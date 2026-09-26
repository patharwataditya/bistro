from tests.conftest import err, ok
from tests.helpers import advance, board_ticket, fire, menu_id, open_order, table, table_id


def test_open_order_occupies_table_and_numbers_increase(as_user):
    server = as_user("server")
    a = open_order(server, "T1", items=[("Margherita Pizza", 1)])
    b = open_order(server, "T2")
    assert b["order_number"] == a["order_number"] + 1
    assert a["status"] == "OPEN" and a["server_name"] == "Sofia Server"
    t = table(server, "T1")
    assert t["status"] == "OCCUPIED" and t["active_order"]["id"] == a["id"]
    assert t["active_order"]["pending_count"] == 1


def test_second_order_on_same_table_rejected(as_user):
    server = as_user("server")
    open_order(server, "T1")
    body = err(server.post("/orders", json={"table_id": table_id(server, "T1")}), 409,
               "INVALID_TRANSITION")
    assert body["details"]["reason"] == "TABLE_OCCUPIED"


def test_identical_pending_lines_merge_and_notes_split(as_user):
    server = as_user("server")
    o = open_order(server, "T1", items=[("Tiramisu", 1)])
    tid = menu_id(server, "Tiramisu")
    o = ok(server.post(f"/orders/{o['id']}/items", json={"items": [
        {"menu_item_id": tid, "quantity": 2},
        {"menu_item_id": tid, "quantity": 1, "notes": "no cocoa"}]}))
    lines = [(i["quantity"], i["notes"]) for i in o["items"]]
    assert lines == [(3, None), (1, "no cocoa")]


def test_totals_preview_uses_server_math(as_user):
    server = as_user("server")
    o = open_order(server, "T1", items=[("Margherita Pizza", 1), ("Tomato Basil Soup", 2)])
    assert o["totals"]["subtotal"] == "810.00"
    assert o["totals"]["total"] == "893.02"
    assert [t["name"] for t in o["totals"]["taxes"]] == ["CGST", "SGST"]


def test_fire_creates_ticket_and_moves_items(as_user):
    server = as_user("server")
    o = open_order(server, "T1", items=[("Margherita Pizza", 1)])
    o = fire(server, o)
    assert o["items"][0]["status"] == "SENT" and o["items"][0]["ticket_id"]
    err(server.post(f"/orders/{o['id']}/fire", json={"version": o["version"]}), 409,
        "INVALID_TRANSITION")
    ticket = board_ticket(as_user("chef"), o["id"])
    assert ticket["status"] == "NEW" and ticket["table_name"] == "T1"
    assert ticket["items"][0]["name"] == "Margherita Pizza"


def test_fire_requires_current_version(as_user):
    server = as_user("server")
    o = open_order(server, "T1", items=[("Margherita Pizza", 1)])
    ok(server.post(f"/orders/{o['id']}/items",
                   json={"items": [{"menu_item_id": menu_id(server, "Tiramisu")}]}))
    err(server.post(f"/orders/{o['id']}/fire", json={"version": o["version"]}), 409,
        "STALE_VERSION")


def test_sent_items_cannot_be_edited_or_removed_only_voided(as_user):
    server = as_user("server")
    o = fire(server, open_order(server, "T1", items=[("Burrata", 1)]))
    item = o["items"][0]
    err(server.patch(f"/orders/{o['id']}/items/{item['id']}", json={"quantity": 3}), 409,
        "INVALID_TRANSITION")
    err(server.delete(f"/orders/{o['id']}/items/{item['id']}"), 409, "INVALID_TRANSITION")
    err(server.post(f"/orders/{o['id']}/items/{item['id']}/void", json={"reason": "wrong"}),
        403, "PERMISSION_DENIED")  # floor staff lack orders.cancel
    mgr = as_user("manager")
    o = ok(mgr.post(f"/orders/{o['id']}/items/{item['id']}/void", json={"reason": "Wrong dish"}))
    assert o["items"][0]["status"] == "VOIDED" and o["totals"]["subtotal"] == "0.00"
    # Every item on the ticket voided → the ticket is cancelled and leaves the board.
    board = ok(as_user("chef").get("/kitchen/tickets"))
    assert all(t["order_id"] != o["id"] for t in board["tickets"])


