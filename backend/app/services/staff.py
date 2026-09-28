"""Staff accounts and roles, with the anti-privilege-escalation rules from ARCHITECTURE §5."""

from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import Actor
from app.core.errors import (
    AccountInactive,
    Conflict,
    InvalidTransition,
    NotFound,
    PermissionDenied,
    StaleVersion,
    ValidationFailed,
)
from app.core.permissions import ALL, OWNER_ROLE
from app.core.security import hash_password
from app.models import Permission, Role, User
from app.models.identity import user_roles
from app.schemas.staff import (
    RoleCreate,
    RoleOut,
    RoleSummary,
    RoleUpdate,
    UserCreate,
    UserOut,
    UserUpdate,
)
from app.services import audit
from app.services.auth import revoke_all_sessions

# ---------- rules ----------

def _serialize(db: Session, actor: Actor) -> None:
    """Serialise all staff/role mutations of a restaurant and re-validate the actor inside
    the lock. Without this, two owners deactivating each other concurrently could both
    succeed (each counting the other as still active) and leave the restaurant ownerless."""
    db.execute(text("SELECT pg_advisory_xact_lock(hashtextextended(:k, 0))"),
               {"k": f"staff:{actor.restaurant_id}"})
    db.refresh(actor.user)
    db.refresh(actor.user, attribute_names=["roles"])
    if not actor.user.is_active:
        raise AccountInactive("This account has been deactivated.")
    actor.permissions = frozenset(actor.user.permission_codes)


def can_manage_user(actor: Actor, target: User) -> bool:
    """You may manage someone only if you already hold every permission they hold."""
    return target.id != actor.id and target.permission_codes <= actor.permissions


def can_reset_password(actor: Actor, target: User) -> bool:
    return target.id != actor.id and target.permission_codes < actor.permissions


def _ensure_can_manage(actor: Actor, target: User) -> None:
    if target.id == actor.id:
        raise PermissionDenied("You can't change your own access. Ask another manager.")
    if not target.permission_codes <= actor.permissions:
        raise PermissionDenied("This person has access you don't have, so you can't manage them.")


def _ensure_can_reset_password(actor: Actor, target: User) -> None:
    # Strictly more access, not merely equal: peers (owner/owner, admin/admin) must not be
    # able to take over each other's accounts and act under their name.
    _ensure_can_manage(actor, target)
    if not target.permission_codes < actor.permissions:
        raise PermissionDenied("Only someone with more access can reset this password.")


def _ensure_can_grant(actor: Actor, roles: list[Role]) -> None:
    for role in roles:
        if not role.permission_codes <= actor.permissions:
            raise PermissionDenied(
                f"You can't assign the {role.name} role: it includes access you don't have.")


def role_editable(actor: Actor, role: Role, members: list[User]) -> bool:
    """Mirror of `_ensure_role_editable`, so the app never offers an edit the API refuses."""
    return (not role.is_system and role.permission_codes <= actor.permissions
            and role not in actor.user.roles
            and all(m.permission_codes <= actor.permissions for m in members))


# ---------- lookups ----------

def _get_user(db: Session, actor: Actor, user_id: int, *, lock: bool = False) -> User:
    stmt = select(User).where(User.id == user_id, User.restaurant_id == actor.restaurant_id)
    if lock:
        stmt = stmt.with_for_update(key_share=True).execution_options(populate_existing=True)
    user = db.scalar(stmt)
    if user is None:
        raise NotFound("Staff member not found.")
    return user


def _get_role(db: Session, actor: Actor, role_id: int, *, lock: bool = False) -> Role:
    stmt = select(Role).where(Role.id == role_id, Role.restaurant_id == actor.restaurant_id)
    if lock:
        stmt = stmt.with_for_update(key_share=True).execution_options(populate_existing=True)
    role = db.scalar(stmt)
    if role is None:
        raise NotFound("Role not found.")
    return role


def _resolve_roles(db: Session, actor: Actor, role_ids: list[int]) -> list[Role]:
    unique_ids = set(role_ids)
    roles = list(db.scalars(select(Role).where(Role.id.in_(unique_ids),
                                               Role.restaurant_id == actor.restaurant_id)))
    if len(roles) != len(unique_ids):
        raise ValidationFailed("One or more roles don't exist.")
    return roles


def _active_owner_count(db: Session, restaurant_id: int) -> int:
    return db.scalar(
        select(func.count(func.distinct(User.id)))
        .join(user_roles, user_roles.c.user_id == User.id)
        .join(Role, Role.id == user_roles.c.role_id)
        .where(Role.restaurant_id == restaurant_id, Role.is_system, Role.name == OWNER_ROLE,
               User.is_active)
    ) or 0


def _is_owner(user: User) -> bool:
    return any(r.is_system and r.name == OWNER_ROLE for r in user.roles)


# ---------- users ----------

