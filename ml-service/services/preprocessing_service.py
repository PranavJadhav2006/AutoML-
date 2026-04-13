"""
preprocessing_service.py  —  SMART ADAPTIVE PREPROCESSING
-----------------------------------------------------------

Design principles
=================
* Analyze the dataset FIRST, then decide what to apply.
* NEVER blindly scale / encode / remove outliers.
* Run all transformations exactly ONCE.
* Return a rich report so the caller knows what happened.

Public API
==========
    from services.preprocessing_service import Preprocessor

    preprocessor = Preprocessor()
    X, y, feature_names, report = preprocessor.process(df, target_col, feature_cols)

    # Or let the service auto-detect the target:
    X, y, feature_names, report = preprocessor.smart_process(df)
"""

import logging
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
from sklearn.preprocessing import LabelEncoder, StandardScaler

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────
# STEP 1 — Dataset analysis
# ─────────────────────────────────────────────────────────────

def analyze_dataset(df: pd.DataFrame) -> Dict[str, Any]:
    """
    Non-destructive scan of *df*.  Returns a property dict that drives
    all downstream conditional decisions.

    Returns
    -------
    {
        "has_missing"  : bool,   # any NaN present?
        "num_cols"     : int,    # count of numeric columns
        "cat_cols"     : int,    # count of object/category columns
        "is_scaled"    : bool,   # values already in ~[-5, 5] range?
        "size"         : int,    # number of rows
    }
    """
    num_df = df.select_dtypes(include=["number"])

    has_missing: bool = bool(df.isnull().sum().sum() > 0)
    num_cols: int     = int(num_df.shape[1])
    cat_cols: int     = int(df.select_dtypes(include=["object", "category"]).shape[1])
    size: int         = int(len(df))

    # is_scaled: all numeric values comfortably within [-5, 5]
    if num_cols > 0 and not num_df.empty:
        col_max = float(num_df.max().max())
        col_min = float(num_df.min().min())
        is_scaled: bool = (col_max < 5.0) and (col_min > -5.0)
    else:
        is_scaled = False

    analysis = {
        "has_missing": has_missing,
        "num_cols":    num_cols,
        "cat_cols":    cat_cols,
        "is_scaled":   is_scaled,
        "size":        size,
    }
    logger.info(f"[analyze_dataset] {analysis}")
    return analysis


# ─────────────────────────────────────────────────────────────
# STEP 2 — Target column detection
# ─────────────────────────────────────────────────────────────

_TARGET_PRIORITY = [
    "target", "label", "price", "output",
    "class", "survived", "diagnosis", "salary",
    "quality", "y",
]

def detect_target(df: pd.DataFrame) -> str:
    """
    Return the most likely target column name from *df*.

    Priority order:
      1. Column whose lowercased name matches a known target keyword.
      2. Last column in the DataFrame.
    """
    lower_map = {col.lower(): col for col in df.columns}
    for candidate in _TARGET_PRIORITY:
        if candidate in lower_map:
            chosen = lower_map[candidate]
            logger.info(f"[detect_target] Found by keyword → '{chosen}'")
            return chosen
    # Fallback: last column
    chosen = df.columns[-1]
    logger.info(f"[detect_target] Fallback (last col) → '{chosen}'")
    return chosen


# ─────────────────────────────────────────────────────────────
# STEP 3 — Conditional missing-value handling
# ─────────────────────────────────────────────────────────────

def _handle_missing(df: pd.DataFrame) -> Tuple[pd.DataFrame, int]:
    """
    Fill missing values IN-PLACE on a copy.
    * Numeric  → column median
    * Categoric → column mode (first value)

    Returns (filled_df, n_values_filled).
    """
    df = df.copy()
    n_filled = 0

    for col in df.columns:
        missing_count = int(df[col].isnull().sum())
        if missing_count == 0:
            continue

        if pd.api.types.is_numeric_dtype(df[col]):
            fill_val = df[col].median()
        else:
            mode = df[col].mode()
            fill_val = mode.iloc[0] if not mode.empty else "unknown"

        df[col] = df[col].fillna(fill_val)
        n_filled += missing_count
        logger.debug(f"  Filled {missing_count} NaN in '{col}' with {fill_val!r}")

    logger.info(f"[_handle_missing] Filled {n_filled} total missing values.")
    return df, n_filled


