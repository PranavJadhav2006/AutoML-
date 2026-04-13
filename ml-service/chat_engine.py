"""
chat_engine.py
--------------
Natural-language Q&A and Action Engine for AutoML Studio dataset.

Supports:
- Questions: distribution, stats, missing values, correlation.
- Actions: remove missing values, clean dataset, scale features, etc.
- Undo: revert the last applied action.
"""

import os
import logging
from typing import Dict, Any, Tuple

import numpy as np
import pandas as pd
import joblib

from services.preprocessing_service import (
    _handle_missing,
    _encode_categoricals,
    _scale_features,
    _remove_outliers_iqr,
    smart_preprocess,
    detect_target
)

MODELS_DIR = "models"
logger = logging.getLogger(__name__)


def _load_artifact(model_id: str) -> Dict:
    path = os.path.join(MODELS_DIR, f"{model_id}.joblib")
    if not os.path.exists(path):
        raise FileNotFoundError(f"Model '{model_id}' not found.")
    return joblib.load(path)


def _save_artifact(model_id: str, artifact: Dict):
    path = os.path.join(MODELS_DIR, f"{model_id}.joblib")
    joblib.dump(artifact, path)


def _df_from_artifact(artifact: Dict) -> pd.DataFrame:
    # Use standard pandas DataFrame from dict if it's stored as dict-oriented list
    data = artifact["df_sample"]
    if isinstance(data, dict):
        return pd.DataFrame(data)
    elif isinstance(data, pd.DataFrame):
        return data
    return pd.DataFrame(data)


# ────────────────────────────────────────────────────────────────────────────
# Intent & Action Mapping
# ────────────────────────────────────────────────────────────────────────────

def detect_intent(query: str) -> Tuple[str, str]:
    """
    Analyzes the user's query and returns (intent, action_type).
    Intent can be "question", "action", or "undo".
    action_type holds a string mapping for the specific action to perform.
    """
    q = query.lower().strip()

    # Undo
    if any(kw in q for kw in ["undo", "revert"]):
        return "undo", "undo"

    # Actions mapping
    action_keywords = {
        "remove missing": ["remove missing", "fill missing", "impute missing", "handle missing"],
        "encode data": ["label encode", "one hot encode", "encode categorical", "encode features"],
        "scale data": ["normalize data", "scale features", "standardize data", "scale data"],
        "remove outliers": ["remove outliers", "drop outliers"],
        "clean dataset": ["clean dataset", "preprocess dataset", "smart preprocess"],
    }

    for action_type, keywords in action_keywords.items():
        if any(kw in q for kw in keywords):
            # Exception: "show missing values" should remain a question
            if "show " in q or "what " in q or "how " in q or "describe " in q:
                continue
            return "action", action_type

    # Default to question
    return "question", ""


def execute_action(action_type: str, df: pd.DataFrame) -> Tuple[pd.DataFrame, Dict[str, Any], str]:
    """
    Safely applies a predefined data transformation action string onto df.
    Returns (updated_df, changes_dict, message)
    """
    original_rows = len(df)
    original_cols = len(df.columns)
    message = ""
    changes = {}

    if original_rows < 10:
        raise ValueError("Dataset is too small to apply further transformations safely.")

    if action_type == "remove missing":
        updated_df, n_filled = _handle_missing(df)
        message = f"Filled {n_filled} missing values in the dataset using modes and medians."
        changes = {"rows_affected": n_filled, "columns_modified": len(df.columns)}

    elif action_type == "encode data":
        updated_df, n_encoded = _encode_categoricals(df)
        message = f"Encoded {n_encoded} categorical columns into numeric formats."
        changes = {"rows_affected": len(updated_df), "columns_modified": n_encoded}

    elif action_type == "scale data":
        # Create a copy so we can replace purely numeric data without losing targets
        updated_df = df.copy()
        numeric_cols = updated_df.select_dtypes(include=["number"]).columns
        if len(numeric_cols) > 0:
            X_scaled = _scale_features(updated_df[numeric_cols].values.astype(np.float64))
            updated_df[numeric_cols] = X_scaled
            message = f"Applied standard scaling to {len(numeric_cols)} numeric features."
            changes = {"rows_affected": len(updated_df), "columns_modified": len(numeric_cols)}
        else:
            message = "No numeric columns found to scale."
            changes = {"rows_affected": 0, "columns_modified": 0}

    elif action_type == "remove outliers":
        # Outliers needs a target, try to detect it or just process all features
        target_col = detect_target(df)
        if target_col in df.columns:
            y_series = df[target_col]
            X_df = df.drop(columns=[target_col])
        else:
            y_series = pd.Series([0] * len(df), name="dummy")
            X_df = df

        X_clean, y_clean, n_removed = _remove_outliers_iqr(X_df, y_series)
        
        if target_col in df.columns:
            X_clean[target_col] = y_clean
        updated_df = X_clean
        
        message = f"Removed {n_removed} outlier rows using the IQR method."
        changes = {"rows_affected": n_removed, "columns_modified": len(updated_df.columns)}

    elif action_type == "clean dataset":
        X, y, feature_names, report = smart_preprocess(df)
        
        # Reconstruct DataFrame from X and y
        updated_df = pd.DataFrame(X, columns=feature_names)
        target_col = report.get("target_column")
        if target_col:
            updated_df[target_col] = y
            
        message = "Applied full smart adaptive preprocessing on the dataset."
        changes = {"rows_affected": report.get("outliers_removed", 0) + report.get("values_filled", 0), 
                   "columns_modified": len(updated_df.columns)}
    else:
        raise ValueError(f"Unknown action: {action_type}")

    return updated_df, changes, message


