from typing import Any


class AppError(Exception):
    """A domain error with a stable, client-facing code (see contract/enums.json ErrorCode)."""

    status_code = 400
    code = "VALIDATION_ERROR"

    def __init__(self, message: str, *, details: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.details = details or {}
        # Extra response headers for the error envelope (e.g. clearing a cookie).
        self.headers: list[tuple[str, str]] = []


class ValidationFailed(AppError):
    status_code = 422
    code = "VALIDATION_ERROR"


class Unauthenticated(AppError):
    status_code = 401
    code = "UNAUTHENTICATED"


class TokenExpired(AppError):
    status_code = 401
    code = "TOKEN_EXPIRED"


class InvalidCredentials(AppError):
    status_code = 401
    code = "INVALID_CREDENTIALS"


class AccountLocked(AppError):
    status_code = 423
    code = "ACCOUNT_LOCKED"


class AccountInactive(AppError):
    status_code = 403
    code = "ACCOUNT_INACTIVE"


class PermissionDenied(AppError):
    status_code = 403
    code = "PERMISSION_DENIED"


class NotFound(AppError):
    status_code = 404
    code = "NOT_FOUND"


class Conflict(AppError):
    status_code = 409
    code = "CONFLICT"


class StaleVersion(AppError):
    status_code = 409
    code = "STALE_VERSION"

    def __init__(self, entity: str, current_version: int) -> None:
        super().__init__(
            f"This {entity} was changed by someone else. Refresh and try again.",
            details={"current_version": current_version},
        )


class InvalidTransition(AppError):
    status_code = 409
    code = "INVALID_TRANSITION"


class IdempotencyMismatch(AppError):
    status_code = 422
    code = "IDEMPOTENCY_MISMATCH"


class RateLimited(AppError):
    status_code = 429
    code = "RATE_LIMITED"
