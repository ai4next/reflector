"""API endpoint for receiving on-device transcription results.

Instead of uploading audio for server-side WhisperX processing,
the mobile app transcribes locally via whisper.cpp and submits
the resulting text for AI analysis.
"""

import uuid
import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timezone

from app.dependencies import get_db
from app.schemas import TranscriptionSubmitRequest, TranscriptionSubmitResponse
from app.models.session import SessionModel, ChunkModel, SegmentModel
from app.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sessions/{session_id}", tags=["transcriptions"])


@router.post("/transcriptions", response_model=TranscriptionSubmitResponse, status_code=202)
async def submit_transcription(
    session_id: uuid.UUID,
    body: TranscriptionSubmitRequest,
    db: AsyncSession = Depends(get_db),
):
    """Receive on-device transcription results and queue AI analysis."""

    # Verify session exists
    session = (await db.execute(
        select(SessionModel).where(SessionModel.id == session_id)
    )).scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Create a chunk record for the transcribed data
    chunk = ChunkModel(
        session_id=session_id,
        chunk_index=body.chunk_index,
        status="completed",
        duration_seconds=(
            body.segments[-1].end_time - body.segments[0].start_time
            if body.segments else None
        ),
        processed_at=datetime.now(timezone.utc),
    )
    db.add(chunk)
    await db.flush()  # Get chunk.id without committing

    # Store segments
    speaker_counter = 0
    for seg in body.segments:
        db.add(SegmentModel(
            chunk_id=chunk.id,
            speaker_label=f"SPEAKER_{speaker_counter:02d}",
            text=seg.text,
            start_time=seg.start_time,
            end_time=seg.end_time,
            confidence=seg.confidence,
        ))
    await db.commit()
    await db.refresh(chunk)

    # Queue AI analysis asynchronously
    from app.tasks.processing import analyze_transcribed_chunk
    analyze_transcribed_chunk.delay(
        session_id=str(session_id),
        chunk_id=str(chunk.id),
        chunk_index=body.chunk_index,
        language=body.language,
    )

    logger.info(
        "Received on-device transcription for session %s chunk %d (%d segments, lang=%s)",
        session_id, body.chunk_index, len(body.segments), body.language,
    )

    return TranscriptionSubmitResponse(
        chunk_id=chunk.id,
        status="accepted",
        segments_count=len(body.segments),
    )