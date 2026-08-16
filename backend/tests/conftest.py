import pytest
import pytest_asyncio
import contextvars
from sqlalchemy.ext.asyncio import AsyncSession
import app.db

# Context variable to hold the active transactional database session for the current test
active_session_var = contextvars.ContextVar("active_session")

# Save references to the original implementations
original_AsyncSessionLocal = app.db.AsyncSessionLocal
original_get_db = app.db.get_db

# 1. Patch AsyncSessionLocal at module load time so all subsequent imports in test modules get this patched version
class MockSessionContextManager:
    async def __aenter__(self):
        try:
            return active_session_var.get()
        except LookupError:
            # Fallback to creating a new real session if no test transaction is active
            return original_AsyncSessionLocal()
            
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        # We handle session closing in the fixture teardown, so we do nothing here
        pass

app.db.AsyncSessionLocal = lambda: MockSessionContextManager()

# 2. Patch get_db at module load time so all route dependencies get this patched version
async def mock_get_db():
    try:
        yield active_session_var.get()
    except LookupError:
        # Fallback to the original get_db generator
        async for session in original_get_db():
            yield session

app.db.get_db = mock_get_db


@pytest_asyncio.fixture(autouse=True)
async def transactional_session():
    """
    Fixture that intercepts all database sessions in tests and runs them in a transactional block.
    All commits are mocked to only perform a flush, ensuring no test data is ever committed to the database.
    At the end of each test, the entire transaction is rolled back, leaving the database completely clean.
    """
    from app.db import engine

    # Connect to the database
    async with engine.connect() as connection:
        # Start a database transaction on this connection
        transaction = await connection.begin()
        
        # Create a session bound to this connection/transaction
        session = AsyncSession(bind=connection, expire_on_commit=False)
        
        # Mock session.commit to only flush changes (making them visible to queries in the same transaction)
        # but preventing them from committing to the database.
        async def mock_commit():
            await session.flush()
        session.commit = mock_commit
        
        # Set this transactional session as the active session for the current context
        token = active_session_var.set(session)
        
        try:
            yield session
        finally:
            # Close the session and roll back the transaction (reverting all inserts, updates, and deletes)
            await session.close()
            await transaction.rollback()
            # Clear the context variable
            active_session_var.reset(token)