def test_kitchen_state_machine(as_user):
    server = as_user("server")
    chef = as_user("chef")
    o = fire(server, open_order(server, "T1", items=[("Grilled Salmon", 2)]))
    t = board_ticket(chef, o["id"])
    err(chef.post(f"/kitchen/tickets/{t['id']}/transition",
                  json={"version": t["version"], "to": "READY"}), 409, "INVALID_TRANSITION")
    err(chef.post(f"/kitchen/tickets/{t['id']}/transition",
                  json={"version": t["version"], "to": "COMPLETED"}), 409, "INVALID_TRANSITION")
    t = advance(chef, t, "ACCEPTED", "PREPARING")
    assert ok(server.get(f"/orders/{o['id']}"))["items"][0]["status"] == "PREPARING"
    t = advance(chef, t, "READY")
    assert t["ready_at"] is not None
    assert table(server, "T1")["active_order"]["ready_count"] == 2
    t = advance(chef, t, "COMPLETED")
    assert ok(server.get(f"/orders/{o['id']}"))["items"][0]["status"] == "SERVED"
    err(chef.post(f"/kitchen/tickets/{t['id']}/transition",
                  json={"version": t["version"], "to": "PREPARING"}), 409, "INVALID_TRANSITION")


def test_kitchen_double_tap_is_harmless(as_user):
    server = as_user("server")
    chef = as_user("chef")
    o = fire(server, open_order(server, "T1", items=[("Grilled Salmon", 1)]))
    t = board_ticket(chef, o["id"])
    first = advance(chef, t, "PREPARING")
    # Same request again with the old version: already in that state → returns current state.
    again = ok(chef.post(f"/kitchen/tickets/{t['id']}/transition",
                         json={"version": t["version"], "to": "PREPARING"}))
    assert again["version"] == first["version"] and again["status"] == "PREPARING"


def test_stale_ticket_version_rejected(as_user):
    server = as_user("server")
    chef = as_user("chef")
    o = fire(server, open_order(server, "T1", items=[("Grilled Salmon", 1)]))
    t = board_ticket(chef, o["id"])
    advance(chef, t, "ACCEPTED")
    err(chef.post(f"/kitchen/tickets/{t['id']}/transition",
                  json={"version": t["version"], "to": "PREPARING"}), 409, "STALE_VERSION")


def test_recall_ready_ticket_to_preparing(as_user):
    server = as_user("server")
    chef = as_user("chef")
    o = fire(server, open_order(server, "T1", items=[("Grilled Salmon", 1)]))
    t = advance(chef, board_ticket(chef, o["id"]), "PREPARING", "READY", "PREPARING")
    assert t["ready_at"] is None
    assert ok(server.get(f"/orders/{o['id']}"))["items"][0]["status"] == "PREPARING"


def test_serving_all_ready_items_completes_ticket(as_user):
    server = as_user("server")
    chef = as_user("chef")
    o = fire(server, open_order(server, "T1", items=[("Burrata", 1), ("Tiramisu", 1)]))
    advance(chef, board_ticket(chef, o["id"]), "PREPARING", "READY")
    for item in o["items"]:
        ok(server.post(f"/orders/{o['id']}/items/{item['id']}/serve"))
    board = ok(chef.get("/kitchen/tickets"))["tickets"]
    t = next(t for t in board if t["order_id"] == o["id"])
    assert t["status"] == "COMPLETED"


def test_cannot_serve_item_not_ready(as_user):
    server = as_user("server")
    o = fire(server, open_order(server, "T1", items=[("Burrata", 1)]))
    err(server.post(f"/orders/{o['id']}/items/{o['items'][0]['id']}/serve"), 409,
        "INVALID_TRANSITION")


def test_cancel_unsent_order_by_server_frees_table(as_user):
    server = as_user("server")
    o = open_order(server, "T1", items=[("Burrata", 1)])
    o = ok(server.post(f"/orders/{o['id']}/cancel", json={"version": o["version"],
                                                        "reason": "Guests left"}))
    assert o["status"] == "CANCELLED" and o["items"] == []
    assert table(server, "T1")["status"] == "AVAILABLE"


def test_cancel_with_sent_items_needs_manager_and_cancels_tickets(as_user):
    server = as_user("server")
    o = fire(server, open_order(server, "T1", items=[("Burrata", 1)]))
    err(server.post(f"/orders/{o['id']}/cancel", json={"version": o["version"],
                                                     "reason": "Guests left"}),
        403, "PERMISSION_DENIED")
    mgr = as_user("manager")
    o = ok(mgr.post(f"/orders/{o['id']}/cancel", json={"version": o["version"],
                                                     "reason": "Guests left"}))
    assert all(i["status"] == "VOIDED" for i in o["items"])
    chef = as_user("chef")
    assert all(t["order_id"] != o["id"] for t in ok(chef.get("/kitchen/tickets"))["tickets"])
    assert table(server, "T1")["status"] == "CLEANING"


