"""Security review of the Bistro Web auth changes (a3c8d38).

Android compatibility: behaviour the phone app depends on that must not change.
Regression tests: one per review finding, each reproduced before it was fixed.
"""

from datetime import timedelta

from sqlalchemy import select

from app.models import AuthSession
from app.seed import DEMO_PASSWORD
from tests.conftest import err, ok

WEB = {"X-Bistro-Client": "web", "Origin": "http://testserver"}


def _mobile_login(client, username="manager"):
    return ok(client.post("/api/v1/auth/login",
                          json={"username": username, "password": DEMO_PASSWORD,
                                "device_label": "Pixel"}))


def _web_login(client, username="manager"):
    return ok(client.post("/api/v1/auth/web/login",
                          json={"username": username, "password": DEMO_PASSWORD}, headers=WEB))


def _session_for(db, access_token_owner_client: str) -> AuthSession:
    return db.scalars(select(AuthSession).where(AuthSession.client == access_token_owner_client)
                      .order_by(AuthSession.created_at.desc())).first()


# ---------- Android compatibility (must pass) ----------

def test_android_login_contract_unchanged(client, db):
    r = client.post("/api/v1/auth/login",
                    json={"username": "manager", "password": DEMO_PASSWORD, "device_label": "Pixel"})
    body = ok(r)
    assert set(body) == {"access_token", "refresh_token", "expires_in", "token_type"} or \
        {"access_token", "refresh_token", "expires_in"} <= set(body)
    assert body["expires_in"] == 15 * 60
    assert "set-cookie" not in r.headers  # mobile never gets a cookie
    s = db.scalar(select(AuthSession).order_by(AuthSession.created_at.desc()))
    assert s.client == "mobile"
    assert timedelta(days=29, hours=23) < s.expires_at - s.created_at <= timedelta(days=30, minutes=1)


def test_android_mobile_session_has_no_idle_timeout(client, db):
    pair = _mobile_login(client)
    s = _session_for(db, "mobile")
    s.last_used_at = s.last_used_at - timedelta(days=10)
    db.flush()
    fresh = ok(client.post("/api/v1/auth/refresh", json={"refresh_token": pair["refresh_token"]}))
    assert fresh["refresh_token"] != pair["refresh_token"]


def test_android_mobile_refresh_ignores_cookies(client):
    _web_login(client)  # the TestClient jar now holds a web refresh cookie
    err(client.post("/api/v1/auth/refresh", json={}), 422, "VALIDATION_ERROR")


def test_android_password_change_still_returns_30_day_pair(client, db):
    pair = _mobile_login(client)
    fresh = ok(client.post("/api/v1/me/password",
                           headers={"Authorization": f"Bearer {pair['access_token']}"},
                           json={"current_password": DEMO_PASSWORD, "new_password": "n3w-password!x"}))
    assert fresh["refresh_token"]
    s = _session_for(db, "mobile")
    assert s.expires_at - s.created_at > timedelta(days=29)


def test_android_audit_logs_without_time_window(as_user):
    page = ok(as_user("manager").get("/audit-logs", params={"limit": 50}))
    assert "items" in page and "next_before_id" in page


def test_android_revoke_and_logout_unchanged(client):
    pair = _mobile_login(client)
    ok(client.post("/api/v1/auth/revoke", json={"refresh_token": pair["refresh_token"]}), 204)
    err(client.post("/api/v1/auth/refresh", json={"refresh_token": pair["refresh_token"]}), 401,
        "UNAUTHENTICATED")


def test_web_endpoints_do_not_touch_mobile_routes(client):
    # Unknown /auth/web paths are plain 404 envelopes, not something the app could hit.
    err(client.post("/api/v1/auth/web/nope", headers=WEB), 404, "NOT_FOUND")


# ---------- CSRF (sslip.io siblings are same-site) ----------

def test_sibling_sslip_origin_refused_without_web_origin_setting(client):
    for origin in ("https://evil-1-2-3-4.sslip.io", "null", "https://testserver.evil"):
        err(client.post("/api/v1/auth/web/login", headers={**WEB, "Origin": origin},
                        json={"username": "manager", "password": DEMO_PASSWORD}),
            403, "PERMISSION_DENIED")


def test_sibling_fetch_metadata_refused(client):
    _web_login(client)
    err(client.post("/api/v1/auth/web/logout", headers={**WEB, "Sec-Fetch-Site": "same-site"}),
        403, "PERMISSION_DENIED")


