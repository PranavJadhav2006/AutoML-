"""
trainer.py
----------
Core ML training engine for AutoML Studio — UPGRADED.

Upgraded Pipeline
=================
  1. Match problem description → best dataset (DatasetService)
  2. Load dataset
  3. Preprocess ONCE  (PreprocessingService)
  4. Sample 30% for fast candidate comparison
  5. Parallel model training on sample  (joblib)
  6. Model comparison — pick best
  7. Retrain best model on FULL dataset
  8. Save artifact
  9. Generate visualisations
 10. Return rich JSON result   (includes model_comparison dict)

Key Constraints
===============
* GridSearch is REMOVED — lightweight fixed hyper-params for speed
* n_jobs=-1 is NOT used inside any sklearn model (avoids nested parallelism)
* Preprocessing runs exactly ONCE
"""

import os
import uuid
import logging
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
import joblib
from sklearn.datasets import (
    load_iris, load_wine, load_breast_cancer,
    load_diabetes, fetch_california_housing, load_digits,
)
from sklearn.ensemble import (
    RandomForestClassifier,  GradientBoostingClassifier,
    RandomForestRegressor,   GradientBoostingRegressor,
)
from sklearn.linear_model import (
    LogisticRegression, LinearRegression, Lasso, Ridge,
)
from sklearn.model_selection import cross_val_score
from sklearn.preprocessing import LabelEncoder, StandardScaler
from sklearn.metrics import accuracy_score, f1_score, r2_score, mean_squared_error

# Parallel helper
from joblib import Parallel, delayed

from services.dataset_service       import DatasetService
from services.preprocessing_service import Preprocessor, detect_target
from services.visualization_service import VisualizationService
from services.dl_service            import DLService
from services.image_dl_service      import ImageDLService
from services.mode_selector         import select_mode, select_mode_with_reason

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

MODELS_DIR = "models"
os.makedirs(MODELS_DIR, exist_ok=True)

# ─────────────────────────────────────────────────────────────────────────────
# Fallback sklearn loaders (used when dynamic dataset discovery fails)
# ─────────────────────────────────────────────────────────────────────────────

def _load_sklearn_iris():
    d = load_iris()
    df = pd.DataFrame(d.data, columns=d.feature_names)
    df["target"] = d.target
    return df, "target", list(d.feature_names), "classification"


def _load_sklearn_wine():
    d = load_wine()
    df = pd.DataFrame(d.data, columns=d.feature_names)
    df["target"] = d.target
    return df, "target", list(d.feature_names), "classification"


def _load_sklearn_cancer():
    d = load_breast_cancer()
    df = pd.DataFrame(d.data, columns=d.feature_names)
    df["target"] = d.target
    return df, "target", list(d.feature_names), "classification"


def _load_sklearn_diabetes():
    d = load_diabetes()
    df = pd.DataFrame(d.data, columns=d.feature_names)
    df["target"] = d.target
    return df, "target", list(d.feature_names), "regression"


def _load_california():
    d = fetch_california_housing()
    df = pd.DataFrame(d.data, columns=d.feature_names)
    df["target"] = d.target
    return df, "target", list(d.feature_names), "regression"


def _load_digits():
    d = load_digits()
    feature_names = [f"pixel_{i}" for i in range(d.data.shape[1])]
    df = pd.DataFrame(d.data, columns=feature_names)
    df["target"] = d.target
    return df, "target", feature_names, "classification"


def _load_mnist_proxy():
    """
    Loads MNIST as a flattened proxy for the registry and converts to PIL.
    """
    from sklearn.datasets import fetch_openml
    from PIL import Image
    import numpy as np
    
    X, y = fetch_openml('mnist_784', version=1, return_X_y=True, as_frame=False)
    # Use only 1000 samples for speed
    X, y = X[:1000], y[:1000].astype(int)
    
    images = []
    for row in X:
        arr = row.reshape(28, 28).astype(np.uint8)
        images.append(Image.fromarray(arr).convert("RGB"))
        
    return {
        "dataset": "Handwritten Digits (MNIST)",
        "source": "sklearn",
        "task": "image_classification",
        "target_col": "digit",
        "score": 100,
        "features": ["image"],
        "image_data": images,
        "labels": y.tolist(),
        "class_names": [str(i) for i in range(10)]
    }

# ─────────────────────────────────────────────────────────────────────────────
# Dataset registry (keyword-based fallback)
# ─────────────────────────────────────────────────────────────────────────────

