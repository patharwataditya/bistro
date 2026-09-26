from typing import Any

from sqlalchemy.orm import Session

from app.api.deps import Actor
from app.models import AuditLog


def record(
    db: Session,
    actor: Actor | None,
    action: str,
    entity_type: str,
    entity_id: object,
    summary: str,
    *,
    restaurant_id: int | None = None,
    location_id: int | None = None,
    **meta: Any,
) -> None:
    """Append an audit entry in the caller's transaction (it commits or rolls back with it)."""
    db.add(AuditLog(
        restaurant_id=restaurant_id if restaurant_id is not None else actor.restaurant_id
        if actor else None,
        location_id=location_id if location_id is not None else actor.location_id
        if actor else None,
        actor_id=actor.id if actor else None,
        action=action,
        entity_type=entity_type,
        entity_id=None if entity_id is None else str(entity_id),
        summary=summary[:300],
        meta={k: _jsonable(v) for k, v in meta.items()},
    ))


def _jsonable(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(k): _jsonable(v) for k, v in value.items()}
    if isinstance(value, list | tuple | set | frozenset):
        return [_jsonable(v) for v in value]
    if value is None or isinstance(value, bool | int | float | str):
        return value
    return str(value)
