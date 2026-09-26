import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Table,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base, TimestampMixin

role_permissions = Table(
    "role_permissions",
    Base.metadata,
    Column("role_id", ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
    Column("permission_code", ForeignKey("permissions.code", ondelete="CASCADE"),
           primary_key=True),
)

user_roles = Table(
    "user_roles",
    Base.metadata,
    Column("user_id", ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("role_id", ForeignKey("roles.id", ondelete="RESTRICT"), primary_key=True,
           index=True),
)


class Permission(Base):
    __tablename__ = "permissions"

    code: Mapped[str] = mapped_column(String(64), primary_key=True)
    group: Mapped[str] = mapped_column(String(32))
    description: Mapped[str] = mapped_column(String(200))


class Role(TimestampMixin, Base):
    __tablename__ = "roles"
    __table_args__ = (
        Index("uq_roles_restaurant_name", "restaurant_id", text("lower(name)"), unique=True),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    restaurant_id: Mapped[int] = mapped_column(ForeignKey("restaurants.id", ondelete="CASCADE"),
                                               index=True)
    name: Mapped[str] = mapped_column(String(60))
    description: Mapped[str | None] = mapped_column(String(200))
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)
    version: Mapped[int] = mapped_column(Integer, default=1)

    permissions: Mapped[list[Permission]] = relationship(secondary=role_permissions,
                                                         lazy="selectin")

    @property
    def permission_codes(self) -> set[str]:
        return {p.code for p in self.permissions}


class User(TimestampMixin, Base):
    __tablename__ = "users"
    __table_args__ = (Index("uq_users_username", text("lower(username)"), unique=True),)

    id: Mapped[int] = mapped_column(primary_key=True)
    restaurant_id: Mapped[int] = mapped_column(ForeignKey("restaurants.id", ondelete="RESTRICT"),
                                               index=True)
    location_id: Mapped[int] = mapped_column(ForeignKey("locations.id", ondelete="RESTRICT"),
                                             index=True)
    username: Mapped[str] = mapped_column(String(40))
    full_name: Mapped[str] = mapped_column(String(120))
    password_hash: Mapped[str] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    token_version: Mapped[int] = mapped_column(Integer, default=1)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    version: Mapped[int] = mapped_column(Integer, default=1)

    roles: Mapped[list[Role]] = relationship(secondary=user_roles, lazy="selectin",
                                             order_by="Role.name")

    @property
    def permission_codes(self) -> set[str]:
        codes: set[str] = set()
        for role in self.roles:
            codes |= role.permission_codes
        return codes


class AuthSession(Base):
    """One login. Refresh tokens rotate within a session; reuse of a rotated token kills it."""

    __tablename__ = "auth_sessions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True,
                                          default=uuid.uuid4)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True),
                                                 server_default=func.now())
    last_used_at: Mapped[datetime] = mapped_column(DateTime(timezone=True),
                                                   server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    device_label: Mapped[str | None] = mapped_column(String(120))


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("auth_sessions.id", ondelete="CASCADE"), index=True
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True),
                                                 server_default=func.now())
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class LoginThrottle(Base):
    """Failed-attempt counter per (purpose, username, client IP).

    Keyed by IP as well as username so nobody can lock the owner out from the internet, and
    applied to unknown usernames too so a lockout never reveals that an account exists.
    """

    __tablename__ = "login_throttles"

    key: Mapped[str] = mapped_column(String(200), primary_key=True)
    failures: Mapped[int] = mapped_column(Integer, default=0)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True),
                                                 server_default=func.now(), index=True)
