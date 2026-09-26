from decimal import Decimal

from tests.conftest import ok


def table_id(api, name):
    return next(t["id"] for t in ok(api.get("/tables"))["tables"] if t["name"] == name)


def table(api, name):
    return next(t for t in ok(api.get("/tables"))["tables"] if t["name"] == name)


def menu_id(api, name):
    return next(i["id"] for i in ok(api.get("/menu"))["items"] if i["name"] == name)


def open_order(api, table_name="T1", items=(), guests=2):
    body = {"table_id": table_id(api, table_name), "guest_count": guests,
            "items": [{"menu_item_id": menu_id(api, n), "quantity": q} for n, q in items]}
    return ok(api.post("/orders", json=body), 201)


def fire(api, order):
    return ok(api.post(f"/orders/{order['id']}/fire", json={"version": order["version"]}))


def board_ticket(api, order_id):
    return next(t for t in ok(api.get("/kitchen/tickets"))["tickets"] if t["order_id"] == order_id)


def advance(api, ticket, *states):
    for state in states:
        ticket = ok(api.post(f"/kitchen/tickets/{ticket['id']}/transition",
                             json={"version": ticket["version"], "to": state}))
    return ticket


def cash_id(api):
    return next(m["id"] for m in ok(api.get("/payment-methods")) if m["is_cash"])


def card_id(api):
    return next(m["id"] for m in ok(api.get("/payment-methods")) if m["name"] == "Card")


def D(value):  # noqa: N802 - reads like the Decimal constructor it wraps
    return Decimal(str(value))
