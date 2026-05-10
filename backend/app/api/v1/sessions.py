import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db
from app.schemas import (
    SessionCreate, SessionResponse, SessionListItem,
    PaginatedSessions, SessionUpdate, ChunkResponse,
    SegmentResponse, ReflectionResponse,
)
from app.models.session import (
    SessionModel, UserModel, ChunkModel, SegmentModel, ReflectionModel,
)

router = APIRouter(prefix="/sessions", tags=["sessions"])

DEFAULT_USER_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")


async def _get_or_create_user(db: AsyncSession) -> uuid.UUID:
    result = await db.execute(select(UserModel).limit(1))
    user = result.scalar_one_or_none()
    if not user:
        user = UserModel(id=DEFAULT_USER_ID, display_name="Default User")
        db.add(user)
        await db.commit()
    return user.id


async def _build_session(db: AsyncSession, session: SessionModel) -> SessionResponse:
    chunks = (await db.execute(
        select(ChunkModel).where(ChunkModel.session_id == session.id).order_by(ChunkModel.chunk_index)
    )).scalars().all()

    segments = (await db.execute(
        select(SegmentModel).join(ChunkModel).where(ChunkModel.session_id == session.id)
        .order_by(ChunkModel.chunk_index, SegmentModel.start_time)
    )).scalars().all()

    reflections = (await db.execute(
        select(ReflectionModel).where(ReflectionModel.session_id == session.id)
        .order_by(ReflectionModel.created_at)
    )).scalars().all()

    chunk_map = {str(ch.id): ch for ch in chunks}
    seg_groups: dict[str, list[SegmentModel]] = {}
    for seg in segments:
        seg_groups.setdefault(str(seg.chunk_id), []).append(seg)

    return SessionResponse(
        id=session.id,
        title=session.title,
        status=session.status,
        started_at=session.started_at,
        ended_at=session.ended_at,
        total_duration_seconds=session.total_duration_seconds,
        chunks=[
            ChunkResponse(
                id=ch.id, session_id=ch.session_id, chunk_index=ch.chunk_index,
                status=ch.status, file_hash=ch.file_hash,
                duration_seconds=ch.duration_seconds, error_message=ch.error_message,
                processed_at=ch.processed_at,
                segments=[
                    SegmentResponse(
                        id=s.id, chunk_id=s.chunk_id, speaker_label=s.speaker_label,
                        text=s.text, start_time=s.start_time, end_time=s.end_time,
                        confidence=s.confidence,
                    ) for s in seg_groups.get(str(ch.id), [])
                ],
            ) for ch in chunks
        ],
        reflections=[
            ReflectionResponse(
                id=r.id, session_id=r.session_id, chunk_id=r.chunk_id,
                provider_name=r.provider_name, model_name=r.model_name,
                summary=r.summary, key_themes=r.key_themes,
                action_items=r.action_items,
                improvement_suggestions=r.improvement_suggestions,
                sentiment_overview=r.sentiment_overview,
                tokens_used=r.tokens_used, processing_time_ms=r.processing_time_ms,
            ) for r in reflections
        ],
    )


@router.post("", response_model=SessionResponse, status_code=201)
async def create_session(body: SessionCreate, db: AsyncSession = Depends(get_db)):
    user_id = await _get_or_create_user(db)
    session = SessionModel(user_id=user_id, title=body.title)
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return await _build_session(db, session)


@router.get("", response_model=PaginatedSessions)
async def list_sessions(
    status: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    user_id = await _get_or_create_user(db)
    where = [SessionModel.user_id == user_id]
    if status:
        where.append(SessionModel.status == status)

    total_q = await db.execute(
        select(func.count(SessionModel.id)).where(*where)
    )
    total = total_q.scalar() or 0

    sessions = (await db.execute(
        select(SessionModel).where(*where)
        .order_by(SessionModel.started_at.desc())
        .limit(limit).offset(offset)
    )).scalars().all()

    items = []
    for s in sessions:
        cnt = await db.execute(
            select(func.count(ChunkModel.id)).where(ChunkModel.session_id == s.id)
        )
        items.append(SessionListItem(
            id=s.id, title=s.title, status=s.status,
            started_at=s.started_at, ended_at=s.ended_at,
            total_duration_seconds=s.total_duration_seconds,
            chunk_count=cnt.scalar() or 0,
        ))

    return PaginatedSessions(items=items, total=total, offset=offset, limit=limit)


@router.get("/{session_id}", response_model=SessionResponse)
async def get_session_detail(session_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    session = (await db.execute(select(SessionModel).where(SessionModel.id == session_id))).scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return await _build_session(db, session)


@router.patch("/{session_id}", response_model=SessionResponse)
async def update_session(session_id: uuid.UUID, body: SessionUpdate, db: AsyncSession = Depends(get_db)):
    session = (await db.execute(select(SessionModel).where(SessionModel.id == session_id))).scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(session, key, value)
    await db.commit()
    await db.refresh(session)
    return await _build_session(db, session)


@router.delete("/{session_id}", status_code=204)
async def delete_session(session_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(delete(SessionModel).where(SessionModel.id == session_id))
    await db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Session not found")