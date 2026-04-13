"""
dl_service.py
-------------
Lightweight Deep Learning pipeline using PyTorch.

Architecture (mirrors Keras spec)
==================================
  Dense(64, relu) → Dense(32, relu) → Dense(output)

Optimisation rules (IMPORTANT)
================================
  * Max 10 epochs
  * batch_size = 32
  * EarlyStopping: patience=2 on val_loss
  * Single small model — no parallel DL training
  * Preprocessing shared with ML pipeline (done upstream)

Supports
========
  * Regression:              MSE loss   → R² evaluation
  * Binary classification:   BCE loss   → accuracy + F1
  * Multiclass classification: CrossEntropy → accuracy + F1
"""

import os
import uuid
import logging
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd
import joblib
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, TensorDataset
from sklearn.metrics import r2_score, accuracy_score, f1_score
from sklearn.model_selection import train_test_split

from services.visualization_service import VisualizationService

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

MODELS_DIR = "models"
os.makedirs(MODELS_DIR, exist_ok=True)


# ─────────────────────────────────────────────────────────────────────────────
# MLP model  (Dense 64 → Dense 32 → Dense output)
# ─────────────────────────────────────────────────────────────────────────────

class _MLP(nn.Module):
    """
    Simple 2-hidden-layer MLP.
    Architecture: input → Dense(64, relu) → Dense(32, relu) → output
    """

    def __init__(self, input_dim: int, output_dim: int, task: str):
        super().__init__()
        self.task       = task
        self.output_dim = output_dim

        self.net = nn.Sequential(
            nn.Linear(input_dim, 64),
            nn.ReLU(),
            nn.Linear(64, 32),
            nn.ReLU(),
            nn.Linear(32, output_dim),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        out = self.net(x)
        if self.task == "classification" and self.output_dim == 1:
            out = torch.sigmoid(out)
        return out


# ─────────────────────────────────────────────────────────────────────────────
# Sklearn-like wrapper for VisualizationService compatibility
# ─────────────────────────────────────────────────────────────────────────────

class _TorchWrapper:
    """Thin adapter so VisualizationService.generate_all() works unchanged."""

    def __init__(self, model: _MLP, task: str, n_classes: int):
        self._model    = model
        self._task     = task
        self._n_classes = n_classes

    def predict(self, X: np.ndarray) -> np.ndarray:
        self._model.eval()
        with torch.no_grad():
            t   = torch.FloatTensor(X)
            out = self._model(t).numpy()
        if self._task == "classification":
            if self._n_classes <= 2:
                return (out.flatten() > 0.5).astype(int)
            return np.argmax(out, axis=1)
        return out.flatten()

    @property
    def feature_importances_(self):
        return None          # gracefully degrades visualisation


# ─────────────────────────────────────────────────────────────────────────────
# DLService
# ─────────────────────────────────────────────────────────────────────────────

class DLService:

    @staticmethod
    def train_model(
        df: pd.DataFrame,
        X_full: np.ndarray,
        y_full: np.ndarray,
        feature_names: List[str],
        target_col: str,
        task: str,
        dataset_name: str,
        dataset_source: str,
        prep_report: Dict[str, Any],
        reason: str = "DL mode selected.",
        warning: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Train a lightweight PyTorch MLP and return a unified result dict.

        Parameters
        ----------
        df              : original DataFrame (for preview / visualisation)
        X_full          : preprocessed feature matrix  (n_samples, n_features)
        y_full          : target array                 (n_samples,)
        feature_names   : list of column names
        target_col      : name of the target column
        task            : 'regression' | 'classification'
        dataset_name    : human-friendly dataset name
        dataset_source  : e.g. 'huggingface', 'sklearn'
        prep_report     : preprocessing summary dict (passed through)
        reason          : why DL was chosen — shown in frontend
        warning         : optional safety warning (small dataset, etc.)
        """
        n_rows, n_features = X_full.shape
        logger.info(
            f"[DLService] Keras-spec MLP via PyTorch "
            f"| rows={n_rows}, features={n_features}, task={task}"
        )

        # ── Prepare tensors ──────────────────────────────────────────────────
        X_t = torch.FloatTensor(X_full)

        if task == "classification":
            n_classes  = int(len(np.unique(y_full)))
            if n_classes <= 2:
                y_t        = torch.FloatTensor(y_full).view(-1, 1)
                output_dim = 1
                criterion  = nn.BCELoss()
            else:
                y_t        = torch.LongTensor(y_full.astype(np.int64))
                output_dim = n_classes
                criterion  = nn.CrossEntropyLoss()
        else:
            n_classes  = 0
            y_t        = torch.FloatTensor(y_full).view(-1, 1)
            output_dim = 1
            criterion  = nn.MSELoss()

        # ── Train / validation split (80 / 20) ──────────────────────────────
        X_tr, X_val, y_tr, y_val = train_test_split(
            X_t, y_t, test_size=0.2, random_state=42
        )
        train_loader = DataLoader(
            TensorDataset(X_tr, y_tr), batch_size=32, shuffle=True
        )

        # ── Build model ──────────────────────────────────────────────────────
        model     = _MLP(n_features, output_dim, task)
        optimizer = optim.Adam(model.parameters(), lr=0.001)

        logger.info(
            f"[DLService] Architecture: {n_features}->Dense(64,relu)"
            f"->Dense(32,relu)->Dense({output_dim})"
        )

        # ── Training loop with EarlyStopping (patience=2) ───────────────────
        best_val_loss  = float("inf")
        patience_left  = 2
        best_state     = None
        epochs_run     = 0

        for epoch in range(10):          # 10 epochs MAX
            # — train —
            model.train()
            for bx, by in train_loader:
                optimizer.zero_grad()
                loss = criterion(model(bx), by)
                loss.backward()
                optimizer.step()

            # — validate —
            model.eval()
            with torch.no_grad():
                val_out  = model(X_val)
                val_loss = criterion(val_out, y_val).item()

            epochs_run = epoch + 1
            logger.info(f"[DLService] Epoch {epochs_run}/10 — val_loss={val_loss:.4f}")

            # — EarlyStopping —
            if val_loss < best_val_loss:
                best_val_loss = val_loss
                best_state    = {k: v.clone() for k, v in model.state_dict().items()}
                patience_left = 2
            else:
                patience_left -= 1
                if patience_left <= 0:
                    logger.info(
                        f"[DLService] EarlyStopping triggered at epoch {epochs_run}"
                    )
                    break

        # Load best weights
        if best_state is not None:
            model.load_state_dict(best_state)
        logger.info(f"[DLService] Training done after {epochs_run} epoch(s).")

        # ── Evaluation on full dataset ───────────────────────────────────────
        model.eval()
        with torch.no_grad():
            raw_pred = model(X_t).numpy()

        if task == "classification":
            if n_classes <= 2:
                y_pred = (raw_pred.flatten() > 0.5).astype(int)
            else:
                y_pred = np.argmax(raw_pred, axis=1)

            final_score  = float(accuracy_score(y_full, y_pred))
            f1           = float(
                f1_score(y_full, y_pred, average="weighted", zero_division=0)
            )
            final_metrics = {
                "accuracy":   round(final_score, 4),
                "f1_score":   round(f1, 4),
                "epochs_run": epochs_run,
                "val_loss":   round(best_val_loss, 4),
            }
        else:
            y_pred       = raw_pred.flatten()
            final_score  = float(r2_score(y_full, y_pred))
            rmse         = float(np.sqrt(np.mean((y_full - y_pred) ** 2)))
            final_metrics = {
                "r2_score":  round(final_score, 4),
                "rmse":      round(rmse, 4),
                "epochs_run": epochs_run,
                "val_loss":  round(best_val_loss, 4),
            }

        logger.info(
            f"[DLService] Final score: {final_score:.4f} "
            f"({'accuracy' if task == 'classification' else 'R²'})"
        )

        # ── Save artifact ────────────────────────────────────────────────────
        model_id = str(uuid.uuid4())[:8]

        # Save weights
        weights_path = os.path.join(MODELS_DIR, f"{model_id}_dl.pt")
        torch.save(model.state_dict(), weights_path)

        # Save metadata (joblib for compatibility with predictor/chat)
        metadata = {
            "model_type":    "DL_PyTorch",
            "weights_path":  weights_path,
            "feature_names": feature_names,
            "task":          task,
            "input_dim":     n_features,
            "output_dim":    output_dim,
            "n_classes":     n_classes,
            "dataset_name":  dataset_name,
            "df_sample":     df.head(100).to_dict(orient="list"),
        }
        joblib.dump(metadata, os.path.join(MODELS_DIR, f"{model_id}.joblib"))
        logger.info(f"[DLService] Artifact saved → {weights_path}")

        # ── Visualisations ───────────────────────────────────────────────────
        wrapper = _TorchWrapper(model, task, n_classes)
        try:
            plots = VisualizationService.generate_all(
                df, wrapper, feature_names, target_col, task
            )
        except Exception as viz_err:
            logger.warning(f"[DLService] Visualisation skipped: {viz_err}")
            plots = {}

        # ── Unified response (matches ML pipeline format) ────────────────────
        result: Dict[str, Any] = {
            # Identity
            "model_id":        model_id,
            "dataset_name":    dataset_name,
            "dataset":         dataset_name,
            "source":          dataset_source,
            "task":            task,
            "task_type":       task,
            # Mode info
            "mode_selected":   "dl",
            "model_type":      "DL",
            "reason":          reason,
            # Performance
            "best_model":      "PyTorch MLP (Dense 64->32)",
            "best_score":      round(final_score, 4),
            "score":           round(final_score, 4),
            "metrics":         final_metrics,
            "model_comparison": {
                "PyTorch MLP (Dense 64->32)": round(final_score, 4),
            },
            # Dataset / preprocessing
            "preprocessing":   prep_report,
            "features":        feature_names,
            "feature_names":   feature_names,
            "dataset_rows":    n_rows,
            "dataset_cols":    len(feature_names) + 1,
            "dataset_preview": df.head(5).fillna("").to_dict(orient="records"),
            # Visuals
            "plots":           plots,
            "note": (
                f"PyTorch MLP (64->32) trained in {epochs_run} epoch(s) "
                "with EarlyStopping (patience=2)."
            ),
        }

        if warning:
            result["warning"] = warning

        return result