def to_user_out(actor: Actor, user: User) -> UserOut:
    return UserOut(
        id=user.id, username=user.username, full_name=user.full_name, is_active=user.is_active,
        roles=[RoleSummary(id=r.id, name=r.name) for r in user.roles],
        last_login_at=user.last_login_at, created_at=user.created_at, version=user.version,
        manageable=can_manage_user(actor, user),
        password_resettable=can_reset_password(actor, user),
    )


def list_users(db: Session, actor: Actor, *, include_inactive: bool, query: str | None,
               limit: int, offset: int) -> tuple[list[User], int]:
    stmt = select(User).where(User.restaurant_id == actor.restaurant_id)
    if not include_inactive:
        stmt = stmt.where(User.is_active)
    if query:
        pattern = f"%{query.lower()}%"
        stmt = stmt.where(func.lower(User.full_name).like(pattern)
                          | func.lower(User.username).like(pattern))
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    users = list(db.scalars(stmt.order_by(User.is_active.desc(), func.lower(User.full_name))
                            .limit(limit).offset(offset)))
    return users, total


def get_user(db: Session, actor: Actor, user_id: int) -> User:
    return _get_user(db, actor, user_id)


def create_user(db: Session, actor: Actor, data: UserCreate) -> User:
    _serialize(db, actor)
    roles = _resolve_roles(db, actor, data.role_ids)
    _ensure_can_grant(actor, roles)
    if db.scalar(select(User.id).where(func.lower(User.username) == data.username.lower())):
        raise Conflict("That username is taken.", details={"field": "username"})
    user = User(
        restaurant_id=actor.restaurant_id, location_id=actor.location_id,
        username=data.username, full_name=data.full_name,
        password_hash=hash_password(data.password), roles=roles,
    )
    db.add(user)
    try:
        db.flush()
    except IntegrityError as exc:
        raise Conflict("That username is taken.", details={"field": "username"}) from exc
    audit.record(db, actor, "staff.created", "user", user.id,
                 f"Created {user.full_name} (@{user.username})",
                 roles=[r.name for r in roles])
    return user


def update_user(db: Session, actor: Actor, user_id: int, data: UserUpdate) -> User:
    _serialize(db, actor)
    user = _get_user(db, actor, user_id, lock=True)
    _ensure_can_manage(actor, user)
    if user.version != data.version:
        raise StaleVersion("staff member", user.version)
    if data.full_name is not None and data.full_name != user.full_name:
        audit.record(db, actor, "staff.renamed", "user", user.id,
                     f"Renamed {user.full_name} to {data.full_name}")
        user.full_name = data.full_name
    if data.role_ids is not None:
        roles = _resolve_roles(db, actor, data.role_ids)
        _ensure_can_grant(actor, roles)
        before = sorted(r.name for r in user.roles)
        after = sorted(r.name for r in roles)
        if before != after:
            was_owner = _is_owner(user)
            user.roles = roles
            db.flush()
            if was_owner and not _is_owner(user) and _active_owner_count(db, actor.restaurant_id) == 0:
                raise InvalidTransition("There must always be at least one active Owner.")
            # Tokens carry no permissions (they are loaded per request), so the change is
            # effective on the user's very next call without signing them out.
            audit.record(db, actor, "staff.roles_changed", "user", user.id,
                         f"Changed roles for {user.full_name}", before=before, after=after)
    user.version += 1
    db.flush()
    return user


def set_active(db: Session, actor: Actor, user_id: int, active: bool, version: int) -> User:
    _serialize(db, actor)
    user = _get_user(db, actor, user_id, lock=True)
    _ensure_can_manage(actor, user)
    if user.version != version:
        raise StaleVersion("staff member", user.version)
    if user.is_active == active:
        return user
    user.is_active = active
    db.flush()
    if not active:
        if _is_owner(user) and _active_owner_count(db, actor.restaurant_id) == 0:
            raise InvalidTransition("There must always be at least one active Owner.")
        revoke_all_sessions(db, user)
    user.version += 1
    audit.record(db, actor, "staff.reactivated" if active else "staff.deactivated", "user",
                 user.id, f"{'Reactivated' if active else 'Deactivated'} {user.full_name}")
    db.flush()
    return user


def reset_password(db: Session, actor: Actor, user_id: int, new_password: str,
                   version: int) -> User:
    _serialize(db, actor)
    user = _get_user(db, actor, user_id, lock=True)
    _ensure_can_reset_password(actor, user)
    if user.version != version:
        raise StaleVersion("staff member", user.version)
    user.password_hash = hash_password(new_password)
    revoke_all_sessions(db, user)
    user.version += 1
    audit.record(db, actor, "staff.password_reset", "user", user.id,
                 f"Reset password for {user.full_name}")
    db.flush()
    return user


# ---------- roles ----------

def _members(db: Session, actor: Actor) -> dict[int, list[User]]:
    """Role id → users holding it (active or not). Restaurants have tens of staff, not
    thousands, so loading them with their roles is one cheap query."""
    by_role: dict[int, list[User]] = {}
    for user in db.scalars(select(User).where(User.restaurant_id == actor.restaurant_id)):
        for role in user.roles:
            by_role.setdefault(role.id, []).append(user)
    return by_role


