"""
WhisperX Python Worker — 语音转写 + 说话人分离

两种运行模式:
  1. 单次模式: python process_chunk.py --input audio.wav --model large-v3 --language zh
     处理单文件, 结果 JSON 输出到 stdout。

  2. 常驻模式: python process_chunk.py --daemon --model large-v3
     通过 stdin/stdout JSON-RPC 通信, 模型常驻内存。
"""

import argparse
import json
import os
import sys
import time
from dataclasses import dataclass, field, asdict
from typing import Optional

# Model cache (module-level, persists across daemon calls)
_asr_model = None
_align_model_cache = {}
_diarize_pipeline = None


@dataclass
class Segment:
    speaker_label: str = "SPEAKER_00"
    text: str = ""
    start_time: float = 0.0
    end_time: float = 0.0
    confidence: Optional[float] = None


@dataclass
class TranscriptionResult:
    success: bool = True
    language: str = "zh"
    segments: list = field(default_factory=list)
    processing_time_ms: float = 0.0
    error: Optional[str] = None


def detect_device() -> str:
    import torch

    if torch.cuda.is_available():
        return "cuda"
    if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def get_asr_model(model_name: str, device: str, compute_type: str):
    global _asr_model
    if _asr_model is None:
        import whisperx

        _asr_model = whisperx.load_model(model_name, device, compute_type=compute_type)
        print(f"[whisperx] Loaded ASR model '{model_name}' on {device}", file=sys.stderr)
    return _asr_model


def get_align_model(language: str, device: str):
    global _align_model_cache
    import whisperx

    if language not in _align_model_cache:
        _align_model_cache[language] = whisperx.load_align_model(
            language_code=language, device=device
        )
        print(f"[whisperx] Loaded alignment model for '{language}'", file=sys.stderr)
    return _align_model_cache[language]


def get_diarize_pipeline(device: str):
    global _diarize_pipeline
    if _diarize_pipeline is None:
        from whisperx import DiarizationPipeline

        token = os.environ.get("HF_TOKEN", "")
        _diarize_pipeline = DiarizationPipeline(
            use_auth_token=token, device=device
        )
        print(f"[whisperx] Loaded diarization pipeline", file=sys.stderr)
    return _diarize_pipeline


def process_audio(
    audio_path: str,
    model_name: str = "large-v3",
    language: Optional[str] = None,
) -> TranscriptionResult:
    """Run full WhisperX pipeline: transcribe → align → diarize → assign speakers."""
    import whisperx

    device = detect_device()
    compute_type = "float16" if device == "cuda" else "int8"

    start = time.monotonic()

    try:
        if not os.path.exists(audio_path):
            return TranscriptionResult(
                success=False, error=f"Audio file not found: {audio_path}"
            )

        # Phase 1: Transcribe
        asr_model = get_asr_model(model_name, device, compute_type)
        audio = whisperx.load_audio(audio_path)
        result = asr_model.transcribe(audio, batch_size=16, language=language)
        detected_lang = result.get("language", language or "zh")

        # Phase 2: Align
        align_model, align_metadata = get_align_model(detected_lang, device)
        result = whisperx.align(
            result["segments"],
            align_model,
            align_metadata,
            audio,
            device,
            return_char_alignments=False,
        )

        # Phase 3: Diarize
        try:
            diarize_model = get_diarize_pipeline(device)
            diarize_segments = diarize_model(audio)
            # Phase 4: Assign speakers
            result = whisperx.assign_word_speakers(diarize_segments, result)
        except Exception as e:
            print(f"[whisperx] Diarization failed, fallback to single speaker: {e}", file=sys.stderr)
            for seg in result.get("segments", []):
                seg["speaker"] = "SPEAKER_00"

        # Build output
        segments = []
        for seg in result.get("segments", []):
            segments.append({
                "speaker_label": seg.get("speaker", "SPEAKER_00"),
                "text": seg["text"].strip(),
                "start_time": seg["start"],
                "end_time": seg["end"],
                "confidence": seg.get("confidence", None),
            })

        elapsed = (time.monotonic() - start) * 1000

        return TranscriptionResult(
            success=True,
            language=detected_lang,
            segments=segments,
            processing_time_ms=elapsed,
        )

    except Exception as e:
        elapsed = (time.monotonic() - start) * 1000
        return TranscriptionResult(
            success=False,
            error=str(e),
            processing_time_ms=elapsed,
        )


def run_once(args):
    """Single-shot mode: process one file, print JSON to stdout."""
    result = process_audio(
        audio_path=args.input,
        model_name=args.model,
        language=args.language,
    )
    print(json.dumps(asdict(result), ensure_ascii=False))
    sys.exit(0 if result.success else 1)


def run_daemon(args):
    """Daemon mode: read JSON commands from stdin, write results to stdout."""
    # Pre-load models
    device = detect_device()
    compute_type = "float16" if device == "cuda" else "int8"
    get_asr_model(args.model, device, compute_type)
    print(json.dumps({"type": "ready"}), flush=True)

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        try:
            msg = json.loads(line)
        except json.JSONDecodeError:
            continue

        if msg.get("type") == "transcribe":
            audio_path = msg.get("input", "")
            language = msg.get("language", args.language)
            result = process_audio(
                audio_path=audio_path,
                model_name=args.model,
                language=language,
            )
            response = {
                "type": "result",
                "id": msg.get("id"),
                "result": asdict(result),
            }
            print(json.dumps(response, ensure_ascii=False), flush=True)


def main():
    parser = argparse.ArgumentParser(description="WhisperX Worker")
    parser.add_argument("--input", "-i", help="Audio file path (one-shot mode)")
    parser.add_argument("--daemon", "-d", action="store_true", help="Run as daemon (stdin/stdout RPC)")
    parser.add_argument("--model", "-m", default=os.environ.get("WHISPERX_MODEL", "large-v3"), help="Whisper model name")
    parser.add_argument("--language", "-l", default=os.environ.get("WHISPERX_LANGUAGE", "zh"), help="Language code")

    args = parser.parse_args()

    if args.daemon:
        run_daemon(args)
    else:
        run_once(args)


if __name__ == "__main__":
    main()