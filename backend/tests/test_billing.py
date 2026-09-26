from datetime import date

from tests.conftest import err, ok
from tests.helpers import D, advance, board_ticket, card_id, cash_id, fire, open_order, table


def billed(api, table_name="T1", items=(("Margherita Pizza", 1), ("Tomato Basil Soup", 2))):
    o = fire(api, open_order(api, table_name, items=list(items)))
    return ok(api.post("/bills", json={"order_id": o["id"], "order_version": o["version"]}), 201)


def test_bill_totals_are_server_computed_and_order_locked(as_user):
    server = as_user("server")
    bill = billed(server)
    assert bill["bill_number"] == "B-000001"
    assert (bill["subtotal"], bill["service_charge_amount"], bill["tax_total"], bill["total"]) == \
        ("810.00", "40.50", "42.52", "893.02")
    assert bill["balance_due"] == "893.02" and bill["status"] == "OPEN"
    order = ok(server.get(f"/orders/{bill['order_id']}"))
    assert order["status"] == "BILLED" and order["bill_id"] == bill["id"]
    assert order["totals"]["total"] == bill["total"]
    err(server.post(f"/orders/{order['id']}/items",
                    json={"items": [{"menu_item_id": order["items"][0]["menu_item_id"]}]}),
        409, "INVALID_TRANSITION")


def test_bill_rejected_with_unsent_items_or_nothing_to_bill(as_user):
    server = as_user("server")
    o = open_order(server, "T1", items=[("Burrata", 1)])
    err(server.post("/bills", json={"order_id": o["id"], "order_version": o["version"]}), 409,
        "INVALID_TRANSITION")
    empty = open_order(server, "T2")
    err(server.post("/bills", json={"order_id": empty["id"], "order_version": empty["version"]}),
        409, "INVALID_TRANSITION")


def test_second_bill_for_same_order_rejected(as_user):
    server = as_user("server")
    bill = billed(server)
    order = ok(server.get(f"/orders/{bill['order_id']}"))
    err(server.post("/bills", json={"order_id": order["id"], "order_version": order["version"]}),
        409, "INVALID_TRANSITION")


def test_split_tender_cash_change_and_settlement(as_user):
    server = as_user("server")
    bill = billed(server)
    cashier = as_user("cashier")
    bill = ok(cashier.post(f"/bills/{bill['id']}/payments", json={
        "version": bill["version"], "payment_method_id": card_id(cashier), "amount": "500.00",
        "reference": "AUTH123"}))
    assert bill["status"] == "OPEN" and bill["balance_due"] == "393.02"
    assert table(cashier, "T1")["status"] == "OCCUPIED"
    bill = ok(cashier.post(f"/bills/{bill['id']}/payments", json={
        "version": bill["version"], "payment_method_id": cash_id(cashier), "amount": "393.02",
        "tendered": "500.00"}))
    assert bill["status"] == "PAID" and bill["balance_due"] == "0.00"
    assert bill["payments"][1]["change_due"] == "106.98"
    order = ok(cashier.get(f"/orders/{bill['order_id']}"))
    assert order["status"] == "CLOSED" and order["closed_at"] is not None
    t = table(cashier, "T1")
    assert t["status"] == "CLEANING" and t["active_order"] is None


def test_overpayment_and_tender_rules(as_user):
    cashier = as_user("cashier")
    bill = billed(as_user("server"))
    err(cashier.post(f"/bills/{bill['id']}/payments", json={
        "version": bill["version"], "payment_method_id": card_id(cashier), "amount": "900.00"}),
        422, "VALIDATION_ERROR")
    err(cashier.post(f"/bills/{bill['id']}/payments", json={
        "version": bill["version"], "payment_method_id": card_id(cashier), "amount": "10.00",
        "tendered": "20.00"}), 422, "VALIDATION_ERROR")
    err(cashier.post(f"/bills/{bill['id']}/payments", json={
        "version": bill["version"], "payment_method_id": cash_id(cashier), "amount": "10.00",
        "tendered": "5.00"}), 422, "VALIDATION_ERROR")
    err(cashier.post(f"/bills/{bill['id']}/payments", json={
        "version": bill["version"], "payment_method_id": cash_id(cashier), "amount": "0"}),
        422, "VALIDATION_ERROR")
    err(cashier.post(f"/bills/{bill['id']}/payments", json={
        "version": bill["version"], "payment_method_id": cash_id(cashier),
        "amount": "10.001"}), 422, "VALIDATION_ERROR")


