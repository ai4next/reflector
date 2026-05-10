"""Middleware: request ID, timing, error handling."""

import time
import uuid
import logging

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger(__name__)


class RequestIDMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request_id = str(uuid.uuid4())[:8]
        request.state.request_id = request_id

        start = time.monotonic()
        try:
            response = await call_next(request)
            elapsed = int((time.monotonic() - start) * 1000)

            response.headers["X-Request-ID"] = request_id
            response.headers["X-Processing-Time-MS"] = str(elapsed)

            logger.info(
                "%s %s → %s (%dms) [%s]",
                request.method, request.url.path,
                response.status_code, elapsed, request_id,
            )
            return response
        except Exception as exc:
            elapsed = int((time.monotonic() - start) * 1000)
            logger.error(
                "%s %s → 500 (%dms) [%s]: %s",
                request.method, request.url.path,
                elapsed, request_id, exc,
            )
            return JSONResponse(
                status_code=500,
                content={"detail": "Internal server error", "request_id": request_id},
            )