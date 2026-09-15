"""Batch OCR for dataset creation (notebook 01).

Runs Tesseract over a directory of product photos and writes one JSON per image:
    {image, text, words: [{text, confidence, bbox_px, line}], engine}

The OUTPUT IS A DRAFT for human review — OCR text is never auto-committed to the
training set without a person reading it and annotating entities (Phase 37 step 3).
"""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff"}


def ocr_image(path: Path, lang: str = "eng") -> dict:
    """OCR one image with word-level boxes + confidence (same engine as serving)."""
    import pytesseract

    image = Image.open(path)
    image = image.convert("RGB") if image.mode not in ("RGB", "L") else image
    data = pytesseract.image_to_data(image, lang=lang, output_type=pytesseract.Output.DICT)
    words: list[dict] = []
    lines: list[str] = []
    current_key = None
    parts: list[str] = []
    width, height = image.size
    for index, raw in enumerate(data["text"]):
        text = (raw or "").strip()
        confidence = float(data["conf"][index])
        if not text or confidence < 0:
            continue
        key = (data["block_num"][index], data["par_num"][index], data["line_num"][index])
        if current_key is not None and key != current_key:
            lines.append(" ".join(parts))
            parts = []
        current_key = key
        parts.append(text)
        words.append({
            "text": text,
            "confidence": round(confidence / 100.0, 4),
            "bbox_px": [int(data["left"][index]), int(data["top"][index]), int(data["width"][index]), int(data["height"][index])],
            "line": int(data["line_num"][index]),
            "bbox_norm": [round(int(data["left"][index]) / width, 5), round(int(data["top"][index]) / height, 5),
                          round(int(data["width"][index]) / width, 5), round(int(data["height"][index]) / height, 5)],
        })
    if parts:
        lines.append(" ".join(parts))
    return {
        "image": path.name,
        "engine": f"tesseract ({lang})",
        "text": "\n".join(lines),
        "words": words,
        "mean_word_confidence": round(sum(word["confidence"] for word in words) / len(words), 4) if words else 0.0,
    }


def run_directory(images_dir: Path, output_dir: Path, lang: str = "eng") -> list[Path]:
    """OCR every image in `images_dir` into `output_dir`/<image>.ocr.json drafts."""
    output_dir.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []
    for path in sorted(images_dir.rglob("*")):
        if path.suffix.lower() not in IMAGE_EXTENSIONS:
            continue
        result = ocr_image(path, lang=lang)
        target = output_dir / f"{path.stem}.ocr.json"
        target.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        written.append(target)
    return written


def draft_annotation(ocr_json_path: Path, product_id: str) -> dict:
    """Create an EMPTY annotation skeleton from an OCR draft for human editing."""
    draft = json.loads(ocr_json_path.read_text(encoding="utf-8"))
    return {
        "id": f"ann-{draft['image']}",
        "product_id": product_id,
        "text": draft["text"],
        "source_image": draft["image"],
        "reviewed": False,
        "entities": [],
    }
