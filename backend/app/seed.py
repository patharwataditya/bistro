"""Reference data (always), first-run bootstrap (production), and demo data (dev only)."""

from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.permissions import DEFAULT_ROLES, OWNER_ROLE, PERMISSIONS
from app.core.security import hash_password
from app.models import (
    DiningTable,
    Location,
    MenuCategory,
    MenuItem,
    PaymentMethod,
    Permission,
    Restaurant,
    Role,
    TableArea,
    TaxRate,
    User,
)


def sync_reference_data(db: Session) -> None:
    """Idempotent: make the permissions table match the code catalog; Owner keeps everything."""
    existing = {p.code: p for p in db.scalars(select(Permission))}
    for code, (group, description) in PERMISSIONS.items():
        perm = existing.get(code)
        if perm is None:
            db.add(Permission(code=code, group=group, description=description))
        else:
            perm.group, perm.description = group, description
    for code, perm in existing.items():
        if code not in PERMISSIONS:
            db.delete(perm)
    db.flush()
    all_perms = list(db.scalars(select(Permission)))
    for owner in db.scalars(select(Role).where(Role.is_system, Role.name == OWNER_ROLE)):
        owner.permissions = all_perms
    db.flush()


def bootstrap(
    db: Session,
    *,
    restaurant_name: str,
    location_name: str,
    timezone: str,
    currency_code: str,
    owner_username: str,
    owner_full_name: str,
    owner_password: str,
) -> tuple[Restaurant, Location, User]:
    """Create the first restaurant, location, default roles and the owner account."""
    if db.scalar(select(Restaurant.id).limit(1)) is not None:
        raise RuntimeError("Already bootstrapped: a restaurant exists.")
    sync_reference_data(db)
    perms = {p.code: p for p in db.scalars(select(Permission))}
    restaurant = Restaurant(name=restaurant_name)
    db.add(restaurant)
    db.flush()
    location = Location(restaurant_id=restaurant.id, name=location_name, timezone=timezone,
                        currency_code=currency_code)
    db.add(location)
    db.flush()
    roles: dict[str, Role] = {}
    for name, (description, codes) in DEFAULT_ROLES.items():
        role = Role(restaurant_id=restaurant.id, name=name, description=description,
                    is_system=name == OWNER_ROLE, permissions=[perms[c] for c in sorted(codes)])
        db.add(role)
        roles[name] = role
    for i, (name, is_cash) in enumerate([("Cash", True), ("Card", False), ("UPI", False),
                                         ("Other", False)]):
        db.add(PaymentMethod(location_id=location.id, name=name, is_cash=is_cash, sort_order=i))
    owner = User(restaurant_id=restaurant.id, location_id=location.id, username=owner_username,
                 full_name=owner_full_name, password_hash=hash_password(owner_password),
                 roles=[roles[OWNER_ROLE]])
    db.add(owner)
    db.flush()
    return restaurant, location, owner


DEMO_PASSWORD = "bistro-demo-1"  # noqa: S105 — development seed only; `demo` refuses to run in production

DEMO_USERS = [
    ("owner", "Olivia Owner", OWNER_ROLE),
    ("admin", "Arjun Admin", "Administrator"),
    ("manager", "Maya Manager", "Manager"),
    ("cashier", "Carlos Cashier", "Cashier"),
    ("chef", "Kenji Kitchen", "Kitchen Staff"),
    ("server", "Sofia Server", "Floor Staff"),
]

DEMO_MENU = {
    "Starters": [("Tomato Basil Soup", "Slow-roasted tomatoes, basil oil", "180.00"),
                 ("Crispy Calamari", "Lemon aioli", "320.00"),
                 ("Burrata", "Heirloom tomatoes, sourdough", "420.00"),
                 ("Paneer Tikka", "Charred cottage cheese, mint chutney", "290.00")],
    "Mains": [("Margherita Pizza", "San Marzano, fior di latte", "450.00"),
              ("Truffle Mushroom Risotto", "Arborio, parmesan, truffle", "560.00"),
              ("Grilled Salmon", "Lemon butter, greens", "780.00"),
              ("Butter Chicken", "Tomato makhani, served with naan", "480.00"),
              ("Aglio e Olio", "Garlic, chilli, parsley", "380.00")],
    "Desserts": [("Tiramisu", "Mascarpone, espresso", "280.00"),
                 ("Chocolate Fondant", "Vanilla bean ice cream", "320.00")],
    "Drinks": [("Fresh Lime Soda", "Sweet or salted", "120.00"),
               ("Cold Brew", "18-hour steep", "180.00"),
               ("Sparkling Water", "750 ml", "150.00"),
               ("Masala Chai", "House blend", "90.00")],
}


def seed_demo(db: Session) -> None:
    _, location, _ = bootstrap(
        db, restaurant_name="Bistro Demo", location_name="Main Street", timezone="Asia/Kolkata",
        currency_code="INR", owner_username="owner", owner_full_name="Olivia Owner",
        owner_password=DEMO_PASSWORD,
    )
    roles = {r.name: r for r in db.scalars(select(Role))}
    for username, full_name, role in DEMO_USERS[1:]:
        db.add(User(restaurant_id=location.restaurant_id, location_id=location.id,
                    username=username, full_name=full_name,
                    password_hash=hash_password(DEMO_PASSWORD), roles=[roles[role]]))
    location.service_charge_percent = Decimal("5.00")
    db.add_all([
        TaxRate(location_id=location.id, name="CGST", rate_percent=Decimal("2.5"), sort_order=0),
        TaxRate(location_id=location.id, name="SGST", rate_percent=Decimal("2.5"), sort_order=1),
    ])
    areas = [TableArea(location_id=location.id, name=n, sort_order=i)
             for i, n in enumerate(["Main Hall", "Patio", "Bar"])]
    db.add_all(areas)
    db.flush()
    layout = [(areas[0], "T", 8, 4), (areas[1], "P", 4, 2), (areas[2], "B", 4, 2)]
    for area, prefix, count, capacity in layout:
        for n in range(1, count + 1):
            db.add(DiningTable(location_id=location.id, area_id=area.id, name=f"{prefix}{n}",
                               capacity=capacity if n % 3 else capacity + 2, sort_order=n))
    for i, (category_name, items) in enumerate(DEMO_MENU.items()):
        category = MenuCategory(location_id=location.id, name=category_name, sort_order=i)
        db.add(category)
        db.flush()
        for j, (name, description, price) in enumerate(items):
            db.add(MenuItem(location_id=location.id, category_id=category.id, name=name,
                            description=description, price=Decimal(price), sort_order=j))
    db.flush()
