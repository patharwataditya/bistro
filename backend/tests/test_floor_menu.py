from tests.conftest import err, ok
from tests.helpers import menu_id, open_order, table


def test_floor_lists_areas_and_tables(as_user):
    floor = ok(as_user("server").get("/tables"))
    assert [a["name"] for a in floor["areas"]] == ["Main Hall", "Patio", "Bar"]
    assert len(floor["tables"]) == 16
    assert all(t["status"] == "AVAILABLE" and t["active_order"] is None for t in floor["tables"])


def test_table_crud_and_name_uniqueness(as_user):
    mgr = as_user("manager")
    created = ok(mgr.post("/tables", json={"name": "T99", "capacity": 6}), 201)
    err(mgr.post("/tables", json={"name": "t99", "capacity": 2}), 409, "CONFLICT")
    updated = ok(mgr.patch(f"/tables/{created['id']}", json={"version": created["version"],
                                                             "capacity": 8}))
    assert updated["capacity"] == 8
    err(mgr.patch(f"/tables/{created['id']}", json={"version": 1, "capacity": 4}), 409,
        "STALE_VERSION")
    err(as_user("server").delete(f"/tables/{created['id']}"), 403, "PERMISSION_DENIED")
    err(mgr.delete(f"/tables/{created['id']}"), 403, "PERMISSION_DENIED")  # manager lacks it
    ok(as_user("owner").delete(f"/tables/{created['id']}"), 204)
    # name is reusable after soft delete
    ok(mgr.post("/tables", json={"name": "T99", "capacity": 2}), 201)


def test_status_changes_and_occupied_is_reserved_for_orders(as_user):
    server = as_user("server")
    t = table(server, "T2")
    t = ok(server.post(f"/tables/{t['id']}/status",
                       json={"version": t["version"], "status": "RESERVED", "note": "Smith 8pm"}))
    assert t["status"] == "RESERVED" and t["status_note"] == "Smith 8pm"
    err(server.post(f"/tables/{t['id']}/status", json={"version": t["version"],
                                                     "status": "OCCUPIED"}),
        422, "VALIDATION_ERROR")


def test_status_cannot_change_while_order_open(as_user):
    server = as_user("server")
    open_order(server, "T3")
    t = table(server, "T3")
    assert t["status"] == "OCCUPIED" and t["active_order"] is not None
    err(server.post(f"/tables/{t['id']}/status", json={"version": t["version"],
                                                     "status": "AVAILABLE"}),
        409, "INVALID_TRANSITION")


def test_blocked_table_cannot_be_seated(as_user):
    server = as_user("server")
    t = table(server, "T4")
    ok(server.post(f"/tables/{t['id']}/status", json={"version": t["version"],
                                                    "status": "BLOCKED"}))
    err(server.post("/orders", json={"table_id": t["id"]}), 409, "INVALID_TRANSITION")


def test_table_with_open_order_cannot_be_deleted(as_user):
    open_order(as_user("server"), "T5")
    owner = as_user("owner")
    err(owner.delete(f"/tables/{table(owner, 'T5')['id']}"), 409, "INVALID_TRANSITION")


def test_area_delete_blocked_while_tables_inside(as_user):
    owner = as_user("owner")
    area = ok(owner.get("/table-areas"))[0]
    err(owner.delete(f"/table-areas/{area['id']}"), 409, "CONFLICT")
    empty = ok(owner.post("/table-areas", json={"name": "Terrace"}), 201)
    ok(owner.delete(f"/table-areas/{empty['id']}"), 204)


def test_menu_management_and_price_change_audited(as_user, db):
    from sqlalchemy import select

    from app.models import AuditLog
    mgr = as_user("manager")
    menu = ok(mgr.get("/menu"))
    cat = menu["categories"][0]
    item = ok(mgr.post("/menu/items", json={"category_id": cat["id"], "name": "Garlic Bread",
                                            "price": "150.00"}), 201)
    item = ok(mgr.patch(f"/menu/items/{item['id']}", json={"version": item["version"],
                                                           "price": "175.50"}))
    assert item["price"] == "175.50"
    assert db.scalar(select(AuditLog).where(AuditLog.action == "menu.price_changed")) is not None
    err(mgr.post("/menu/items", json={"category_id": cat["id"], "name": "x",
                                      "price": "1.234"}), 422, "VALIDATION_ERROR")
    err(mgr.post("/menu/items", json={"category_id": cat["id"], "name": "x",
                                      "price": "-1"}), 422, "VALIDATION_ERROR")


def test_kitchen_can_86_but_not_reprice(as_user):
    chef = as_user("chef")
    item = next(i for i in ok(chef.get("/menu"))["items"] if i["name"] == "Burrata")
    item = ok(chef.post(f"/menu/items/{item['id']}/availability",
                        json={"version": item["version"], "is_available": False}))
    assert item["is_available"] is False
    err(chef.patch(f"/menu/items/{item['id']}", json={"version": item["version"],
                                                     "price": "1.00"}),
        403, "PERMISSION_DENIED")


def test_unavailable_item_cannot_be_ordered_but_existing_lines_survive(as_user):
    server = as_user("server")
    order = open_order(server, "T6", items=[("Burrata", 1)])
    chef = as_user("chef")
    item = next(i for i in ok(chef.get("/menu"))["items"] if i["name"] == "Burrata")
    ok(chef.post(f"/menu/items/{item['id']}/availability",
                 json={"version": item["version"], "is_available": False}))
    err(server.post(f"/orders/{order['id']}/items",
                    json={"items": [{"menu_item_id": item["id"]}]}), 422, "VALIDATION_ERROR")
    still = ok(server.get(f"/orders/{order['id']}"))
    assert still["items"][0]["name"] == "Burrata"


def test_price_change_does_not_rewrite_history(as_user):
    server = as_user("server")
    order = open_order(server, "T7", items=[("Tiramisu", 2)])
    owner = as_user("owner")
    item = next(i for i in ok(owner.get("/menu"))["items"] if i["name"] == "Tiramisu")
    ok(owner.patch(f"/menu/items/{item['id']}", json={"version": item["version"],
                                                      "price": "999.00"}))
    line = ok(server.get(f"/orders/{order['id']}"))["items"][0]
    assert line["unit_price"] == "280.00" and line["line_total"] == "560.00"


def test_deleted_menu_item_keeps_order_history(as_user):
    server = as_user("server")
    order = open_order(server, "T8", items=[("Cold Brew", 1)])
    owner = as_user("owner")
    ok(owner.delete(f"/menu/items/{menu_id(owner, 'Cold Brew')}"), 204)
    assert ok(server.get(f"/orders/{order['id']}"))["items"][0]["name"] == "Cold Brew"


def test_category_with_items_cannot_be_deleted(as_user):
    mgr = as_user("manager")
    cat = ok(mgr.get("/menu"))["categories"][0]
    err(mgr.delete(f"/menu/categories/{cat['id']}"), 409, "CONFLICT")
