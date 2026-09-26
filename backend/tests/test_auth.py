from sqlalchemy import select

from app.core.security import create_access_token
from app.models import User
from app.seed import DEMO_PASSWORD
from tests.conftest import err, ok


def login(client, username="owner", password=DEMO_PASSWORD):
    return client.post("/api/v1/auth/login", json={"username": username, "password": password})


def test_login_returns_tokens_and_me_works(client):
    tokens = ok(login(client))
    assert tokens["token_type"] == "bearer" and tokens["expires_in"] == 900
    me = ok(client.get("/api/v1/me", headers={"Authorization": f"Bearer {tokens['access_token']}"}))
    assert me["username"] == "owner"
    assert "roles.delete" in me["permissions"]
    assert me["location"]["currency_code"] == "INR"


def test_login_is_case_insensitive_on_username(client):
    ok(login(client, "OWNER"))


def test_wrong_password_and_unknown_user_look_identical(client):
    a = err(login(client, "owner", "nope-nope-1"), 401, "INVALID_CREDENTIALS")
    b = err(login(client, "ghost", "nope-nope-1"), 401, "INVALID_CREDENTIALS")
    assert a["message"] == b["message"]


def test_throttle_after_repeated_failures(client):
    for _ in range(5):
        err(login(client, "cashier", "wrong-pass-1"), 401, "INVALID_CREDENTIALS")
    # Even the correct password is refused while throttled.
    err(login(client, "cashier"), 429, "RATE_LIMITED")


def test_throttle_does_not_reveal_whether_user_exists(client):
    for _ in range(5):
        err(login(client, "nobody-here", "wrong-pass-1"), 401, "INVALID_CREDENTIALS")
    err(login(client, "nobody-here", "wrong-pass-1"), 429, "RATE_LIMITED")


def test_throttle_is_per_client_address(client, db):
    from app.models import LoginThrottle
    for _ in range(5):
        login(client, "owner", "wrong-pass-1")
    err(login(client, "owner"), 429, "RATE_LIMITED")
    keys = [t.key for t in db.scalars(select(LoginThrottle))]
    assert sorted(keys) == ["login-ip:testclient", "login:owner:testclient"]


def test_protected_route_requires_token(client):
    err(client.get("/api/v1/me"), 401, "UNAUTHENTICATED")
    err(client.get("/api/v1/me", headers={"Authorization": "Bearer garbage"}), 401,
        "UNAUTHENTICATED")


def test_expired_access_token_reports_token_expired(client, monkeypatch):
    from app.core import config
    tokens = ok(login(client))
    monkeypatch.setattr(config.get_settings(), "access_token_ttl_seconds", -10)
    import jwt
    claims = jwt.decode(tokens["access_token"], options={"verify_signature": False})
    expired = create_access_token(int(claims["sub"]), __import__("uuid").UUID(claims["sid"]),
                                  claims["ver"])
    err(client.get("/api/v1/me", headers={"Authorization": f"Bearer {expired}"}), 401,
        "TOKEN_EXPIRED")


def test_token_signed_with_other_secret_rejected(client):
    import jwt
    forged = jwt.encode({"sub": "1", "sid": "00000000-0000-0000-0000-000000000000", "ver": 1,
                         "iss": "bistro-api", "iat": 0, "exp": 9999999999, "typ": "access"},
                        "attacker-secret-attacker-secret-0000", algorithm="HS256")
    err(client.get("/api/v1/me", headers={"Authorization": f"Bearer {forged}"}), 401,
        "UNAUTHENTICATED")


def test_alg_none_rejected(client):
    import jwt
    forged = jwt.encode({"sub": "1", "sid": "00000000-0000-0000-0000-000000000000", "ver": 1,
                         "iss": "bistro-api", "iat": 0, "exp": 9999999999, "typ": "access"},
                        None, algorithm="none")
    err(client.get("/api/v1/me", headers={"Authorization": f"Bearer {forged}"}), 401,
        "UNAUTHENTICATED")


def test_refresh_rotates(client):
    first = ok(login(client))
    second = ok(client.post("/api/v1/auth/refresh", json={"refresh_token": first["refresh_token"]}))
    assert second["refresh_token"] != first["refresh_token"]
    ok(client.get("/api/v1/me", headers={"Authorization": f"Bearer {second['access_token']}"}))


def test_logout_revokes_session(client):
    tokens = ok(login(client))
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}
    ok(client.post("/api/v1/auth/logout", headers=headers), 204)
    err(client.get("/api/v1/me", headers=headers), 401, "UNAUTHENTICATED")
    err(client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]}), 401,
        "UNAUTHENTICATED")


