"""Races exercised for real: separate connections, parallel threads, committed data."""

import threading
from collections import Counter
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.core.db import get_engine, session_factory
from app.main import app
from app.seed import DEMO_PASSWORD, seed_demo


@pytest.fixture
def live():
    """Real per-request transactions against the test DB; state is rebuilt afterwards."""
    yield
    with get_engine().begin() as conn:
        tables = conn.execute(text(
            "SELECT tablename FROM pg_tables WHERE schemaname = 'public' "
            "AND tablename <> 'alembic_version'")).scalars().all()
        conn.execute(text(f"TRUNCATE {', '.join(tables)} RESTART IDENTITY CASCADE"))
    with session_factory()() as db, db.begin():
        seed_demo(db)


def token(client, username):
    r = client.post("/api/v1/auth/login", json={"username": username, "password": DEMO_PASSWORD})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def race(n, fn):
    barrier = threading.Barrier(n)

    def run(i):
        with TestClient(app) as c:
            barrier.wait()
            return fn(c, i)

    with ThreadPoolExecutor(n) as pool:
        return list(pool.map(run, range(n)))


def setup_bill(c, h):
    floor = c.get("/api/v1/tables", headers=h).json()
    table_id = next(t["id"] for t in floor["tables"] if t["name"] == "T1")
    menu = c.get("/api/v1/menu", headers=h).json()
    item = next(i["id"] for i in menu["items"] if i["name"] == "Burrata")
    o = c.post("/api/v1/orders", headers=h, json={"table_id": table_id,
                                                   "items": [{"menu_item_id": item}]}).json()
    o = c.post(f"/api/v1/orders/{o['id']}/fire", headers=h, json={"version": o["version"]}).json()
    return c.post("/api/v1/bills", headers=h,
                  json={"order_id": o["id"], "order_version": o["version"]}).json()


def test_concurrent_seating_of_one_table(live):
    with TestClient(app) as c:
        h = token(c, "server")
        table_id = next(t["id"] for t in c.get("/api/v1/tables", headers=h).json()["tables"]
                        if t["name"] == "T1")
    codes = race(6, lambda c, i: c.post("/api/v1/orders", headers=h,
                                        json={"table_id": table_id}).status_code)
    assert Counter(codes) == Counter({201: 1, 409: 5})


def test_concurrent_full_payments_charge_once(live):
    with TestClient(app) as c:
        h = token(c, "manager")
        bill = setup_bill(c, h)
        card = next(m["id"] for m in c.get("/api/v1/payment-methods", headers=h).json()
                    if m["name"] == "Card")
    results = race(5, lambda c, i: c.post(
        f"/api/v1/bills/{bill['id']}/payments", headers={**h, "Idempotency-Key": f"key-{i}-abcdef"},
        json={"version": bill["version"], "payment_method_id": card,
              "amount": bill["total"]}).status_code)
    assert Counter(results)[200] == 1
    with TestClient(app) as c:
        final = c.get(f"/api/v1/bills/{bill['id']}", headers=h).json()
    assert final["status"] == "PAID" and final["paid_total"] == bill["total"]
    assert len(final["payments"]) == 1


def test_concurrent_retries_with_same_idempotency_key(live):
    with TestClient(app) as c:
        h = token(c, "manager")
        bill = setup_bill(c, h)
        card = next(m["id"] for m in c.get("/api/v1/payment-methods", headers=h).json()
                    if m["name"] == "Card")
    body = {"version": bill["version"], "payment_method_id": card, "amount": "10.00"}
    results = race(5, lambda c, i: c.post(
        f"/api/v1/bills/{bill['id']}/payments", headers={**h, "Idempotency-Key": "same-key-123"},
        json=body))
    assert all(r.status_code == 200 for r in results)
    assert len({r.json()["payments"][0]["id"] for r in results}) == 1
    with TestClient(app) as c:
        assert c.get(f"/api/v1/bills/{bill['id']}", headers=h).json()["paid_total"] == "10.00"


def test_concurrent_kitchen_bumps(live):
    with TestClient(app) as c:
        h = token(c, "manager")
        bill = setup_bill(c, h)
        ticket = next(t for t in c.get("/api/v1/kitchen/tickets", headers=h).json()["tickets"]
                      if t["order_id"] == bill["order_id"])
    codes = race(4, lambda c, i: c.post(
        f"/api/v1/kitchen/tickets/{ticket['id']}/transition", headers=h,
        json={"version": ticket["version"], "to": "ACCEPTED" if i % 2 else "PREPARING"}
    ).status_code)
    # Exactly one transition wins from NEW; repeats of the winning state are harmless no-ops,
    # everything else is a clean conflict — never a 500, never a skipped state.
    assert set(codes) <= {200, 409} and codes.count(200) >= 1
    with TestClient(app) as c:
        t = next(t for t in c.get("/api/v1/kitchen/tickets", headers=h).json()["tickets"]
                 if t["id"] == ticket["id"])
    assert t["status"] in ("ACCEPTED", "PREPARING") and t["version"] == 2


def test_owners_deactivating_each_other_cannot_leave_zero_owners(live):
    with TestClient(app) as c:
        h = token(c, "owner")
        roles = c.get("/api/v1/roles", headers=h).json()
        owner_role = next(r["id"] for r in roles if r["name"] == "Owner")
        o2 = c.post("/api/v1/users", headers=h, json={
            "username": "owner2", "full_name": "Second", "password": "s3cure-pass",
            "role_ids": [owner_role]}).json()
        users = c.get("/api/v1/users", headers=h).json()["items"]
        o1 = next(u for u in users if u["username"] == "owner")
        r = c.post("/api/v1/auth/login", json={"username": "owner2", "password": "s3cure-pass"})
        h2 = {"Authorization": f"Bearer {r.json()['access_token']}"}
    targets = [(h, o2), (h2, o1)]
    codes = race(2, lambda c, i: c.post(
        f"/api/v1/users/{targets[i][1]['id']}/deactivate", headers=targets[i][0],
        json={"version": targets[i][1]["version"]}).status_code)
    assert sorted(codes) != [200, 200]
    with get_engine().connect() as conn:
        active_owners = conn.execute(text(
            "SELECT count(*) FROM users u JOIN user_roles ur ON ur.user_id = u.id "
            "JOIN roles r ON r.id = ur.role_id WHERE r.name = 'Owner' AND u.is_active")).scalar()
    assert active_owners >= 1


def test_concurrent_order_numbers_are_unique(live):
    with TestClient(app) as c:
        h = token(c, "server")
        ids = [t["id"] for t in c.get("/api/v1/tables", headers=h).json()["tables"]][:8]
    results = race(8, lambda c, i: c.post("/api/v1/orders", headers=h,
                                          json={"table_id": ids[i]}).json())
    numbers = [r["order_number"] for r in results]
    assert len(set(numbers)) == 8