# ────────────────────────────────────────────────────────────────────────────
# Chat & Q&A
# ────────────────────────────────────────────────────────────────────────────

def chat_with_dataset(model_id: str, question: str) -> Dict[str, Any]:
    """
    Main entry point for Chat Engine.
    Handles understanding intents (questions vs actions vs undo) and dispatching suitably.
    """
    try:
        artifact = _load_artifact(model_id)
        df = _df_from_artifact(artifact)
        
        intent, action_type = detect_intent(question)
        
        # ── Undo Intent ────────────────────────────────────────────────────────
        if intent == "undo":
            if "df_sample_prev" not in artifact:
                return {
                    "type": "error",
                    "answer": "No previous dataset state available to undo.",
                    "data": None
                }
            
            # Revert state
            df_prev = artifact["df_sample_prev"]
            artifact["df_sample"] = df_prev
            del artifact["df_sample_prev"]
            
            # Recalculate feature names just in case columns changed
            new_df = _df_from_artifact(artifact)
            artifact["feature_names"] = list(new_df.columns)
            
            _save_artifact(model_id, artifact)
            
            return {
                "type": "action",
                "answer": "Undo successful. Reverted to previous dataset state.",
                "changes": {"rows_affected": len(new_df), "columns_modified": len(new_df.columns)},
                "preview": new_df.head().to_dict(orient="records"),
                "data": None,
                "chart_hint": None
            }

        # ── Action Intent ────────────────────────────────────────────────────
        elif intent == "action":
            try:
                updated_df, changes, message = execute_action(action_type, df)
                
                # Maintain data versioning for undo layer
                artifact["df_sample_prev"] = artifact["df_sample"]
                
                # It is critical we convert the DataFrame back to a structure the UI handles (dict mapping)
                artifact["df_sample"] = updated_df.to_dict(orient="list")
                
                # Ensure feature_names matches available columns 
                # (except target if present, but for preview consistency we store all)
                artifact["feature_names"] = list(updated_df.columns)
                
                _save_artifact(model_id, artifact)
                
                logger.info(f"Action '{action_type}' applied. Changes: {changes}")
                
                return {
                    "type": "action",
                    "answer": message,
                    "changes": changes,
                    "preview": updated_df.head().to_dict(orient="records"),
                    "data": None,
                    "chart_hint": None
                }
            except Exception as e:
                logger.error(f"Action execution failed: {e}")
                return {
                    "type": "error",
                    "answer": f"Action failed: {str(e)}",
                    "data": None
                }
                
        # ── Question Intent ───────────────────────────────────────────────────
        else:
            return _handle_question(df, artifact, question)
            
    except Exception as e:
        logger.error(f"Chat error: {e}")
        return {
            "type": "error", 
            "answer": "An internal error occurred responding to your request.", 
            "data": None
        }


