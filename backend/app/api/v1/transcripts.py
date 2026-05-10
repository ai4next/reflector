import uuid
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db
from app.models.session import SegmentModel, ChunkModel

router = APIRouter(prefix="/sessions/{session_id}", tags=["transcripts"])


@router.get("/transcript")
async def get_transcript(
    session_id: uuid.UUID,
    format: str = Query("json"),
    db: AsyncSession = Depends(get_db),
):
    segments = (await db.execute(
        select(SegmentModel)
        .join(ChunkModel, SegmentModel.chunk_id == ChunkModel.id)
        .where(ChunkModel.session_id == session_id)
        .order_by(ChunkModel.chunk_index, SegmentModel.start_time)
    )).scalars().all()

    if not segments:
        raise HTTPException(status_code=404, detail="No transcript found")

    if format == "text":
        lines = [f"[{s.speaker_label}] {s.text}" for s in segments]
        return "\n".join(lines)

    return [
        {
            "id": str(s.id),
            "chunk_id": str(s.chunk_id),
            "speaker_label": s.speaker_label,
            "text": s.text,
            "start_time": s.start_time,
            "end_time": s.end_time,
            "confidence": s.confidence,
        }
        for s in segments
    ]