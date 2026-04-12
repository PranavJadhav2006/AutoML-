import os
import subprocess
import logging
from typing import Dict, Any, List, Tuple
import pandas as pd
from datasets import load_dataset
import openml
from dotenv import load_dotenv

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class DatasetService:
    def __init__(self):
        pass

    def search_huggingface(self, query: str) -> List[Dict]:
        logger.info(f"Searching Hugging Face for: {query}")
        results = []
        try:
            from huggingface_hub import HfApi
            api = HfApi()
            datasets = api.list_datasets(search=query, limit=10)
            for d in datasets:
                results.append({
                    "id": d.id,
                    "name": d.id.split('/')[-1],
                    "source": "huggingface",
                    "description": getattr(d, 'description', d.id),
                    "downloads": getattr(d, 'downloads', 0)
                })
        except Exception as e:
            logger.warning(f"Hugging Face search failed: {e}")
        return results

    def search_openml(self, query: str) -> List[Dict]:
        logger.info(f"Searching OpenML for: {query}")
        results = []
        try:
            datasets = openml.datasets.list_datasets(output_format='dataframe')
            if not datasets.empty:
                # filter by name
                matching = datasets[datasets['name'].str.contains(query, case=False, na=False)].head(10)
                for _, row in matching.iterrows():
                    results.append({
                        "id": str(row['did']),
                        "name": row['name'],
                        "source": "openml",
                        "description": row['name'],
                        "format": row.get('format', ''),
                        "downloads": row.get('NumberOfInstances', 0)
                    })
        except Exception as e:
            logger.warning(f"OpenML search failed: {e}")
        return results

    def search_kaggle(self, query: str) -> List[Dict]:
        logger.info(f"Searching Kaggle for: {query}")
        results = []
        try:
            import sys
            kaggle_bin = os.path.join(os.path.dirname(sys.executable), "kaggle")
            result = subprocess.run(
                [kaggle_bin, "datasets", "list", "-s", query, "--csv"],
                capture_output=True, text=True
            )
            if result.stdout:
                import csv, io
                # Kaggle sometimes prints warnings before the CSV output
                lines = [line for line in result.stdout.split('\n') if ',' in line and not line.startswith('Warning:')]
                if not lines: return results
                reader = csv.DictReader(io.StringIO('\n'.join(lines)))
                for i, row in enumerate(reader):
                    if i >= 10: break
                    results.append({
                        "id": row.get("ref", ""),
                        "name": row.get("title", ""),
                        "source": "kaggle",
                        "description": row.get("subtitle", ""),
                        "downloads": 0
                    })
        except Exception as e:
            logger.warning(f"Kaggle search failed: {e}")
        return results

    def rank_datasets(self, datasets: List[Dict], query: str) -> Dict | None:
        if not datasets:
            return None
            
        best_score = -1
        best_ds = None
        query_lower = query.lower()
        
        for ds in datasets:
            score = 0
            
            name = str(ds.get("name", "")).lower()
            desc = str(ds.get("description", "")).lower()
            if query_lower in name:
                score += 50
            if query_lower in desc:
                score += 20
                
            metrics = int(ds.get("downloads", 0))
            if metrics >= 1000:
                score += 15
            elif metrics > 0:
                score += 5
                
            if ds.get("source") == "kaggle":
                score += 10
                
            ds["_score"] = score
            if score > best_score:
                best_score = score
                best_ds = ds
                
        return best_ds

    def load_dataset_as_dataframe(self, ds: Dict) -> pd.DataFrame:
        source = ds["source"]
        dataset_id = ds["id"]
        
        if source == "huggingface":
            logger.info(f"Loading HF dataset: {dataset_id}")
            hf_ds = load_dataset(dataset_id, split="train")
            return hf_ds.to_pandas()
            
        elif source == "openml":
            logger.info(f"Loading OpenML dataset: {dataset_id}")
            openml_ds = openml.datasets.get_dataset(dataset_id=int(dataset_id), download_data=True)
            X, y, categorical_indicator, attribute_names = openml_ds.get_data(
                target=openml_ds.default_target_attribute, dataset_format="dataframe"
            )
            df = X.copy()
            if openml_ds.default_target_attribute and type(y) == pd.Series:
                df[openml_ds.default_target_attribute] = y
            return df
            
        elif source == "kaggle":
            logger.info(f"Loading Kaggle dataset: {dataset_id}")
            import tempfile
            import sys
            kaggle_bin = os.path.join(os.path.dirname(sys.executable), "kaggle")
            with tempfile.TemporaryDirectory() as tmp_dir:
                subprocess.run([kaggle_bin, "datasets", "download", "-d", dataset_id, "-p", tmp_dir, "--unzip"], check=True)
                import glob
                csv_files = glob.glob(os.path.join(tmp_dir, "**", "*.csv"), recursive=True)
                if not csv_files:
                    raise ValueError("No CSV file found in Kaggle dataset")
                
                largest_csv = max(csv_files, key=os.path.getsize)
                return pd.read_csv(largest_csv)
                
        raise ValueError(f"Unknown source: {source}")

    def deduce_target_and_task(self, df: pd.DataFrame) -> Tuple[str, str]:
        target_names = ['target', 'class', 'label', 'survived', 'diagnosis', 'price', 'salary', 'quality']
        target_col = None
        lower_cols = [str(c).lower() for c in df.columns]
        
        for t in target_names:
            if t in lower_cols:
                target_col = df.columns[lower_cols.index(t)]
                break
        
        if not target_col:
            target_col = df.columns[-1]
            
        # task logic
        s = df[target_col].dropna()
        if pd.api.types.is_numeric_dtype(s) and s.nunique() > 15:
            task = 'regression'
        else:
            task = 'classification'
            
        return target_col, task

    def get_best_dataset(self, query: str) -> Dict:
        """
        1. Search HF, OpenML, Kaggle
        2. Rank
        3. Load and return df + metadata
        """
        hf_res = self.search_huggingface(query)
        openml_res = self.search_openml(query)
        kaggle_res = self.search_kaggle(query)
        
        all_ds = hf_res + openml_res + kaggle_res
        best_ds = self.rank_datasets(all_ds, query)
        
        if not best_ds:
            raise ValueError(f"No dataset found for query: '{query}'")
            
        logger.info(f"Best dataset selected: {best_ds['name']} from {best_ds['source']}")
        
        df = self.load_dataset_as_dataframe(best_ds)
        
        # Ensure sufficient rows and columns
        if len(df) < 50:
            raise ValueError("Dataset is too small (<50 rows)")
            
        numeric_cols = df.select_dtypes(include=[pd.api.types.is_numeric_dtype]).columns.tolist()
        if len(numeric_cols) == 0:
             raise ValueError("No numeric columns found in the dataset")
             
        target_col, task = self.deduce_target_and_task(df)
        features = [c for c in df.columns if c != target_col]
        
        return {
            "dataset": best_ds["name"],
            "source": best_ds["source"],
            "task": task,
            "target_col": target_col,
            "score": best_ds["_score"],
            "features": features,
            "df": df
        }
