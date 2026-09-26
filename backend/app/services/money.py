"""Authoritative bill arithmetic. Pure functions over Decimal; no floats anywhere."""

from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

from app.models.enums import DiscountType

CENT = Decimal("0.01")
ZERO = Decimal("0.00")
HUNDRED = Decimal("100")


def q(value: Decimal) -> Decimal:
    return value.quantize(CENT, rounding=ROUND_HALF_UP)


@dataclass(frozen=True)
class TaxLine:
    name: str
    rate_percent: Decimal
    taxable_amount: Decimal
    amount: Decimal


@dataclass(frozen=True)
class Breakdown:
    subtotal: Decimal
    discount_amount: Decimal
    service_charge_percent: Decimal
    service_charge_amount: Decimal
    taxes: tuple[TaxLine, ...]
    tax_total: Decimal
    round_off: Decimal
    total: Decimal


def discount_amount(subtotal: Decimal, kind: str | None, value: Decimal | None) -> Decimal:
    if kind is None or value is None:
        return ZERO
    if kind == DiscountType.PERCENT:
        if not ZERO < value <= HUNDRED:
            raise ValueError("Percent discount must be between 0 and 100")
        return q(subtotal * value / HUNDRED)
    if kind == DiscountType.FIXED:
        if value <= ZERO:
            raise ValueError("Discount must be positive")
        return min(q(value), subtotal)
    raise ValueError(f"Unknown discount type {kind}")


def round_to_increment(amount: Decimal, increment: Decimal) -> Decimal:
    if increment <= ZERO:
        raise ValueError("Rounding increment must be positive")
    steps = (amount / increment).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    return q(steps * increment)


def compute(
    line_totals: list[Decimal],
    *,
    discount_type: str | None,
    discount_value: Decimal | None,
    service_charge_percent: Decimal,
    service_charge_taxable: bool,
    taxes: list[tuple[str, Decimal]],
    rounding_increment: Decimal,
) -> Breakdown:
    """subtotal → discount → service charge → taxes (per line, rounded) → rounded total."""
    subtotal = q(sum(line_totals, ZERO))
    discount = discount_amount(subtotal, discount_type, discount_value)
    net = subtotal - discount
    service = q(net * service_charge_percent / HUNDRED)
    taxable = net + (service if service_charge_taxable else ZERO)
    tax_lines = tuple(TaxLine(name, rate, taxable, q(taxable * rate / HUNDRED))
                      for name, rate in taxes)
    tax_total = sum((t.amount for t in tax_lines), ZERO)
    exact = net + service + tax_total
    total = round_to_increment(exact, rounding_increment)
    return Breakdown(
        subtotal=subtotal, discount_amount=discount,
        service_charge_percent=service_charge_percent, service_charge_amount=service,
        taxes=tax_lines, tax_total=q(tax_total), round_off=q(total - exact), total=total,
    )