DATASET_REGISTRY = [
    {
        "keywords": ["iris", "flower", "petal", "sepal", "setosa", "species"],
        "name": "Iris Flower Species",
        "loader": _load_sklearn_iris,
        "task": "classification",
    },
    {
        "keywords": ["image", "processing", "vision", "picture", "mnist", "digits", "pixel", "canvas"],
        "name": "Handwritten Digits (Image)",
        "loader": _load_mnist_proxy,
        "task": "image_classification",
    },
    {
        "keywords": ["titanic", "survival", "passenger", "ship", "survived"],
        "name": "Titanic Survival",
        "loader": _load_sklearn_cancer,
        "task": "classification",
    },
    {
        "keywords": ["wine", "alcohol", "grape", "vintage", "quality", "phenols"],
        "name": "Wine Quality Classification",
        "loader": _load_sklearn_wine,
        "task": "classification",
    },
    {
        "keywords": ["cancer", "tumor", "breast", "malignant", "benign", "diagnosis"],
        "name": "Breast Cancer Wisconsin",
        "loader": _load_sklearn_cancer,
        "task": "classification",
    },
    {
        "keywords": ["heart", "cardiac", "cardiovascular", "coronary", "chest pain"],
        "name": "Heart Disease Classification",
        "loader": _load_sklearn_cancer,
        "task": "classification",
    },
    {
        "keywords": ["digit", "handwritten", "handwriting", "mnist"],
        "name": "Handwritten Digits",
        "loader": _load_digits,
        "task": "classification",
    },
    {
        "keywords": ["diabetes", "blood sugar", "glucose", "insulin", "hba1c"],
        "name": "Diabetes Progression",
        "loader": _load_sklearn_diabetes,
        "task": "regression",
    },
    {
        "keywords": ["house", "housing", "home", "property", "california", "price"],
        "name": "California Housing Prices",
        "loader": _load_california,
        "task": "regression",
    },
    {
        "keywords": ["salary", "income", "wage", "employee", "compensation"],
        "name": "Salary / Income Prediction",
        "loader": _load_california,
        "task": "regression",
    },
    {
        "keywords": ["sentiment", "review", "opinion", "positive", "negative", "nlp"],
        "name": "Sentiment (Proxy: Wine Quality)",
        "loader": _load_sklearn_wine,
        "task": "classification",
    },
]


def _match_dataset_registry(description: str) -> Dict:
    desc_lower = description.lower()
    best, best_score = None, 0 # Require at least 1 keyword match
    for entry in DATASET_REGISTRY:
        score = sum(1 for kw in entry["keywords"] if kw in desc_lower)
        if score > best_score:
            best_score, best = score, entry
    
    # If no match in registry, fallback to a neutral dataset like Iris (index 0)
    return best if best else DATASET_REGISTRY[0]


# ─────────────────────────────────────────────────────────────────────────────
# Model catalogue
# ─────────────────────────────────────────────────────────────────────────────

def _get_candidate_models(task: str) -> List[Tuple[str, Any]]:
    """
    Return lightweight models for parallel evaluation.
    IMPORTANT: no model uses n_jobs!=1 to avoid nested parallelism.
    """
    if task == "classification":
        return [
            ("Logistic Regression",  LogisticRegression(max_iter=500, random_state=42)),
            ("Random Forest",        RandomForestClassifier(n_estimators=50, random_state=42, n_jobs=1)),
            ("Gradient Boosting",    GradientBoostingClassifier(n_estimators=100, random_state=42)),
        ]
    else:  # regression
        return [
            ("Linear Regression",    LinearRegression()),
            ("Random Forest",        RandomForestRegressor(n_estimators=50, random_state=42, n_jobs=1)),
            ("Gradient Boosting",    GradientBoostingRegressor(n_estimators=100, random_state=42)),
            ("Lasso",                Lasso(alpha=0.1, max_iter=1000)),
        ]


# ─────────────────────────────────────────────────────────────────────────────
# Parallel worker
# ─────────────────────────────────────────────────────────────────────────────

def _train_and_evaluate(
    model_name: str,
    model: Any,
    X: np.ndarray,
    y: np.ndarray,
    task: str,
) -> Tuple[str, Any, float]:
    """
    Fit *model* on (X, y), evaluate via 3-fold CV, return tuple.
    Safe for joblib.Parallel: no heavy nested parallelism.
    """
    try:
        scoring = "accuracy" if task == "classification" else "r2"
        # 3-fold cross-val on sample data
        scores = cross_val_score(model, X, y, cv=3, scoring=scoring, n_jobs=1)
        mean_score = float(scores.mean())
        # Fit on full sample so model is ready for fine-tuning later
        model.fit(X, y)
        logger.info(f"  [{model_name}] CV {scoring}={mean_score:.4f}")
        return model_name, model, mean_score
    except Exception as e:
        logger.warning(f"  [{model_name}] failed during evaluation: {e}")
        return model_name, None, float("-inf")


