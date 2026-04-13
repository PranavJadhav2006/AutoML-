"""
mode_selector.py
----------------
Decides which training pipeline (ML or DL) to use based on:
  1. Explicit user mode preference ("ml", "dl", "auto")
  2. Dataset characteristics (size, task type)

Decision Rules (Auto Mode):
  - data_type == "image"             → DL  (CNN required)
  - data_type == "text"              → DL  (NLP required)
  - tabular AND n_rows < 10,000      → ML  (fast, usually better)
  - tabular AND n_rows >= 10,000     → ML  (preferred, DL optional)

Safety:
  - DL on < 1,000 rows triggers a warning
  - Always returns a human-readable reason string
"""

import logging
from typing import Dict, Any, Tuple

logger = logging.getLogger(__name__)


def select_mode(mode: str, dataset_info: Dict[str, Any]) -> str:
    """
    Returns 'ml' or 'dl'.

    Parameters
    ----------
    mode         : 'auto' | 'ml' | 'dl'  (user choice)
    dataset_info : {'n_rows': int, 'task': str}
                   task can be 'classification', 'regression',
                   'image_classification', 'text_classification', etc.
    """
    selected, _ = _decide(mode, dataset_info)
    return selected


def select_mode_with_reason(mode: str, dataset_info: Dict[str, Any]) -> Tuple[str, str]:
    """
    Returns (selected_mode, reason_string).
    Use this when you need the human-readable reason for the UI.
    """
    return _decide(mode, dataset_info)


# ─────────────────────────────────────────────────────────────────────────────
# Internal decision engine
# ─────────────────────────────────────────────────────────────────────────────

def _decide(mode: str, dataset_info: Dict[str, Any]) -> Tuple[str, str]:
    n_rows = dataset_info.get("n_rows", 0)
    task   = dataset_info.get("task", "regression")

    # Derive data type from task string
    is_image  = "image" in task.lower()
    is_text   = "text"  in task.lower() or "nlp" in task.lower()
    is_tabular = not is_image and not is_text

    # ── Explicit user overrides ──────────────────────────────────────────────
    if mode == "ml":
        reason = "ML mode explicitly selected by user."
        logger.info(f"Mode decision: ml (explicit) | {reason}")
        return "ml", reason

    if mode == "dl":
        reason = "DL mode explicitly selected by user."
        if n_rows < 1_000:
            reason += " ⚠️ Warning: dataset is very small (<1,000 rows); ML may outperform DL here."
        logger.info(f"Mode decision: dl (explicit) | {reason}")
        return "dl", reason

    # ── Auto mode ───────────────────────────────────────────────────────────
    # Image data → CNN / DL required
    if is_image:
        reason = "Image dataset detected — CNN / deep learning pipeline required."
        logger.info(f"Mode decision: dl (auto-image) | {reason}")
        return "dl", reason

    # Text / NLP data → DL preferred
    if is_text:
        reason = "Text/NLP dataset detected — deep learning pipeline preferred."
        logger.info(f"Mode decision: dl (auto-text) | {reason}")
        return "dl", reason

    # Tabular data — size-based heuristic
    if is_tabular:
        if n_rows < 10_000:
            reason = (
                f"Tabular dataset with {n_rows:,} rows (< 10,000) — "
                "ML is faster and typically more accurate on small tabular data."
            )
            logger.info(f"Mode decision: ml (auto-small-tabular) | {reason}")
            return "ml", reason
        else:
            reason = (
                f"Tabular dataset with {n_rows:,} rows (≥ 10,000) — "
                "ML preferred for speed and interpretability on tabular data."
            )
            logger.info(f"Mode decision: ml (auto-large-tabular) | {reason}")
            return "ml", reason

    # Fallback
    reason = "Unknown data type — defaulting to ML for safety."
    logger.info(f"Mode decision: ml (fallback) | {reason}")
    return "ml", reason
