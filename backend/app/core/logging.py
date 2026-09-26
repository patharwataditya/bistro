import logging
import sys

import structlog

from app.core.config import get_settings

_SENSITIVE_KEYS = {"password", "new_password", "current_password", "token", "access_token",
                   "refresh_token", "authorization", "jwt_secret"}


def _redact(_: object, __: str, event_dict: structlog.types.EventDict) -> structlog.types.EventDict:
    for key in list(event_dict):
        if key.lower() in _SENSITIVE_KEYS:
            event_dict[key] = "[redacted]"
    return event_dict


def configure_logging() -> None:
    settings = get_settings()
    level = getattr(logging, settings.log_level.upper(), logging.INFO)
    renderer: structlog.types.Processor = (
        structlog.processors.JSONRenderer() if settings.is_production
        else structlog.dev.ConsoleRenderer(colors=False)
    )
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso", utc=True),
            _redact,
            structlog.processors.format_exc_info,
            renderer,
        ],
        wrapper_class=structlog.make_filtering_bound_logger(level),
        logger_factory=structlog.PrintLoggerFactory(file=sys.stdout),
        cache_logger_on_first_use=True,
    )
    # Uvicorn's own access log would duplicate ours and print query strings.
    logging.getLogger("uvicorn.access").disabled = True


def get_logger(name: str = "bistro") -> structlog.stdlib.BoundLogger:
    return structlog.get_logger(name)  # type: ignore[no-any-return]
