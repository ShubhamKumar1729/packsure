"""Preprocessing/validation tests (Phase 28: validate uploads strictly)."""

import io

import pytest
from PIL import Image

from app.preprocessing import ImageValidationError, load_image, sniff_format


def png_bytes(size=(300, 150)) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", size, "white").save(buffer, format="PNG")
    return buffer.getvalue()


def jpeg_bytes() -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (300, 150), "white").save(buffer, format="JPEG")
    return buffer.getvalue()


class TestValidation:
    def test_accepts_jpeg_and_png(self):
        assert load_image(png_bytes()).size == (300, 150)
        assert load_image(jpeg_bytes()).size == (300, 150)

    def test_rejects_empty(self):
        with pytest.raises(ImageValidationError, match="empty"):
            load_image(b"")

    def test_rejects_oversize(self, monkeypatch):
        from app import config

        monkeypatch.setattr(config, "MAX_IMAGE_BYTES", 10)
        with pytest.raises(ImageValidationError, match="exceeds"):
            load_image(png_bytes())

    def test_rejects_undecodable(self):
        with pytest.raises(ImageValidationError, match="decoded"):
            load_image(b"\x89PNG\r\n\x1a\n" + b"garbage" * 10)

    def test_rejects_non_image_magic(self):
        with pytest.raises(ImageValidationError):
            load_image(b"MZ\x90\x00" + b"\x00" * 100)  # PE/executable header

    def test_sniff_format(self):
        assert sniff_format(jpeg_bytes()) == "JPEG"
        assert sniff_format(png_bytes()) == "PNG"
