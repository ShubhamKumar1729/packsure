"""Image preprocessing: decode, validate, normalize orientation.

Validation is strict and defensive: magic-byte checked, size-capped, and decoded
via PIL. Nothing is executed from the file; filenames are never used for paths.
"""

import io

from PIL import Image, ImageOps, UnidentifiedImageError

from . import config

# Minimal magic-byte signatures for the formats we accept.
_MAGIC: list[tuple[bytes, str]] = [
    (b"\xff\xd8\xff", "JPEG"),
    (b"\x89PNG\r\n\x1a\n", "PNG"),
    (b"RIFF", "WEBP"),  # refined by PIL below
]


class ImageValidationError(ValueError):
    """Raised with a user-safe message; never leaks internals."""


def sniff_format(data: bytes) -> str | None:
    for magic, fmt in _MAGIC:
        if data.startswith(magic):
            return "WEBP" if fmt == "WEBP" and data[8:12] != b"WEBP" else fmt
    return None


def validate_size(data: bytes) -> None:
    if len(data) == 0:
        raise ImageValidationError("The uploaded image is empty.")
    if len(data) > config.MAX_IMAGE_BYTES:
        raise ImageValidationError(f"The uploaded image exceeds the {config.MAX_IMAGE_BYTES // (1024 * 1024)} MB limit.")


def load_image(data: bytes) -> Image.Image:
    """Decode and validate an uploaded image, normalizing EXIF orientation."""
    validate_size(data)
    sniffed = sniff_format(data)
    if sniffed is not None and sniffed not in config.ALLOWED_IMAGE_FORMATS:
        raise ImageValidationError("Unsupported image format. Use JPEG, PNG or WebP.")
    try:
        image = Image.open(io.BytesIO(data))
        image.load()
    except (UnidentifiedImageError, OSError) as error:
        raise ImageValidationError("The file could not be decoded as an image.") from error
    if image.format not in config.ALLOWED_IMAGE_FORMATS:
        raise ImageValidationError("Unsupported image format. Use JPEG, PNG or WebP.")
    # Respect EXIF rotation so OCR boxes match what the user saw.
    return ImageOps.exif_transpose(image)


def preprocess_for_ocr(image: Image.Image) -> Image.Image:
    """Light, deterministic preprocessing suitable for package labels.

    Grayscale + autocontrast only — no aggressive binarization, which hurts
    colored retail labels. Small images are upscaled because Tesseract performs
    poorly under ~1000px width.
    """
    from .config import OCR_UPSCALE_MIN_WIDTH

    image = ImageOps.exif_transpose(image)
    if image.mode not in ("L", "RGB"):
        image = image.convert("RGB")
    gray = image.convert("L")
    gray = ImageOps.autocontrast(gray)
    width, _ = gray.size
    if width < OCR_UPSCALE_MIN_WIDTH:
        factor = min(3.0, OCR_UPSCALE_MIN_WIDTH / max(width, 1))
        gray = gray.resize((int(gray.width * factor), int(gray.height * factor)), Image.LANCZOS)
    return gray
