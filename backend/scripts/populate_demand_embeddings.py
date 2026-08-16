import os
import sys
import asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.models.demand_request import DemandRequest
from app.services.embedding_service import embedding_service

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
    # 1. Fetch demands needing embeddings
    async with AsyncSessionLocal() as session:
        stmt = select(DemandRequest.id, DemandRequest.commodity_name, DemandRequest.category).where(DemandRequest.embedding == None)
        result = await session.execute(stmt)
        demands_data = result.all()
        
    print(f"Found {len(demands_data)} demand requests without embeddings.")
    if not demands_data:
        return

    # 2. Generate embeddings
    updates = []
    for dr_id, commodity_name, category in demands_data:
        text = f"{commodity_name} {category}"
        print(f"Generating embedding for: {text}...")
        try:
            emb = await embedding_service.generate_embedding(text)
            updates.append((dr_id, emb))
        except Exception as e:
            print(f"Error generating embedding for {dr_id}: {e}")

    # 3. Update database
    if updates:
        async with AsyncSessionLocal() as session:
            for dr_id, emb in updates:
                dr = await session.get(DemandRequest, dr_id)
                if dr:
                    dr.embedding = emb
                    session.add(dr)
            await session.commit()
            print(f"Successfully updated {len(updates)} demand requests.")
    
    print("Done populating embeddings.")

if __name__ == "__main__":
    asyncio.run(main())
