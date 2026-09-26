"""The permission catalog. Code-defined (routes depend on these), seeded into the DB."""

from typing import Final

PERMISSIONS: Final[dict[str, tuple[str, str]]] = {
    # code: (group, description)
    "dashboard.view": ("Dashboard", "See the operations dashboard"),
    "tables.view": ("Tables", "See the floor and table status"),
    "tables.create": ("Tables", "Add tables and areas"),
    "tables.update": ("Tables", "Edit table details and areas"),
    "tables.delete": ("Tables", "Remove tables and areas"),
    "tables.manage_status": ("Tables", "Mark tables reserved, cleaning, blocked or available"),
    "orders.view": ("Orders", "See orders"),
    "orders.create": ("Orders", "Open tables and start orders"),
    "orders.update": ("Orders", "Add, edit and send items"),
    "orders.cancel": ("Orders", "Void sent items and cancel orders"),
    "orders.transfer": ("Orders", "Move, merge and split orders between tables"),
    "kitchen.view": ("Kitchen", "See kitchen tickets"),
    "kitchen.update": ("Kitchen", "Accept, prepare, ready and complete tickets"),
    "billing.view": ("Billing", "See bills and payments"),
    "billing.create": ("Billing", "Issue bills for orders"),
    "billing.discount": ("Billing", "Apply or remove bill discounts"),
    "billing.void": ("Billing", "Void unpaid bills"),
    "billing.process_payment": ("Billing", "Take payments"),
    "billing.refund": ("Billing", "Refund paid bills"),
    "menu.view": ("Menu", "See the menu"),
    "menu.create": ("Menu", "Add menu items"),
    "menu.update": ("Menu", "Edit items and prices"),
    "menu.set_availability": ("Menu", "Mark items available or sold out"),
    "menu.delete": ("Menu", "Remove menu items"),
    "menu.manage_categories": ("Menu", "Create, edit and remove categories"),
    "staff.view": ("Staff", "See staff accounts"),
    "staff.create": ("Staff", "Create staff accounts"),
    "staff.update": ("Staff", "Edit staff, assign roles, reset passwords"),
    "staff.deactivate": ("Staff", "Deactivate and reactivate staff"),
    "roles.view": ("Roles", "See roles and permissions"),
    "roles.create": ("Roles", "Create roles"),
    "roles.update": ("Roles", "Rename roles and change their permissions"),
    "roles.delete": ("Roles", "Delete roles"),
    "reports.view": ("Reports", "See sales and operations reports"),
    "settings.view": ("Settings", "See restaurant settings"),
    "settings.update": ("Settings", "Change taxes, payment methods and billing settings"),
    "audit_logs.view": ("Audit", "Review the audit log"),
}

ALL: Final[frozenset[str]] = frozenset(PERMISSIONS)

OWNER_ROLE = "Owner"

DEFAULT_ROLES: Final[dict[str, tuple[str, frozenset[str]]]] = {
    OWNER_ROLE: ("Full access. Cannot be edited or removed.", ALL),
    "Administrator": (
        "Everything except deleting roles.",
        ALL - {"roles.delete"},
    ),
    "Manager": (
        "Runs the floor: orders, billing, refunds, menu, staff and reports.",
        frozenset({
            "dashboard.view", "tables.view", "tables.create", "tables.update",
            "tables.manage_status", "orders.view", "orders.create", "orders.update",
            "orders.cancel", "orders.transfer", "kitchen.view", "kitchen.update",
            "billing.view", "billing.create", "billing.discount", "billing.void",
            "billing.process_payment", "billing.refund", "menu.view", "menu.create",
            "menu.update", "menu.set_availability", "menu.delete", "menu.manage_categories",
            "staff.view", "staff.create",
            "staff.update", "staff.deactivate", "roles.view", "reports.view", "settings.view",
            "audit_logs.view",
        }),
    ),
    "Cashier": (
        "Bills and payments.",
        frozenset({
            "dashboard.view", "tables.view", "orders.view", "billing.view", "billing.create",
            "billing.process_payment", "menu.view",
        }),
    ),
    "Kitchen Staff": (
        "Kitchen display.",
        frozenset({"kitchen.view", "kitchen.update", "menu.view", "menu.set_availability"}),
    ),
    "Floor Staff": (
        "Seats guests, takes orders, serves.",
        frozenset({
            "dashboard.view", "tables.view", "tables.manage_status", "orders.view",
            "orders.create", "orders.update", "orders.transfer", "kitchen.view", "billing.view",
            "billing.create", "menu.view",
        }),
    ),
}