def test_cancelled_order_accepts_no_more_actions(as_user):
    mgr = as_user("manager")
    o = open_order(mgr, "T1", items=[("Burrata", 1)])
    o = ok(mgr.post(f"/orders/{o['id']}/cancel", json={"version": o["version"],
                                                     "reason": "Test cancel"}))
    err(mgr.post(f"/orders/{o['id']}/items",
                 json={"items": [{"menu_item_id": menu_id(mgr, "Burrata")}]}), 409,
        "INVALID_TRANSITION")
    err(mgr.post(f"/orders/{o['id']}/cancel", json={"version": o["version"],
                                                  "reason": "Again cancel"}), 409,
        "INVALID_TRANSITION")


def test_transfer_moves_order_and_frees_source(as_user):
    server = as_user("server")
    o = open_order(server, "T1", items=[("Burrata", 1)])
    o = ok(server.post(f"/orders/{o['id']}/transfer",
                       json={"version": o["version"], "table_id": table_id(server, "P1")}))
    assert o["table_name"] == "P1"
    assert table(server, "T1")["status"] == "AVAILABLE"
    assert table(server, "P1")["status"] == "OCCUPIED"


def test_transfer_to_occupied_table_rejected(as_user):
    server = as_user("server")
    o = open_order(server, "T1")
    open_order(server, "T2")
    err(server.post(f"/orders/{o['id']}/transfer",
                    json={"version": o["version"], "table_id": table_id(server, "T2")}),
        409, "INVALID_TRANSITION")


def test_merge_orders(as_user):
    server = as_user("server")
    chef = as_user("chef")
    a = fire(server, open_order(server, "T1", items=[("Burrata", 1)], guests=2))
    b = fire(server, open_order(server, "T2", items=[("Tiramisu", 2)], guests=3))
    merged = ok(server.post(f"/orders/{a['id']}/merge", json={
        "version": a["version"], "source_order_id": b["id"], "source_version": b["version"]}))
    assert merged["guest_count"] == 5
    assert sorted(i["name"] for i in merged["items"]) == ["Burrata", "Tiramisu"]
    assert ok(server.get(f"/orders/{b['id']}"))["status"] == "MERGED"
    # Food went to T2 before the merge, so it needs clearing like any table that was used.
    assert table(server, "T2")["status"] == "CLEANING"
    tickets = [t for t in ok(chef.get("/kitchen/tickets"))["tickets"]
               if t["order_id"] == a["id"]]
    assert len(tickets) == 2 and all(t["table_name"] == "T1" for t in tickets)


def test_split_moves_served_items_to_new_table(as_user):
    server = as_user("server")
    chef = as_user("chef")
    o = fire(server, open_order(server, "T1", items=[("Burrata", 1), ("Tiramisu", 1)]))
    advance(chef, board_ticket(chef, o["id"]), "PREPARING", "READY", "COMPLETED")
    o = ok(server.get(f"/orders/{o['id']}"))
    tiramisu = next(i for i in o["items"] if i["name"] == "Tiramisu")
    new = ok(server.post(f"/orders/{o['id']}/split", json={
        "version": o["version"], "table_id": table_id(server, "T2"),
        "item_ids": [tiramisu["id"]]}), 201)
    assert [i["name"] for i in new["items"]] == ["Tiramisu"] and new["table_name"] == "T2"
    assert [i["name"] for i in ok(server.get(f"/orders/{o['id']}"))["items"]] == ["Burrata"]


def test_split_rejects_in_flight_items_and_everything(as_user):
    server = as_user("server")
    o = fire(server, open_order(server, "T1", items=[("Burrata", 1), ("Tiramisu", 1)]))
    ids = [i["id"] for i in o["items"]]
    err(server.post(f"/orders/{o['id']}/split", json={
        "version": o["version"], "table_id": table_id(server, "T2"), "item_ids": ids[:1]}),
        409, "INVALID_TRANSITION")
    p = open_order(server, "T3", items=[("Burrata", 1), ("Tiramisu", 1)])
    err(server.post(f"/orders/{p['id']}/split", json={
        "version": p["version"], "table_id": table_id(server, "T4"),
        "item_ids": [i["id"] for i in p["items"]]}), 422, "VALIDATION_ERROR")


def test_cross_location_ids_are_not_found(as_user, db):
    """IDOR: an order from another location is invisible, not forbidden."""
    from app.models import DiningTable, Location, Order
    server = as_user("server")
    other = Location(restaurant_id=1, name="Elsewhere", timezone="UTC", currency_code="USD")
    db.add(other)
    db.flush()
    t = DiningTable(location_id=other.id, name="X1", capacity=2)
    db.add(t)
    db.flush()
    o = Order(location_id=other.id, order_number=1, table_id=t.id, server_id=1)
    db.add(o)
    db.flush()
    err(server.get(f"/orders/{o.id}"), 404, "NOT_FOUND")
    err(server.post("/orders", json={"table_id": t.id}), 404, "NOT_FOUND")


