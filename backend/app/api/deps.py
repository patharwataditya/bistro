import uuid
from collections.abc import Callable
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.errors import AccountInactive, PermissionDenied, Unauthenticated
from app.core.security import decode_access_token
from app.models import AuthSession, Location, User

_bearer = HTTPBearer(auto_error=False)

DB = Annotated[Session, Depends(get_db)]


@dataclass
class Actor:
    """The authenticated caller. Identity, location and permissions all come from the DB."""

    user: User
    location: Location
    permissions: frozenset[str]
    session_id: uuid.UUID

    @property
    def id(self) -> int:
        return self.user.id

    @property
    def location_id(self) -> int:
        return self.location.id

    @property
    def restaurant_id(self) -> int:
        return self.user.restaurant_id

    def can(self, permission: str) -> bool:
        return permission in self.permissions

    def ensure(self, permission: str) -> None:
        if permission not in self.permissions:
            raise PermissionDenied("You don't have permission to do that.",
                                   details={"permission": permission})


def get_actor(
    request: Request,
    db: DB,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> Actor:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise Unauthenticated("Sign in to continue.")
    claims = decode_access_token(credentials.credentials)
    user = db.get(User, claims.user_id)
    if user is None or user.token_version != claims.token_version:
        raise Unauthenticated("Your session is no longer valid. Sign in again.")
    if not user.is_active:
        raise AccountInactive("This account has been deactivated.")
    session = db.get(AuthSession, claims.session_id)
    if session is None or session.revoked_at is not None or session.user_id != user.id:
        raise Unauthenticated("Your session is no longer valid. Sign in again.")
    location = db.scalar(select(Location).where(Location.id == user.location_id))
    if location is None:
        raise Unauthenticated("Your account is not assigned to a location.")
    request.state.user_id = user.id
    return Actor(user=user, location=location, permissions=frozenset(user.permission_codes),
                 session_id=session.id)


CurrentActor = Annotated[Actor, Depends(get_actor)]


def require(*permissions: str) -> Callable[[Actor], Actor]:
    """Route dependency: the caller must hold every listed permission."""

    def dependency(actor: CurrentActor) -> Actor:
        for permission in permissions:
            actor.ensure(permission)
        return actor

    return dependency
