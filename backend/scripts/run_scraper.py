import os
import sys
import asyncio
import re
from datetime import datetime, timedelta, timezone
from playwright.async_api import async_playwright
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

# Add backend directory to sys.path so we can import app models/schemas
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.models.reference_price import ReferencePrice
from app.models.scraper_status import ScraperStatus, ScrapeStatusEnum

DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    from dotenv import load_dotenv
    load_dotenv()
    DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    print("Error: DATABASE_URL environment variable is not set.")
    sys.exit(1)

# Configure async engine and sessionmaker
engine = create_async_engine(DATABASE_URL, connect_args={"statement_cache_size": 0})
AsyncSessionLocal = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)

async def scrape_from_url(page, url: str) -> list[dict]:
    print(f"Navigating to {url}...")
    response = await page.goto(url, timeout=60000)
    
    print("Response Status:", response.status if response else "No response")
    print("Page Title:", await page.title())
    
    # Save pre-interaction screenshot for debugging
    await page.screenshot(path="debug_screenshot.png")
    print("Screenshot saved to debug_screenshot.png")
    
    # 1. Wait for DevExpress dropdown container controls
    print("Waiting for cboProvince and CommodityTree controls...")
    await page.wait_for_selector("#cboProvince", timeout=20000)
    await page.wait_for_selector("#CommodityTree", timeout=20000)
    
    # Set date range to last 30 days
    end_dt = datetime.now(timezone.utc).replace(tzinfo=None)
    start_dt = end_dt - timedelta(days=30)
    start_date_str = start_dt.strftime("%Y-%m-%d")
    end_date_str = end_dt.strftime("%Y-%m-%d")
    
    print(f"Setting date range in UI: {start_date_str} to {end_date_str}")
    await page.evaluate(f"""
        () => {{
            const mulai = $("#dboDateMulai").dxDateBox("instance");
            const selesai = $("#dboDateSelesai").dxDateBox("instance");
            if (mulai && selesai) {{
                mulai.option("value", "{start_date_str}");
                selesai.option("value", "{end_date_str}");
            }}
        }}
    """)
    
    # Get all commodity names from the tree to avoid element detaching issues during the click loop
    rows = await page.query_selector_all("#CommodityTree .dx-treelist-rowsview tr.dx-data-row")
    commodity_names = []
    for r in rows:
        name = (await r.text_content()).strip()
        if name:
            commodity_names.append(name)
    print(f"Found {len(commodity_names)} commodities in tree list.")
    
    extracted_data = []
    date_pattern = re.compile(r'^\d{2}/\d{2}/\d{4}$')
    
    for i, comp_name in enumerate(commodity_names):
        print(f"[{i+1}/{len(commodity_names)}] Scraping '{comp_name}'...")
        
        try:
            # Click the commodity row matching the name
            row_locator = page.locator(f"#CommodityTree .dx-treelist-rowsview tr.dx-data-row >> text='{comp_name}'").first
            await row_locator.click()
            
            # Wait for report button and click it
            await page.wait_for_selector("button#btnReport", timeout=10000)
            await page.click("button#btnReport")
            
            # Wait for info header to update to match the selected commodity (this guarantees AJAX grid load is complete)
            escaped_name = comp_name.replace("'", "\\'")
            await page.wait_for_function(
                f"document.querySelector('#info').innerText.includes('{escaped_name}')",
                timeout=20000
            )
            
            # Wait for grid rows to render
            await page.wait_for_selector("#grid1 .dx-datagrid-rowsview tr.dx-data-row", timeout=15000)
            
            # Extract header dates from .dx-header-row
            header_cells = await page.evaluate("""
                () => {
                    const rows = Array.from(document.querySelectorAll('#grid1 .dx-datagrid-headers tr.dx-header-row'));
                    const dateRow = rows.find(r => r.querySelectorAll('td').length > 5);
                    if (!dateRow) return [];
                    return Array.from(dateRow.querySelectorAll('td')).map(td => td.innerText.trim());
                }
            """)
            
            # Extract rows
            grid_rows = await page.query_selector_all("#grid1 .dx-datagrid-rowsview tr.dx-data-row")
            
            for row in grid_rows:
                cells = await row.query_selector_all("td")
                if len(cells) >= 2:
                    region_raw = (await cells[1].text_content()).strip()
                    region = "Nasional" if "SEMUA" in region_raw else region_raw.title()
                    if region == "Dki Jakarta":
                        region = "DKI Jakarta"
                    
                    # Loop over all columns starting from index 2
                    for col_idx in range(2, len(cells)):
                        if col_idx < len(header_cells):
                            raw_date = header_cells[col_idx]
                            clean_date = raw_date.replace(" ", "")
                            
                            # If it matches date pattern, parse and save
                            if date_pattern.match(clean_date):
                                try:
                                    scraped_date = datetime.strptime(clean_date, "%d/%m/%Y")
                                    scraped_date = datetime(scraped_date.year, scraped_date.month, scraped_date.day, end_dt.hour, end_dt.minute, end_dt.second)
                                    
                                    price_str = (await cells[col_idx].text_content()).strip()
                                    price_cleaned = price_str.replace("Rp", "").replace(".", "").replace(",", "").strip()
                                    if price_cleaned.isdigit():
                                        extracted_data.append({
                                            "commodity_name": comp_name,
                                            "price_per_kg": float(price_cleaned),
                                            "source": "PIHPS BI",
                                            "region": region,
                                            "scraped_at": scraped_date
                                        })
                                except Exception as date_parse_err:
                                    print(f"Failed to parse price/date for column {col_idx}: {date_parse_err}")
        except Exception as item_err:
            print(f"Failed to scrape commodity '{comp_name}': {item_err}")
            
    # Save post-interaction screenshot for verification
    await page.screenshot(path="debug_screenshot.png")
    return extracted_data

