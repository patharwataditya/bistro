from fastapi import APIRouter, Request, Response, status

from app.api.deps import DB, CurrentActor
from app.api.routing import TransactionalRoute
from app.core.permissions import PERMISSIONS
from app.models import Restaurant
from app.schemas.auth import ChangePasswordIn, LoginIn, RefreshIn, TokenPair
from app.schemas.staff import LocationBrief, MeOut, RoleSummary
from app.services import audit, auth

router = APIRouter(route_class=TransactionalRoute, tags=["auth"])


@router.post("/auth/login", response_model=TokenPair)
def login(body: LoginIn, db: DB, request: Request, response: Response) -> TokenPair:
    """Exchange credentials for an access token (15 min) and a rotating refresh token.
    Repeated failures for a username from one address are throttled (429 RATE_LIMITED)."""
    client_ip = request.client.host if request.client else "unknown"
    response.headers["Cache-Control"] = "no-store"
    return auth.login(db, body.username, body.password, body.device_label, client_ip)


@router.post("/auth/refresh", response_model=TokenPair)
def refresh(body: RefreshIn, db: DB, response: Response) -> TokenPair:
    """Rotate the refresh token. Presenting an already-used token revokes the session."""
    response.headers["Cache-Control"] = "no-store"
    return auth.refresh(db, body.refresh_token)


@router.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(actor: CurrentActor, db: DB) -> None:
    """End the current session: its access and refresh tokens stop working immediately."""
    auth.logout(db, actor.id, actor.session_id)


@router.post("/auth/revoke", status_code=status.HTTP_204_NO_CONTENT)
def revoke(body: RefreshIn, db: DB) -> None:
    """End the session that owns this refresh token. Always 204 (reveals nothing)."""
    auth.revoke_by_refresh_token(db, body.refresh_token)


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