def test_client_cannot_send_totals(as_user):
    server = as_user("server")
    o = fire(server, open_order(server, "T1", items=[("Burrata", 1)]))
    err(server.post("/bills", json={"order_id": o["id"], "order_version": o["version"],
                                    "total": "1.00"}), 422, "VALIDATION_ERROR")


def test_payment_idempotency_prevents_double_charge(as_user):
    cashier = as_user("cashier")
    bill = billed(as_user("server"))
    body = {"version": bill["version"], "payment_method_id": card_id(cashier), "amount": "100.00"}
    h = {"Idempotency-Key": "pay-once-123456"}
    first = ok(cashier.post(f"/bills/{bill['id']}/payments", json=body, headers=h))
    again = ok(cashier.post(f"/bills/{bill['id']}/payments", json=body, headers=h))
    assert again == first and len(again["payments"]) == 1
    current = ok(cashier.get(f"/bills/{bill['id']}"))
    assert current["paid_total"] == "100.00"


def test_stale_bill_version_rejected(as_user):
    cashier = as_user("cashier")
    bill = billed(as_user("server"))
    ok(cashier.post(f"/bills/{bill['id']}/payments", json={
        "version": bill["version"], "payment_method_id": card_id(cashier), "amount": "100.00"}))
    err(cashier.post(f"/bills/{bill['id']}/payments", json={
        "version": bill["version"], "payment_method_id": card_id(cashier), "amount": "100.00"}),
        409, "STALE_VERSION")


def test_discount_recomputes_and_requires_permission(as_user):
    bill = billed(as_user("server"))
    err(as_user("cashier").post(f"/bills/{bill['id']}/discount", json={
        "version": bill["version"], "type": "PERCENT", "value": "10", "reason": "Regular"}),
        403, "PERMISSION_DENIED")
    mgr = as_user("manager")
    err(mgr.post(f"/bills/{bill['id']}/discount", json={
        "version": bill["version"], "type": "PERCENT", "value": "10"}), 422, "VALIDATION_ERROR")
    bill = ok(mgr.post(f"/bills/{bill['id']}/discount", json={
        "version": bill["version"], "type": "PERCENT", "value": "10", "reason": "Regular guest"}))
    # 810 - 81 = 729; service 36.45; taxable 765.45; 2×19.14 = 38.28; total 803.73
    assert (bill["discount_amount"], bill["service_charge_amount"], bill["tax_total"],
            bill["total"]) == ("81.00", "36.45", "38.28", "803.73")
    bill = ok(mgr.post(f"/bills/{bill['id']}/discount", json={"version": bill["version"],
                                                            "type": None}))
    assert bill["total"] == "893.02" and bill["discount_type"] is None


def test_discount_blocked_after_payment(as_user):
    mgr = as_user("manager")
    bill = billed(mgr)
    bill = ok(mgr.post(f"/bills/{bill['id']}/payments", json={
        "version": bill["version"], "payment_method_id": card_id(mgr), "amount": "100.00"}))
    err(mgr.post(f"/bills/{bill['id']}/discount", json={
        "version": bill["version"], "type": "FIXED", "value": "50", "reason": "Late"}),
        409, "INVALID_TRANSITION")


def test_fixed_discount_larger_than_bill_rejected(as_user):
    mgr = as_user("manager")
    bill = billed(mgr)
    err(mgr.post(f"/bills/{bill['id']}/discount", json={
        "version": bill["version"], "type": "FIXED", "value": "5000", "reason": "Oops"}),
        422, "VALIDATION_ERROR")


