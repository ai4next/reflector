from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.api.v1.health import router as health_router
from app.api.v1.sessions import router as sessions_router
from app.api.v1.chunks import router as chunks_router
from app.api.v1.transcripts import router as transcripts_router
from app.api.v1.reflections import router as reflections_router
from app.api.v1.transcriptions import router as transcriptions_router
from app.config import settings
from app.logging_config import configure_logging
from app.middleware import RequestIDMiddleware


limiter = Limiter(key_func=get_remote_address)


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    from app.db.session import init_db
    await init_db()
    yield
    from app.db.session import close_db
    await close_db()


app = FastAPI(
    title="Reflector API",
    version="0.1.0",
    docs_url="/docs",
    lifespan=lifespan,
)

# Middleware (order matters: outermost first)
app.add_middleware(RequestIDMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Rate limit handler
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


@app.get("/")
async def root():
    return {"message": "Reflector API", "version": "0.1.0", "docs": "/docs"}


# Register routers
app.include_router(health_router, prefix="/api/v1")
app.include_router(sessions_router, prefix="/api/v1")
app.include_router(chunks_router, prefix="/api/v1")
app.include_router(transcripts_router, prefix="/api/v1")
app.include_router(reflections_router, prefix="/api/v1")
app.include_router(transcriptions_router, prefix="/api/v1")