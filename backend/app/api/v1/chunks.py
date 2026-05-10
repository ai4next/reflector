import uuid
import os
import hashlib
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db
from app.schemas import ChunkUploadResponse, ChunkStatusResponse
from app.models.session import ChunkModel, SessionModel
from app.config import settings
from app.tasks.processing import process_chunk

router = APIRouter(prefix="/sessions/{session_id}", tags=["chunks"])


@router.post("/chunks", response_model=ChunkUploadResponse, status_code=202)
async def upload_chunk(
    session_id: uuid.UUID,
    audio: UploadFile = File(...),
    chunk_index: int = Form(...),
    checksum: str = Form(""),
    db: AsyncSession = Depends(get_db),
):
    session = (await db.execute(select(SessionModel).where(SessionModel.id == session_id))).scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Read audio data
    data = await audio.read()

    # Compute SHA-256 if not provided
    file_hash = checksum or hashlib.sha256(data).hexdigest()

    # Idempotency check
    existing = (await db.execute(
        select(ChunkModel).where(
            ChunkModel.session_id == session_id,
            ChunkModel.file_hash == file_hash,
        )
    )).scalar_one_or_none()
    if existing:
        return ChunkUploadResponse(chunk_id=existing.id, status=existing.status)

    # Save to temp
    temp_dir = os.path.join(settings.audio_temp_dir, str(session_id))
    os.makedirs(temp_dir, exist_ok=True)
    file_path = os.path.join(temp_dir, f"chunk_{chunk_index}.wav")
    with open(file_path, "wb") as f:
        f.write(data)

    # Create chunk record
    chunk = ChunkModel(
        session_id=session_id,
        chunk_index=chunk_index,
        status="uploaded",
        file_hash=file_hash,
    )
    db.add(chunk)
    await db.commit()
    await db.refresh(chunk)

    # Enqueue Celery task
    process_chunk.delay(
        session_id=str(session_id),
        chunk_id=str(chunk.id),
        chunk_index=chunk_index,
        file_path=file_path,
    )

    return ChunkUploadResponse(chunk_id=chunk.id)


@router.get("/chunks/{chunk_id}/status", response_model=ChunkStatusResponse)
async def get_chunk_status(
    session_id: uuid.UUID,
    chunk_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    chunk = (await db.execute(
        select(ChunkModel).where(
            ChunkModel.id == chunk_id,
            ChunkModel.session_id == session_id,
        )
    )).scalar_one_or_none()
    if not chunk:
        raise HTTPException(status_code=404, detail="Chunk not found")

    return ChunkStatusResponse(
        id=chunk.id,
        chunk_index=chunk.chunk_index,
        status=chunk.status,
        error_message=chunk.error_message,
    )