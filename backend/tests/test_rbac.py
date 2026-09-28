import json
from pathlib import Path

import pytest

from app.core.permissions import ALL, DEFAULT_ROLES
from tests.conftest import err, ok

CONTRACT = json.loads((Path(__file__).parents[2] / "contract" / "enums.json").read_text())


def role_id(api, name):
    return next(r["id"] for r in ok(api.get("/roles")) if r["name"] == name)


def user(api, username):
    return next(u for u in ok(api.get("/users", params={"include_inactive": True}))["items"]
                if u["username"] == username)


def test_permission_catalog_matches_contract():
    assert set(CONTRACT["Permission"]) == set(ALL)
    assert len(CONTRACT["Permission"]) == len(ALL)


@pytest.mark.parametrize("username,path", [
    ("server", "/users"), ("cashier", "/roles"), ("chef", "/users"), ("server", "/permissions"),
])
def test_views_require_permission(as_user, username, path):
    err(as_user(username).get(path), 403, "PERMISSION_DENIED")


def test_default_roles_seeded_with_expected_permissions(as_user):
    roles = {r["name"]: r for r in ok(as_user("owner").get("/roles"))}
    for name, (_, codes) in DEFAULT_ROLES.items():
        assert set(roles[name]["permissions"]) == set(codes)
    assert roles["Owner"]["is_system"] and not roles["Owner"]["editable"]


def test_manager_can_create_floor_staff(as_user):
    mgr = as_user("manager")
    created = ok(mgr.post("/users", json={
        "username": "newbie", "full_name": "New Server", "password": "s3cure-pass",
        "role_ids": [role_id(mgr, "Floor Staff")]}), 201)
    assert created["roles"][0]["name"] == "Floor Staff" and created["manageable"]
    ok(as_user("newbie", "s3cure-pass").get("/me"))


def test_manager_cannot_grant_admin_or_owner(as_user):
    mgr = as_user("manager")
    for role in ("Administrator", "Owner"):
        err(mgr.post("/users", json={"username": f"x{role.lower()}", "full_name": "X",
                                     "password": "s3cure-pass",
                                     "role_ids": [role_id(mgr, role)]}),
            403, "PERMISSION_DENIED")


def test_cannot_change_own_roles(as_user):
    mgr = as_user("manager")
    me = user(mgr, "manager")
    err(mgr.patch(f"/users/{me['id']}", json={"version": me["version"],
                                             "role_ids": [role_id(mgr, "Manager")]}),
        403, "PERMISSION_DENIED")


def test_manager_cannot_touch_owner_or_admin(as_user):
    mgr = as_user("manager")
    for target in ("owner", "admin"):
        u = user(mgr, target)
        assert not u["manageable"]
        err(mgr.post(f"/users/{u['id']}/deactivate", json={"version": u["version"]}), 403,
            "PERMISSION_DENIED")
        err(mgr.post(f"/users/{u['id']}/password",
                     json={"version": u["version"], "new_password": "hijack-123"}),
            403, "PERMISSION_DENIED")


def test_role_permissions_capped_by_actor_permissions(as_user):
    mgr = as_user("manager")
    err(mgr.post("/roles", json={"name": "Sneaky", "permissions": ["roles.delete"]}), 403,
        "PERMISSION_DENIED")


def test_manager_cannot_edit_own_role(as_user):
    # Managers lack roles.update by default; give admin a try on their own role instead.
    admin = as_user("admin")
    rid = role_id(admin, "Administrator")
    role = ok(admin.get(f"/roles/{rid}"))
    assert not role["editable"]
    err(admin.patch(f"/roles/{rid}", json={"version": role["version"],
                                          "permissions": sorted(ALL - {"roles.delete"})}),
        403, "PERMISSION_DENIED")


def test_owner_role_immutable(as_user):
    owner = as_user("owner")
    rid = role_id(owner, "Owner")
    err(owner.patch(f"/roles/{rid}", json={"version": 1, "name": "Boss"}), 403,
        "PERMISSION_DENIED")
    err(owner.delete(f"/roles/{rid}"), 403, "PERMISSION_DENIED")


