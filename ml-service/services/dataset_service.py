import os
import subprocess
import logging
from typing import Dict, Any, List, Tuple
import pandas as pd
from datasets import load_dataset, Image, ClassLabel
import openml
from dotenv import load_dotenv
import re

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class DatasetService:
    def __init__(self):
        self.stopwords = {"i", "want", "to", "train", "a", "an", "model", "that", "can", "detect", "predict", "classify", "for", "the", "and", "or", "images", "dataset", "data", "using", "on", "with"}

    def _extract_keywords(self, query: str) -> str:
        # Remove punctuation
        clean_query = re.sub(r'[^\w\s]', '', query).lower()
        words = clean_query.split()
        keywords = [w for w in words if w not in self.stopwords]
        return " ".join(keywords) if keywords else clean_query

    def search_huggingface(self, query: str) -> List[Dict]:
        search_query = self._extract_keywords(query)
        logger.info(f"Searching Hugging Face for: '{search_query}' (Original: '{query}')")
        results = []
        try:
            from huggingface_hub import HfApi
            api = HfApi()
            
            # Check if query implies image classification
            q_lower = query.lower()
            is_image_query = any(kw in q_lower for kw in ['image', 'picture', 'photo', 'vision', 'pixel', 'xray', 'mri'])
            filter_tag = 'task_categories:image-classification' if is_image_query else None
            
            datasets = api.list_datasets(search=search_query, filter=filter_tag, limit=10)
            for d in datasets:
                tags = getattr(d, 'tags', [])
                is_image = 'task_categories:image-classification' in tags if tags else is_image_query
                
                results.append({
                    "id": d.id,
                    "name": d.id.split('/')[-1],
                    "source": "huggingface",
                    "description": getattr(d, 'description', d.id),
                    "downloads": getattr(d, 'downloads', 0),
                    "is_image": is_image
                })
        except Exception as e:
            logger.warning(f"Hugging Face search failed: {e}")
        return results

    def search_openml(self, query: str) -> List[Dict]:
        search_query = self._extract_keywords(query)
        logger.info(f"Searching OpenML for: '{search_query}'")
        results = []
        try:
            datasets = openml.datasets.list_datasets(output_format='dataframe')
            if not datasets.empty:
                # filter by name
                # regex trick to allow matching multiple words independently
                pattern = '|'.join(search_query.split())
                matching = datasets[datasets['name'].str.contains(pattern, case=False, na=False)].head(10)
                for _, row in matching.iterrows():
                    results.append({
                        "id": str(row['did']),
                        "name": row['name'],
                        "source": "openml",
                        "description": row['name'],
                        "format": row.get('format', ''),
                        "downloads": row.get('NumberOfInstances', 0),
                        "is_image": False
                    })
        except Exception as e:
            logger.warning(f"OpenML search failed: {e}")
        return results

    def search_kaggle(self, query: str) -> List[Dict]:
        search_query = self._extract_keywords(query)
        logger.info(f"Searching Kaggle for: '{search_query}'")
        results = []
        try:
            import sys
            kaggle_bin = os.path.join(os.path.dirname(sys.executable), "kaggle")
            result = subprocess.run(
                [kaggle_bin, "datasets", "list", "-s", search_query, "--csv"],
                capture_output=True, text=True
            )
            if result.stdout:
                import csv, io
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
                        "downloads": 0,
                        "is_image": False
                    })
        except Exception as e:
            logger.warning(f"Kaggle search failed: {e}")
        return results

    def rank_datasets(self, datasets: List[Dict], query: str) -> Dict | None:
        if not datasets:
            return None
            
        best_score = 0
        best_ds = None
        query_lower = query.lower()
        is_image_query = any(kw in query_lower for kw in ['image', 'picture', 'photo', 'vision', 'pixel', 'xray', 'mri'])
        
        for ds in datasets:
            score = 0
            name = str(ds.get("name", "")).lower()
            desc = str(ds.get("description", "")).lower()
            
            # Direct keyword match
            if query_lower in name:
                score += 50
            
            for word in query_lower.split():
                if len(word) > 3 and word in name:
                    score += 10
                if len(word) > 3 and word in desc:
                    score += 5
                
            metrics = int(ds.get("downloads", 0))
            if metrics >= 1000:
                score += 15
            elif metrics > 0:
                score += 5
                
            if ds.get("source") == "kaggle":
                score += 10
                
            # If user asked for an image dataset, strongly penalize non-image datasets
            if is_image_query:
                if ds.get("is_image"):
                    score += 100
                else:
                    score -= 50
                    
            ds["_score"] = score
            if score > best_score:
                best_score = score
                best_ds = ds
                
        return best_ds

    def load_tabular_dataset(self, ds: Dict) -> pd.DataFrame:
        source = ds["source"]
        dataset_id = ds["id"]
        
        if source == "huggingface":
            hf_ds = load_dataset(dataset_id, split="train")
            return hf_ds.to_pandas()
            
        elif source == "openml":
            openml_ds = openml.datasets.get_dataset(dataset_id=int(dataset_id), download_data=True)
            X, y, _, _ = openml_ds.get_data(target=openml_ds.default_target_attribute, dataset_format="dataframe")
            df = X.copy()
            if openml_ds.default_target_attribute and type(y) == pd.Series:
                df[openml_ds.default_target_attribute] = y
            return df
            
        elif source == "kaggle":
            import tempfile, sys
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

    def load_image_dataset(self, ds: Dict) -> Dict:
        """
        Loads an image classification dataset from HuggingFace, caps it to save memory,
        and extracts PIL images and string labels.
        """
        dataset_id = ds["id"]
        logger.info(f"Loading HF Image dataset: {dataset_id}")
        
        # Load streaming=True to inspect features first without downloading massive datasets
        hf_ds_builder = load_dataset(dataset_id, split="train", streaming=True)
        features = hf_ds_builder.features
        
        image_col = None
        label_col = None
        
        for col_name, feature_type in features.items():
            if isinstance(feature_type, Image):
                image_col = col_name
            elif isinstance(feature_type, ClassLabel):
                label_col = col_name
                
        if not image_col:
            raise ValueError(f"Dataset {dataset_id} does not have an Image column.")
        if not label_col:
            # Fallback to look for typical label names if ClassLabel is not strictly used
            for col in ['label', 'labels', 'target', 'class']:
                if col in features:
                    label_col = col
                    break
            if not label_col:
                raise ValueError(f"Dataset {dataset_id} does not have a recognizable label column.")

        class_names = []
        if isinstance(features[label_col], ClassLabel):
            class_names = features[label_col].names
        
        # Load actual dataset (not streaming anymore) 
        # But we will slice it if it's too big to load fully into memory.
        # It's better to just load it with `load_dataset` and slice the dataset object.
        hf_ds = load_dataset(dataset_id, split="train")
        
        # Cap to max 1000 images total for system performance & memory safety
        max_samples = 1000
        if len(hf_ds) > max_samples:
            hf_ds = hf_ds.shuffle(seed=42).select(range(max_samples))
            
        pil_images = []
        labels = []
        
        for item in hf_ds:
            img = item[image_col]
            # Some datasets have paths instead of PIL images, or string modes. Let's ensure it's a PIL object.
            if hasattr(img, 'convert'): 
                pil_images.append(img.convert("RGB"))
                lbl = item[label_col]
                labels.append(lbl)
                
        # If class names weren't present in metadata, build them dynamically
        if not class_names:
            unique_lbls = sorted(list(set(labels)))
            class_names = [str(x) for x in unique_lbls]
            # Convert string labels to integer indices
            lbl_to_idx = {lbl: idx for idx, lbl in enumerate(unique_lbls)}
            labels = [lbl_to_idx[lbl] for lbl in labels]

        return {
            "image_data": pil_images,
            "labels": labels,
            "class_names": class_names,
            "image_col": image_col,
            "label_col": label_col
        }

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
            
        s = df[target_col].dropna()
        if pd.api.types.is_numeric_dtype(s.dtype) and s.nunique() > 15:
            task = 'regression'
        else:
            task = 'classification'
            
        return target_col, task

    def get_best_dataset(self, query: str) -> Dict:
        """
        1. Search HF, OpenML, Kaggle
        2. Rank
        3. Load and return appropriate format (tabular DF or dict of image lists)
        """
        hf_res = self.search_huggingface(query)
        openml_res = self.search_openml(query)
        kaggle_res = self.search_kaggle(query)
        
        all_ds = hf_res + openml_res + kaggle_res
        best_ds = self.rank_datasets(all_ds, query)
        
        if not best_ds:
            raise ValueError(f"No dataset found for query: '{query}'")
            
        logger.info(f"Best dataset selected: {best_ds['name']} from {best_ds['source']}")
        
        is_image = best_ds.get("is_image", False)
        
        if is_image:
            img_data = self.load_image_dataset(best_ds)
            
            if len(img_data["labels"]) < 20: # Saftey check
                raise ValueError("Image dataset is too small (<20 images)")
                
            return {
                "dataset": best_ds["name"],
                "source": best_ds["source"],
                "task": "image_classification",
                "target_col": img_data["label_col"],
                "score": best_ds["_score"],
                "features": ["image"],
                "image_data": img_data["image_data"],
                "labels": img_data["labels"],
                "class_names": img_data["class_names"]
            }
        else:
            df = self.load_tabular_dataset(best_ds)
            
            if len(df) < 50:
                raise ValueError("Tabular dataset is too small (<50 rows)")
                
            numeric_cols = df.select_dtypes(include=['number']).columns.tolist()
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
