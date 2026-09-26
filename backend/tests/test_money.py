from decimal import Decimal

import pytest

from app.services.money import compute, discount_amount, round_to_increment

D = Decimal


def test_basic_breakdown_matches_hand_calculation():
    # 450 + 2×180 = 810; 5% service = 40.50; taxable 850.50; 2.5% ×2 = 21.26 each (21.2625)
    b = compute([D("450.00"), D("360.00")], discount_type=None, discount_value=None,
                service_charge_percent=D("5"), service_charge_taxable=True,
                taxes=[("CGST", D("2.5")), ("SGST", D("2.5"))], rounding_increment=D("0.01"))
    assert b.subtotal == D("810.00")
    assert b.service_charge_amount == D("40.50")
    assert [t.amount for t in b.taxes] == [D("21.26"), D("21.26")]
    assert b.total == D("893.02")
    assert b.round_off == D("0.00")


def test_discount_applies_before_service_and_tax():
    b = compute([D("1000.00")], discount_type="PERCENT", discount_value=D("10"),
                service_charge_percent=D("0"), service_charge_taxable=True,
                taxes=[("VAT", D("10"))], rounding_increment=D("0.01"))
    assert b.discount_amount == D("100.00")
    assert b.taxes[0].taxable_amount == D("900.00")
    assert b.total == D("990.00")


def test_untaxed_service_charge():
    b = compute([D("100.00")], discount_type=None, discount_value=None,
                service_charge_percent=D("10"), service_charge_taxable=False,
                taxes=[("VAT", D("10"))], rounding_increment=D("0.01"))
    assert b.taxes[0].taxable_amount == D("100.00")
    assert b.total == D("120.00")


def test_rounding_to_whole_units_records_round_off():
    b = compute([D("99.40")], discount_type=None, discount_value=None,
                service_charge_percent=D("0"), service_charge_taxable=True, taxes=[],
                rounding_increment=D("1.00"))
    assert b.total == D("99.00") and b.round_off == D("-0.40")
    b = compute([D("99.50")], discount_type=None, discount_value=None,
                service_charge_percent=D("0"), service_charge_taxable=True, taxes=[],
                rounding_increment=D("1.00"))
    assert b.total == D("100.00") and b.round_off == D("0.50")


@pytest.mark.parametrize("amount,increment,expected", [
    ("10.02", "0.05", "10.00"), ("10.03", "0.05", "10.05"), ("10.025", "0.01", "10.03"),
    ("0.004", "0.01", "0.00"),
])
def test_round_to_increment(amount, increment, expected):
    assert round_to_increment(D(amount), D(increment)) == D(expected)


def test_fixed_discount_capped_at_subtotal():
    assert discount_amount(D("50.00"), "FIXED", D("80.00")) == D("50.00")


def test_full_percent_discount_gives_zero_total():
    b = compute([D("50.00")], discount_type="PERCENT", discount_value=D("100"),
                service_charge_percent=D("5"), service_charge_taxable=True,
                taxes=[("VAT", D("5"))], rounding_increment=D("0.01"))
    assert b.total == D("0.00")


def test_invalid_percent_rejected():
    with pytest.raises(ValueError):
        discount_amount(D("10"), "PERCENT", D("0"))
    with pytest.raises(ValueError):
        discount_amount(D("10"), "PERCENT", D("101"))


def test_no_floats_anywhere():
    b = compute([D("0.10")] * 3, discount_type=None, discount_value=None,
                service_charge_percent=D("0"), service_charge_taxable=True, taxes=[],
                rounding_increment=D("0.01"))
    assert b.total == D("0.30")  # 0.1 + 0.1 + 0.1 != 0.3 in binary floating point


def test_positive_amount_never_rounds_to_zero():
    b = compute([D("0.40")], discount_type=None, discount_value=None,
                service_charge_percent=D("0"), service_charge_taxable=True, taxes=[],
                rounding_increment=D("1.00"))
    assert b.total == D("0.40") and b.round_off == D("0.00")
