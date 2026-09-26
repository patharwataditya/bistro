from typing import Annotated

from fastapi import APIRouter, Body, status

from app.api.deps import DB, CurrentActor
from app.core.permissions import PERMISSIONS
from app.models import Restaurant
from app.schemas.auth import ChangePasswordIn, LoginIn, RefreshIn, TokenPair
from app.schemas.staff import LocationBrief, MeOut, RoleSummary
from app.services import audit, auth

router = APIRouter(tags=["auth"])


@router.post("/auth/login", response_model=TokenPair)
def login(body: LoginIn, db: DB) -> TokenPair:
    """Exchange credentials for an access token (15 min) and a rotating refresh token."""
    return auth.login(db, body.username, body.password, body.device_label)


@router.post("/auth/refresh", response_model=TokenPair)
def refresh(body: RefreshIn, db: DB) -> TokenPair:
    """Rotate the refresh token. Presenting an already-used token revokes the session."""
    return auth.refresh(db, body.refresh_token)


@router.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(actor: CurrentActor, db: DB,
           body: Annotated[RefreshIn | None, Body()] = None) -> None:
    auth.logout(db, actor.id, body.refresh_token if body else None)


@router.get("/me", response_model=MeOut)
def me(actor: CurrentActor, db: DB) -> MeOut:
    restaurant = db.get(Restaurant, actor.restaurant_id)
    return MeOut(
        id=actor.user.id, username=actor.user.username, full_name=actor.user.full_name,
        roles=[RoleSummary(id=r.id, name=r.name) for r in actor.user.roles],
        permissions=sorted(p for p in actor.permissions if p in PERMISSIONS),
        location=LocationBrief.model_validate(actor.location),
        restaurant_name=restaurant.name if restaurant else "",
    )


@router.post("/me/password", response_model=TokenPair)
def change_password(body: ChangePasswordIn, actor: CurrentActor, db: DB) -> TokenPair:
    """Change your password. Signs out every other device; returns fresh tokens for this one."""
    pair = auth.change_password(db, actor.user, body.current_password, body.new_password)
    audit.record(db, actor, "staff.password_changed", "user", actor.id,
                 f"{actor.user.full_name} changed their password")
    return pair