def test_custom_role_lifecycle(as_user):
    owner = as_user("owner")
    role = ok(owner.post("/roles", json={"name": "Host", "description": "Front door",
                                         "permissions": ["tables.view", "tables.manage_status"]}),
              201)
    err(owner.post("/roles", json={"name": "host", "permissions": []}), 409, "CONFLICT")
    updated = ok(owner.patch(f"/roles/{role['id']}", json={
        "version": role["version"], "name": "Hostess", "permissions": ["tables.view"]}))
    assert updated["permissions"] == ["tables.view"] and updated["version"] == 2
    err(owner.patch(f"/roles/{role['id']}", json={"version": 1, "name": "Stale"}), 409,
        "STALE_VERSION")
    staffer = ok(owner.post("/users", json={"username": "hosty", "full_name": "Hosty",
                                            "password": "s3cure-pass",
                                            "role_ids": [role["id"]]}), 201)
    err(owner.delete(f"/roles/{role['id']}"), 409, "CONFLICT")
    ok(owner.patch(f"/users/{staffer['id']}", json={
        "version": staffer["version"], "role_ids": [role_id(owner, "Floor Staff")]}))
    ok(owner.delete(f"/roles/{role['id']}"), 204)


def test_role_assigned_count_includes_deactivated_staff(as_user):
    owner = as_user("owner")
    role = ok(owner.post("/roles", json={"name": "Porter", "permissions": ["tables.view"]}), 201)
    assert role["member_count"] == 0 and role["assigned_count"] == 0
    staffer = ok(owner.post("/users", json={"username": "porty", "full_name": "Porty",
                                            "password": "s3cure-pass",
                                            "role_ids": [role["id"]]}), 201)
    staffer = ok(owner.post(f"/users/{staffer['id']}/deactivate",
                            json={"version": staffer["version"]}))
    listed = next(r for r in ok(owner.get("/roles")) if r["id"] == role["id"])
    assert listed["member_count"] == 0 and listed["assigned_count"] == 1
    detail = ok(owner.get(f"/roles/{role['id']}"))
    assert detail["member_count"] == 0 and detail["assigned_count"] == 1
    # The deactivated holder still blocks deletion, which is what assigned_count tells clients.
    err(owner.delete(f"/roles/{role['id']}"), 409, "CONFLICT")


def test_unknown_permission_rejected(as_user):
    err(as_user("owner").post("/roles", json={"name": "X", "permissions": ["god.mode"]}), 422,
        "VALIDATION_ERROR")


def test_permission_change_takes_effect_without_relogin(as_user):
    owner = as_user("owner")
    server = as_user("server")
    rid = role_id(owner, "Floor Staff")
    role = ok(owner.get(f"/roles/{rid}"))
    ok(owner.patch(f"/roles/{rid}", json={"version": role["version"],
                                         "permissions": role["permissions"] + ["staff.view"]}))
    ok(server.get("/users"))


def test_last_owner_cannot_be_removed(as_user):
    owner = as_user("owner")
    admin = as_user("admin")
    o = user(admin, "owner")
    # Admin lacks roles.delete, so the Owner role's permissions ⊄ admin's: cannot manage owner.
    err(admin.post(f"/users/{o['id']}/deactivate", json={"version": o["version"]}), 403,
        "PERMISSION_DENIED")
    # A second owner may demote the first, but the last one standing is protected.
    second = ok(owner.post("/users", json={"username": "owner2", "full_name": "Second Owner",
                                           "password": "s3cure-pass",
                                           "role_ids": [role_id(owner, "Owner")]}), 201)
    o2 = as_user("owner2", "s3cure-pass")
    ok(o2.post(f"/users/{o['id']}/deactivate", json={"version": o["version"]}))
    err(o2.patch(f"/users/{second['id']}", json={"version": second["version"],
                                                "role_ids": [role_id(o2, "Manager")]}),
        403, "PERMISSION_DENIED")  # can't change own roles either way