def test_tax_snapshot_survives_settings_change(as_user):
    mgr = as_user("manager")
    bill = billed(mgr)
    owner = as_user("owner")
    s = ok(owner.get("/settings"))
    ok(owner.put("/settings/tax-rates", json={"version": s["version"], "tax_rates": [
        {"name": "VAT", "rate_percent": "20"}]}))
    bill = ok(mgr.post(f"/bills/{bill['id']}/discount", json={
        "version": bill["version"], "type": "FIXED", "value": "10.00", "reason": "Wait time"}))
    assert [t["name"] for t in bill["taxes"]] == ["CGST", "SGST"]


def test_void_bill_reopens_order(as_user):
    mgr = as_user("manager")
    bill = billed(mgr)
    err(as_user("cashier").post(f"/bills/{bill['id']}/void", json={
        "version": bill["version"], "reason": "Wrong table"}), 403, "PERMISSION_DENIED")
    bill = ok(mgr.post(f"/bills/{bill['id']}/void", json={"version": bill["version"],
                                                         "reason": "Adding dessert"}))
    assert bill["status"] == "VOID"
    order = ok(mgr.get(f"/orders/{bill['order_id']}"))
    assert order["status"] == "OPEN" and order["bill_id"] is None
    # A new bill can be issued after changes; numbering continues.
    order = fire(mgr, ok(mgr.post(f"/orders/{order['id']}/items", json={
        "items": [{"menu_item_id": order["items"][0]["menu_item_id"]}]})))
    new_bill = ok(mgr.post("/bills", json={"order_id": order["id"],
                                           "order_version": order["version"]}), 201)
    assert new_bill["bill_number"] == "B-000002"


def test_void_blocked_after_payment(as_user):
    mgr = as_user("manager")
    bill = billed(mgr)
    bill = ok(mgr.post(f"/bills/{bill['id']}/payments", json={
        "version": bill["version"], "payment_method_id": card_id(mgr), "amount": "1.00"}))
    err(mgr.post(f"/bills/{bill['id']}/void", json={"version": bill["version"],
                                                  "reason": "Changed mind"}),
        409, "INVALID_TRANSITION")


def _paid(mgr):
    bill = billed(mgr)
    return ok(mgr.post(f"/bills/{bill['id']}/payments", json={
        "version": bill["version"], "payment_method_id": card_id(mgr), "amount": bill["total"]}))


def test_refunds_partial_then_full(as_user):
    mgr = as_user("manager")
    bill = _paid(mgr)
    err(as_user("cashier").post(f"/bills/{bill['id']}/refunds", json={
        "version": bill["version"], "payment_method_id": card_id(mgr), "amount": "10.00",
        "reason": "Cold food"}), 403, "PERMISSION_DENIED")
    bill = ok(mgr.post(f"/bills/{bill['id']}/refunds", json={
        "version": bill["version"], "payment_method_id": card_id(mgr), "amount": "93.02",
        "reason": "Cold soup"}))
    assert bill["status"] == "PARTIALLY_REFUNDED" and bill["refunded_total"] == "93.02"
    err(mgr.post(f"/bills/{bill['id']}/refunds", json={
        "version": bill["version"], "payment_method_id": card_id(mgr), "amount": "800.01",
        "reason": "Too much"}), 422, "VALIDATION_ERROR")
    bill = ok(mgr.post(f"/bills/{bill['id']}/refunds", json={
        "version": bill["version"], "payment_method_id": card_id(mgr), "amount": "800.00",
        "reason": "Whole meal"}))
    assert bill["status"] == "REFUNDED"
    assert ok(mgr.get(f"/orders/{bill['order_id']}"))["status"] == "CLOSED"


def test_refund_needs_money_paid_by_that_method(as_user):
    mgr = as_user("manager")
    bill = billed(mgr)
    err(mgr.post(f"/bills/{bill['id']}/refunds", json={
        "version": bill["version"], "payment_method_id": card_id(mgr), "amount": "1.00",
        "reason": "Nope nope"}), 422, "VALIDATION_ERROR")


