import torch
from fastapi import APIRouter
from sqlalchemy import text

from app.schemas import HealthResponse
from app.db.session import async_session_factory

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def health_check():
    gpu_available = torch.cuda.is_available()
    gpu_device = None
    if gpu_available:
        gpu_device = torch.cuda.get_device_name(0)
    elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        gpu_available = True
        gpu_device = "mps"

    db_connected = False
    try:
        async with async_session_factory() as session:
            await session.execute(text("SELECT 1"))
            db_connected = True
    except Exception:
        pass

    return HealthResponse(
        status="ok",
        gpu_available=gpu_available,
        gpu_device=gpu_device,
        database_connected=db_connected,
    )