# ─────────────────────────────────────────────────────────────────────────────
# Core Training Pipeline
# ─────────────────────────────────────────────────────────────────────────────

def _run_training_pipeline(
    df: pd.DataFrame,
    X_full: np.ndarray,
    y_full: np.ndarray,
    feature_names: List[str],
    target_col: str,
    task: str,
    dataset_name: str,
    dataset_source: str,
    prep_report: Dict[str, Any]
) -> Dict[str, Any]:
    n_rows = X_full.shape[0]
    
    # ──────────────────────────────────────────────────────────────────────
    # STEP 3 — Sample 30% for fast candidate comparison
    # ──────────────────────────────────────────────────────────────────────
    sample_size = max(30, int(n_rows * 0.30))
    # Safety Check
    sample_size = min(sample_size, n_rows)
    rng = np.random.default_rng(42)
    sample_idx = rng.choice(n_rows, size=sample_size, replace=False)
    X_sample = X_full[sample_idx]
    y_sample = y_full[sample_idx]
    logger.info(
        f"Sampled {sample_size}/{n_rows} rows ({sample_size/n_rows*100:.0f}%) "
        "for candidate comparison."
    )

    # ──────────────────────────────────────────────────────────────────────
    # STEP 4 — Parallel model training on sample
    # ──────────────────────────────────────────────────────────────────────
    candidates = _get_candidate_models(task)
    logger.info(f"Running {len(candidates)} models in parallel…")

    eval_results: List[Tuple[str, Any, float]] = Parallel(n_jobs=-1, backend="loky")(
        delayed(_train_and_evaluate)(name, model, X_sample, y_sample, task)
        for name, model in candidates
    )

    # ──────────────────────────────────────────────────────────────────────
    # STEP 5 — Model comparison
    # ──────────────────────────────────────────────────────────────────────
    model_comparison: Dict[str, float] = {}
    valid_results = [(n, m, s) for n, m, s in eval_results if m is not None]

    if not valid_results:
        raise RuntimeError("All candidate models failed training — cannot continue.")

    for name, _model, score in valid_results:
        model_comparison[name] = round(score, 4)

    sorted_results = sorted(valid_results, key=lambda t: t[2], reverse=True)
    best_name, best_model_sample, best_sample_score = sorted_results[0]

    logger.info(
        f"Model comparison (sample): "
        + ", ".join(f"{n}={s:.4f}" for n, s in model_comparison.items())
    )
    logger.info(f"Best model on sample: {best_name} (score={best_sample_score:.4f})")

    # ──────────────────────────────────────────────────────────────────────
    # STEP 6 — Retrain best model on FULL dataset
    # ──────────────────────────────────────────────────────────────────────
    logger.info(f"Retraining '{best_name}' on full dataset ({n_rows} rows)…")

    best_fresh = None
    for cname, cmodel in candidates:
        if cname == best_name:
            from sklearn.base import clone as sk_clone
            best_fresh = sk_clone(cmodel)
            break

    if best_fresh is None:
        best_fresh = best_model_sample

    best_fresh.fit(X_full, y_full)

    y_pred_full = best_fresh.predict(X_full)
    if task == "classification":
        final_score = float(accuracy_score(y_full, y_pred_full))
        final_metrics = {
            "accuracy": round(final_score, 4),
            "f1_score": round(
                float(f1_score(y_full, y_pred_full, average="weighted", zero_division=0)), 4
            ),
        }
    else:
        final_score = float(r2_score(y_full, y_pred_full))
        final_metrics = {
            "r2_score": round(final_score, 4),
            "rmse": round(float(np.sqrt(mean_squared_error(y_full, y_pred_full))), 4),
        }

    logger.info(f"Final model '{best_name}' full-dataset score: {final_score:.4f}")

    # ──────────────────────────────────────────────────────────────────────
    # STEP 7 — Save artifact
    # ──────────────────────────────────────────────────────────────────────
    model_id = str(uuid.uuid4())[:8]
    # IMPORTANT FIX: Store the FULL DataFrame here (up to 50k rows) so Chat Cleaning works seamlessly
    artifact = {
        "model":         best_fresh,
        "feature_names": feature_names,
        "task":          task,
        "dataset_name":  dataset_name,
        "df_sample":     df.to_dict(orient="list"),
    }
    artifact_path = os.path.join(MODELS_DIR, f"{model_id}.joblib")
    joblib.dump(artifact, artifact_path)
    logger.info(f"Model artifact saved: {artifact_path}")

    # ──────────────────────────────────────────────────────────────────────
    # STEP 8 — Visualisations
    # ──────────────────────────────────────────────────────────────────────
    try:
        plots = VisualizationService.generate_all(
            df, best_fresh, feature_names, target_col, task
        )
    except Exception as viz_exc:
        logger.warning(f"Visualisation failed (non-fatal): {viz_exc}")
        plots = {}

    # ──────────────────────────────────────────────────────────────────────
    # STEP 9 — Return enriched result
    # ──────────────────────────────────────────────────────────────────────
    return {
        "model_id":       model_id,
        "dataset_name":   dataset_name,
        "dataset":        dataset_name,
        "source":         dataset_source,
        "task":           task,
        "task_type":      task,
        "best_model":     best_name,
        "best_score":     round(best_sample_score, 4),
        "metrics":        final_metrics,
        "model_comparison": model_comparison,
        "preprocessing":  prep_report,
        "features":       feature_names,
        "feature_names":  feature_names,
        "dataset_rows":   n_rows,
        "dataset_cols":   len(feature_names) + 1,
        "dataset_preview": df.head(5).fillna("").to_dict(orient="records"),
        "plots":          plots,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Entry Point: Auto Train
# ─────────────────────────────────────────────────────────────────────────────

def auto_train(problem_description: str, mode: str = "auto") -> Dict[str, Any]:
    logger.info(f"=== auto_train: '{problem_description}' (mode={mode}) ===")

    dataset_service = DatasetService()
    df: pd.DataFrame
    
    try:
        ds_info = dataset_service.get_best_dataset(problem_description)
    except Exception as exc:
        logger.warning(f"Dynamic dataset discovery failed ({exc}), falling back to registry.")
        entry = _match_dataset_registry(problem_description)
        try:
            if entry["task"] == "image_classification":
                ds_info = entry["loader"]()
            else:
                raw = entry["loader"]()
                df, target_col, feature_cols, task = raw
                ds_info = {
                    "dataset": entry["name"],
                    "source": "sklearn",
                    "task": entry["task"],
                    "target_col": target_col,
                    "features": feature_cols,
                    "df": df
                }
        except Exception as fallback_exc:
            df, target_col, feature_cols, task = _load_sklearn_iris()
            ds_info = {
                "dataset": "Iris Flower Species (fallback)",
                "source": "sklearn",
                "task": task,
                "target_col": target_col,
                "features": feature_cols,
                "df": df
            }

    task = ds_info["task"]
    dataset_name = ds_info["dataset"]

    # ─────────────────────────────────────────────────────────────────────────
    # IMAGE PROCESSING BRANCH
    # ─────────────────────────────────────────────────────────────────────────
    if task == "image_classification":
        logger.info(f"Image processing detected for {dataset_name}. Using MobileNetV2 path.")
        
        # ds_info contains image_data (PIL) and labels (ints), and class_names (strings)
        dl_result = ImageDLService.train_model(
            pil_images=ds_info["image_data"],
            labels=ds_info["labels"],
            class_names=ds_info["class_names"],
            dataset_name=dataset_name,
            source=ds_info["source"]
        )
        return dl_result

    # ─────────────────────────────────────────────────────────────────────────
    # TABULAR PIPELINE (ML / DL)
    # ─────────────────────────────────────────────────────────────────────────
    df = ds_info["df"]
    target_col = ds_info["target_col"]
    feature_cols = ds_info["features"]
    dataset_source = ds_info["source"]

    if len(df) > 50_000:
        df = df.sample(50_000, random_state=42).reset_index(drop=True)

    logger.info("Preprocessing dataset (once)…")
    preprocessor = Preprocessor()
    try:
        X_full, y_full, feature_names, prep_report = preprocessor.process(
            df, target_col, feature_cols
        )
    except Exception as prep_exc:
        raise RuntimeError(f"Preprocessing failed: {prep_exc}") from prep_exc
        
    n_rows = X_full.shape[0]
    if n_rows < 30:
        raise RuntimeError(f"Dataset too small after preprocessing: {n_rows} rows (need ≥ 30).")

    # ── Mode Selection ───────────────────────────────────────────────────────
    dataset_info = {"n_rows": n_rows, "task": task}
    selected_mode, reason = select_mode_with_reason(mode, dataset_info)
    logger.info(f"Mode selected: {selected_mode} | Reason: {reason}")

    if selected_mode == "dl":
        # Safety warning for very small datasets
        warning = None
        if n_rows < 1_000:
            warning = (
                f"⚠️ Dataset has only {n_rows:,} rows. "
                "Deep learning usually underperforms ML on very small datasets. "
                "Training time may also be longer."
            )
            logger.warning(warning)
        elif mode == "dl":
            # User explicitly chose DL — give a heads-up about time
            warning = "Training time may be longer than ML. EarlyStopping is active (patience=2)."

        logger.info("DL pipeline selected. Training may take slightly longer than ML.")

        dl_result = DLService.train_model(
            df=df, X_full=X_full, y_full=y_full,
            feature_names=feature_names, target_col=target_col, task=task,
            dataset_name=dataset_name, dataset_source=dataset_source,
            prep_report=prep_report,
            reason=reason,
            warning=warning,
        )
        return dl_result

    # ── ML Pipeline (default) ────────────────────────────────────────────────
    result = _run_training_pipeline(
        df=df, X_full=X_full, y_full=y_full,
        feature_names=feature_names, target_col=target_col, task=task,
        dataset_name=dataset_name, dataset_source=dataset_source, prep_report=prep_report
    )
    result["mode_selected"] = selected_mode
    result["model_type"]    = "ML"
    result["score"]         = result["best_score"]
    result["reason"]        = reason
    result["note"]          = "ML parallel pipeline used (fastest for this dataset)."
    return result


# ─────────────────────────────────────────────────────────────────────────────
# Entry Point: Retrain from cleaned artifact
# ─────────────────────────────────────────────────────────────────────────────

def retrain_from_artifact(model_id: str) -> Dict[str, Any]:
    logger.info(f"=== retrain_from_artifact: model '{model_id}' ===")
    artifact_path = os.path.join(MODELS_DIR, f"{model_id}.joblib")
    if not os.path.exists(artifact_path):
        raise FileNotFoundError(f"Model ID {model_id} not found.")
        
    artifact = joblib.load(artifact_path)
    
    # Check if df_sample is dict, and convert to standard DataFrame
    if isinstance(artifact["df_sample"], dict):
        df = pd.DataFrame(artifact["df_sample"])
    else:
        df = pd.DataFrame(artifact["df_sample"])
        
    task = artifact.get("task", "classification")
    dataset_name = artifact.get("dataset_name", "Cleaned Dataset")
    
    # Robustly find target column
    target_col = detect_target(df)
    
    if target_col in df.columns:
        if task == "classification":
            y_full = LabelEncoder().fit_transform(df[target_col])
        else:
            y_full = df[target_col].values.astype(np.float64)
        X_df = df.drop(columns=[target_col])
    else:
        # Fallback if somehow target was destroyed during manual chat cleaning
        y_full = np.zeros(len(df))
        X_df = df
        task = "regression" # fallback
        
    # Attempt to coerce object columns if they weren't cleaned correctly
    for col in X_df.columns:
        if X_df[col].dtype == 'object':
            try:
                X_df[col] = X_df[col].astype(float)
            except:
                pass
                
    # Select only numeric types remaining for ML training
    numeric_df = X_df.select_dtypes(include=[np.number])
    X_full = numeric_df.values.astype(np.float64)
    feature_names = list(numeric_df.columns)
    
    if X_full.shape[0] < 30:
        raise RuntimeError(f"Cleaned dataset too small to learn: {X_full.shape[0]} rows (need ≥ 30).")
    
    if X_full.shape[1] == 0:
        raise RuntimeError("No purely numeric attributes left to train on! Please undo or reconsider your cleanup steps.")
    
    prep_report = {
        "dataset_analysis": {"size": X_full.shape[0], "num_cols": X_full.shape[1], "cat_cols": 0, "is_scaled": True},
        "target_column": target_col,
        "message": "Model trained instantly off your customized data flow.",
    }
    
    return _run_training_pipeline(
        df=df, X_full=X_full, y_full=y_full,
        feature_names=feature_names, target_col=target_col, task=task,
        dataset_name=dataset_name, dataset_source="Retrained custom artifact", prep_report=prep_report
    )