def test_paid_bill_rejects_more_payments(as_user):
    mgr = as_user("manager")
    bill = _paid(mgr)
    err(mgr.post(f"/bills/{bill['id']}/payments", json={
        "version": bill["version"], "payment_method_id": card_id(mgr), "amount": "1.00"}),
        409, "INVALID_TRANSITION")


def test_zero_total_bill_settles(as_user):
    mgr = as_user("manager")
    bill = billed(mgr)
    bill = ok(mgr.post(f"/bills/{bill['id']}/discount", json={
        "version": bill["version"], "type": "PERCENT", "value": "100", "reason": "On the house"}))
    assert bill["total"] == "0.00"
    bill = ok(mgr.post(f"/bills/{bill['id']}/settle", json={"version": bill["version"]}))
    assert bill["status"] == "PAID"


def test_kitchen_can_finish_after_payment(as_user):
    server = as_user("server")
    chef = as_user("chef")
    o = fire(server, open_order(server, "P1", items=[("Burrata", 1)]))
    b = ok(server.post("/bills", json={"order_id": o["id"], "order_version": o["version"]}), 201)
    mgr = as_user("manager")
    ok(mgr.post(f"/bills/{b['id']}/payments", json={
        "version": b["version"], "payment_method_id": card_id(mgr), "amount": b["total"]}))
    t = advance(chef, board_ticket(chef, o["id"]), "PREPARING", "READY", "COMPLETED")
    assert t["status"] == "COMPLETED" and t["order_status"] == "CLOSED"


def test_payment_methods_configurable(as_user):
    owner = as_user("owner")
    m = ok(owner.post("/payment-methods", json={"name": "Voucher"}), 201)
    assert "Voucher" in [x["name"] for x in ok(owner.get("/payment-methods"))]
    ok(owner.patch(f"/payment-methods/{m['id']}", json={"is_active": False}))
    assert "Voucher" not in [x["name"] for x in ok(owner.get("/payment-methods"))]
    bill = billed(owner)
    err(owner.post(f"/bills/{bill['id']}/payments", json={
        "version": bill["version"], "payment_method_id": m["id"], "amount": "1.00"}),
        422, "VALIDATION_ERROR")


def test_rounding_increment_setting(as_user):
    owner = as_user("owner")
    s = ok(owner.get("/settings"))
    ok(owner.patch("/settings", json={"version": s["version"], "rounding_increment": "1.00"}))
    bill = billed(owner)
    assert bill["total"] == "893.00" and bill["round_off"] == "-0.02"


def test_settings_validation(as_user):
    owner = as_user("owner")
    s = ok(owner.get("/settings"))
    err(owner.patch("/settings", json={"version": s["version"], "timezone": "Mars/Base"}), 422,
        "VALIDATION_ERROR")
    err(owner.patch("/settings", json={"version": s["version"], "currency_code": "rupees"}),
        422, "VALIDATION_ERROR")
    err(as_user("manager").patch("/settings", json={"version": s["version"],
                                                   "bill_prefix": "X"}),
        403, "PERMISSION_DENIED")


def test_report_reflects_paid_bills_and_refunds(as_user):
    mgr = as_user("manager")
    bill = _paid(mgr)
    ok(mgr.post(f"/bills/{bill['id']}/refunds", json={
        "version": bill["version"], "payment_method_id": card_id(mgr), "amount": "93.02",
        "reason": "Cold soup"}))
    today = ok(mgr.get("/dashboard"))["business_date"]
    r = ok(mgr.get("/reports/summary", params={"start": today, "end": today}))
    assert r["gross_sales"] == "893.02" and r["refunds"] == "93.02" and r["net_sales"] == "800.00"
    assert r["order_count"] == 1 and r["average_order_value"] == "893.02"
    assert r["top_items"][0]["name"] == "Tomato Basil Soup" and r["top_items"][0]["quantity"] == 2
    # Money actually held per method: the card payment minus the card refund.
    assert r["payment_methods"] == [{"name": "Card", "count": 1, "amount": "800.00"}]
    assert r["daily"][0]["gross_sales"] == "893.02" and r["daily"][0]["net_sales"] == "800.00"
    assert r["staff"][0]["name"] == "Maya Manager"
    assert len(r["hourly"]) == 24 and len(r["daily"]) == 1
    assert D(r["tax_total"]) == D("42.52")


