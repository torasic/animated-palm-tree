"""
One-off fix: reset demand requests that are marked TERPENUHI 
but have quantity_kg_committed < quantity_kg_needed back to TERBUKA.
"""
import asyncio
import asyncpg

async def fix():
    conn = await asyncpg.connect(
        host="aws-0-ap-southeast-1.pooler.supabase.com",
        port=6543,
        user="postgres.sbdnleyvijenwzikgyml",
        password="preludetochaos123",
        database="postgres",
        statement_cache_size=0
    )
    rows = await conn.fetch("""
        UPDATE demand_requests 
        SET status = 'TERBUKA'
        WHERE quantity_kg_committed < quantity_kg_needed
          AND status = 'TERPENUHI'
        RETURNING id, status, quantity_kg_committed, quantity_kg_needed
    """)
    if rows:
        for row in rows:
            rid = row["id"]
            committed = row["quantity_kg_committed"]
            needed = row["quantity_kg_needed"]
            print(f"Fixed: id={rid}, committed={committed}, needed={needed}")
    else:
        print("No requests needed fixing.")
    await conn.close()

asyncio.run(fix())
