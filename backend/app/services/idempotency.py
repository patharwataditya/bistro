import hashlib
import json
from collections.abc import Callable
from typing import Any

from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import delete, func, select, text
from sqlalchemy.orm import Session

from app.core.errors import IdempotencyMismatch, ValidationFailed
from app.models import IdempotencyRecord

MAX_KEY_LENGTH = 80


def run_idempotent(
    db: Session,
    *,
    user_id: int,
    key: str | None,
    route: str,
    request_payload: Any,
    status_code: int,
    handler: Callable[[], BaseModel],
) -> JSONResponse:
    """Execute `handler` at most once per (user, key, route).

    A replay with the same key returns the stored response verbatim; the same key with a
    different payload is rejected. Concurrent duplicates serialise on an advisory lock held
    for the transaction, so the second one sees the first one's committed record.
    """
    if key is None:
        return JSONResponse(handler().model_dump(mode="json"), status_code=status_code)
    if not (8 <= len(key) <= MAX_KEY_LENGTH) or not key.isascii():
        raise ValidationFailed("Idempotency-Key must be 8–80 ASCII characters.")

    request_hash = hashlib.sha256(
        json.dumps(request_payload, sort_keys=True, default=str).encode()
    ).hexdigest()
    lock_key = f"{user_id}:{route}:{key}"
    db.execute(text("SELECT pg_advisory_xact_lock(hashtextextended(:k, 0))"), {"k": lock_key})

    existing = db.scalar(select(IdempotencyRecord).where(
        IdempotencyRecord.user_id == user_id,
        IdempotencyRecord.key == key,
        IdempotencyRecord.route == route,
    ))
    if existing is not None:
        if existing.request_hash != request_hash:
            raise IdempotencyMismatch("This request key was already used for a different request.")
        return JSONResponse(existing.response_body, status_code=existing.status_code,
                            headers={"Idempotent-Replayed": "true"})

    body = handler().model_dump(mode="json")
    db.add(IdempotencyRecord(user_id=user_id, key=key, route=route, request_hash=request_hash,
                             status_code=status_code, response_body=body))
    db.flush()
    return JSONResponse(body, status_code=status_code)


def purge_expired(db: Session, older_than_hours: int = 48) -> int:
    result = db.execute(
        delete(IdempotencyRecord).where(
            IdempotencyRecord.created_at < func.now() - text(f"interval '{int(older_than_hours)} hours'")
        )
    )
    return int(result.rowcount or 0)  # type: ignore[attr-defined]
