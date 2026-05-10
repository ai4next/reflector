from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}

    # Database
    database_url: str = "sqlite+aiosqlite:///./reflector.db"

    # WhisperX
    whisper_model: str = "large-v3"
    default_language: str = "zh"
    hf_token: str = ""

    # AI Analysis
    default_analysis_provider: str = "claude"
    anthropic_api_key: str = ""
    openai_api_key: str = ""
    ollama_base_url: str = "http://localhost:11434"

    # Celery
    redis_url: str = "redis://localhost:6379/0"

    # Audio storage (temporary)
    audio_temp_dir: str = "/tmp/reflector"

    # App
    max_chunk_duration_seconds: int = 300
    allowed_audio_formats: list[str] = ["audio/wav", "audio/x-wav"]
    max_upload_size_mb: int = 50


settings = Settings()