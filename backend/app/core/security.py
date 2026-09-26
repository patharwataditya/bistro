import hashlib
import secrets
import threading
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import jwt
from pwdlib import PasswordHash
from pwdlib.hashers.argon2 import Argon2Hasher

from app.core.config import get_settings
from app.core.errors import TokenExpired, Unauthenticated

# Argon2id at the OWASP baseline (19 MiB, t=2, p=1). Existing hashes with other parameters
# still verify and are transparently upgraded on the next successful login.
_password_hash = PasswordHash((Argon2Hasher(memory_cost=19_456, time_cost=2, parallelism=1),))
# Each hash holds ~19 MiB for its duration; bounding concurrency per worker bounds memory, so
# a burst of logins can't exhaust the container (the rest wait briefly instead).
_hash_slots = threading.BoundedSemaphore(3)
# Verified against when the username does not exist, so response time does not reveal it.
_DUMMY_HASH = _password_hash.hash("timing-equaliser-not-a-real-password")
_ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    with _hash_slots:
        return _password_hash.hash(password)


def verify_password(password: str, password_hash: str | None) -> tuple[bool, str | None]:
    """Returns (valid, upgraded_hash_or_None). Always does the work, even with no hash."""
    with _hash_slots:
        if password_hash is None:
            _password_hash.verify(password, _DUMMY_HASH)
            return False, None
        return _password_hash.verify_and_update(password, password_hash)


@dataclass(frozen=True)
class AccessClaims:
    user_id: int
    session_id: uuid.UUID
    token_version: int


def create_access_token(user_id: int, session_id: uuid.UUID, token_version: int) -> str:
    settings = get_settings()
    now = datetime.now(UTC)
    payload = {
        "sub": str(user_id),
        "sid": str(session_id),
        "ver": token_version,
        "iss": settings.jwt_issuer,
        "iat": now,
        "exp": now + timedelta(seconds=settings.access_token_ttl_seconds),
        "typ": "access",
    }
    return jwt.encode(payload, settings.jwt_secret.get_secret_value(), algorithm=_ALGORITHM)


def decode_access_token(token: str) -> AccessClaims:
    settings = get_settings()
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret.get_secret_value(),
            algorithms=[_ALGORITHM],
            issuer=settings.jwt_issuer,
            options={"require": ["sub", "sid", "ver", "exp", "iat", "iss"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise TokenExpired("Your session has expired.") from exc
    except jwt.PyJWTError as exc:
        raise Unauthenticated("Invalid access token.") from exc
    if payload.get("typ") != "access":
        raise Unauthenticated("Invalid access token.")
    try:
        return AccessClaims(int(payload["sub"]), uuid.UUID(payload["sid"]), int(payload["ver"]))
    except (ValueError, TypeError) as exc:
        raise Unauthenticated("Invalid access token.") from exc


def new_refresh_token() -> tuple[str, str]:
    """Returns (token, sha256_hex). Only the hash is stored."""
    token = secrets.token_urlsafe(32)
    return token, hash_refresh_token(token)


def hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()