def test_deactivated_user_loses_access_immediately(client, db):
    tokens = ok(login(client, "server"))
    user = db.scalar(select(User).where(User.username == "server"))
    user.is_active = False
    db.commit()
    err(client.get("/api/v1/me", headers={"Authorization": f"Bearer {tokens['access_token']}"}),
        403, "ACCOUNT_INACTIVE")
    # At login a deactivated account is indistinguishable from a wrong password.
    err(login(client, "server"), 401, "INVALID_CREDENTIALS")


def test_change_password_signs_out_other_sessions(client):
    other = ok(login(client, "manager"))
    current = ok(login(client, "manager"))
    fresh = ok(client.post(
        "/api/v1/me/password",
        json={"current_password": DEMO_PASSWORD, "new_password": "n3w-password!"},
        headers={"Authorization": f"Bearer {current['access_token']}"}))
    err(client.get("/api/v1/me", headers={"Authorization": f"Bearer {other['access_token']}"}),
        401, "UNAUTHENTICATED")
    ok(client.get("/api/v1/me", headers={"Authorization": f"Bearer {fresh['access_token']}"}))
    ok(login(client, "manager", "n3w-password!"))


def test_change_password_requires_current_and_strength(client):
    tokens = ok(login(client, "manager"))
    h = {"Authorization": f"Bearer {tokens['access_token']}"}
    err(client.post("/api/v1/me/password", headers=h,
                    json={"current_password": "wrong", "new_password": "n3w-password!"}),
        422, "VALIDATION_ERROR")
    err(client.post("/api/v1/me/password", headers=h,
                    json={"current_password": DEMO_PASSWORD, "new_password": "abcdefghij"}),
        422, "VALIDATION_ERROR")


def test_unknown_fields_rejected(client):
    err(client.post("/api/v1/auth/login", json={"username": "owner", "password": "x",
                                                "is_admin": True}), 422, "VALIDATION_ERROR")


def test_oversized_body_rejected(client):
    r = client.post("/api/v1/auth/login", content=b"x" * 300_000,
                    headers={"content-type": "application/json"})
    assert r.status_code == 413


def test_health(client):
    assert ok(client.get("/api/v1/health"))["status"] == "ok"


def test_chunked_oversized_body_rejected(client):
    def chunks():
        for _ in range(40):
            yield b"x" * 10_000

    r = client.post("/api/v1/auth/login", content=chunks(),
                    headers={"content-type": "application/json"})
    assert r.status_code == 413


def test_commit_failure_is_reported_not_swallowed(client, db, monkeypatch):
    """The commit runs before the response: if it fails the client must not see success."""
    tokens = ok(login(client, "manager"))
    from sqlalchemy.exc import OperationalError

    def boom():
        raise OperationalError("COMMIT", {}, Exception("connection lost"))

    monkeypatch.setattr(db, "commit", boom)
    r = client.post("/api/v1/tables", json={"name": "Z9", "capacity": 2},
                    headers={"Authorization": f"Bearer {tokens['access_token']}"})
    assert r.status_code == 503


def test_password_spraying_from_one_address_is_throttled(client, monkeypatch):
    from app.services import auth as auth_service
    monkeypatch.setattr(auth_service, "IP_MAX_FAILURES", 6)
    for i in range(6):
        err(login(client, f"user{i}", "Summer2026!"), 401, "INVALID_CREDENTIALS")
    err(login(client, "owner"), 429, "RATE_LIMITED")


def test_refresh_retry_within_grace_window_keeps_session(client):
    first = ok(login(client))
    ok(client.post("/api/v1/auth/refresh", json={"refresh_token": first["refresh_token"]}))
    # Response "lost": the device retries with the same token a moment later.
    again = ok(client.post("/api/v1/auth/refresh", json={"refresh_token": first["refresh_token"]}))
    ok(client.get("/api/v1/me", headers={"Authorization": f"Bearer {again['access_token']}"}))


def test_refresh_reuse_after_grace_window_revokes(client, db):
    from datetime import timedelta

    from app.core.security import hash_refresh_token
    from app.models import RefreshToken
    first = ok(login(client))
    second = ok(client.post("/api/v1/auth/refresh", json={"refresh_token": first["refresh_token"]}))
    token = db.scalar(select(RefreshToken).where(
        RefreshToken.token_hash == hash_refresh_token(first["refresh_token"])))
    token.used_at = token.used_at - timedelta(minutes=5)
    db.flush()
    err(client.post("/api/v1/auth/refresh", json={"refresh_token": first["refresh_token"]}), 401,
        "UNAUTHENTICATED")
    err(client.post("/api/v1/auth/refresh", json={"refresh_token": second["refresh_token"]}), 401,
        "UNAUTHENTICATED")


def test_health_supports_head(client):
    assert client.head("/api/v1/health").status_code == 200