def test_orders_list_filters(as_user):
    server = as_user("server")
    open_order(server, "T1")
    o = open_order(server, "T2")
    ok(server.post(f"/orders/{o['id']}/cancel", json={"version": o["version"],
                                                    "reason": "Mistaken"}))
    page = ok(server.get("/orders", params={"status": ["OPEN", "BILLED"]}))
    assert page["total"] == 1 and page["items"][0]["table_name"] == "T1"


def test_idempotent_order_creation(as_user):
    server = as_user("server")
    body = {"table_id": table_id(server, "T1"), "guest_count": 2}
    headers = {"Idempotency-Key": "open-t1-abc123"}
    first = ok(server.post("/orders", json=body, headers=headers), 201)
    replay = server.post("/orders", json=body, headers=headers)
    assert replay.status_code == 201 and replay.json()["id"] == first["id"]
    assert replay.headers["Idempotent-Replayed"] == "true"
    err(server.post("/orders", json={**body, "guest_count": 3}, headers=headers), 422,
        "IDEMPOTENCY_MISMATCH")


def test_kitchen_cannot_take_orders(as_user):
    chef = as_user("chef")
    err(chef.post("/orders", json={"table_id": 1}), 403, "PERMISSION_DENIED")
    err(chef.get("/orders"), 403, "PERMISSION_DENIED")


def test_split_rejects_served_item_whose_ticket_is_still_open(as_user):
    server = as_user("server")
    chef = as_user("chef")
    o = fire(server, open_order(server, "T1", items=[("Burrata", 1), ("Tiramisu", 1)]))
    advance(chef, board_ticket(chef, o["id"]), "PREPARING", "READY")
    burrata = next(i for i in o["items"] if i["name"] == "Burrata")
    o = ok(server.post(f"/orders/{o['id']}/items/{burrata['id']}/serve"))
    err(server.post(f"/orders/{o['id']}/split", json={
        "version": o["version"], "table_id": table_id(server, "T2"),
        "item_ids": [burrata["id"]]}), 409, "INVALID_TRANSITION")


def test_cancel_finishes_tickets_whose_rest_was_served(as_user):
    server = as_user("server")
    chef = as_user("chef")
    o = fire(server, open_order(server, "T1", items=[("Burrata", 1), ("Tiramisu", 1)]))
    advance(chef, board_ticket(chef, o["id"]), "PREPARING", "READY")
    burrata = next(i for i in o["items"] if i["name"] == "Burrata")
    o = ok(server.post(f"/orders/{o['id']}/items/{burrata['id']}/serve"))
    mgr = as_user("manager")
    tiramisu = next(i for i in o["items"] if i["name"] == "Tiramisu")
    ok(mgr.post(f"/orders/{o['id']}/items/{tiramisu['id']}/void", json={"reason": "Dropped it"}))
    board = ok(chef.get("/kitchen/tickets"))["tickets"]
    t = next(t for t in board if t["order_id"] == o["id"])
    assert t["status"] == "COMPLETED"


def test_price_change_keeps_pending_lines_separate(as_user):
    server = as_user("server")
    o = open_order(server, "T1", items=[("Tiramisu", 1)])
    owner = as_user("owner")
    item = next(i for i in ok(owner.get("/menu"))["items"] if i["name"] == "Tiramisu")
    ok(owner.patch(f"/menu/items/{item['id']}", json={"version": item["version"],
                                                      "price": "300.00"}))
    o = ok(server.post(f"/orders/{o['id']}/items", json={"items": [{"menu_item_id": item["id"]}]}))
    assert [(i["quantity"], i["unit_price"]) for i in o["items"]] == [(1, "280.00"), (1, "300.00")]


def test_sold_out_item_quantity_cannot_grow(as_user):
    server = as_user("server")
    o = open_order(server, "T1", items=[("Burrata", 1)])
    chef = as_user("chef")
    item = next(i for i in ok(chef.get("/menu"))["items"] if i["name"] == "Burrata")
    ok(chef.post(f"/menu/items/{item['id']}/availability",
                 json={"version": item["version"], "is_available": False}))
    line = o["items"][0]
    err(server.patch(f"/orders/{o['id']}/items/{line['id']}", json={"quantity": 5}), 422,
        "VALIDATION_ERROR")
