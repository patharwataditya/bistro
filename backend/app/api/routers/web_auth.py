"""Browser sessions. Same accounts and rotation as the mobile endpoints, but the refresh token
lives only in an HttpOnly cookie page scripts can never read. See docs/web/SECURITY.md.

CSRF: SameSite alone is not relied on (the deployment host may share a registrable domain
with others). Every endpoint requires `X-Bistro-Client: web` (unsendable cross-site without
a CORS preflight the API never grants), an Origin header that exactly matches this site
(browsers send it on every POST), and Sec-Fetch-Site of same-origin when the browser sends
it. In production the cookie uses the `__Host-` prefix so no sibling host can plant or
shadow it. Tokens are bound to their client type: a browser session can't be refreshed or
re-issued as a phone session, or the reverse.
"""

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response, status
from pydantic import Field

from app.api.deps import DB, CurrentActor
from app.api.routing import TransactionalRoute
from app.core.config import get_settings
from app.core.errors import AccountInactive, PermissionDenied, Unauthenticated
from app.schemas.auth import ChangePasswordIn, LoginIn, TokenPair
from app.schemas.common import InputModel, OutputModel
from app.services import audit, auth


def cookie_name() -> str:
    # __Host- requires Secure, which a plain-HTTP dev server can't carry.
    return "__Host-bistro_rt" if get_settings().is_production else "bistro_rt"


class WebSession(OutputModel):
    access_token: str
    token_type: str = "bearer"  # noqa: S105
    expires_in: int


class WebRefreshIn(InputModel):
    # Seconds since the person last touched the app (any tab). Omitted = no interaction.
    idle_seconds: Annotated[int | None, Field(ge=0, le=7 * 24 * 3600)] = None


def _expected_origin(request: Request) -> str:
    configured = get_settings().web_origin
    if configured:
        return configured.rstrip("/")
    return f"{request.url.scheme}://{request.headers.get('host', '')}"


def require_web_client(request: Request, response: Response) -> None:
    # Every answer from these endpoints is personal and single-use.
    response.headers["Cache-Control"] = "no-store"
    if request.headers.get("x-bistro-client") != "web":
        raise PermissionDenied("This endpoint is for the Bistro web app.")
    fetch_site = request.headers.get("sec-fetch-site")
    if fetch_site is not None and fetch_site not in ("same-origin", "none"):
        raise PermissionDenied("Cross-site request refused.")
    origin = request.headers.get("origin")
    if origin is None or origin.rstrip("/") != _expected_origin(request):
        raise PermissionDenied("Cross-site request refused.")


# Every route in this router is guarded; there is no way to add one that isn't.
router = APIRouter(route_class=TransactionalRoute, prefix="/auth/web", tags=["auth"],
                   dependencies=[Depends(require_web_client)])


def _read_cookie(request: Request) -> str | None:
    value = request.cookies.get(cookie_name())
    return value if value and len(value) <= 200 else None


def _clear_cookie_header() -> tuple[str, str]:
    settings = get_settings()
    scratch = Response()
    scratch.delete_cookie(cookie_name(), path="/", httponly=True,
                          secure=settings.is_production, samesite="strict")
    return ("set-cookie", scratch.headers["set-cookie"])


def _clear_cookie(response: Response) -> None:
    response.headers.append(*_clear_cookie_header())


def _session(db: DB, pair: TokenPair, response: Response) -> WebSession:
    session = auth.session_for_refresh_token(db, pair.refresh_token)
    # The cookie never outlives the session's absolute limit.
    remaining = (session.expires_at - datetime.now(UTC)).total_seconds() if session else 0
    settings = get_settings()
    response.set_cookie(
        cookie_name(), pair.refresh_token, max_age=max(1, int(remaining)), path="/",
        httponly=True, secure=settings.is_production, samesite="strict",
    )
    return WebSession(access_token=pair.access_token, expires_in=pair.expires_in)


def _web_actor_session(db: DB, actor: CurrentActor) -> None:
    if auth.session_client(db, actor.session_id) != "web":
        raise PermissionDenied("This endpoint is for the Bistro web app.")


@router.post("/login", response_model=WebSession)
def login(body: LoginIn, db: DB, request: Request, response: Response) -> WebSession:
    """Sign in from the browser. Shares the per-user and per-address throttles with /auth/login.
    Browser sessions last at most 12 hours and end after 2 hours without interaction. A
    browser holds one session: signing in over someone else's ends theirs."""
    client_ip = request.client.host if request.client else "unknown"
    label = body.device_label or "Web browser"
    pair = auth.login(db, body.username, body.password, label, client_ip, client="web")
    previous = _read_cookie(request)
    if previous:
        auth.revoke_by_refresh_token(db, previous)
    return _session(db, pair, response)


@router.post("/refresh", response_model=WebSession)
def refresh(db: DB, request: Request, response: Response,
            body: WebRefreshIn | None = None) -> WebSession:
    """New access token from the refresh cookie (rotated on every call). The app reports how
    long the person has been idle; background polling alone never extends the session."""
    token = _read_cookie(request)
    if not token:
        raise Unauthenticated("Sign in to continue.")
    try:
        pair = auth.refresh(db, token, client="web",
                            idle_seconds=body.idle_seconds if body else None)
    except (Unauthenticated, AccountInactive) as e:
        e.headers.append(_clear_cookie_header())
        raise
    return _session(db, pair, response)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(db: DB, request: Request, response: Response) -> None:
    """End this browser's session (works even with an expired access token)."""
    token = _read_cookie(request)
    if token:
        auth.revoke_by_refresh_token(db, token)
    _clear_cookie(response)


@router.post("/logout-all", status_code=status.HTTP_204_NO_CONTENT)
def logout_all(actor: CurrentActor, db: DB, response: Response) -> None:
    """Sign out everywhere: every browser and every phone signed in as you."""
    _web_actor_session(db, actor)
    auth.revoke_all_sessions(db, actor.user)
    audit.record(db, actor, "staff.signed_out_everywhere", "user", actor.id,
                 f"{actor.user.full_name} signed out of all devices")
    _clear_cookie(response)


@router.post("/password", response_model=WebSession)
def change_password(body: ChangePasswordIn, actor: CurrentActor, db: DB,
                    response: Response) -> WebSession:
    """Change your password; other devices are signed out, this browser stays signed in."""
    _web_actor_session(db, actor)
    pair = auth.change_password(db, actor.user, body.current_password, body.new_password,
                                client="web")
    audit.record(db, actor, "staff.password_changed", "user", actor.id,
                 f"{actor.user.full_name} changed their password")
    return _session(db, pair, response)
