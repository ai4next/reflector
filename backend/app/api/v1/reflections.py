import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db
from app.models.session import ReflectionModel

router = APIRouter(prefix="/sessions/{session_id}", tags=["reflections"])


@router.get("/reflections")
async def get_reflections(session_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    reflections = (await db.execute(
        select(ReflectionModel).where(ReflectionModel.session_id == session_id)
        .order_by(ReflectionModel.created_at)
    )).scalars().all()

    return [
        {
            "id": str(r.id),
            "session_id": str(r.session_id),
            "chunk_id": str(r.chunk_id) if r.chunk_id else None,
            "provider_name": r.provider_name,
            "model_name": r.model_name,
            "summary": r.summary,
            "key_themes": r.key_themes or [],
            "action_items": r.action_items or [],
            "improvement_suggestions": r.improvement_suggestions or [],
            "sentiment_overview": r.sentiment_overview or {},
            "tokens_used": r.tokens_used,
            "processing_time_ms": r.processing_time_ms,
        }
        for r in reflections
    ]


@router.post("/regenerate-reflection", status_code=202)
async def regenerate_reflection(session_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Re-run AI analysis on all completed chunks in the session."""
    from app.models.session import ChunkModel
    from app.tasks.processing import reanalyze_chunk

    chunks = (await db.execute(
        select(ChunkModel).where(
            ChunkModel.session_id == session_id,
            ChunkModel.status == "completed",
        )
    )).scalars().all()

    if not chunks:
        raise HTTPException(status_code=404, detail="No completed chunks found for re-analysis")

    for chunk in chunks:
        reanalyze_chunk.delay(
            session_id=str(session_id),
            chunk_id=str(chunk.id),
        )

    return {"status": "accepted", "session_id": str(session_id), "chunks_queued": len(chunks)}


@router.post("/analyze-global", status_code=202)
async def trigger_global_analysis(session_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Trigger session-level global analysis (combines all chunks for holistic review).

    Returns a session-level Reflection with chunk_id=None.
    """
    from app.models.session import ChunkModel
    from app.tasks.processing import analyze_session

    chunks = (await db.execute(
        select(ChunkModel).where(
            ChunkModel.session_id == session_id,
            ChunkModel.status == "completed",
        )
    )).scalars().all()

    if not chunks:
        raise HTTPException(status_code=404, detail="No completed chunks found for global analysis")

    analyze_session.delay(session_id=str(session_id))

    return {
        "status": "accepted",
        "session_id": str(session_id),
        "message": "Global analysis queued",
    }