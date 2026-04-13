import os
import uuid
import base64
import logging
import io
import pandas as pd
import numpy as np

# Use Agg backend for matplotlib so it doesn't try to open GUI windows
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import seaborn as sns

logger = logging.getLogger(__name__)

class VisualizationService:
    @staticmethod
    def _save_and_encode() -> str:
        """Saves current matplotlib figure to an in-memory buffer and returns its base64 encoding."""
        try:
            plt.tight_layout()
            buf = io.BytesIO()
            plt.savefig(buf, format="png", dpi=100)
            buf.seek(0)
            encoded = base64.b64encode(buf.read()).decode("utf-8")
            return f"data:image/png;base64,{encoded}"
        except Exception as e:
            logger.error(f"Error encoding plot: {e}")
            return ""
        finally:
            plt.clf()
            plt.close('all')

    @classmethod
    def generate_heatmap(cls, df: pd.DataFrame) -> str:
        """Generates a correlation heatmap for numeric columns."""
        numeric_df = df.select_dtypes(include=[np.number])
        if numeric_df.shape[1] < 2:
            return "" # Need at least 2 columns for correlation
            
        plt.figure(figsize=(10, 8))
        corr = numeric_df.corr()
        sns.heatmap(corr, annot=True, cmap="coolwarm", fmt=".2f", linewidths=0.5)
        plt.title("Correlation Heatmap")
        
        return cls._save_and_encode()

    @classmethod
    def generate_missing_values_plot(cls, df: pd.DataFrame) -> str:
        """Generates a bar chart showing the count of missing values per column."""
        missing = df.isnull().sum()
        if missing.sum() == 0:
            return "" # Skip if no missing values
            
        plt.figure(figsize=(10, 6))
        missing = missing[missing > 0]
        sns.barplot(x=missing.index, y=missing.values, palette="Reds")
        plt.xticks(rotation=45, ha='right')
        plt.title("Missing Values per Column")
        plt.ylabel("Count")
        
        return cls._save_and_encode()

    @classmethod
    def generate_feature_distribution(cls, df: pd.DataFrame) -> str:
        """Generates a grouped histogram for numeric columns."""
        numeric_cols = df.select_dtypes(include=[np.number]).columns[:9] # max 9 to fit
        if len(numeric_cols) == 0:
            return ""
            
        n_cols = 3
        n_rows = (len(numeric_cols) + n_cols - 1) // n_cols
        
        fig, axes = plt.subplots(n_rows, n_cols, figsize=(12, 4 * n_rows))
        axes = np.array(axes).flatten()
        
        for i, col in enumerate(numeric_cols):
            sns.histplot(df[col].dropna(), ax=axes[i], kde=True, color='skyblue')
            axes[i].set_title(f"Distribution of {col}")
            
        # Hide any unused subplots
        for j in range(i + 1, len(axes)):
            fig.delaxes(axes[j])
            
        return cls._save_and_encode()

    @classmethod
    def generate_target_distribution(cls, df: pd.DataFrame, target_column: str, task: str) -> str:
        """Generates target distribution: bar plot for classification, histogram for regression."""
        if target_column not in df.columns:
            return ""
            
        plt.figure(figsize=(8, 6))
        if task == "classification":
            sns.countplot(data=df, x=target_column, palette="viridis")
            plt.xticks(rotation=45)
            plt.title("Class Distribution")
        else:
            sns.histplot(df[target_column].dropna(), kde=True, color='purple')
            plt.title("Target Variable Distribution")
            
        return cls._save_and_encode()

    @classmethod
    def generate_feature_importance(cls, model, feature_names: list) -> str:
        """Generates a feature importance bar chart if supported by the model."""
        importances = None
        
        if hasattr(model, "feature_importances_"):
            importances = model.feature_importances_
        elif hasattr(model, "coef_"):
            # Use absolute coefficients for linear models
            importances = np.abs(model.coef_[0]) if len(model.coef_.shape) > 1 else np.abs(model.coef_)
            
        if importances is None:
            return "" # Skip if not supported
            
        # Ensure sizes match
        if len(importances) != len(feature_names):
            return ""
            
        # Sort features
        indices = np.argsort(importances)[::-1][:15] # Top 15
        sorted_features = [feature_names[i] for i in indices]
        sorted_importances = importances[indices]
        
        plt.figure(figsize=(10, 6))
        sns.barplot(x=sorted_importances, y=sorted_features, palette="mako")
        plt.title("Top Feature Importances")
        plt.xlabel("Importance / Absolute Coefficient")
        
        return cls._save_and_encode()

    @classmethod
    def generate_all(cls, df: pd.DataFrame, model, feature_names: list, target_column: str, task: str) -> dict:
        """Orchestrates generation of all plots and returns a dictionary of base64 strings."""
        plots = {
            "heatmap": cls.generate_heatmap(df),
            "missing": cls.generate_missing_values_plot(df),
            "distribution": cls.generate_feature_distribution(df),
            "target": cls.generate_target_distribution(df, target_column, task),
            "feature_importance": cls.generate_feature_importance(model, feature_names)
        }
        
        # Remove empty strings
        return {k: v for k, v in plots.items() if v}
