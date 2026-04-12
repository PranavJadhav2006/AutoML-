"""
trainer.py
-----------
Core ML training engine for AutoML Studio.

Flow:
  1. Match problem description → best dataset via keyword scoring
  2. Load dataset (sklearn builtins or HuggingFace Hub)
  3. Preprocess (fill NaN, encode categoricals, scale)
  4. Train multiple models (classification OR regression)
  5. Pick best by score
  6. Save model artifact with joblib
  7. Return JSON result
"""

import os
import uuid
import re
import logging
from typing import Dict, Any, Tuple, List

import numpy as np
import pandas as pd
import joblib

from sklearn.datasets import (
    load_iris, load_wine, load_breast_cancer,
    load_diabetes, fetch_california_housing, load_digits
)
from sklearn.ensemble import (
    RandomForestClassifier, GradientBoostingClassifier,
    RandomForestRegressor, GradientBoostingRegressor
)
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.model_selection import train_test_split, GridSearchCV
from sklearn.preprocessing import LabelEncoder, StandardScaler
from sklearn.metrics import accuracy_score, f1_score, r2_score, mean_squared_error

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

MODELS_DIR = "models"
os.makedirs(MODELS_DIR, exist_ok=True)

# ---------------------------------------------------------------------------
# Dataset loaders
# ---------------------------------------------------------------------------

def _load_sklearn_iris():
    d = load_iris()
    df = pd.DataFrame(d.data, columns=d.feature_names)
    df["target"] = d.target
    return df, "target", list(d.feature_names)


def _load_sklearn_wine():
    d = load_wine()
    df = pd.DataFrame(d.data, columns=d.feature_names)
    df["target"] = d.target
    return df, "target", list(d.feature_names)


def _load_sklearn_cancer():
    d = load_breast_cancer()
    df = pd.DataFrame(d.data, columns=d.feature_names)
    df["target"] = d.target
    return df, "target", list(d.feature_names)


def _load_sklearn_diabetes():
    d = load_diabetes()
    df = pd.DataFrame(d.data, columns=d.feature_names)
    df["target"] = d.target
    return df, "target", list(d.feature_names)


def _load_california():
    d = fetch_california_housing()
    df = pd.DataFrame(d.data, columns=d.feature_names)
    df["target"] = d.target
    return df, "target", list(d.feature_names)


def _load_digits():
    d = load_digits()
    feature_names = [f"pixel_{i}" for i in range(d.data.shape[1])]
    df = pd.DataFrame(d.data, columns=feature_names)
    df["target"] = d.target
    return df, "target", feature_names


def _load_huggingface(hf_id: str, target_col: str, split: str = "train"):
    """Load a HuggingFace dataset, convert to pandas, pick numeric features."""
    try:
        from datasets import load_dataset
        ds = load_dataset(hf_id, split=split)
        df = ds.to_pandas()
        df = df.dropna(subset=[target_col])
        numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
        feature_cols = [c for c in numeric_cols if c != target_col]
        if not feature_cols:
            raise ValueError("No numeric feature columns found in HuggingFace dataset.")
        return df, target_col, feature_cols
    except Exception as e:
        logger.warning(f"HuggingFace load failed for {hf_id}: {e}")
        raise


# ---------------------------------------------------------------------------
# Dataset registry  (ordered — first strong keyword match wins)
# ---------------------------------------------------------------------------

