"""Browser sessions. Same accounts and rotation as the mobile endpoints, but the refresh token
lives only in an HttpOnly cookie page scripts can never read. See docs/web/SECURITY.md.

CSRF: SameSite alone is not relied on (the deployment host may share a registrable domain
with others). Every endpoint requires `X-Bistro-Client: web` (unsendable cross-site without
a CORS preflight the API never grants), an exact Origin match when Origin is present, and
Sec-Fetch-Site of same-origin when the browser sends it. In production the cookie uses the
`__Host-` prefix so no sibling host can plant or shadow it.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response, status

from app.api.deps import DB, CurrentActor
from app.api.routing import TransactionalRoute
from app.core.config import get_settings
from app.core.errors import PermissionDenied, Unauthenticated
from app.schemas.auth import ChangePasswordIn, LoginIn, TokenPair
from app.schemas.common import OutputModel
from app.services import audit, auth

router = APIRouter(route_class=TransactionalRoute, prefix="/auth/web", tags=["auth"])


def cookie_name() -> str:
    # __Host- requires Secure, which a plain-HTTP dev server can't carry.
    return "__Host-bistro_rt" if get_settings().is_production else "bistro_rt"


class WebSession(OutputModel):
    access_token: str
    token_type: str = "bearer"  # noqa: S105
    expires_in: int


def require_web_client(request: Request) -> None:
    if request.headers.get("x-bistro-client") != "web":
        raise PermissionDenied("This endpoint is for the Bistro web app.")
    fetch_site = request.headers.get("sec-fetch-site")
    if fetch_site is not None and fetch_site not in ("same-origin", "none"):
        raise PermissionDenied("Cross-site request refused.")
    origin = request.headers.get("origin")
    if origin is not None:
        expected = get_settings().web_origin
        if expected is not None:
            if origin.rstrip("/") != expected.rstrip("/"):
                raise PermissionDenied("Cross-site request refused.")
        elif origin.split("://", 1)[-1].rstrip("/") != request.headers.get("host", ""):
            raise PermissionDenied("Cross-site request refused.")


WebClient = Annotated[None, Depends(require_web_client)]


def _read_cookie(request: Request) -> str | None:
    value = request.cookies.get(cookie_name())
    return value if value and len(value) <= 200 else None


def _set_cookie(response: Response, token: str) -> None:
    settings = get_settings()
    response.set_cookie(
        cookie_name(), token, max_age=settings.web_session_ttl_seconds, path="/",
        httponly=True, secure=settings.is_production, samesite="strict",
    )


def _clear_cookie(response: Response) -> None:
    settings = get_settings()
    response.delete_cookie(cookie_name(), path="/", httponly=True,
                           secure=settings.is_production, samesite="strict")


def _session(pair: TokenPair, response: Response) -> WebSession:
    _set_cookie(response, pair.refresh_token)
    response.headers["Cache-Control"] = "no-store"
    return WebSession(access_token=pair.access_token, expires_in=pair.expires_in)


@router.post("/login", response_model=WebSession)
def login(body: LoginIn, db: DB, request: Request, response: Response, _: WebClient) -> WebSession:
    """Sign in from the browser. Shares the per-user and per-address throttles with /auth/login.
    Browser sessions last at most 12 hours and end after 2 hours idle."""
    client_ip = request.client.host if request.client else "unknown"
    label = body.device_label or "Web browser"
    return _session(auth.login(db, body.username, body.password, label, client_ip, client="web"),
                    response)


@router.post("/refresh", response_model=WebSession)
def refresh(db: DB, request: Request, response: Response, _: WebClient) -> WebSession:
    """New access token from the refresh cookie (rotated on every call)."""
    token = _read_cookie(request)
    if not token:
        raise Unauthenticated("Sign in to continue.")
    try:
        return _session(auth.refresh(db, token), response)
    except Unauthenticated:
        _clear_cookie(response)
        raise


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(db: DB, request: Request, response: Response, _: WebClient) -> None:
    """End this browser's session (works even with an expired access token)."""
    token = _read_cookie(request)
    if token:
        auth.revoke_by_refresh_token(db, token)
    _clear_cookie(response)


@router.post("/logout-all", status_code=status.HTTP_204_NO_CONTENT)
def logout_all(actor: CurrentActor, db: DB, response: Response, _: WebClient) -> None:
    """Sign out everywhere: every browser and every phone signed in as you."""
    auth.revoke_all_sessions(db, actor.user)
    audit.record(db, actor, "staff.signed_out_everywhere", "user", actor.id,
                 f"{actor.user.full_name} signed out of all devices")
    _clear_cookie(response)


@router.post("/password", response_model=WebSession)
def change_password(body: ChangePasswordIn, actor: CurrentActor, db: DB, response: Response,
                    _: WebClient) -> WebSession:
    """Change your password; other devices are signed out, this browser stays signed in."""
    pair = auth.change_password(db, actor.user, body.current_password, body.new_password,
                                client="web")
    audit.record(db, actor, "staff.password_changed", "user", actor.id,
                 f"{actor.user.full_name} changed their password")
    return _session(pair, response)
