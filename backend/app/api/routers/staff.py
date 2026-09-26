from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select

from app.api.deps import DB, Actor, require
from app.api.routing import TransactionalRoute
from app.models import Permission
from app.schemas.common import Page, VersionIn
from app.schemas.staff import (
    PermissionOut,
    ResetPasswordIn,
    RoleCreate,
    RoleOut,
    RoleUpdate,
    UserCreate,
    UserOut,
    UserUpdate,
)
from app.services import staff

router = APIRouter(route_class=TransactionalRoute, tags=["staff"])


@router.get("/users", response_model=Page[UserOut])
def list_users(
    db: DB,
    actor: Annotated[Actor, Depends(require("staff.view"))],
    include_inactive: bool = False,
    q: Annotated[str | None, Query(max_length=60)] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> Page[UserOut]:
    users, total = staff.list_users(db, actor, include_inactive=include_inactive, query=q,
                                    limit=limit, offset=offset)
    return Page(items=[staff.to_user_out(actor, u) for u in users], total=total, limit=limit,
                offset=offset)


@router.get("/users/{user_id}", response_model=UserOut)
def get_user(user_id: int, db: DB,
             actor: Annotated[Actor, Depends(require("staff.view"))]) -> UserOut:
    return staff.to_user_out(actor, staff.get_user(db, actor, user_id))


@router.post("/users", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(body: UserCreate, db: DB,
                actor: Annotated[Actor, Depends(require("staff.create"))]) -> UserOut:
    return staff.to_user_out(actor, staff.create_user(db, actor, body))


@router.patch("/users/{user_id}", response_model=UserOut)
def update_user(user_id: int, body: UserUpdate, db: DB,
                actor: Annotated[Actor, Depends(require("staff.update"))]) -> UserOut:
    return staff.to_user_out(actor, staff.update_user(db, actor, user_id, body))


@router.post("/users/{user_id}/deactivate", response_model=UserOut)
def deactivate_user(user_id: int, body: VersionIn, db: DB,
                    actor: Annotated[Actor, Depends(require("staff.deactivate"))]) -> UserOut:
    return staff.to_user_out(actor, staff.set_active(db, actor, user_id, False, body.version))


@router.post("/users/{user_id}/reactivate", response_model=UserOut)
def reactivate_user(user_id: int, body: VersionIn, db: DB,
                    actor: Annotated[Actor, Depends(require("staff.deactivate"))]) -> UserOut:
    return staff.to_user_out(actor, staff.set_active(db, actor, user_id, True, body.version))


@router.post("/users/{user_id}/password", response_model=UserOut)
def reset_password(user_id: int, body: ResetPasswordIn, db: DB,
                   actor: Annotated[Actor, Depends(require("staff.update"))]) -> UserOut:
    return staff.to_user_out(
        actor, staff.reset_password(db, actor, user_id, body.new_password, body.version))


@router.get("/permissions", response_model=list[PermissionOut])
def list_permissions(db: DB,
                     _: Annotated[Actor, Depends(require("roles.view"))]) -> list[PermissionOut]:
    rows = db.scalars(select(Permission).order_by(Permission.group, Permission.code))
    return [PermissionOut.model_validate(p) for p in rows]


@router.get("/roles", response_model=list[RoleOut])
def list_roles(db: DB, actor: Annotated[Actor, Depends(require("roles.view"))]) -> list[RoleOut]:
    return staff.list_roles(db, actor)


@router.get("/roles/{role_id}", response_model=RoleOut)
def get_role(role_id: int, db: DB,
             actor: Annotated[Actor, Depends(require("roles.view"))]) -> RoleOut:
    return staff.role_out(db, actor, staff.get_role(db, actor, role_id))


@router.post("/roles", response_model=RoleOut, status_code=status.HTTP_201_CREATED)
def create_role(body: RoleCreate, db: DB,
                actor: Annotated[Actor, Depends(require("roles.create"))]) -> RoleOut:
    return staff.role_out(db, actor, staff.create_role(db, actor, body))


@router.patch("/roles/{role_id}", response_model=RoleOut)
def update_role(role_id: int, body: RoleUpdate, db: DB,
                actor: Annotated[Actor, Depends(require("roles.update"))]) -> RoleOut:
    return staff.role_out(db, actor, staff.update_role(db, actor, role_id, body))


@router.delete("/roles/{role_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_role(role_id: int, db: DB,
                actor: Annotated[Actor, Depends(require("roles.delete"))]) -> None:
    staff.delete_role(db, actor, role_id)