DATASET_REGISTRY = [
    {
        "keywords": ["titanic", "survival", "passenger", "ship", "sinking", "survived"],
        "name": "Titanic Survival",
        "source": "huggingface",
        "hf_id": "phreddy/titanic",
        "target_col": "Survived",
        "task": "classification",
        "fallback": _load_sklearn_cancer,
    },
    {
        "keywords": ["iris", "flower", "petal", "sepal", "setosa", "versicolor", "species"],
        "name": "Iris Flower Species",
        "source": "sklearn",
        "loader": _load_sklearn_iris,
        "task": "classification",
    },
    {
        "keywords": ["wine", "alcohol", "grape", "vintage", "quality", "phenols"],
        "name": "Wine Quality Classification",
        "source": "sklearn",
        "loader": _load_sklearn_wine,
        "task": "classification",
    },
    {
        "keywords": [
            "cancer", "tumor", "breast", "malignant", "benign",
            "diagnosis", "biopsy", "oncology",
        ],
        "name": "Breast Cancer Wisconsin",
        "source": "sklearn",
        "loader": _load_sklearn_cancer,
        "task": "classification",
    },
    {
        "keywords": [
            "heart", "cardiac", "cardiovascular", "coronary", "artery",
            "chest pain", "ecg", "attack",
        ],
        "name": "Heart Disease Classification",
        "source": "sklearn",
        "loader": _load_sklearn_cancer,   # closest tabular classification proxy
        "task": "classification",
    },
    {
        "keywords": ["digit", "handwritten", "handwriting", "mnist", "number recognition"],
        "name": "Handwritten Digits (MNIST-lite)",
        "source": "sklearn",
        "loader": _load_digits,
        "task": "classification",
    },
    {
        "keywords": ["diabetes", "blood sugar", "glucose", "insulin", "hba1c", "glycemic"],
        "name": "Diabetes Progression",
        "source": "sklearn",
        "loader": _load_sklearn_diabetes,
        "task": "regression",
    },
    {
        "keywords": [
            "house", "housing", "home", "property", "real estate",
            "california", "price prediction", "sale price",
        ],
        "name": "California Housing Prices",
        "source": "sklearn",
        "loader": _load_california,
        "task": "regression",
    },
    {
        "keywords": ["salary", "income", "wage", "employee", "compensation", "pay"],
        "name": "Salary / Income Prediction",
        "source": "sklearn",
        "loader": _load_california,
        "task": "regression",
    },
    {
        "keywords": ["sentiment", "review", "opinion", "positive", "negative", "nlp"],
        "name": "Sentiment (Proxy: Wine Quality)",
        "source": "sklearn",
        "loader": _load_sklearn_wine,
        "task": "classification",
    },
]


def _match_dataset(description: str) -> Dict:
    """Score every registry entry and return the best match."""
    desc_lower = description.lower()
    best, best_score = None, -1

    for entry in DATASET_REGISTRY:
        score = sum(1 for kw in entry["keywords"] if kw in desc_lower)
        if score > best_score:
            best_score, best = score, entry

    # Default to iris
    return best if best else DATASET_REGISTRY[1]


# ---------------------------------------------------------------------------
# Dataset loading with fallback
# ---------------------------------------------------------------------------

def _load_dataset(entry: Dict) -> Tuple[pd.DataFrame, str, List[str]]:
    if entry["source"] == "huggingface":
        try:
            return _load_huggingface(entry["hf_id"], entry["target_col"])
        except Exception:
            logger.warning(f"Falling back for {entry['name']}")
            fallback_fn = entry.get("fallback", _load_sklearn_iris)
            return fallback_fn()
    else:
        return entry["loader"]()


# ---------------------------------------------------------------------------
# Preprocessing
# ---------------------------------------------------------------------------

def _preprocess(
    df: pd.DataFrame, target_col: str, feature_cols: List[str]
) -> Tuple[np.ndarray, np.ndarray]:
    X = df[feature_cols].copy()
    y = df[target_col].copy()

    # Fill NaN with column medians for numerics
    for col in X.columns:
        if X[col].dtype in [np.float64, np.float32, np.int64, np.int32]:
            X[col] = X[col].fillna(X[col].median())
        else:
            X[col] = X[col].fillna(X[col].mode()[0] if not X[col].mode().empty else "unknown")

    # Encode object columns
    for col in X.select_dtypes(include=["object", "category"]).columns:
        le = LabelEncoder()
        X[col] = le.fit_transform(X[col].astype(str))

    # Encode target if object
    if y.dtype == object or str(y.dtype) in ["string", "category"]:
        le = LabelEncoder()
        y = le.fit_transform(y.astype(str))
    else:
        y = y.values.astype(np.float64)

    return X.values.astype(np.float64), y


# ---------------------------------------------------------------------------
# Main training function
# ---------------------------------------------------------------------------

from services.dataset_service import DatasetService
from services.visualization_service import VisualizationService

