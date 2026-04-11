"""
predictor.py
------------
Loads a saved model artifact and returns predictions.
"""

import os
import logging
from typing import Dict, Any

import numpy as np
import joblib

MODELS_DIR = "models"
logger = logging.getLogger(__name__)


def _load_artifact(model_id: str) -> Dict:
    path = os.path.join(MODELS_DIR, f"{model_id}.joblib")
    if not os.path.exists(path):
        raise FileNotFoundError(f"Model '{model_id}' not found. Train a model first.")
    return joblib.load(path)


def predict(model_id: str, features: Dict[str, Any]) -> Dict[str, Any]:
    """
    Load the saved model + scaler and return a prediction.

    Parameters
    ----------
    model_id : str
        The short UUID returned by /auto-train.
    features : dict
        {feature_name: value} — all feature names returned by /auto-train.

    Returns
    -------
    dict with keys: prediction, confidence (classification only), task_type
    """
    artifact = _load_artifact(model_id)
    model = artifact["model"]
    scaler = artifact["scaler"]
    feature_names = artifact["feature_names"]
    task = artifact["task"]

    # Build ordered feature vector
    try:
        X = np.array([[float(features.get(f, 0)) for f in feature_names]])
    except (ValueError, TypeError) as e:
        raise ValueError(f"Invalid feature values: {e}")

    X_scaled = scaler.transform(X)
    raw_pred = model.predict(X_scaled)[0]

    result: Dict[str, Any] = {
        "task_type": task,
        "prediction": float(raw_pred) if task == "regression" else int(raw_pred),
    }

    # Confidence for classifiers
    if task == "classification" and hasattr(model, "predict_proba"):
        proba = model.predict_proba(X_scaled)[0]
        result["confidence"] = round(float(np.max(proba)) * 100, 2)
        result["all_probabilities"] = {
            f"class_{i}": round(float(p) * 100, 2) for i, p in enumerate(proba)
        }

    return result
