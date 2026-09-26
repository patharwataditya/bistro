from datetime import UTC, datetime
from typing import Any, Protocol

from sqlalchemy import Result

from app.core.errors import StaleVersion


class Versioned(Protocol):
    version: int


def now() -> datetime:
    return datetime.now(UTC)


def check_version(entity: Versioned, expected: int, label: str) -> None:
    if entity.version != expected:
        raise StaleVersion(label, entity.version)


def bump(entity: Versioned) -> None:
    entity.version += 1


def pairs(result: Result[Any]) -> dict[Any, Any]:
    """Two-column result → dict."""
    return {row[0]: row[1] for row in result.all()}  # type: ignore[misc]