def test_report_permissions_and_range(as_user):
    err(as_user("cashier").get("/reports/summary", params={"start": "2026-01-01",
                                                           "end": "2026-01-02"}),
        403, "PERMISSION_DENIED")
    mgr = as_user("manager")
    err(mgr.get("/reports/summary", params={"start": "2026-02-01", "end": "2026-01-01"}), 422,
        "VALIDATION_ERROR")
    err(mgr.get("/reports/summary", params={"start": "2024-01-01", "end": "2026-01-01"}), 422,
        "VALIDATION_ERROR")


def test_dashboard_sections_follow_permissions(as_user):
    server = ok(as_user("server").get("/dashboard"))
    assert server["tables"]["total"] == 16 and server["kitchen"] is not None
    assert server["sales_today"] is None and server["recent_activity"] is None
    owner = ok(as_user("owner").get("/dashboard"))
    assert owner["sales_today"] is not None and owner["recent_activity"] is not None
    err(as_user("chef").get("/dashboard"), 403, "PERMISSION_DENIED")


def test_day_bounds_are_local_and_dst_safe():
    from zoneinfo import ZoneInfo

    from app.services.insights import day_bounds
    lo, hi = day_bounds(date(2026, 3, 8), date(2026, 3, 8), ZoneInfo("America/New_York"))
    assert (hi - lo).total_seconds() == 23 * 3600  # spring-forward day is 23 hours
    lo, hi = day_bounds(date(2026, 9, 27), date(2026, 9, 27), ZoneInfo("Asia/Kolkata"))
    assert lo.isoformat() == "2026-09-26T18:30:00+00:00"


def test_audit_log_listing_and_permission(as_user):
    mgr = as_user("manager")
    _paid(mgr)
    page = ok(mgr.get("/audit-logs", params={"limit": 3}))
    assert len(page["items"]) == 3 and page["next_before_id"] is not None
    actions = {e["action"] for e in ok(mgr.get("/audit-logs"))["items"]}
    assert {"order.opened", "order.fired", "bill.created", "payment.processed"} <= actions
    older = ok(mgr.get("/audit-logs", params={"before_id": page["next_before_id"]}))
    assert all(e["id"] < page["next_before_id"] for e in older["items"])
    err(as_user("cashier").get("/audit-logs"), 403, "PERMISSION_DENIED")


# ---------- regressions from review ----------

def test_refund_goes_back_on_the_original_method(as_user):
    mgr = as_user("manager")
    bill = _paid(mgr)  # paid by card
    err(mgr.post(f"/bills/{bill['id']}/refunds", json={
        "version": bill["version"], "payment_method_id": cash_id(mgr), "amount": "10.00",
        "reason": "Cash from drawer"}), 422, "VALIDATION_ERROR")


def test_mistaken_partial_payment_can_be_unwound_then_voided(as_user):
    cashier = as_user("cashier")
    bill = billed(as_user("server"))
    bill = ok(cashier.post(f"/bills/{bill['id']}/payments", json={
        "version": bill["version"], "payment_method_id": card_id(cashier), "amount": "0.01"}))
    owner = as_user("owner")
    err(owner.post(f"/bills/{bill['id']}/void", json={"version": bill["version"],
                                                    "reason": "Wrong table"}),
        409, "INVALID_TRANSITION")
    bill = ok(owner.post(f"/bills/{bill['id']}/refunds", json={
        "version": bill["version"], "payment_method_id": card_id(owner), "amount": "0.01",
        "reason": "Charged by mistake"}))
    assert bill["status"] == "OPEN" and bill["balance_due"] == bill["total"]
    bill = ok(owner.post(f"/bills/{bill['id']}/void", json={"version": bill["version"],
                                                          "reason": "Wrong table"}))
    assert bill["status"] == "VOID"


