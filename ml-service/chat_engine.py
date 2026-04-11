"""
chat_engine.py
--------------
Natural-language Q&A about the dataset using rule-based pandas operations.

Supports questions like:
  - "What are the feature names?"
  - "How many rows are there?"
  - "What is the class distribution?"
  - "Which columns have missing values?"
  - "What is the correlation between X and Y?"
  - "Show me statistics / describe the data"
  - "What is the mean / max / min of <column>?"
"""

import os
import re
import logging
from typing import Dict, Any

import numpy as np
import pandas as pd
import joblib

MODELS_DIR = "models"
logger = logging.getLogger(__name__)


def _load_artifact(model_id: str) -> Dict:
    path = os.path.join(MODELS_DIR, f"{model_id}.joblib")
    if not os.path.exists(path):
        raise FileNotFoundError(f"Model '{model_id}' not found.")
    return joblib.load(path)


def _df_from_artifact(artifact: Dict) -> pd.DataFrame:
    return pd.DataFrame(artifact["df_sample"])


def chat_with_dataset(model_id: str, question: str) -> Dict[str, Any]:
    """
    Rule-based NL → pandas query engine.

    Returns
    -------
    dict with keys: answer (str), data (optional table), chart_hint
    """
    artifact = _load_artifact(model_id)
    df = _df_from_artifact(artifact)
    feature_names = artifact["feature_names"]
    task = artifact["task"]
    dataset_name = artifact.get("dataset_name", "Dataset")

    q = question.lower().strip()

    # ── Basic info ──────────────────────────────────────────────────────────
    if any(kw in q for kw in ["how many rows", "row count", "number of rows", "size"]):
        return _reply(
            f"The dataset **{dataset_name}** has **{len(df):,} rows** and "
            f"**{len(df.columns)} columns** (showing first 500 rows in memory).",
            chart_hint=None,
        )

    if any(kw in q for kw in ["feature", "column", "fields", "variables", "attributes"]):
        names = ", ".join(f"`{f}`" for f in feature_names)
        return _reply(
            f"The dataset has **{len(feature_names)} features**: {names}. "
            f"Target column: `target`.",
            table={"features": feature_names},
            chart_hint=None,
        )

    # ── Describe / statistics ────────────────────────────────────────────────
    if any(kw in q for kw in ["describe", "statistics", "summary", "overview", "stats"]):
        desc = df[feature_names].describe().round(4)
        return _reply(
            f"Here is a statistical summary of **{dataset_name}**:",
            table=desc.to_dict(),
            chart_hint="table",
        )

    # ── Missing values ───────────────────────────────────────────────────────
    if any(kw in q for kw in ["missing", "null", "nan", "empty"]):
        nulls = df.isnull().sum()
        missing = nulls[nulls > 0]
        if missing.empty:
            return _reply("✅ Great news! There are **no missing values** in this dataset.")
        table = missing.to_dict()
        return _reply(
            f"Found missing values in **{len(missing)} column(s)**:",
            table=table,
            chart_hint="bar",
        )

    # ── Class / target distribution ──────────────────────────────────────────
    if any(kw in q for kw in ["class distribution", "target distribution", "label distribution",
                               "class balance", "how many class", "categories"]):
        if "target" in df.columns:
            dist = df["target"].value_counts().to_dict()
            total = sum(dist.values())
            pct = {str(k): f"{v} ({100*v/total:.1f}%)" for k, v in dist.items()}
            return _reply(
                f"Target class distribution for **{dataset_name}**:",
                table=pct,
                chart_hint="pie",
            )
        return _reply("No target column found in this dataset sample.")

    # ── Correlation ──────────────────────────────────────────────────────────
    if "correlation" in q or "corr" in q:
        # Check if asking about specific columns
        mentioned_cols = [c for c in feature_names if c.lower() in q]
        if len(mentioned_cols) >= 2:
            cols = mentioned_cols[:2]
            corr_val = df[cols].corr().iloc[0, 1]
            return _reply(
                f"The correlation between `{cols[0]}` and `{cols[1]}` is "
                f"**{corr_val:.4f}** "
                f"({'strong' if abs(corr_val) > 0.7 else 'moderate' if abs(corr_val) > 0.4 else 'weak'} "
                f"{'positive' if corr_val > 0 else 'negative'} correlation).",
                chart_hint="scatter",
            )
        # Full correlation matrix
        corr = df[feature_names].corr().round(4)
        return _reply(
            "Full correlation matrix:",
            table=corr.to_dict(),
            chart_hint="heatmap",
        )

    # ── Mean / max / min / std of a specific column ─────────────────────────
    stat_ops = {
        "mean": "mean", "average": "mean",
        "max": "max", "maximum": "max",
        "min": "min", "minimum": "min",
        "std": "std", "standard deviation": "std",
        "median": "median",
    }
    for keyword, op in stat_ops.items():
        if keyword in q:
            col = _find_column(q, feature_names)
            if col:
                val = getattr(df[col], op)()
                return _reply(
                    f"The **{op}** of `{col}` is **{val:.4f}**.",
                    chart_hint=None,
                )

    # ── Top / most common values ─────────────────────────────────────────────
    if any(kw in q for kw in ["top", "most common", "frequent", "value count"]):
        col = _find_column(q, feature_names + (["target"] if "target" in df.columns else []))
        if col:
            vc = df[col].value_counts().head(10).to_dict()
            return _reply(f"Top values in `{col}`:", table=vc, chart_hint="bar")

    # ── Dataset name / task type ─────────────────────────────────────────────
    if any(kw in q for kw in ["what is this dataset", "what dataset", "name", "task"]):
        return _reply(
            f"You are working with the **{dataset_name}** dataset. "
            f"Task type: **{task}**. "
            f"Features: {len(feature_names)}. Rows in memory: {len(df):,}."
        )

    # ── Fallback ─────────────────────────────────────────────────────────────
    return _reply(
        f"I can answer questions about **{dataset_name}** such as:\n"
        "- Row/column count\n"
        "- Feature names\n"
        "- Class/target distribution\n"
        "- Missing values\n"
        "- Statistical summary (mean, max, min, std)\n"
        "- Correlation between features\n\n"
        "Try: *\"What is the class distribution?\"* or *\"Describe the data\"*"
    )


# ── Helpers ──────────────────────────────────────────────────────────────────

def _reply(answer: str, table: Dict = None, chart_hint: str = None) -> Dict[str, Any]:
    return {"answer": answer, "data": table, "chart_hint": chart_hint}


def _find_column(question: str, columns) -> "str | None":
    """Find the first column name mentioned in the question (case-insensitive)."""
    q_lower = question.lower()
    for col in columns:
        if col.lower() in q_lower:
            return col
    return None