async def scrape_data() -> list[dict]:
    async with async_playwright() as p:
        # Launch headless browser
        print("Launching browser...")
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        
        traditional_url = "https://www.bi.go.id/hargapangan/TabelHarga/PasarTradisionalKomoditas"
        producer_url = "https://www.bi.go.id/hargapangan/TabelHarga/ProdusenKomoditas"
        
        try:
            print(f"Attempting to scrape from traditional market: {traditional_url}")
            extracted_data = await scrape_from_url(page, traditional_url)
            if extracted_data:
                print(f"Successfully scraped {len(extracted_data)} items from traditional market.")
                await browser.close()
                return extracted_data
            else:
                print("Traditional market scraping returned no data. Falling back to producer prices...")
        except Exception as e:
            print(f"Error scraping traditional market: {e}. Falling back to producer prices...")
            
        try:
            print(f"Attempting to scrape from producer market: {producer_url}")
            extracted_data = await scrape_from_url(page, producer_url)
            await browser.close()
            return extracted_data
        except Exception as e:
            print(f"Error scraping producer market: {e}")
            await browser.close()
            raise e
PARENT_CHILD_MAP = {
    "Beras": [
        "Beras Kualitas Bawah I",
        "Beras Kualitas Bawah II",
        "Beras Kualitas Medium I",
        "Beras Kualitas Medium II",
        "Beras Kualitas Super I",
        "Beras Kualitas Super II"
    ],
    "Bawang Merah": [
        "Bawang Merah Ukuran Sedang"
    ],
    "Bawang Putih": [
        "Bawang Putih Ukuran Sedang"
    ],
    "Cabai Merah": [
        "Cabai Merah Keriting",
        "Cabai Merah Besar"
    ],
    "Cabai Rawit": [
        "Cabai Rawit Merah",
        "Cabai Rawit Hijau"
    ],
    "Daging Ayam": [
        "Daging Ayam Ras Segar"
    ],
    "Telur Ayam": [
        "Telur Ayam Ras Segar"
    ],
    "Daging Sapi": [
        "Daging Sapi Kualitas 1",
        "Daging Sapi Kualitas 2"
    ],
    "Minyak Goreng": [
        "Minyak Goreng Curah",
        "Minyak Goreng Kemasan Bermerk 1",
        "Minyak Goreng Kemasan Bermerk 2"
    ],
    "Gula Pasir": [
        "Gula Pasir Lokal",
        "Gula Pasir Kualitas Premium"
    ]
}

def calculate_parent_averages(data: list[dict]) -> list[dict]:
    from collections import defaultdict
    # Group existing records by (region, scraped_at)
    grouped = defaultdict(list)
    for item in data:
        grouped[(item["region"], item["scraped_at"])].append(item)
        
    calculated_data = []
    
    for (region, scraped_at), items in grouped.items():
        present_comms = {item["commodity_name"]: item for item in items}
        
        for parent, children in PARENT_CHILD_MAP.items():
            if parent not in present_comms:
                child_prices = []
                for child in children:
                    if child in present_comms:
                        child_prices.append(present_comms[child]["price_per_kg"])
                
                if child_prices:
                    avg_price = sum(child_prices) / len(child_prices)
                    avg_price = round(avg_price / 100.0) * 100.0
                    calculated_data.append({
                        "commodity_name": parent,
                        "price_per_kg": float(avg_price),
                        "source": "PIHPS BI (Calculated Average)",
                        "region": region,
                        "scraped_at": scraped_at
                    })
                    
    return calculated_data

async def main():
    start_time = datetime.now(timezone.utc).replace(tzinfo=None)
    status = ScrapeStatusEnum.FAILED
    error_message = None
    items_scraped = 0
    
    try:
        data = await scrape_data()
        items_scraped = len(data)
        
        if items_scraped > 0:
            parent_averages = calculate_parent_averages(data)
            data.extend(parent_averages)
            items_scraped = len(data)
            
            async with AsyncSessionLocal() as db:
                print("Deleting old reference prices...")
                await db.execute(text("DELETE FROM reference_prices;"))
                print("Inserting new reference prices...")
                for item in data:
                    new_price = ReferencePrice(**item)
                    db.add(new_price)
                await db.commit()
            
            status = ScrapeStatusEnum.SUCCESS
            print(f"Scraping completed successfully. Scraped {items_scraped} items.")
        else:
            error_message = "No data rows matched in the table."
            print(f"Scraping failed: {error_message}")
            
    except Exception as e:
        error_message = str(e)
        print(f"Error during scraping: {error_message}")
        
    # Always log status to scraper_statuses
    try:
        async with AsyncSessionLocal() as db:
            log_entry = ScraperStatus(
                last_run_at=start_time,
                status=status,
                items_scraped=items_scraped,
                error_message=error_message
            )
            db.add(log_entry)
            await db.commit()
            print("Logged scraper status to database.")
    except Exception as db_err:
        print(f"Failed to log scraper status to DB: {db_err}")
        
    # Mandatory exit code propagation for GitHub Actions
    if status == ScrapeStatusEnum.FAILED:
        sys.exit(1)

if __name__ == '__main__':
    asyncio.run(main())
