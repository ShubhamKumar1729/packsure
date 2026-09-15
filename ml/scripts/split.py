"""Product-level train/validation/test splitting (Phase 18).

Near-duplicate photos of the SAME product must never leak across splits, so the
split key is `product_id` (falling back to sample id when absent). Splitting is
deterministic for a given seed.
"""

from __future__ import annotations

import hashlib
import random
from collections import defaultdict


def split_samples(samples: list[dict], train_ratio: float = 0.8, validation_ratio: float = 0.1, seed: int = 42) -> dict[str, list[dict]]:
    """Group by product, shuffle product groups, assign whole groups to splits."""
    groups: dict[str, list[dict]] = defaultdict(list)
    for sample in samples:
        groups[str(sample.get("product_id") or sample.get("id"))].append(sample)

    product_ids = sorted(groups.keys())
    rng = random.Random(seed)
    rng.shuffle(product_ids)

    train: list[dict] = []
    validation: list[dict] = []
    test: list[dict] = []
    total = len(product_ids)
    train_cutoff = int(total * train_ratio)
    validation_cutoff = train_cutoff + int(total * validation_ratio)

    for index, product_id in enumerate(product_ids):
        bucket = train if index < train_cutoff else validation if index < validation_cutoff else test
        bucket.extend(groups[product_id])

    assert not ({id(s) for s in train} & {id(s) for s in test}), "leak detected"
    return {"train": train, "validation": validation, "test": test}


def stable_hash_split(product_id: str, train_ratio: float = 0.8, validation_ratio: float = 0.1) -> str:
    """Deterministic per-product split (no global state; resumable pipelines)."""
    digest = int(hashlib.sha256(product_id.encode("utf-8")).hexdigest(), 16) % 10_000
    if digest < train_ratio * 10_000:
        return "train"
    if digest < (train_ratio + validation_ratio) * 10_000:
        return "validation"
    return "test"


def check_no_leakage(splits: dict[str, list[dict]]) -> list[str]:
    """Return any product ids that appear in more than one split (must be [])."""
    seen: dict[str, str] = {}
    leaks: list[str] = []
    for split_name, samples in splits.items():
        for sample in samples:
            key = str(sample.get("product_id") or sample.get("id"))
            if key in seen and seen[key] != split_name:
                leaks.append(f"product {key} in both {seen[key]} and {split_name}")
            seen[key] = split_name
    return leaks
