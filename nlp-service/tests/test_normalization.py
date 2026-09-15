"""Deterministic normalization tests (Phase 7)."""

from app.normalization import (
    normalize_best_before,
    normalize_customer_care,
    normalize_month_year,
    normalize_mrp,
    normalize_net_quantity,
)


class TestNetQuantity:
    def test_common_surface_forms(self):
        cases = {
            "500G": ("500 g", "g", 500.0),
            "500 GM": ("500 g", "g", 500.0),
            "500 g": ("500 g", "g", 500.0),
            "1.5 kg": ("1.5 kg", "kg", 1.5),
            "750 ml": ("750 ml", "ml", 750.0),
            "1 L": ("1 l", "l", 1.0),
            "2 x 500 g": ("500 g", "g", 500.0),
            "Net Wt. 200G": ("200 g", "g", 200.0),
        }
        for raw, (value, unit, magnitude) in cases.items():
            result = normalize_net_quantity(raw)
            assert result is not None, raw
            assert result["value"] == value
            assert result["unit"] == unit
            assert result["magnitude"] == magnitude

    def test_multipack_count(self):
        result = normalize_net_quantity("2X100ml")
        assert result is not None
        assert result["count"] == 2
        assert result["total"] == 200.0

    def test_ambiguous_input_returns_none(self):
        assert normalize_net_quantity("500") is None  # no unit: ambiguous
        assert normalize_net_quantity("") is None
        assert normalize_net_quantity("five hundred g") is None


class TestMrp:
    def test_common_surface_forms(self):
        cases = {
            "Rs.120/-": "₹120",
            "MRP Rs 120": "₹120",
            "₹ 45": "₹45",
            "M.R.P.: 99.50": "₹99.5",
            "1,20,000": "₹120000",
            "INR 35": "₹35",
        }
        for raw, value in cases.items():
            assert normalize_mrp(raw)["value"] == value, raw

    def test_garbage_returns_none(self):
        assert normalize_mrp("twelve rupees") is None
        assert normalize_mrp("") is None


class TestDates:
    def test_numeric_forms(self):
        assert normalize_month_year("06/2026")["iso"] == "2026-06"
        assert normalize_month_year("6-2026")["iso"] == "2026-06"
        assert normalize_month_year("06/26")["iso"] == "2026-06"
        assert normalize_month_year("2026/06")["iso"] == "2026-06"
        assert normalize_month_year("Mfd: 06/2026")["iso"] == "2026-06"

    def test_textual_forms(self):
        assert normalize_month_year("Jun 2026")["iso"] == "2026-06"
        assert normalize_month_year("Manufactured: Jun 2026")["iso"] == "2026-06"
        assert normalize_month_year("SEP-2025")["iso"] == "2025-09"

    def test_ambiguous_or_invalid_returns_none(self):
        assert normalize_month_year("2026") is None
        assert normalize_month_year("13/2026") is None
        assert normalize_month_year("06/1888") is None
        assert normalize_month_year("") is None


class TestBestBefore:
    def test_relative(self):
        result = normalize_best_before("Best before 6 months from packaging")
        assert result["type"] == "relative"
        assert result["months"] == 6

    def test_absolute(self):
        result = normalize_best_before("Best Before: 09/2026")
        assert result["type"] == "absolute"
        assert result["iso"] == "2026-09"


class TestCustomerCare:
    def test_email(self):
        assert normalize_customer_care("Write to care@brand.co.in")["type"] == "email"

    def test_phone(self):
        result = normalize_customer_care("Toll Free 1800-123-4567")
        assert result["type"] == "phone"
        assert result["digits"] == "18001234567"

    def test_url(self):
        assert normalize_customer_care("www.brand.in/care")["type"] == "url"

    def test_no_contact(self):
        assert normalize_customer_care("Net Wt 50 g") is None
