"""CV observation tests (Phase 13) — honesty guarantees."""

from app.cv_metrics import (
    SCALE_UNAVAILABLE_NOTE,
    collect_observations,
    estimate_char_height_px,
    estimate_scale,
)


def test_char_height_px_median():
    words = [
        {"bbox_px": (0, 0, 10, 20)},
        {"bbox_px": (5, 5, 10, 22)},
        {"bbox_px": (9, 9, 10, 60)},  # outlier should not dominate the median
    ]
    assert estimate_char_height_px(words) == 22.0


def test_char_height_empty():
    assert estimate_char_height_px([]) is None


def test_scale_is_none_without_barcode():
    px_per_mm, source, note = estimate_scale([], image=None)
    assert px_per_mm is None and source is None
    assert note == SCALE_UNAVAILABLE_NOTE


def test_collect_never_fabricates_tampering():
    observations = collect_observations(image=None, words=[])
    assert observations["tampering_probability"] is None
    assert observations["sticker_overlay_anomaly"] is None
