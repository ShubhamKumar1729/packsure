"""API-level tests: /health, /extract, validation, security, degraded-mode honesty.

The trained NER model does not exist yet, so these tests verify the DEGRADED
path explicitly (pattern extractor, degraded=true) — that is the honest
contract the backend depends on.
"""

import io

import pytest
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

from app import config
from app.main import app


@pytest.fixture()
def client(monkeypatch):
    # Force the "no model" state for deterministic degraded-mode tests.
    monkeypatch.setattr("app.main._MODEL_STATE", {"loaded": False})
    return TestClient(app)


def png_bytes(width=600, height=200, color="white") -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (width, height), color).save(buffer, format="PNG")
    return buffer.getvalue()


class TestHealth:
    def test_health_reports_degraded_without_model(self, client):
        response = client.get("/health")
        assert response.status_code == 200
        body = response.json()
        assert body["model_loaded"] is False
        assert body["model"]["degraded"] is True
        assert body["status"] == "degraded"

    def test_api_key_rejected_when_configured(self, monkeypatch):
        monkeypatch.setattr(config, "NLP_API_KEY", "secret-key-1")
        local_client = TestClient(app)
        assert local_client.get("/health").status_code == 401
        assert local_client.get("/health", headers={"X-API-Key": "secret-key-1"}).status_code == 200

    def test_api_key_open_when_unset(self, client):
        assert client.get("/health").status_code == 200


class TestExtract:
    def test_extract_returns_schema_and_raw_values(self, client):
        response = client.post("/extract", json={"ocr_text": "MRP Rs.120/- Net Qty 500G Mfd: 06/2026"})
        assert response.status_code == 200
        body = response.json()
        assert body["success"] is True
        assert body["model"]["extractor"] == "pattern_rules"
        assert body["model"]["degraded"] is True

        fields = body["fields"]
        assert fields["mrp"]["value"] == "₹120"
        assert fields["mrp"]["raw_value"].startswith("Rs.120")  # raw preserved verbatim
        assert fields["net_quantity"]["value"] == "500 g"
        assert fields["mfg_date"]["value"] == "2026-06"
        # Missing fields are explicitly listed, not fabricated.
        assert "manufacturer" in body["missing_fields"]
        assert "manufacturer" not in fields

    def test_extract_unknown_text_returns_no_fabrication(self, client):
        response = client.post("/extract", json={"ocr_text": "lorem ipsum dolor sit amet"})
        body = response.json()
        assert body["fields"].get("mrp") is None
        assert len(body["missing_fields"]) == 16

    def test_extract_rejects_blank(self, client):
        assert client.post("/extract", json={"ocr_text": "   "}).status_code == 422

    def test_extract_rejects_oversize_text(self, client):
        response = client.post("/extract", json={"ocr_text": "x" * 25000})
        assert response.status_code == 422


class TestPipelineValidation:
    def test_pipeline_rejects_bad_bytes(self, client):
        response = client.post("/pipeline", files={"image": ("x.png", b"not-an-image", "image/png")})
        assert response.status_code == 422
        assert "decode" in response.json()["detail"].lower()

    def test_pipeline_rejects_wrong_format(self, client):
        buffer = io.BytesIO()
        Image.new("RGB", (10, 10)).save(buffer, format="BMP")
        response = client.post("/pipeline", files={"image": ("x.bmp", buffer.getvalue(), "image/bmp")})
        assert response.status_code == 422

    def test_pipeline_rejects_empty(self, client):
        response = client.post("/pipeline", files={"image": ("x.png", b"", "image/png")})
        assert response.status_code == 422


@pytest.mark.skipif(not __import__("shutil").which("tesseract"), reason="tesseract binary not installed in this environment")
class TestPipelineEndToEnd:
    """Full image -> OCR -> extraction test. Renders a SYNTHETIC test label at
    runtime (clearly a test fixture, not a real product or training data)."""

    def test_synthetic_label_end_to_end(self, client):
        image = Image.new("RGB", (900, 400), "white")
        draw = ImageDraw.Draw(image)
        draw.text((40, 40), "MRP Rs.120/-", fill="black")
        draw.text((40, 90), "Net Qty. 500 g", fill="black")
        draw.text((40, 140), "Mfd: 06/2026", fill="black")
        buffer = io.BytesIO()
        image.save(buffer, format="PNG")
        response = client.post("/pipeline", files={"image": ("synthetic_label.png", buffer.getvalue(), "image/png")})
        assert response.status_code == 200
        body = response.json()
        assert body["ocr"]["status"] == "completed"
        assert body["ocr"]["text"].strip(), "OCR produced no text for the synthetic label"
        assert "mrp" in body["fields"] or "MRP" in body["ocr"]["text"]
        # CV observations must be honest about scale limits.
        assert body["cv"]["scale_source"] is None or body["cv"]["scale_source"] == "ean13_barcode"