def test_no_cors_preflight_is_granted(client):
    r = client.options("/api/v1/auth/web/login", headers={
        "Origin": "https://evil-1-2-3-4.sslip.io", "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "x-bistro-client,content-type"})
    assert "access-control-allow-origin" not in r.headers


# ---------- Regression tests for review findings ----------

def test_failed_refresh_clears_cookie(client, db):
    _web_login(client)
    s = _session_for(db, "web")
    s.revoked_at = s.created_at
    db.flush()
    r = client.post("/api/v1/auth/web/refresh", headers=WEB)
    err(r, 401, "UNAUTHENTICATED")
    assert "bistro_rt=" in r.headers.get("set-cookie", "")


def test_inactive_refresh_clears_cookie(client, db):
    _web_login(client, "cashier")
    from app.models import User
    user = db.scalar(select(User).where(User.username == "cashier"))
    user.is_active = False
    db.flush()
    r = client.post("/api/v1/auth/web/refresh", headers=WEB)
    err(r, 403, "ACCOUNT_INACTIVE")
    assert "bistro_rt=" in r.headers.get("set-cookie", "")


def test_web_session_cannot_mint_mobile_lifetime_session(client, db):
    body = _web_login(client)
    fresh = client.post("/api/v1/me/password",
                        headers={"Authorization": f"Bearer {body['access_token']}"},
                        json={"current_password": DEMO_PASSWORD, "new_password": "n3w-password!x"})
    if fresh.status_code == 200:
        s = db.scalar(select(AuthSession).where(AuthSession.revoked_at.is_(None))
                      .order_by(AuthSession.created_at.desc()))
        assert s.client == "web", f"web caller got a {s.client} session: {s.expires_at - s.created_at}"


def test_web_refresh_rejects_mobile_session_token(client):
    pair = _mobile_login(client)
    client.cookies.set("bistro_rt", pair["refresh_token"])
    r = client.post("/api/v1/auth/web/refresh", headers=WEB)
    assert r.status_code == 401


def test_mobile_refresh_rejects_web_session_token(client):
    _web_login(client)
    token = client.cookies.get("bistro_rt")
    client.cookies.clear()
    r = client.post("/api/v1/auth/refresh", json={"refresh_token": token})
    assert r.status_code == 401


def test_cookie_max_age_tracks_absolute_lifetime(client, db):
    _web_login(client)
    s = _session_for(db, "web")
    s.expires_at = s.expires_at - timedelta(hours=11)
    s.created_at = s.created_at - timedelta(hours=11)
    db.flush()
    r = client.post("/api/v1/auth/web/refresh", headers=WEB)
    ok(r)
    max_age = int(r.headers["set-cookie"].split("Max-Age=")[1].split(";")[0])
    assert max_age <= 3600


def test_web_login_replaces_existing_browser_session(client, db):
    _web_login(client, "manager")
    first = _session_for(db, "web")
    _web_login(client, "cashier")
    db.refresh(first)
    assert first.revoked_at is not None


def test_web_error_responses_not_cacheable(client):
    r = client.post("/api/v1/auth/web/refresh", headers=WEB)
    assert r.headers.get("cache-control") == "no-store"


def test_web_session_cannot_use_phone_password_endpoint(client):
    body = _web_login(client)
    err(client.post("/api/v1/me/password", headers={"Authorization": f"Bearer {body['access_token']}"},
                    json={"current_password": DEMO_PASSWORD, "new_password": "n3w-password!x"}),
        403, "PERMISSION_DENIED")


def test_phone_session_cannot_use_web_only_endpoints(client):
    pair = _mobile_login(client)
    h = {**WEB, "Authorization": f"Bearer {pair['access_token']}"}
    err(client.post("/api/v1/auth/web/logout-all", headers=h), 403, "PERMISSION_DENIED")
    err(client.post("/api/v1/auth/web/password", headers=h,
                    json={"current_password": DEMO_PASSWORD, "new_password": "n3w-password!x"}),
        403, "PERMISSION_DENIED")


def test_origin_is_required(client):
    err(client.post("/api/v1/auth/web/login", headers={"X-Bistro-Client": "web"},
                    json={"username": "manager", "password": DEMO_PASSWORD}), 403, "PERMISSION_DENIED")


def test_guard_runs_before_body_validation(client):
    err(client.post("/api/v1/auth/web/login", json={}), 403, "PERMISSION_DENIED")


def test_polling_without_interaction_does_not_extend_idle(client, db):
    _web_login(client)
    s = _session_for(db, "web")
    start = s.last_used_at - timedelta(minutes=90)
    s.last_used_at = start
    db.flush()
    # Background refresh: the person has been idle for 90 minutes.
    ok(client.post("/api/v1/auth/web/refresh", headers=WEB, json={"idle_seconds": 90 * 60}))
    db.refresh(s)
    assert abs((s.last_used_at - start).total_seconds()) < 5
    # No report at all also leaves it alone.
    ok(client.post("/api/v1/auth/web/refresh", headers=WEB))
    db.refresh(s)
    assert abs((s.last_used_at - start).total_seconds()) < 5
    # Idle past the limit: signed out, cookie cleared, even if they click right now.
    s.last_used_at = start - timedelta(minutes=31)
    db.flush()
    r = client.post("/api/v1/auth/web/refresh", headers=WEB, json={"idle_seconds": 0})
    err(r, 401, "UNAUTHENTICATED")
    assert "bistro_rt=" in r.headers.get("set-cookie", "")


def test_interaction_extends_idle(client, db):
    _web_login(client)
    s = _session_for(db, "web")
    before = s.last_used_at - timedelta(minutes=90)
    s.last_used_at = before
    db.flush()
    ok(client.post("/api/v1/auth/web/refresh", headers=WEB, json={"idle_seconds": 3}))
    db.refresh(s)
    assert s.last_used_at > before + timedelta(minutes=85)
