from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import Actor
from app.core.errors import Conflict, NotFound
from app.models import MenuCategory, MenuItem
from app.schemas.menu import (
    AvailabilityIn,
    CategoryIn,
    CategoryOut,
    CategoryUpdate,
    MenuItemIn,
    MenuItemOut,
    MenuItemUpdate,
    MenuOut,
)
from app.services import audit
from app.services.common import bump, check_version


def _flush_unique(db: Session, message: str) -> None:
    try:
        with db.begin_nested():
            db.flush()
    except IntegrityError as exc:
        raise Conflict(message, details={"field": "name"}) from exc


def menu(db: Session, actor: Actor, *, include_unavailable: bool = True) -> MenuOut:
    categories = list(db.scalars(select(MenuCategory)
                                 .where(MenuCategory.location_id == actor.location_id,
                                        MenuCategory.is_active)
                                 .order_by(MenuCategory.sort_order, MenuCategory.name)))
    stmt = select(MenuItem).where(MenuItem.location_id == actor.location_id, MenuItem.is_active)
    if not include_unavailable:
        stmt = stmt.where(MenuItem.is_available)
    items = list(db.scalars(stmt.order_by(MenuItem.sort_order, MenuItem.name)))
    counts: dict[int, int] = {}
    for item in items:
        counts[item.category_id] = counts.get(item.category_id, 0) + 1
    return MenuOut(
        categories=[CategoryOut(id=c.id, name=c.name, sort_order=c.sort_order,
                                item_count=counts.get(c.id, 0)) for c in categories],
        items=[MenuItemOut.model_validate(i) for i in items],
    )


def _get_category(db: Session, actor: Actor, category_id: int) -> MenuCategory:
    category = db.scalar(select(MenuCategory).where(MenuCategory.id == category_id,
                                                    MenuCategory.location_id == actor.location_id,
                                                    MenuCategory.is_active))
    if category is None:
        raise NotFound("Category not found.")
    return category


def get_item(db: Session, actor: Actor, item_id: int, *, lock: bool = False) -> MenuItem:
    stmt = select(MenuItem).where(MenuItem.id == item_id,
                                  MenuItem.location_id == actor.location_id, MenuItem.is_active)
    if lock:
        stmt = stmt.with_for_update().execution_options(populate_existing=True)
    item = db.scalar(stmt)
    if item is None:
        raise NotFound("Menu item not found.")
    return item


def category_out(db: Session, category: MenuCategory) -> CategoryOut:
    count = db.scalar(select(func.count()).where(MenuItem.category_id == category.id,
                                                 MenuItem.is_active)) or 0
    return CategoryOut(id=category.id, name=category.name, sort_order=category.sort_order,
                       item_count=count)


def create_category(db: Session, actor: Actor, data: CategoryIn) -> MenuCategory:
    category = MenuCategory(location_id=actor.location_id, name=data.name,
                            sort_order=data.sort_order)
    db.add(category)
    _flush_unique(db, "A category with that name already exists.")
    audit.record(db, actor, "menu.category_created", "menu_category", category.id,
                 f"Created category {category.name}")
    return category


def update_category(db: Session, actor: Actor, category_id: int,
                    data: CategoryUpdate) -> MenuCategory:
    category = _get_category(db, actor, category_id)
    if data.name is not None:
        category.name = data.name
    if data.sort_order is not None:
        category.sort_order = data.sort_order
    _flush_unique(db, "A category with that name already exists.")
    return category


def delete_category(db: Session, actor: Actor, category_id: int) -> None:
    category = _get_category(db, actor, category_id)
    count = db.scalar(select(func.count()).where(MenuItem.category_id == category.id,
                                                 MenuItem.is_active)) or 0
    if count:
        raise Conflict(f"{count} item(s) are in this category. Move or remove them first.")
    category.is_active = False
    audit.record(db, actor, "menu.category_deleted", "menu_category", category.id,
                 f"Removed category {category.name}")


def create_item(db: Session, actor: Actor, data: MenuItemIn) -> MenuItem:
    _get_category(db, actor, data.category_id)
    item = MenuItem(location_id=actor.location_id, **data.model_dump())
    db.add(item)
    _flush_unique(db, "A menu item with that name already exists.")
    audit.record(db, actor, "menu.item_created", "menu_item", item.id,
                 f"Added {item.name} at {item.price}", price=item.price)
    return item


def update_item(db: Session, actor: Actor, item_id: int, data: MenuItemUpdate) -> MenuItem:
    item = get_item(db, actor, item_id, lock=True)
    check_version(item, data.version, "menu item")
    if data.category_id is not None:
        item.category_id = _get_category(db, actor, data.category_id).id
    if data.name is not None:
        item.name = data.name
    if data.description is not None:
        item.description = data.description or None
    if data.sort_order is not None:
        item.sort_order = data.sort_order
    if data.price is not None and data.price != item.price:
        audit.record(db, actor, "menu.price_changed", "menu_item", item.id,
                     f"{item.name}: {item.price} → {data.price}", before=item.price,
                     after=data.price)
        item.price = data.price
    bump(item)
    _flush_unique(db, "A menu item with that name already exists.")
    return item


def set_availability(db: Session, actor: Actor, item_id: int, data: AvailabilityIn) -> MenuItem:
    item = get_item(db, actor, item_id, lock=True)
    check_version(item, data.version, "menu item")
    if item.is_available != data.is_available:
        item.is_available = data.is_available
        bump(item)
        audit.record(db, actor, "menu.availability_changed", "menu_item", item.id,
                     f"{item.name} marked {'available' if data.is_available else 'sold out'}")
    return item


def delete_item(db: Session, actor: Actor, item_id: int) -> None:
    """Soft delete: historical order lines keep their own name/price snapshot."""
    item = get_item(db, actor, item_id, lock=True)
    item.is_active = False
    bump(item)
    audit.record(db, actor, "menu.item_deleted", "menu_item", item.id, f"Removed {item.name}")
