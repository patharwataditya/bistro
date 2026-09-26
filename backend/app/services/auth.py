from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, func, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import (
    AccountInactive,
    InvalidCredentials,
    RateLimited,
    Unauthenticated,
    ValidationFailed,
)
from app.core.logging import get_logger
from app.core.security import (
    create_access_token,
    hash_password,
    hash_refresh_token,
    new_refresh_token,
    verify_password,
)
from app.models import AuthSession, LoginThrottle, RefreshToken, User
from app.schemas.auth import TokenPair

log = get_logger(__name__)


def _now() -> datetime:
    return datetime.now(UTC)


# ---------- throttling ----------

def _check_throttle(db: Session, key: str) -> None:
    row = db.get(LoginThrottle, key)
    if row is not None and row.locked_until is not None and row.locked_until > _now():
        verify_password("x", None)  # same work as a real attempt
        raise RateLimited("Too many attempts. Wait a few minutes and try again.",
                          details={"retry_after_seconds":
                                   int((row.locked_until - _now()).total_seconds()) + 1})


def _register_failure(db: Session, key: str) -> None:
    """Atomic increment; locks the key once it reaches the limit. Commits immediately so the
    count survives the error response that follows."""
    settings = get_settings()
    failures = db.scalar(
        insert(LoginThrottle).values(key=key, failures=1, updated_at=func.now())
        .on_conflict_do_update(index_elements=[LoginThrottle.key],
                               set_={"failures": LoginThrottle.failures + 1,
                                     "updated_at": func.now()})
        .returning(LoginThrottle.failures)
    )
    if failures is not None and failures >= settings.login_max_failures:
        db.execute(update(LoginThrottle).where(LoginThrottle.key == key).values(
            failures=0, locked_until=_now() + timedelta(seconds=settings.login_lockout_seconds)))
        log.warning("throttle_locked", key_kind=key.split(":", 1)[0])
    db.commit()


def _clear_throttle(db: Session, key: str) -> None:
    db.execute(delete(LoginThrottle).where(LoginThrottle.key == key))


def purge_throttles(db: Session) -> None:
    db.execute(delete(LoginThrottle).where(LoginThrottle.updated_at < _now() - timedelta(days=1)))


# ---------- tokens ----------

def _issue(db: Session, user: User, session: AuthSession) -> TokenPair:
    token, token_hash = new_refresh_token()
    db.add(RefreshToken(session_id=session.id, token_hash=token_hash))
    db.flush()
    settings = get_settings()
    return TokenPair(
        access_token=create_access_token(user.id, session.id, user.token_version),
        refresh_token=token,
        expires_in=settings.access_token_ttl_seconds,
    )


def start_session(db: Session, user: User, device_label: str | None) -> TokenPair:
    settings = get_settings()
    session = AuthSession(
        user_id=user.id,
        expires_at=_now() + timedelta(seconds=settings.refresh_token_ttl_seconds),
        device_label=device_label,
    )
    db.add(session)
    db.flush()
    return _issue(db, user, session)


def login(db: Session, username: str, password: str, device_label: str | None,
          client_ip: str) -> TokenPair:
    key = f"login:{username.lower()}:{client_ip}"
    _check_throttle(db, key)
    user = db.scalar(select(User).where(func.lower(User.username) == username.lower()))
    valid, upgraded = verify_password(password, user.password_hash if user else None)
    # A deactivated account answers exactly like a wrong password: no oracle for either.
    if user is None or not valid or not user.is_active:
        _register_failure(db, key)
        raise InvalidCredentials("Incorrect username or password.")
    _clear_throttle(db, key)
    if upgraded:
        user.password_hash = upgraded
    user.last_login_at = _now()
    pair = start_session(db, user, device_label)
    log.info("login", user_id=user.id)
    return pair


def refresh(db: Session, refresh_token: str) -> TokenPair:
    token = db.scalar(
        select(RefreshToken)
        .where(RefreshToken.token_hash == hash_refresh_token(refresh_token))
        .with_for_update().execution_options(populate_existing=True)
    )
    if token is None:
        raise Unauthenticated("Your session has ended. Sign in again.")
    session = db.get(AuthSession, token.session_id, with_for_update=True, populate_existing=True)
    now = _now()
    if session is None or session.revoked_at is not None or session.expires_at <= now:
        raise Unauthenticated("Your session has ended. Sign in again.")
    if token.used_at is not None:
        # A rotated token came back: it was stolen or replayed. Kill the whole session.
        session.revoked_at = now
        db.commit()
        log.warning("refresh_token_reuse", user_id=session.user_id)
        raise Unauthenticated("Your session has ended. Sign in again.")
    user = db.get(User, session.user_id)
    if user is None or not user.is_active:
        session.revoked_at = now
        db.commit()
        raise AccountInactive("This account has been deactivated.")
    token.used_at = now
    session.last_used_at = now
    return _issue(db, user, session)


def logout(db: Session, user_id: int, session_id: object) -> None:
    """Revoke the caller's current session (named by the access token)."""
    db.execute(update(AuthSession)
               .where(AuthSession.id == session_id, AuthSession.user_id == user_id)
               .values(revoked_at=_now()))


def revoke_all_sessions(db: Session, user: User) -> None:
    """Invalidate every refresh session and every outstanding access token for a user."""
    db.execute(update(AuthSession)
               .where(AuthSession.user_id == user.id, AuthSession.revoked_at.is_(None))
               .values(revoked_at=_now()))
    user.token_version += 1


def change_password(db: Session, user: User, current: str, new: str) -> TokenPair:
    """Change the caller's password, sign out every other device, keep this one signed in."""
    key = f"password:{user.id}"
    _check_throttle(db, key)
    valid, _ = verify_password(current, user.password_hash)
    if not valid:
        _register_failure(db, key)
        # 422, not 401: the session is fine, only the typed password is wrong.
        raise ValidationFailed("Your current password is incorrect.",
                               details={"fields": [{"field": "current_password",
                                                    "message": "Incorrect password"}]})
    if current == new:
        raise ValidationFailed("Choose a password you haven't been using.",
                               details={"fields": [{"field": "new_password",
                                                    "message": "Same as current password"}]})
    _clear_throttle(db, key)
    user.password_hash = hash_password(new)
    revoke_all_sessions(db, user)
    db.flush()
    return start_session(db, user, None)
