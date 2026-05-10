from sqlalchemy import (
    Column, String, Integer, Float, Text, DateTime, ForeignKey, UniqueConstraint, Index
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
import uuid

from . import Base


class SessionModel(Base):
    __tablename__ = "sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    title = Column(String(500), nullable=True)
    status = Column(String(50), nullable=False, default="recording")
    started_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    ended_at = Column(DateTime(timezone=True), nullable=True)
    total_duration_seconds = Column(Integer, nullable=True)
    metadata_ = Column("metadata", JSONB, default=dict)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))

    chunks = relationship("ChunkModel", back_populates="session", cascade="all, delete-orphan")
    reflections = relationship("ReflectionModel", back_populates="session", cascade="all, delete-orphan")
    user = relationship("UserModel")


class ChunkModel(Base):
    __tablename__ = "chunks"
    __table_args__ = (
        UniqueConstraint("session_id", "chunk_index", name="uq_chunk_session_index"),
        Index("idx_chunks_session", "session_id"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(UUID(as_uuid=True), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False)
    chunk_index = Column(Integer, nullable=False)
    status = Column(String(50), nullable=False, default="uploaded")
    file_hash = Column(String(64), nullable=True)
    duration_seconds = Column(Float, nullable=True)
    error_message = Column(Text, nullable=True)
    processed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))

    session = relationship("SessionModel", back_populates="chunks")
    segments = relationship("SegmentModel", back_populates="chunk", cascade="all, delete-orphan")


class SegmentModel(Base):
    __tablename__ = "segments"
    __table_args__ = (
        Index("idx_segments_chunk", "chunk_id"),
        Index("idx_segments_chunk_speaker", "chunk_id", "speaker_label"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    chunk_id = Column(UUID(as_uuid=True), ForeignKey("chunks.id", ondelete="CASCADE"), nullable=False)
    speaker_label = Column(String(50), nullable=False)
    text = Column(Text, nullable=False)
    start_time = Column(Float, nullable=False)
    end_time = Column(Float, nullable=False)
    confidence = Column(Float, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))

    chunk = relationship("ChunkModel", back_populates="segments")


class ReflectionModel(Base):
    __tablename__ = "reflections"
    __table_args__ = (
        Index("idx_reflections_session", "session_id"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(UUID(as_uuid=True), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False)
    chunk_id = Column(UUID(as_uuid=True), ForeignKey("chunks.id", ondelete="SET NULL"), nullable=True)
    provider_name = Column(String(100), nullable=False)
    model_name = Column(String(100), nullable=True)
    summary = Column(Text, nullable=True)
    key_themes = Column(JSONB, default=list)
    action_items = Column(JSONB, default=list)
    improvement_suggestions = Column(JSONB, default=list)
    sentiment_overview = Column(JSONB, default=dict)
    raw_response = Column(Text, nullable=True)
    tokens_used = Column(Integer, nullable=True)
    processing_time_ms = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))

    session = relationship("SessionModel", back_populates="reflections")


class ProcessingJobModel(Base):
    __tablename__ = "processing_jobs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    chunk_id = Column(UUID(as_uuid=True), ForeignKey("chunks.id", ondelete="CASCADE"), nullable=False)
    celery_task_id = Column(String(255), nullable=True)
    stage = Column(String(50), nullable=False, default="queued")
    progress_pct = Column(Float, default=0)
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))