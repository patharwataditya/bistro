import re
import time
import uuid

import structlog
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.logging import get_logger

log = get_logger("bistro.http")
_REQUEST_ID = re.compile(r"[A-Za-z0-9-]{8,64}")


class RequestContextMiddleware:
    """Request ID propagation, access logging and a hard request-body size cap (pure ASGI)."""

    def __init__(self, app: ASGIApp, max_body_bytes: int) -> None:
        self.app = app
        self.max_body_bytes = max_body_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = dict(scope["headers"])
        incoming = headers.get(b"x-request-id", b"").decode(errors="ignore")
        request_id = incoming if _REQUEST_ID.fullmatch(incoming) else uuid.uuid4().hex
        structlog.contextvars.bind_contextvars(request_id=request_id)
        start = time.perf_counter()
        status_holder = {"status": 500}

        declared = headers.get(b"content-length")
        if declared is not None and (not declared.isdigit()
                                     or int(declared) > self.max_body_bytes):
            await _reject_too_large(send, request_id)
            structlog.contextvars.clear_contextvars()
            return

        if declared is None and scope.get("method") in ("POST", "PUT", "PATCH", "DELETE"):
            # No Content-Length (chunked): buffer up to the cap here, so an oversized body is
            # refused with 413 before the app's own parser ever sees it.
            chunks: list[bytes] = []
            size = 0
            more = True
            while more:
                message = await receive()
                if message["type"] != "http.request":
                    break
                chunk = message.get("body", b"")
                size += len(chunk)
                if size > self.max_body_bytes:
                    await _reject_too_large(send, request_id)
                    structlog.contextvars.clear_contextvars()
                    return
                chunks.append(chunk)
                more = message.get("more_body", False)
            buffered = b"".join(chunks)
            delivered = False

            async def replay() -> Message:
                nonlocal delivered
                if not delivered:
                    delivered = True
                    return {"type": "http.request", "body": buffered, "more_body": False}
                return await receive()

            app_receive: Receive = replay
        else:
            app_receive = receive

        async def send_wrapper(message: Message) -> None:
            if message["type"] == "http.response.start":
                status_holder["status"] = message["status"]
                message.setdefault("headers", [])
                message["headers"].append((b"x-request-id", request_id.encode()))
            await send(message)

        try:
            await self.app(scope, app_receive, send_wrapper)
        finally:
            duration_ms = round((time.perf_counter() - start) * 1000, 1)
            path = scope.get("path", "")
            if path != "/api/v1/health":
                state = scope.get("state") or {}
                log.info("request", method=scope.get("method"), path=path,
                         status=status_holder["status"], duration_ms=duration_ms,
                         user_id=state.get("user_id") if isinstance(state, dict) else None)
            structlog.contextvars.clear_contextvars()


async def _reject_too_large(send: Send, request_id: str) -> None:
    body = (b'{"error":{"code":"VALIDATION_ERROR","message":"Request is too large.",'
            b'"details":{}}}')
    await send({"type": "http.response.start", "status": 413,
                "headers": [(b"content-type", b"application/json"),
                            (b"content-length", str(len(body)).encode()),
                            (b"x-request-id", request_id.encode())]})
    await send({"type": "http.response.body", "body": body})
