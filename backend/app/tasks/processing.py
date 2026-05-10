import os
import logging

from app.tasks.celery_app import celery_app
from app.services.whisperx_pipeline import WhisperXPipeline
from app.services.analysis.factory import AnalysisProviderFactory
from app.services.analysis.base import AnalysisContext
from app.config import settings

logger = logging.getLogger(__name__)

# WhisperX pipeline — 模型在 Celery Worker 进程内缓存, 无需子进程
_pipeline: WhisperXPipeline | None = None


def get_pipeline() -> WhisperXPipeline:
    global _pipeline
    if _pipeline is None:
        _pipeline = WhisperXPipeline(model_name=settings.whisper_model)
    return _pipeline


@celery_app.task(bind=True, max_retries=3, default_retry_delay=60, acks_late=True)
def reanalyze_chunk(self, session_id: str, chunk_id: str):
    """Re-run AI analysis on an already-processed chunk (audio already cleaned up)."""
    from app.db.session import async_session_factory
    from app.models.session import ChunkModel, SegmentModel, ReflectionModel
    from app.services.analysis.factory import AnalysisProviderFactory
    from app.services.analysis.base import AnalysisContext
    from sqlalchemy import select, update
    import asyncio

    async def _run():
        async with async_session_factory() as db:
            try:
                chunk = (await db.execute(
                    select(ChunkModel).where(ChunkModel.id == chunk_id)
                )).scalar_one_or_none()
                if not chunk:
                    logger.error("Chunk %s not found for re-analysis", chunk_id)
                    return

                segments = (await db.execute(
                    select(SegmentModel).where(SegmentModel.chunk_id == chunk_id)
                    .order_by(SegmentModel.start_time)
                )).scalars().all()

                speaker_labels = sorted(set(s.speaker_label for s in segments))
                segment_dicts = [
                    {"speaker_label": s.speaker_label, "text": s.text,
                     "start_time": s.start_time, "end_time": s.end_time,
                     "confidence": s.confidence}
                    for s in segments
                ]

                provider = AnalysisProviderFactory.get_provider()
                context = AnalysisContext(
                    session_id=session_id,
                    chunk_id=chunk_id,
                    transcript_text=" ".join(s.text for s in segments),
                    segments=segment_dicts,
                    speaker_labels=speaker_labels,
                    chunk_index=chunk.chunk_index,
                )
                analysis = await provider.analyze(context)

                db.add(ReflectionModel(
                    session_id=session_id,
                    chunk_id=chunk_id,
                    provider_name=analysis.provider_name,
                    model_name=analysis.model_name,
                    summary=analysis.summary,
                    key_themes=analysis.key_themes,
                    action_items=analysis.action_items,
                    improvement_suggestions=analysis.improvement_suggestions,
                    sentiment_overview=analysis.sentiment_overview,
                    tokens_used=analysis.tokens_used,
                    processing_time_ms=analysis.processing_time_ms,
                    raw_response=analysis.raw_response,
                ))
                await db.commit()
                logger.info("Re-analysis complete for chunk %s", chunk_id)

            except Exception as exc:
                logger.error("Re-analysis failed for chunk %s: %s", chunk_id, exc)
                raise self.retry(exc=exc)

    asyncio.run(_run())


@celery_app.task(bind=True, max_retries=2, default_retry_delay=120)
def analyze_session(self, session_id: str):
    """Global session-level analysis: combines ALL chunks for a holistic view.

    Runs after all chunks in a session are processed.
    Stores result as a ReflectionModel with chunk_id=None (session-level).
    """
    from app.db.session import async_session_factory
    from app.models.session import SessionModel, ChunkModel, SegmentModel, ReflectionModel
    from app.services.analysis.factory import AnalysisProviderFactory
    from app.services.analysis.base import AnalysisContext
    from sqlalchemy import select
    import asyncio

    async def _run():
        async with async_session_factory() as db:
            try:
                # 1. Load all completed chunks
                chunks = (await db.execute(
                    select(ChunkModel).where(
                        ChunkModel.session_id == session_id,
                        ChunkModel.status == "completed",
                    ).order_by(ChunkModel.chunk_index)
                )).scalars().all()

                if not chunks:
                    logger.warning("No completed chunks for session %s", session_id)
                    return

                # 2. Load all segments for ALL chunks
                all_segments = []
                all_speakers: set[str] = set()
                transcript_parts = []

                for chunk in chunks:
                    segments = (await db.execute(
                        select(SegmentModel).where(SegmentModel.chunk_id == chunk.id)
                        .order_by(SegmentModel.start_time)
                    )).scalars().all()

                    for seg in segments:
                        all_speakers.add(seg.speaker_label)
                        all_segments.append({
                            "speaker_label": seg.speaker_label,
                            "text": seg.text,
                            "start_time": seg.start_time,
                            "end_time": seg.end_time,
                            "confidence": seg.confidence,
                        })
                        transcript_parts.append(f"[{seg.speaker_label}]: {seg.text}")

                # 3. Build combined transcript
                combined_text = "\n".join(transcript_parts)

                # 4. Run AI analysis on full context
                provider = AnalysisProviderFactory.get_provider()
                context = AnalysisContext(
                    session_id=session_id,
                    chunk_id="",  # session-level
                    transcript_text=combined_text,
                    segments=all_segments,
                    speaker_labels=sorted(all_speakers),
                    chunk_index=-1,  # sentinel for session-level
                    language="zh",
                )
                analysis = await provider.analyze(context)

                # 5. Store session-level reflection
                db.add(ReflectionModel(
                    session_id=session_id,
                    chunk_id=None,  # session-level marker
                    provider_name=analysis.provider_name,
                    model_name=analysis.model_name,
                    summary=analysis.summary,
                    key_themes=analysis.key_themes,
                    action_items=analysis.action_items,
                    improvement_suggestions=analysis.improvement_suggestions,
                    sentiment_overview=analysis.sentiment_overview,
                    tokens_used=analysis.tokens_used,
                    processing_time_ms=analysis.processing_time_ms,
                    raw_response=analysis.raw_response,
                ))

                # 6. Update session status
                from sqlalchemy import update as upd
                await db.execute(
                    upd(SessionModel).where(SessionModel.id == session_id).values(
                        status="completed"
                    )
                )
                await db.commit()
                logger.info("Session-level analysis complete for %s", session_id)

            except Exception as exc:
                logger.error("Session analysis failed for %s: %s", session_id, exc)
                raise self.retry(exc=exc)

    asyncio.run(_run())