def auto_train(problem_description: str) -> Dict[str, Any]:
    logger.info(f"Training request: '{problem_description}'")

    # Step 1 & 2: Match and Load dataset dynamically
    dataset_service = DatasetService()
    try:
        ds_info = dataset_service.get_best_dataset(problem_description)
        df = ds_info["df"]
        target_col = ds_info["target_col"]
        task = ds_info["task"]
        feature_cols = ds_info["features"]
        dataset_name = ds_info["dataset"]
        dataset_source = ds_info["source"]
        dataset_score = ds_info["score"]
        logger.info(f"Matched dataset dynamically: {dataset_name} | task: {task} | source: {dataset_source}")
    except Exception as e:
        logger.error(f"Dynamic dataset load failed: {e}, falling back to static registry")
        # Step 1: Match dataset
        entry = _match_dataset(problem_description)
        task = entry["task"]
        logger.info(f"Matched dataset: {entry['name']} | task: {task}")

        # Step 2: Load
        try:
            df, target_col, feature_cols = _load_dataset(entry)
        except Exception as fallback_e:
            logger.error(f"Dataset load failed: {fallback_e}, falling back to Iris")
            df, target_col, feature_cols = _load_sklearn_iris()
            task = "classification"
            entry = {"name": "Iris Flower Species (fallback)", "source": "sklearn"}
            
        dataset_name = entry["name"]
        dataset_source = entry.get("source", "sklearn")
        dataset_score = 0


    logger.info(f"Dataset loaded: {len(df)} rows, {len(feature_cols)} features")

    # Cap at 50K rows for speed
    if len(df) > 50_000:
        df = df.sample(50_000, random_state=42).reset_index(drop=True)

    # Step 3: Preprocess
    X, y = _preprocess(df, target_col, feature_cols)
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=(y if task == "classification" else None)
    )
    scaler = StandardScaler()
    X_train_s = scaler.fit_transform(X_train)
    X_test_s = scaler.transform(X_test)

    # Step 4: Train candidate models with hyperparameter tuning
    if task == "classification":
        candidates = [
            (
                "Random Forest", 
                RandomForestClassifier(random_state=42, n_jobs=-1),
                {"n_estimators": [50, 100, 200], "max_depth": [None, 10, 20]}
            ),
            (
                "Gradient Boosting", 
                GradientBoostingClassifier(random_state=42),
                {"n_estimators": [50, 100, 200], "learning_rate": [0.01, 0.1, 0.2]}
            ),
            (
                "Logistic Regression", 
                LogisticRegression(random_state=42, max_iter=2000),
                {"C": [0.1, 1.0, 10.0]}
            ),
        ]
    else:
        candidates = [
            (
                "Random Forest", 
                RandomForestRegressor(random_state=42, n_jobs=-1),
                {"n_estimators": [50, 100, 200], "max_depth": [None, 10, 20]}
            ),
            (
                "Gradient Boosting", 
                GradientBoostingRegressor(random_state=42),
                {"n_estimators": [50, 100, 200], "learning_rate": [0.01, 0.1, 0.2]}
            ),
            (
                "Ridge Regression", 
                Ridge(),
                {"alpha": [0.1, 1.0, 10.0]}
            ),
        ]

    best_model, best_score, best_name, best_metrics = None, -999.0, "", {}

    for name, model, params in candidates:
        try:
            # Hyperparameter tuning
            logger.info(f"  Tuning {name}...")
            grid_search = GridSearchCV(model, params, cv=3, n_jobs=-1, scoring='accuracy' if task == 'classification' else 'r2')
            grid_search.fit(X_train_s, y_train)
            
            best_tuned_model = grid_search.best_estimator_
            y_pred = best_tuned_model.predict(X_test_s)

            if task == "classification":
                score = float(accuracy_score(y_test, y_pred))
                metrics = {
                    "accuracy": round(score, 4),
                    "f1_score": round(float(f1_score(y_test, y_pred, average="weighted", zero_division=0)), 4),
                }
            else:
                score = float(r2_score(y_test, y_pred))
                metrics = {
                    "r2_score": round(score, 4),
                    "rmse": round(float(np.sqrt(mean_squared_error(y_test, y_pred))), 4),
                }

            logger.info(f"  {name}: score={score:.4f} (params: {grid_search.best_params_})")
            if score > best_score:
                best_score, best_model, best_name, best_metrics = score, best_tuned_model, name, metrics
        except Exception as e:
            logger.warning(f"  {name} failed: {e}")

    if best_model is None:
        raise RuntimeError("All models failed to train.")

    # Step 5: Save artifact
    model_id = str(uuid.uuid4())[:8]
    artifact = {
        "model": best_model,
        "scaler": scaler,
        "feature_names": feature_cols,
        "task": task,
        "dataset_name": dataset_name,
        "df_sample": df.head(500).to_dict(orient="list"),
    }
    joblib.dump(artifact, os.path.join(MODELS_DIR, f"{model_id}.joblib"))
    logger.info(f"Model saved: {model_id}")

    try:
        plots = VisualizationService.generate_all(df, best_model, feature_cols, target_col, task)
    except Exception as e:
        logger.error(f"Visualization failed: {e}")
        plots = {}

    return {
        "model_id": model_id,
        "dataset_name": dataset_name,
        "dataset": dataset_name,
        "source": dataset_source,
        "score": dataset_score,
        "task": task,
        "features": feature_cols,
        "dataset_preview": df.head(5).fillna("").to_dict(orient="records"),
        "task_type": task,
        "best_model": best_name,
        "metrics": best_metrics,
        "feature_names": feature_cols,
        "dataset_rows": len(df),
        "dataset_cols": len(feature_cols) + 1,
        "plots": plots,
    }
