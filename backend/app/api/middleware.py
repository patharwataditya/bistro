import time
import uuid

import structlog
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.logging import get_logger

log = get_logger("bistro.http")


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
        request_id = incoming if 8 <= len(incoming) <= 64 and incoming.isascii() \
            else uuid.uuid4().hex
        structlog.contextvars.bind_contextvars(request_id=request_id)
        start = time.perf_counter()
        status_holder = {"status": 500}

        declared = headers.get(b"content-length")
        if declared is not None and (not declared.isdigit()
                                     or int(declared) > self.max_body_bytes):
            await _reject_too_large(send, request_id)
            structlog.contextvars.clear_contextvars()
            return

        received = 0

        async def limited_receive() -> Message:
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.max_body_bytes:
                    raise _BodyTooLarge
            return message

        async def send_wrapper(message: Message) -> None:
            if message["type"] == "http.response.start":
                status_holder["status"] = message["status"]
                message.setdefault("headers", [])
                message["headers"].append((b"x-request-id", request_id.encode()))
            await send(message)

        try:
            await self.app(scope, limited_receive, send_wrapper)
        except _BodyTooLarge:
            await _reject_too_large(send, request_id)
            status_holder["status"] = 413
        finally:
            duration_ms = round((time.perf_counter() - start) * 1000, 1)
            path = scope.get("path", "")
            if path != "/api/v1/health":
                log.info("request", method=scope.get("method"), path=path,
                         status=status_holder["status"], duration_ms=duration_ms,
                         user_id=getattr(scope.get("state", {}), "user_id", None)
                         if not isinstance(scope.get("state"), dict)
                         else scope["state"].get("user_id"))
            structlog.contextvars.clear_contextvars()


class _BodyTooLarge(Exception):
    pass


async def _reject_too_large(send: Send, request_id: str) -> None:
    body = (b'{"error":{"code":"VALIDATION_ERROR","message":"Request is too large.",'
            b'"details":{}}}')
    await send({"type": "http.response.start", "status": 413,
                "headers": [(b"content-type", b"application/json"),
                            (b"content-length", str(len(body)).encode()),
                            (b"x-request-id", request_id.encode())]})
    await send({"type": "http.response.body", "body": body})