@celery_app.task(bind=True, max_retries=3, default_retry_delay=60, acks_late=True)
def process_chunk(self, session_id: str, chunk_id: str, chunk_index: int, file_path: str):
    """5 分钟音频分片处理管线: WhisperX → DB 存储 → AI 分析 → 清理。"""
    from app.db.session import async_session_factory
    from app.models.session import ChunkModel, SegmentModel, ReflectionModel
    from sqlalchemy import select, update
    from datetime import datetime, timezone

    async def _run():
        async with async_session_factory() as db:
            try:
                # 1. Update status
                await db.execute(
                    update(ChunkModel).where(ChunkModel.id == chunk_id).values(status="processing")
                )
                await db.commit()
                logger.info("Processing chunk %s (session=%s, index=%d)", chunk_id, session_id, chunk_index)

                # 2. WhisperX Pipeline (同一进程, 模型已缓存)
                pipeline = get_pipeline()
                result = pipeline.transcribe(file_path, language=settings.default_language)

                # 3. Store segments
                for seg in result.segments:
                    db.add(SegmentModel(
                        chunk_id=chunk_id,
                        speaker_label=seg["speaker_label"],
                        text=seg["text"],
                        start_time=seg["start_time"],
                        end_time=seg["end_time"],
                        confidence=seg["confidence"],
                    ))
                await db.commit()

                # 4. AI Analysis
                provider = AnalysisProviderFactory.get_provider()
                context = AnalysisContext(
                    session_id=session_id,
                    chunk_id=chunk_id,
                    transcript_text=" ".join(s["text"] for s in result.segments),
                    segments=result.segments,
                    speaker_labels=result.speakers,
                    chunk_index=chunk_index,
                    language=result.language,
                )
                analysis = await provider.analyze(context)

                # 5. Store reflection
                db.add(ReflectionModel(
                    session_id=session_id,
                    chunk_id=chunk_id,
                    provider_name=analysis.provider_name,
                    model_name=analysis.model_name,
                    summary=analysis.summary,
                    key_themes=analysis.key_themes,
                    action_items=analysis.action_items,
                    improvement_suggestions=analysis.improvement_suggestions,
                    sentiment_overview=analysis.sentiment_overview,
                    tokens_used=analysis.tokens_used,
                    processing_time_ms=analysis.processing_time_ms,
                    raw_response=analysis.raw_response,
                ))
                await db.commit()

                # 6. Cleanup
                try:
                    os.remove(file_path)
                except OSError:
                    pass

                await db.execute(
                    update(ChunkModel).where(ChunkModel.id == chunk_id).values(
                        status="completed", processed_at=datetime.now(timezone.utc)
                    )
                )
                await db.commit()
                logger.info("Chunk %s completed", chunk_id)

                # Check if all chunks done
                result = await db.execute(
                    select(ChunkModel).where(
                        ChunkModel.session_id == session_id,
                        ChunkModel.status.in_(["uploaded", "processing", "failed"]),
                    )
                )
                pending = result.scalars().all()
                if not pending:
                    from sqlalchemy import update as upd
                    await db.execute(
                        upd(ChunkModel.__table__).where(ChunkModel.session_id == session_id).values(status="completed")  # noqa
                    )
                    # Trigger session-level global analysis
                    analyze_session.delay(session_id)
                    from app.models.session import SessionModel
                    await db.execute(
                        update(SessionModel).where(SessionModel.id == session_id).values(status="processing")
                    )
                    await db.commit()

            except Exception as exc:
                await db.execute(
                    update(ChunkModel).where(ChunkModel.id == chunk_id).values(
                        status="failed", error_message=str(exc)
                    )
                )
                await db.commit()
                logger.error("Chunk %s failed: %s", chunk_id, exc)
                raise self.retry(exc=exc)

    import asyncio
    asyncio.run(_run())