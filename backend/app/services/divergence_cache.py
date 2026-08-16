import uuid
from datetime import datetime, timezone, date
from typing import Optional, Dict, Any
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

class DivergenceCache:
    def _get_today_date(self) -> date:
        # Standardized UTC date
        return datetime.now(timezone.utc).date()

    async def get(self, db: AsyncSession, commodity: str, region: str, days: int) -> Optional[Dict[str, Any]]:
        try:
            today = self._get_today_date()
            sql = text("""
                SELECT result_json
                FROM divergence_analysis_cache
                WHERE LOWER(TRIM(commodity_name)) = LOWER(TRIM(:commodity))
                  AND LOWER(TRIM(region)) = LOWER(TRIM(:region))
                  AND days = :days
                  AND cache_date = :today
                LIMIT 1
            """)
            result = await db.execute(sql, {
                "commodity": commodity,
                "region": region,
                "days": days,
                "today": today
            })
            row = result.first()
            if row:
                res_val = row[0]
                # SQLAlchemy JSON column could be parsed automatically or return dict directly
                if isinstance(res_val, str):
                    import json
                    return json.loads(res_val)
                return res_val
        except Exception as e:
            print("DB Cache read failed:", e)
        return None

    async def set(self, db: AsyncSession, commodity: str, region: str, days: int, data: Dict[str, Any]):
        try:
            today = self._get_today_date()
            
            # Delete any existing cache entry for this commodity/region/days for today to prevent duplicates
            delete_sql = text("""
                DELETE FROM divergence_analysis_cache
                WHERE LOWER(TRIM(commodity_name)) = LOWER(TRIM(:commodity))
                  AND LOWER(TRIM(region)) = LOWER(TRIM(:region))
                  AND days = :days
                  AND cache_date = :today
            """)
            await db.execute(delete_sql, {
                "commodity": commodity,
                "region": region,
                "days": days,
                "today": today
            })
            
            # Insert the new entry
            insert_sql = text("""
                INSERT INTO divergence_analysis_cache (id, commodity_name, region, days, result_json, cache_date)
                VALUES (:id, :commodity, :region, :days, :result_json, :today)
            """)
            await db.execute(insert_sql, {
                "id": uuid.uuid4(),
                "commodity": commodity.strip(),
                "region": region.strip(),
                "days": days,
                "result_json": data,
                "today": today
            })
            await db.commit()
        except Exception as e:
            print("DB Cache write failed:", e)

divergence_cache = DivergenceCache()