def to_role_out(actor: Actor, role: Role, members: list[User]) -> RoleOut:
    return RoleOut(
        id=role.id, name=role.name, description=role.description, is_system=role.is_system,
        permissions=sorted(role.permission_codes),
        member_count=sum(1 for m in members if m.is_active),
        assigned_count=len(members),
        version=role.version, editable=role_editable(actor, role, members),
    )


def list_roles(db: Session, actor: Actor) -> list[RoleOut]:
    roles = list(db.scalars(select(Role).where(Role.restaurant_id == actor.restaurant_id)
                            .order_by(Role.is_system.desc(), func.lower(Role.name))))
    members = _members(db, actor)
    return [to_role_out(actor, r, members.get(r.id, [])) for r in roles]


def role_out(db: Session, actor: Actor, role: Role) -> RoleOut:
    return to_role_out(actor, role, _members(db, actor).get(role.id, []))


def get_role(db: Session, actor: Actor, role_id: int) -> Role:
    return _get_role(db, actor, role_id)


def _resolve_permissions(db: Session, actor: Actor, codes: list[str]) -> list[Permission]:
    wanted = set(codes)
    unknown = wanted - ALL
    if unknown:
        raise ValidationFailed("Unknown permissions.", details={"unknown": sorted(unknown)})
    beyond = wanted - actor.permissions
    if beyond:
        raise PermissionDenied("You can't grant access you don't have yourself.",
                               details={"permissions": sorted(beyond)})
    return list(db.scalars(select(Permission).where(Permission.code.in_(wanted))))


def _ensure_name_free(db: Session, actor: Actor, name: str, exclude_id: int | None) -> None:
    stmt = select(Role.id).where(Role.restaurant_id == actor.restaurant_id,
                                 func.lower(Role.name) == name.lower())
    if exclude_id is not None:
        stmt = stmt.where(Role.id != exclude_id)
    if db.scalar(stmt) is not None:
        raise Conflict("A role with that name already exists.", details={"field": "name"})


def create_role(db: Session, actor: Actor, data: RoleCreate) -> Role:
    _serialize(db, actor)
    _ensure_name_free(db, actor, data.name, None)
    role = Role(restaurant_id=actor.restaurant_id, name=data.name, description=data.description,
                permissions=_resolve_permissions(db, actor, data.permissions))
    db.add(role)
    db.flush()
    audit.record(db, actor, "role.created", "role", role.id, f"Created role {role.name}",
                 permissions=sorted(role.permission_codes))
    return role


def _ensure_role_editable(db: Session, actor: Actor, role: Role) -> None:
    if role.is_system:
        raise PermissionDenied("The Owner role is built in and can't be changed.")
    if role in actor.user.roles:
        raise PermissionDenied("You can't edit a role you hold. Ask another manager.")
    if not role.permission_codes <= actor.permissions:
        raise PermissionDenied("This role includes access you don't have, so you can't edit it.")
    # Editing a role changes the access of everyone holding it, so it is only allowed when
    # the actor could manage each of those people directly.
    members = db.scalars(select(User).join(user_roles).where(user_roles.c.role_id == role.id))
    if any(not m.permission_codes <= actor.permissions for m in members):
        raise PermissionDenied("Someone with this role has access you don't have, "
                               "so you can't edit it.")


def update_role(db: Session, actor: Actor, role_id: int, data: RoleUpdate) -> Role:
    _serialize(db, actor)
    role = _get_role(db, actor, role_id, lock=True)
    _ensure_role_editable(db, actor, role)
    if role.version != data.version:
        raise StaleVersion("role", role.version)
    if data.name is not None and data.name != role.name:
        _ensure_name_free(db, actor, data.name, role.id)
        audit.record(db, actor, "role.renamed", "role", role.id,
                     f"Renamed role {role.name} to {data.name}")
        role.name = data.name
    if data.description is not None:
        role.description = data.description or None
    if data.permissions is not None:
        before = role.permission_codes
        role.permissions = _resolve_permissions(db, actor, data.permissions)
        after = role.permission_codes
        if before != after:
            audit.record(db, actor, "role.permissions_changed", "role", role.id,
                         f"Changed permissions of {role.name}",
                         added=sorted(after - before), removed=sorted(before - after))
    role.version += 1
    db.flush()
    return role


def delete_role(db: Session, actor: Actor, role_id: int) -> None:
    _serialize(db, actor)
    role = _get_role(db, actor, role_id, lock=True)
    _ensure_role_editable(db, actor, role)
    in_use = db.scalar(select(func.count()).select_from(user_roles)
                       .where(user_roles.c.role_id == role.id)) or 0
    if in_use:
        raise Conflict(f"{in_use} staff member(s) still have this role. Reassign them first.")
    audit.record(db, actor, "role.deleted", "role", role.id, f"Deleted role {role.name}")
    db.delete(role)
    db.flush()