# ─────────────────────────────────────────────────────────────
# STEP 4 — Conditional categorical encoding
# ─────────────────────────────────────────────────────────────

def _encode_categoricals(df: pd.DataFrame) -> Tuple[pd.DataFrame, int]:
    """
    One-hot-encode all object/category columns using pd.get_dummies.
    drop_first=True removes the redundant reference level.

    Returns (encoded_df, n_encoded_cols).
    """
    cat_cols = df.select_dtypes(include=["object", "category"]).columns.tolist()
    if not cat_cols:
        return df, 0

    df = pd.get_dummies(df, columns=cat_cols, drop_first=True)
    logger.info(f"[_encode_categoricals] Encoded {len(cat_cols)} column(s): {cat_cols}")
    return df, len(cat_cols)


# ─────────────────────────────────────────────────────────────
# STEP 5 — Conditional outlier removal  (IQR, only if size > 1000)
# ─────────────────────────────────────────────────────────────

def _remove_outliers_iqr(
    X_df: pd.DataFrame,
    y_series: pd.Series,
) -> Tuple[pd.DataFrame, pd.Series, int]:
    """
    Remove rows where ANY numeric feature falls outside [Q1–1.5·IQR, Q3+1.5·IQR].
    Applied ONLY when dataset has > 1000 rows (see caller).

    Returns (X_df_clean, y_series_clean, n_removed).
    """
    num_cols = X_df.select_dtypes(include=["number"]).columns
    mask = pd.Series(True, index=X_df.index)

    for col in num_cols:
        q1 = X_df[col].quantile(0.25)
        q3 = X_df[col].quantile(0.75)
        iqr = q3 - q1
        lower = q1 - 1.5 * iqr
        upper = q3 + 1.5 * iqr
        mask &= X_df[col].between(lower, upper)

    n_removed = int((~mask).sum())
    X_df_clean  = X_df[mask].reset_index(drop=True)
    y_clean     = y_series[mask].reset_index(drop=True)
    logger.info(f"[_remove_outliers_iqr] Removed {n_removed} outlier rows.")
    return X_df_clean, y_clean, n_removed


# ─────────────────────────────────────────────────────────────
# STEP 6 — Conditional feature scaling
# ─────────────────────────────────────────────────────────────

def _scale_features(X: np.ndarray) -> np.ndarray:
    """StandardScaler — called only when data is NOT already scaled."""
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)
    logger.info("[_scale_features] StandardScaler applied.")
    return X_scaled


# ─────────────────────────────────────────────────────────────
# STEP 7 — Main smart_preprocess function
# ─────────────────────────────────────────────────────────────