def test_correction_refunds_do_not_count_as_sales_refunds(as_user):
    mgr = as_user("manager")
    bill = billed(mgr)
    bill = ok(mgr.post(f"/bills/{bill['id']}/payments", json={
        "version": bill["version"], "payment_method_id": card_id(mgr), "amount": "50.00"}))
    bill = ok(mgr.post(f"/bills/{bill['id']}/refunds", json={
        "version": bill["version"], "payment_method_id": card_id(mgr), "amount": "50.00",
        "reason": "Wrong card"}))
    bill = ok(mgr.post(f"/bills/{bill['id']}/payments", json={
        "version": bill["version"], "payment_method_id": cash_id(mgr), "amount": bill["total"]}))
    assert bill["status"] == "PAID"
    today = ok(mgr.get("/dashboard"))["business_date"]
    r = ok(mgr.get("/reports/summary", params={"start": today, "end": today}))
    assert r["net_sales"] == bill["total"] and r["refunds"] == "0.00"


def test_fully_refunded_bill_nets_to_zero_in_daily(as_user):
    mgr = as_user("manager")
    bill = _paid(mgr)
    ok(mgr.post(f"/bills/{bill['id']}/refunds", json={
        "version": bill["version"], "payment_method_id": card_id(mgr), "amount": bill["total"],
        "reason": "Whole meal"}))
    today = ok(mgr.get("/dashboard"))["business_date"]
    r = ok(mgr.get("/reports/summary", params={"start": today, "end": today}))
    assert r["net_sales"] == "0.00" and r["daily"][0]["net_sales"] == "0.00"


def test_rounding_increment_is_whitelisted(as_user):
    owner = as_user("owner")
    s = ok(owner.get("/settings"))
    err(owner.patch("/settings", json={"version": s["version"], "rounding_increment": "100"}),
        422, "VALIDATION_ERROR")


def test_null_settings_values_mean_no_change(as_user):
    owner = as_user("owner")
    s = ok(owner.get("/settings"))
    s2 = ok(owner.patch("/settings", json={"version": s["version"], "timezone": None,
                                           "location_name": "Harbour"}))
    assert s2["timezone"] == s["timezone"] and s2["location_name"] == "Harbour"


def test_restaurant_rename_needs_full_access(as_user):
    admin = as_user("admin")
    s = ok(admin.get("/settings"))
    err(admin.patch("/settings", json={"version": s["version"], "restaurant_name": "Mine"}), 403,
        "PERMISSION_DENIED")


def test_equivalent_amounts_replay_under_same_key(as_user):
    cashier = as_user("cashier")
    bill = billed(as_user("server"))
    h = {"Idempotency-Key": "decimal-form-123"}
    first = ok(cashier.post(f"/bills/{bill['id']}/payments", headers=h, json={
        "version": bill["version"], "payment_method_id": card_id(cashier), "amount": "10"}))
    again = ok(cashier.post(f"/bills/{bill['id']}/payments", headers=h, json={
        "version": bill["version"], "payment_method_id": card_id(cashier), "amount": "10.00"}))
    assert again == first


def test_kitchen_progress_does_not_stale_the_order(as_user):
    server = as_user("server")
    chef = as_user("chef")
    o = fire(server, open_order(server, "T1", items=[("Burrata", 1)]))
    advance(chef, board_ticket(chef, o["id"]), "PREPARING", "READY")
    # The server's copy of the order (version from before the kitchen moved) still bills.
    ok(server.post("/bills", json={"order_id": o["id"], "order_version": o["version"]}), 201)


def test_huge_ids_are_validation_errors(as_user):
    server = as_user("server")
    err(server.get("/orders/99999999999999999999"), 422, "VALIDATION_ERROR")
    err(server.post("/orders", json={"table_id": 99999999999999}), 422, "VALIDATION_ERROR")


def test_bills_filter_by_settlement_time(as_user):
    from datetime import UTC, datetime, timedelta
    mgr = as_user("manager")
    _paid(mgr)
    billed(mgr, "T2")
    since = (datetime.now(UTC) - timedelta(hours=1)).isoformat()
    page = ok(mgr.get("/bills", params={"paid_since": since}))
    assert page["total"] == 1 and page["items"][0]["status"] == "PAID"