def test_deactivate_and_reactivate(as_user):
    mgr = as_user("manager")
    s = user(mgr, "server")
    s = ok(mgr.post(f"/users/{s['id']}/deactivate", json={"version": s["version"]}))
    assert not s["is_active"]
    err(mgr.post(f"/users/{s['id']}/deactivate", json={"version": 1}), 409, "STALE_VERSION")
    s = ok(mgr.post(f"/users/{s['id']}/reactivate", json={"version": s["version"]}))
    assert s["is_active"]


def test_cannot_deactivate_self(as_user):
    mgr = as_user("manager")
    me = user(mgr, "manager")
    err(mgr.post(f"/users/{me['id']}/deactivate", json={"version": me["version"]}), 403,
        "PERMISSION_DENIED")


def test_password_reset_revokes_sessions(as_user):
    mgr = as_user("manager")
    server = as_user("server")
    s = user(mgr, "server")
    ok(mgr.post(f"/users/{s['id']}/password", json={"version": s["version"],
                                                   "new_password": "fresh-pass-9"}))
    err(server.get("/me"), 401, "UNAUTHENTICATED")


def test_duplicate_username_conflict(as_user):
    mgr = as_user("manager")
    err(mgr.post("/users", json={"username": "Server", "full_name": "Dup",
                                 "password": "s3cure-pass",
                                 "role_ids": [role_id(mgr, "Floor Staff")]}), 409, "CONFLICT")


def test_role_ids_from_nowhere_rejected(as_user):
    err(as_user("owner").post("/users", json={"username": "ghosty", "full_name": "G",
                                              "password": "s3cure-pass", "role_ids": [99999]}),
        422, "VALIDATION_ERROR")


def test_audit_trail_written_for_staff_changes(as_user, db):
    from sqlalchemy import select

    from app.models import AuditLog
    mgr = as_user("manager")
    s = user(mgr, "server")
    ok(mgr.post(f"/users/{s['id']}/deactivate", json={"version": s["version"]}))
    actions = set(db.scalars(select(AuditLog.action)))
    assert "staff.deactivated" in actions


def test_cannot_edit_role_held_by_someone_with_more_access(as_user):
    owner = as_user("owner")
    role = ok(owner.post("/roles", json={"name": "Shared", "permissions": ["tables.view"]}), 201)
    ok(owner.post("/users", json={"username": "owner2", "full_name": "Second Owner",
                                  "password": "s3cure-pass",
                                  "role_ids": [role_id(owner, "Owner"), role["id"]]}), 201)
    admin = as_user("admin")
    listed = next(r for r in ok(admin.get("/roles")) if r["id"] == role["id"])
    assert not listed["editable"]
    err(admin.patch(f"/roles/{role['id']}", json={"version": role["version"], "permissions": []}),
        403, "PERMISSION_DENIED")


def test_peers_cannot_reset_each_others_password(as_user):
    owner = as_user("owner")
    ok(owner.post("/users", json={"username": "owner2", "full_name": "Second Owner",
                                  "password": "s3cure-pass",
                                  "role_ids": [role_id(owner, "Owner")]}), 201)
    o2 = user(owner, "owner2")
    assert o2["manageable"] and not o2["password_resettable"]
    err(owner.post(f"/users/{o2['id']}/password",
                   json={"version": o2["version"], "new_password": "takeover-1"}),
        403, "PERMISSION_DENIED")


def test_deactivated_actor_cannot_mutate_staff(as_user, db):
    from sqlalchemy import select

    from app.models import User
    mgr = as_user("manager")
    s = user(mgr, "server")
    m = db.scalar(select(User).where(User.username == "manager"))
    m.is_active = False
    db.flush()
    r = mgr.post(f"/users/{s['id']}/deactivate", json={"version": s["version"]})
    assert r.status_code == 403
