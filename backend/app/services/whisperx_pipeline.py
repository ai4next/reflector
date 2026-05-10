import os
import logging
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class TranscriptionResult:
    segments: list[dict]
    language: str
    speakers: list[str]


class WhisperXPipeline:
    """WhisperX 原生集成——同一进程内加载模型, 无需子进程通信。

    模型以模块级变量缓存, 首次加载后常驻内存, 后续任务复用。
    """

    def __init__(self, model_name: str = "large-v3", device: Optional[str] = None):
        self._model_name = model_name
        self._device = device or self._detect_device()
        self._compute_type = "float16" if self._device == "cuda" else "int8"

    # --- Module-level model cache ---
    _asr_model = None
    _align_model_cache = {}
    _diarize_pipeline = None

    def _detect_device(self) -> str:
        import torch
        if torch.cuda.is_available():
            return "cuda"
        if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            return "mps"
        return "cpu"

    def _get_asr_model(self):
        if WhisperXPipeline._asr_model is None:
            import whisperx
            WhisperXPipeline._asr_model = whisperx.load_model(
                self._model_name, self._device, compute_type=self._compute_type,
            )
            logger.info("Loaded ASR model '%s' on %s", self._model_name, self._device)
        return WhisperXPipeline._asr_model

    def _get_align_model(self, language: str):
        import whisperx
        cache = WhisperXPipeline._align_model_cache
        if language not in cache:
            cache[language] = whisperx.load_align_model(language_code=language, device=self._device)
            logger.info("Loaded alignment model for '%s'", language)
        return cache[language]

    def _get_diarize_pipeline(self):
        if WhisperXPipeline._diarize_pipeline is None:
            from whisperx import DiarizationPipeline
            token = os.environ.get("HF_TOKEN", "")
            WhisperXPipeline._diarize_pipeline = DiarizationPipeline(
                use_auth_token=token, device=self._device,
            )
            logger.info("Loaded diarization pipeline")
        return WhisperXPipeline._diarize_pipeline

    def transcribe(self, audio_path: str, language: Optional[str] = None) -> TranscriptionResult:
        import whisperx

        logger.info("Starting WhisperX pipeline for %s (device=%s)", audio_path, self._device)

        # Phase 1: Transcribe
        asr_model = self._get_asr_model()
        audio = whisperx.load_audio(audio_path)
        result = asr_model.transcribe(audio, batch_size=16, language=language)
        detected_lang = result.get("language", language or "zh")

        # Phase 2: Align
        align_model, align_metadata = self._get_align_model(detected_lang)
        result = whisperx.align(
            result["segments"], align_model, align_metadata, audio, self._device,
            return_char_alignments=False,
        )

        # Phase 3: Diarize
        try:
            diarize_model = self._get_diarize_pipeline()
            diarize_segments = diarize_model(audio)
            result = whisperx.assign_word_speakers(diarize_segments, result)
        except Exception as e:
            logger.warning("Diarization failed, fallback to single speaker: %s", e)
            for seg in result.get("segments", []):
                seg["speaker"] = "SPEAKER_00"

        # Build output
        segments = []
        speakers_set: set[str] = set()
        for seg in result.get("segments", []):
            speaker = seg.get("speaker", "SPEAKER_00")
            speakers_set.add(speaker)
            segments.append({
                "speaker_label": speaker,
                "text": seg["text"].strip(),
                "start_time": seg["start"],
                "end_time": seg["end"],
                "confidence": seg.get("confidence", 0.0),
            })

        return TranscriptionResult(
            segments=segments, language=detected_lang,
            speakers=sorted(speakers_set),
        )