def smart_preprocess(
    df: pd.DataFrame,
    target_col: Optional[str] = None,
    feature_cols: Optional[List[str]] = None,
) -> Tuple[np.ndarray, np.ndarray, List[str], Dict[str, Any]]:
    """
    Full smart adaptive preprocessing pipeline.

    Parameters
    ----------
    df           : raw DataFrame
    target_col   : column to predict (auto-detected if None)
    feature_cols : features to use   (all non-target cols if None)

    Returns
    -------
    X                : float64 ndarray  (n_samples, n_features)
    y                : float64 ndarray  (n_samples,)
    feature_names    : list[str]
    preprocessing_report : dict  (see STEP 8)
    """

    # ── sanity ────────────────────────────────────────────────
    if len(df) < 10:
        raise ValueError(f"Dataset too small: {len(df)} rows (need ≥ 10).")

    # ── STEP 1: Analyze ───────────────────────────────────────
    analysis = analyze_dataset(df)

    # ── STEP 2: Detect target ─────────────────────────────────
    if target_col is None or target_col not in df.columns:
        target_col = detect_target(df)

    if feature_cols is None:
        feature_cols = [c for c in df.columns if c != target_col]

    # Work on a copy; keep only relevant columns
    work_df = df[feature_cols + [target_col]].copy()

    # Drop rows where target is missing
    n_before_target_drop = len(work_df)
    work_df = work_df[work_df[target_col].notna()].reset_index(drop=True)
    n_dropped_target = n_before_target_drop - len(work_df)

    # ── STEP 3: Missing values (conditional) ──────────────────
    missing_handled = False
    n_filled = 0
    if analysis["has_missing"]:
        work_df, n_filled = _handle_missing(work_df)
        missing_handled = True

    # ── STEP 4: Categorical encoding (conditional) ─────────────
    n_encoded = 0
    if analysis["cat_cols"] > 0:
        work_df, n_encoded = _encode_categoricals(work_df)
        # After get_dummies the target col name is preserved (it's numeric/label)

    # ── STEP 5: Separate X / y ────────────────────────────────
    # target_col must still be in work_df (get_dummies preserves numeric cols)
    y_series = work_df[target_col].copy()
    X_df = work_df.drop(columns=[target_col])
    final_feature_names = list(X_df.columns)

    # Encode target if categorical
    target_encoded = False
    if y_series.dtype == object or str(y_series.dtype) in ("string", "category"):
        le = LabelEncoder()
        y = le.fit_transform(y_series.astype(str)).astype(np.float64)
        target_encoded = True
    else:
        y = y_series.values.astype(np.float64)

    # Cast feature matrix to float, coerce non-numeric to NaN then fill 0
    X_df = X_df.apply(pd.to_numeric, errors="coerce").fillna(0.0)

    # ── STEP 6: Outlier removal (only when size > 1000) ───────
    n_outliers_removed = 0
    if analysis["size"] > 1000:
        y_series_tmp = pd.Series(y, name=target_col)
        X_df, y_series_tmp, n_outliers_removed = _remove_outliers_iqr(X_df, y_series_tmp)
        y = y_series_tmp.values

    # ── STEP 7: Feature scaling (conditional) ─────────────────
    scaling_applied = False
    X_raw = X_df.values.astype(np.float64)
    if not analysis["is_scaled"]:
        X = _scale_features(X_raw)
        scaling_applied = True
    else:
        X = X_raw
        logger.info("[smart_preprocess] Scaling SKIPPED — data already in [-5, 5] range.")

    # ── STEP 8: Build preprocessing report ────────────────────
    report: Dict[str, Any] = {
        "target_column":        target_col,
        "missing_handled":      missing_handled,
        "values_filled":        n_filled,
        "categorical_encoded":  n_encoded,
        "scaling_applied":      scaling_applied,
        "outliers_removed":     n_outliers_removed,
        "target_encoded":       target_encoded,
        "dropped_target_rows":  n_dropped_target,
        "dataset_analysis":     analysis,
        # legacy keys (keep for backward-compat with frontend)
        "original_rows":        analysis["size"],
        "original_cols":        len(feature_cols) + 1,
        "final_rows":           int(X.shape[0]),
        "final_cols":           int(X.shape[1]),
        "encoded_cols":         [],          # filled if old style used
        "imputed_cols":         [],
        "scaler":               "StandardScaler" if scaling_applied else "none",
    }

    logger.info(
        f"[smart_preprocess] Done — "
        f"{report['final_rows']} rows × {report['final_cols']} features | "
        f"missing={missing_handled} | encoded={n_encoded} | "
        f"outliers_removed={n_outliers_removed} | scaled={scaling_applied}"
    )

    return X, y, final_feature_names, report


# ─────────────────────────────────────────────────────────────
# Public class wrapper (keeps existing trainer.py call-site happy)
# ─────────────────────────────────────────────────────────────

class Preprocessor:
    """
    Thin wrapper around smart_preprocess() for backward compatibility
    with trainer.py.

    Usage (original signature preserved):
        preprocessor = Preprocessor()
        X, y, feature_names, report = preprocessor.process(df, target_col, feature_cols)
    """

    def process(
        self,
        df: pd.DataFrame,
        target_col: str,
        feature_cols: List[str],
    ) -> Tuple[np.ndarray, np.ndarray, List[str], Dict[str, Any]]:
        """Drop-in replacement for the old Preprocessor.process()."""
        return smart_preprocess(df, target_col=target_col, feature_cols=feature_cols)

    def smart_process(
        self,
        df: pd.DataFrame,
    ) -> Tuple[np.ndarray, np.ndarray, List[str], Dict[str, Any]]:
        """Auto-detect target and preprocess."""
        return smart_preprocess(df)
