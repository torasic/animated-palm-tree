import os
import sys
import asyncio
from sqlalchemy import select, delete, update, or_
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.models.user import User
from app.models.product import Product
from app.models.order import Order
from app.models.payment_transaction import DemandTransaction
from app.models.conversation import Conversation
from app.models.message import Message
from app.models.rating import Rating
from app.models.token import RefreshToken
from app.models.demand_request import DemandRequest, SupplyCommitment

DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    from dotenv import load_dotenv
    load_dotenv()
    DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    print("Error: DATABASE_URL is not set.")
    sys.exit(1)

async def main():
    print("=== Purging Test Sellers, Test Buyers, and All Related Data ===")
    
    engine = create_async_engine(DATABASE_URL, connect_args={"statement_cache_size": 0})
    AsyncSessionLocal = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
    
    async with AsyncSessionLocal() as session:
        # 1. Identify all test users
        stmt_users = select(User.id, User.email, User.full_name).where(
            or_(
                User.email.like("%@test.com"),
                User.email == "test_petani@grove.com",
                User.email == "mock_user@example.com",
                User.email == "new_mock_user@example.com",
                User.full_name.in_(["Test Seller", "Test Buyer", "Test Petani", "Mock User", "New Mock User"])
            )
        )
        res_users = await session.execute(stmt_users)
        users = res_users.all()
        test_user_ids = [u[0] for u in users]
        
        if not test_user_ids:
            print("No test sellers or buyers found in database.")
            return
            
        print(f"Found {len(test_user_ids)} test users to purge.")
        
        # 2. Identify products of test sellers
        stmt_products = select(Product.id).where(Product.seller_id.in_(test_user_ids))
        res_products = await session.execute(stmt_products)
        test_product_ids = res_products.scalars().all()
        print(f"Found {len(test_product_ids)} products belonging to test users.")
        
        # 3. Identify demand requests of test buyers
        stmt_demands = select(DemandRequest.id).where(DemandRequest.buyer_id.in_(test_user_ids))
        res_demands = await session.execute(stmt_demands)
        test_demand_request_ids = res_demands.scalars().all()
        print(f"Found {len(test_demand_request_ids)} demand requests belonging to test users.")
        
        # --- DELETION SEQUENCE ---
        
        # 1. Supply Commitments
        stmt_sc = delete(SupplyCommitment).where(
            or_(
                SupplyCommitment.petani_id.in_(test_user_ids),
                SupplyCommitment.demand_request_id.in_(test_demand_request_ids)
            )
        )
        res_sc = await session.execute(stmt_sc)
        print(f"Deleted {res_sc.rowcount} supply commitments.")
        
        # 2. Demand Transactions (set product_id = NULL first, then delete)
        if test_product_ids:
            stmt_trans_null = update(DemandTransaction).where(DemandTransaction.product_id.in_(test_product_ids)).values(product_id=None)
            res_trans_null = await session.execute(stmt_trans_null)
            print(f"Nullified product_id in {res_trans_null.rowcount} demand transactions.")
            
        stmt_trans_del = delete(DemandTransaction).where(
            or_(
                DemandTransaction.seller_id.in_(test_user_ids),
                DemandTransaction.demand_request_id.in_(test_demand_request_ids)
            )
        )
        res_trans_del = await session.execute(stmt_trans_del)
        print(f"Deleted {res_trans_del.rowcount} demand transactions.")
        
        # 3. Orders (delete orders referencing test products OR buyer is test user)
        stmt_orders = delete(Order).where(
            or_(
                Order.product_id.in_(test_product_ids) if test_product_ids else False,
                Order.buyer_id.in_(test_user_ids)
            )
        )
        res_orders = await session.execute(stmt_orders)
        print(f"Deleted {res_orders.rowcount} orders.")
        
        # 4. Conversations & Messages
        stmt_conv_ids = select(Conversation.id).where(
            or_(
                Conversation.seller_id.in_(test_user_ids),
                Conversation.buyer_id.in_(test_user_ids)
            )
        )
        res_conv_ids = await session.execute(stmt_conv_ids)
        test_conv_ids = res_conv_ids.scalars().all()
        
        if test_conv_ids:
            stmt_msgs = delete(Message).where(Message.conversation_id.in_(test_conv_ids))
            res_msgs = await session.execute(stmt_msgs)
            print(f"Deleted {res_msgs.rowcount} messages.")
            
            stmt_convs = delete(Conversation).where(Conversation.id.in_(test_conv_ids))
            res_convs = await session.execute(stmt_convs)
            print(f"Deleted {res_convs.rowcount} conversations.")
        else:
            print("Deleted 0 messages.")
            print("Deleted 0 conversations.")
            
        # 5. Ratings
        stmt_ratings = delete(Rating).where(
            or_(
                Rating.rater_id.in_(test_user_ids),
                Rating.rated_id.in_(test_user_ids)
            )
        )
        res_ratings = await session.execute(stmt_ratings)
        print(f"Deleted {res_ratings.rowcount} ratings.")
        
        # 6. Refresh Tokens
        stmt_tokens = delete(RefreshToken).where(RefreshToken.user_id.in_(test_user_ids))
        res_tokens = await session.execute(stmt_tokens)
        print(f"Deleted {res_tokens.rowcount} refresh tokens.")
        
        # 7. Demand Requests
        stmt_dr = delete(DemandRequest).where(DemandRequest.buyer_id.in_(test_user_ids))
        res_dr = await session.execute(stmt_dr)
        print(f"Deleted {res_dr.rowcount} demand requests.")
        
        # 8. Products
        stmt_p = delete(Product).where(Product.seller_id.in_(test_user_ids))
        res_p = await session.execute(stmt_p)
        print(f"Deleted {res_p.rowcount} products.")
        
        # 9. Users
        stmt_u = delete(User).where(User.id.in_(test_user_ids))
        res_u = await session.execute(stmt_u)
        print(f"Purged {res_u.rowcount} test user accounts.")
        
        await session.commit()
        print("=== Database Purge Completed Successfully ===")

if __name__ == "__main__":
    asyncio.run(main())
