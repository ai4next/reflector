from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.pool import NullPool

from app.config import settings


engine = create_async_engine(
    settings.database_url,
    poolclass=NullPool,
    echo=False,
)

async_session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_db():
    async with async_session_factory() as session:
        try:
            yield session
        finally:
            await session.close()


async def init_db():
    """Create all tables. For dev; production should use Alembic."""
    from app.models import Base
    from app.models.session import (
        SessionModel, ChunkModel, SegmentModel,
        ReflectionModel, ProcessingJobModel,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def close_db():
    await engine.dispose()