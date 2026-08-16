import os
import sys
import asyncio
from sqlalchemy import select, delete, update
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

# Add backend directory to sys.path so we can import app modules
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.models.product import Product
from app.models.order import Order
from app.models.payment_transaction import DemandTransaction

DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    from dotenv import load_dotenv
    load_dotenv()
    DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    print("Error: DATABASE_URL is not set.")
    sys.exit(1)

engine = create_async_engine(DATABASE_URL, connect_args={"statement_cache_size": 0})
AsyncSessionLocal = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)

async def main():
    print("--- Grove Dummy Product Cleanup ---")
    async with AsyncSessionLocal() as session:
        # Find product IDs with prefix [DEMO]
        stmt = select(Product.id).where(Product.name.like("[DEMO] %"))
        res = await session.execute(stmt)
        demo_product_ids = res.scalars().all()
        
        if not demo_product_ids:
            print("No dummy products found with prefix '[DEMO] '.")
            return
            
        print(f"Found {len(demo_product_ids)} dummy products to clean up.")
        
        # 1. Nullify product_id in demand_transactions to avoid foreign key violations
        stmt_trans = update(DemandTransaction).where(DemandTransaction.product_id.in_(demo_product_ids)).values(product_id=None)
        res_trans = await session.execute(stmt_trans)
        print(f"Nullified product_id in {res_trans.rowcount} associated demand transactions.")

        # 2. Delete associated orders first to avoid foreign key violations
        stmt_orders = delete(Order).where(Order.product_id.in_(demo_product_ids))
        res_orders = await session.execute(stmt_orders)
        print(f"Deleted {res_orders.rowcount} associated orders.")
        
        # 3. Delete the products
        stmt_products = delete(Product).where(Product.id.in_(demo_product_ids))
        res_products = await session.execute(stmt_products)
        print(f"Deleted {res_products.rowcount} dummy products.")
        
        await session.commit()
        print("Cleanup completed successfully.")

if __name__ == "__main__":
    asyncio.run(main())