def _handle_question(df: pd.DataFrame, artifact: Dict, question: str) -> Dict[str, Any]:
    """Pure Q&A module without mutating dataset structure."""
    feature_names = artifact["feature_names"]
    task = artifact["task"]
    dataset_name = artifact.get("dataset_name", "Dataset")

    q = question.lower().strip()

    # Describe / statistics
    if any(kw in q for kw in ["describe", "statistics", "summary", "overview", "stats"]):
        num_cols = df.select_dtypes(include=["number"]).columns
        if not num_cols.empty:
            desc = df[num_cols].describe().round(4)
            return _reply(
                f"Here is a statistical summary of **{dataset_name}**:",
                table=desc.to_dict(),
                chart_hint="table",
            )
        return _reply("No numerical columns found to summarize.")

    # Missing values
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

    # Class / target distribution
    if any(kw in q for kw in ["class distribution", "target distribution", "label distribution",
                              "class balance", "how many class", "categories"]):
        target_col = detect_target(df)
        if target_col in df.columns:
            dist = df[target_col].value_counts().to_dict()
            total = sum(dist.values())
            pct = {str(k): f"{v} ({100*v/total:.1f}%)" for k, v in dist.items()}
            return _reply(
                f"Target class distribution for **{dataset_name}**:",
                table=pct,
                chart_hint="pie",
            )
        return _reply("No clear target column found in this dataset sample.")

    # Correlation
    if "correlation" in q or "corr" in q:
        num_cols = df.select_dtypes(include=["number"]).columns
        if len(num_cols) < 2:
            return _reply("Require at least two numeric columns to compute correlations.")
            
        mentioned_cols = [c for c in num_cols if c.lower() in q]
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
            
        corr = df[num_cols].corr().round(4)
        return _reply(
            "Full feature correlation matrix:",
            table=corr.to_dict(),
            chart_hint="heatmap",
        )

    # Mean / max / min / std of specific column
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
            if col and pd.api.types.is_numeric_dtype(df[col]):
                val = getattr(df[col], op)()
                return _reply(
                    f"The **{op}** of `{col}` is **{val:.4f}**.",
                    chart_hint=None,
                )

    # Top / most common values
    if any(kw in q for kw in ["top", "most common", "frequent", "value count"]):
        col = _find_column(q, feature_names)
        if col:
            vc = df[col].value_counts().head(10).to_dict()
            return _reply(f"Top values in `{col}`:", table=vc, chart_hint="bar")

    # Basic info
    if any(kw in q for kw in ["how many rows", "row count", "number of rows", "size"]):
        return _reply(
            f"The dataset **{dataset_name}** currently has **{len(df):,} rows** and "
            f"**{len(df.columns)} columns** (showing sample rows in memory).",
            chart_hint=None,
        )

    if any(kw in q for kw in ["feature", "column", "fields", "variables", "attributes"]):
        names = ", ".join(f"`{f}`" for f in df.columns)
        return _reply(
            f"The dataset currently has **{len(df.columns)} features**: {names}.",
            table={"features": list(df.columns)},
            chart_hint=None,
        )

    # Dataset name / task type
    if any(kw in q for kw in ["what is this dataset", "what dataset", "name", "task"]):
        return _reply(
            f"You are working with the **{dataset_name}** dataset. "
            f"Task type: **{task}**. "
            f"Features: {len(df.columns)}. Rows in local memory map: {len(df):,}."
        )

    # Fallback
    return _reply(
        f"I can answer questions or apply actions to **{dataset_name}**!\n\n"
        "**Questions:**\n"
        "- Row/column count\n"
        "- Missing values\n"
        "- Statistical summary\n\n"
        "**Actions:**\n"
        "- Remove missing values\n"
        "- Scale data\n"
        "- Remove outliers\n"
        "- Clean dataset (Smart Adaptive Preprocess)\n"
        "- *Undo* (reverts the last action)"
    )


# ── Helpers ──────────────────────────────────────────────────────────────────

def _reply(answer: str, table: Dict = None, chart_hint: str = None) -> Dict[str, Any]:
    return {"type": "question", "answer": answer, "data": table, "chart_hint": chart_hint}


def _find_column(question: str, columns) -> "str | None":
    """Find the first column name mentioned in the question (case-insensitive)."""
    q_lower = question.lower()
    for col in columns:
        if col.lower() in q_lower:
            return col
    return None
