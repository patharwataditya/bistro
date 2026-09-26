from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import Actor
from app.core.errors import NotFound, ValidationFailed
from app.models import Location, PaymentMethod, Restaurant, TaxRate
from app.schemas.settings import (
    PaymentMethodIn,
    PaymentMethodOut,
    PaymentMethodUpdate,
    SettingsOut,
    SettingsUpdate,
    TaxRateOut,
    TaxRatesIn,
)
from app.services import audit
from app.services.common import bump, check_version


def _location(db: Session, actor: Actor, *, lock: bool = False) -> Location:
    stmt = select(Location).where(Location.id == actor.location_id)
    if lock:
        stmt = stmt.with_for_update().execution_options(populate_existing=True)
    location = db.scalar(stmt)
    assert location is not None
    return location


def payment_methods(db: Session, actor: Actor, *, active_only: bool) -> list[PaymentMethod]:
    stmt = select(PaymentMethod).where(PaymentMethod.location_id == actor.location_id)
    if active_only:
        stmt = stmt.where(PaymentMethod.is_active)
    return list(db.scalars(stmt.order_by(PaymentMethod.sort_order, PaymentMethod.name)))


def active_tax_rates(db: Session, location_id: int) -> list[TaxRate]:
    return list(db.scalars(select(TaxRate)
                           .where(TaxRate.location_id == location_id, TaxRate.is_active)
                           .order_by(TaxRate.sort_order, TaxRate.id)))


def get_settings_out(db: Session, actor: Actor) -> SettingsOut:
    location = _location(db, actor)
    restaurant = db.get(Restaurant, location.restaurant_id)
    taxes = list(db.scalars(select(TaxRate).where(TaxRate.location_id == location.id)
                            .order_by(TaxRate.sort_order, TaxRate.id)))
    return SettingsOut(
        restaurant_name=restaurant.name if restaurant else "",
        location_name=location.name, address=location.address, timezone=location.timezone,
        currency_code=location.currency_code,
        service_charge_percent=location.service_charge_percent,
        service_charge_taxable=location.service_charge_taxable,
        rounding_increment=location.rounding_increment, bill_prefix=location.bill_prefix,
        status_after_payment=location.status_after_payment, version=location.version,
        tax_rates=[TaxRateOut.model_validate(t) for t in taxes],
        payment_methods=[PaymentMethodOut.model_validate(p)
                         for p in payment_methods(db, actor, active_only=False)],
    )


def update_settings(db: Session, actor: Actor, data: SettingsUpdate) -> SettingsOut:
    location = _location(db, actor, lock=True)
    check_version(location, data.version, "settings")
    changes = data.model_dump(exclude_unset=True, exclude={"version", "restaurant_name",
                                                           "location_name"})
    before = {k: getattr(location, k) for k in changes}
    for key, value in changes.items():
        setattr(location, key, value)
    if data.location_name is not None:
        location.name = data.location_name
    if data.restaurant_name is not None:
        restaurant = db.get(Restaurant, location.restaurant_id, with_for_update=True, populate_existing=True)
        assert restaurant is not None
        restaurant.name = data.restaurant_name
    bump(location)
    audit.record(db, actor, "settings.updated", "location", location.id, "Updated settings",
                 before=before, after=changes)
    db.flush()
    return get_settings_out(db, actor)


def replace_tax_rates(db: Session, actor: Actor, data: TaxRatesIn) -> SettingsOut:
    """Replace the tax table. Existing bills keep their own tax snapshot (BillTax)."""
    location = _location(db, actor, lock=True)
    check_version(location, data.version, "settings")
    existing = {t.id: t for t in db.scalars(select(TaxRate)
                                            .where(TaxRate.location_id == location.id))}
    keep: set[int] = set()
    for index, rate in enumerate(data.tax_rates):
        if rate.id is not None:
            row = existing.get(rate.id)
            if row is None:
                raise ValidationFailed("Unknown tax rate.", details={"id": rate.id})
            row.name, row.rate_percent, row.is_active = rate.name, rate.rate_percent, rate.is_active
            row.sort_order = index
            keep.add(row.id)
        else:
            db.add(TaxRate(location_id=location.id, name=rate.name,
                           rate_percent=rate.rate_percent, is_active=rate.is_active,
                           sort_order=index))
    for tax_id, row in existing.items():
        if tax_id not in keep:
            db.delete(row)
    bump(location)
    audit.record(db, actor, "settings.taxes_changed", "location", location.id,
                 "Updated tax rates",
                 taxes=[{"name": t.name, "rate": t.rate_percent, "active": t.is_active}
                        for t in data.tax_rates])
    db.flush()
    return get_settings_out(db, actor)


def create_payment_method(db: Session, actor: Actor, data: PaymentMethodIn) -> PaymentMethod:
    method = PaymentMethod(location_id=actor.location_id, **data.model_dump())
    db.add(method)
    db.flush()
    audit.record(db, actor, "settings.payment_method_created", "payment_method", method.id,
                 f"Added payment method {method.name}")
    return method


def update_payment_method(db: Session, actor: Actor, method_id: int,
                          data: PaymentMethodUpdate) -> PaymentMethod:
    method = db.scalar(select(PaymentMethod).where(PaymentMethod.id == method_id,
                                                   PaymentMethod.location_id == actor.location_id))
    if method is None:
        raise NotFound("Payment method not found.")
    changes = data.model_dump(exclude_unset=True)
    for key, value in changes.items():
        setattr(method, key, value)
    audit.record(db, actor, "settings.payment_method_updated", "payment_method", method.id,
                 f"Updated payment method {method.name}", changes=changes)
    db.flush()
    return method
