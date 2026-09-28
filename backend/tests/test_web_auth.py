from app.seed import DEMO_PASSWORD
from tests.conftest import err, ok

WEB = {"X-Bistro-Client": "web"}


def web_login(client, username="manager", password=DEMO_PASSWORD, headers=WEB):
    return client.post("/api/v1/auth/web/login", json={"username": username, "password": password},
                       headers=headers)


def test_login_sets_httponly_cookie_and_hides_refresh_token(client):
    r = web_login(client)
    body = ok(r)
    assert "refresh_token" not in body and body["access_token"]
    cookie = r.headers["set-cookie"]
    assert "bistro_rt=" in cookie and "HttpOnly" in cookie
    assert "SameSite=strict" in cookie and "Path=/" in cookie
    assert r.headers["cache-control"] == "no-store"
    ok(client.get("/api/v1/me", headers={"Authorization": f"Bearer {body['access_token']}"}))


def test_refresh_rotates_cookie(client):
    web_login(client)
    first = client.cookies.get("bistro_rt")
    body = ok(client.post("/api/v1/auth/web/refresh", headers=WEB))
    assert body["access_token"]
    assert client.cookies.get("bistro_rt") != first


def test_web_endpoints_require_client_header(client):
    err(web_login(client, headers={}), 403, "PERMISSION_DENIED")
    web_login(client)
    err(client.post("/api/v1/auth/web/refresh"), 403, "PERMISSION_DENIED")


def test_cross_site_origin_refused(client):
    err(web_login(client, headers={**WEB, "Origin": "https://evil.example"}), 403,
        "PERMISSION_DENIED")
    ok(web_login(client, headers={**WEB, "Origin": "http://testserver"}))


def test_refresh_without_cookie_is_unauthenticated(client):
    err(client.post("/api/v1/auth/web/refresh", headers=WEB), 401, "UNAUTHENTICATED")


def test_logout_revokes_and_clears(client):
    body = ok(web_login(client))
    ok(client.post("/api/v1/auth/web/logout", headers=WEB), 204)
    err(client.get("/api/v1/me", headers={"Authorization": f"Bearer {body['access_token']}"}), 401,
        "UNAUTHENTICATED")
    err(client.post("/api/v1/auth/web/refresh", headers=WEB), 401, "UNAUTHENTICATED")


def test_web_login_shares_throttle(client):
    for _ in range(5):
        err(web_login(client, "cashier", "wrong-pass-1"), 401, "INVALID_CREDENTIALS")
    err(web_login(client, "cashier"), 429, "RATE_LIMITED")


def test_web_password_change_keeps_browser_signed_in(client):
    body = ok(web_login(client))
    h = {**WEB, "Authorization": f"Bearer {body['access_token']}"}
    fresh = ok(client.post("/api/v1/auth/web/password", headers=h,
                           json={"current_password": DEMO_PASSWORD, "new_password": "n3w-password!"}))
    assert "refresh_token" not in fresh
    ok(client.post("/api/v1/auth/web/refresh", headers=WEB))


def test_audit_log_time_window(as_user):
    mgr = as_user("manager")
    ok(mgr.post("/tables", json={"name": "Z1", "capacity": 2}), 201)
    page = ok(mgr.get("/audit-logs", params={"since": "2000-01-01T00:00:00Z"}))
    assert page["items"]
    empty = ok(mgr.get("/audit-logs", params={"until": "2000-01-01T00:00:00Z"}))
    assert empty["items"] == []


def test_cross_site_fetch_metadata_refused(client):
    err(web_login(client, headers={**WEB, "Sec-Fetch-Site": "same-site"}), 403, "PERMISSION_DENIED")
    ok(web_login(client, headers={**WEB, "Sec-Fetch-Site": "same-origin"}))


def test_web_sessions_are_short_and_idle_out(client, db):
    from datetime import timedelta

    from sqlalchemy import select

    from app.models import AuthSession
    web_login(client)
    session = db.scalar(select(AuthSession).where(AuthSession.client == "web"))
    remaining = session.expires_at - session.created_at
    assert timedelta(hours=11) < remaining <= timedelta(hours=12, minutes=1)
    session.last_used_at = session.last_used_at - timedelta(hours=3)
    db.flush()
    err(client.post("/api/v1/auth/web/refresh", headers=WEB), 401, "UNAUTHENTICATED")


def test_logout_all_ends_mobile_sessions_too(client):
    mobile = ok(client.post("/api/v1/auth/login", json={"username": "manager", "password": DEMO_PASSWORD}))
    body = ok(web_login(client))
    ok(client.post("/api/v1/auth/web/logout-all",
                   headers={**WEB, "Authorization": f"Bearer {body['access_token']}"}), 204)
    err(client.get("/api/v1/me", headers={"Authorization": f"Bearer {mobile['access_token']}"}), 401,
        "UNAUTHENTICATED")


def test_mobile_token_responses_are_not_cached(client):
    r = client.post("/api/v1/auth/login", json={"username": "manager", "password": DEMO_PASSWORD})
    assert r.headers["cache-control"] == "no-store"
