from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import AccountInactive, AccountLocked, InvalidCredentials, Unauthenticated
from app.core.logging import get_logger
from app.core.security import (
    create_access_token,
    hash_password,
    hash_refresh_token,
    new_refresh_token,
    verify_password,
)
from app.models import AuthSession, RefreshToken, User
from app.schemas.auth import TokenPair

log = get_logger(__name__)


def _now() -> datetime:
    return datetime.now(UTC)


def _issue(db: Session, user: User, session: AuthSession) -> TokenPair:
    token, token_hash = new_refresh_token()
    db.add(RefreshToken(session_id=session.id, token_hash=token_hash))
    settings = get_settings()
    return TokenPair(
        access_token=create_access_token(user.id, session.id, user.token_version),
        refresh_token=token,
        expires_in=settings.access_token_ttl_seconds,
    )


def login(db: Session, username: str, password: str, device_label: str | None) -> TokenPair:
    settings = get_settings()
    user = db.scalar(
        select(User).where(func.lower(User.username) == username.lower()).with_for_update()
    )
    now = _now()
    if user is not None and user.locked_until is not None and user.locked_until > now:
        # Still verify, so a locked account is not distinguishable by timing.
        verify_password(password, None)
        raise AccountLocked("Too many failed attempts. Try again in a few minutes.",
                            details={"retry_after_seconds":
                                     int((user.locked_until - now).total_seconds())})

    valid, upgraded = verify_password(password, user.password_hash if user else None)
    if user is None or not valid:
        if user is not None:
            user.failed_login_count += 1
            if user.failed_login_count >= settings.login_max_failures:
                user.locked_until = now + timedelta(seconds=settings.login_lockout_seconds)
                user.failed_login_count = 0
                log.warning("account_locked", user_id=user.id)
        # The failure counter must persist even though we raise.
        db.commit()
        raise InvalidCredentials("Incorrect username or password.")

    if not user.is_active:
        raise AccountInactive("This account has been deactivated. Ask a manager for help.")

    if upgraded:
        user.password_hash = upgraded
    user.failed_login_count = 0
    user.locked_until = None
    user.last_login_at = now
    pair = start_session(db, user, device_label)
    log.info("login", user_id=user.id)
    return pair


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


def refresh(db: Session, refresh_token: str) -> TokenPair:
    token = db.scalar(
        select(RefreshToken)
        .where(RefreshToken.token_hash == hash_refresh_token(refresh_token))
        .with_for_update()
    )
    if token is None:
        raise Unauthenticated("Your session has ended. Sign in again.")
    session = db.get(AuthSession, token.session_id, with_for_update=True)
    now = _now()
    if session is None or session.revoked_at is not None or session.expires_at <= now:
        raise Unauthenticated("Your session has ended. Sign in again.")
    if token.used_at is not None:
        # A rotated token came back: it was stolen or replayed. Kill the whole session.
        session.revoked_at = now
        db.commit()
        log.warning("refresh_token_reuse", session_id=str(session.id), user_id=session.user_id)
        raise Unauthenticated("Your session has ended. Sign in again.")
    user = db.get(User, session.user_id)
    if user is None or not user.is_active:
        session.revoked_at = now
        db.commit()
        raise AccountInactive("This account has been deactivated.")
    token.used_at = now
    session.last_used_at = now
    return _issue(db, user, session)


def logout(db: Session, user_id: int, session_id_token: str | None) -> None:
    """Revoke the session owning the given refresh token (only if it belongs to the caller)."""
    if not session_id_token:
        return
    token = db.scalar(select(RefreshToken).where(
        RefreshToken.token_hash == hash_refresh_token(session_id_token)))
    if token is None:
        return
    db.execute(update(AuthSession)
               .where(AuthSession.id == token.session_id, AuthSession.user_id == user_id)
               .values(revoked_at=_now()))


def revoke_all_sessions(db: Session, user: User) -> None:
    """Invalidate every refresh session and every outstanding access token for a user."""
    db.execute(update(AuthSession)
               .where(AuthSession.user_id == user.id, AuthSession.revoked_at.is_(None))
               .values(revoked_at=_now()))
    user.token_version += 1


def change_password(db: Session, user: User, current: str, new: str) -> TokenPair:
    """Change the caller's password, sign out every other device, keep this one signed in."""
    valid, _ = verify_password(current, user.password_hash)
    if not valid:
        raise InvalidCredentials("Your current password is incorrect.")
    user.password_hash = hash_password(new)
    revoke_all_sessions(db, user)
    db.flush()
    return start_session(db, user, None)
