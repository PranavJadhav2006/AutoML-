"""
SETUP.md NOTE:
This module leverages internal official API client SDKs.
- Kaggle Dataset evaluation REQUIRES `~/.kaggle/kaggle.json` credentials fully initialized in your environment.
- Hugging Face relies on the public domain endpoint limits, so it uses 0.5s delays to avoid temporary blacklists.

Required explicit env path handling might be required depending on CI/CD configuration.
"""
import os
import shutil
import tempfile
import logging
import asyncio
from typing import List, Dict, Tuple, Any
from concurrent.futures import ThreadPoolExecutor

import pandas as pd
from pydantic import BaseModel
from huggingface_hub import HfApi

# Lazy load sentence-transformers via a singleton block efficiently
try:
    from sentence_transformers import SentenceTransformer, util
    _ST_MODEL = SentenceTransformer("all-MiniLM-L6-v2")
except ImportError:
    import logging
    logging.getLogger(__name__).warning("sentence-transformers not installed. Cosine scoring constrained.")
    _ST_MODEL = None

logger = logging.getLogger(__name__)

# Constants
MAX_RECOMMENDED_BYTES = 1_073_741_824  # 1 GB
COMMERCIAL_LICENSES = [
    "CC0: Public Domain", "CC BY 4.0",
    "CC BY-SA 4.0", "Apache 2.0", "MIT",
    "Creative Commons Attribution 4.0", "gpl", "agpl"
]

class DatasetCard(BaseModel):
    name: str
    source: str
    identifier: str
    description: str
    relevance_score: float        # 0.0-5.0
    health_score: float           # 0.0-1.0
    health_flags: List[str]
    license_name: str
    commercial_use_allowed: bool
class DatasetCard(BaseModel):
    name: str
    source: str
    identifier: str
    description: str
    relevance_score: float        # 0.0-5.0
    health_score: float           # 0.0-1.0
    health_flags: List[str]
    license_name: str
    commercial_use_allowed: bool
    size_bytes: int
    size_alert: bool              # True if > 1GB
    estimated_rows: int
    composite_score: float
    import_ready: bool            # True if composite > 0.6
    preview_url: str              # direct link to dataset page
    downloads_metric: int = 0
    tags: List[str] = []


class DatasetScores(BaseModel):
    relevance_score: float
    health_score: float
    health_flags: List[str]
    license_score: float
    size_score: float
    size_alert: bool
    composite_score: float

class RawDatasetMeta(BaseModel):
    title: str
    description: str
    tags: List[str]
    size_bytes: int
    license_name: str
    downloads_metric: int
    preview_url: str
    estimated_rows: int
    download_url_or_id: str  # id for kaggle to download logic


def parse_kaggle_size(size_str: Any) -> int:
    """Converts Kaggle size strings (e.g., '22KB', '1MB') to bytes."""
    if isinstance(size_str, int): return size_str
    if not isinstance(size_str, str): return 0
    
    size_str = size_str.upper().strip()
    try:
        if 'GB' in size_str: return int(float(size_str.replace('GB', '')) * 1024 * 1024 * 1024)
        if 'MB' in size_str: return int(float(size_str.replace('MB', '')) * 1024 * 1024)
        if 'KB' in size_str: return int(float(size_str.replace('KB', '')) * 1024)
        return int(float(size_str))
    except:
        return 0

async def fetch_from_kaggle(identifier: str) -> RawDatasetMeta:
    """Uses official Kaggle Python SDK bounds. Handles both datasets and competitions."""
    try:
        from kaggle.api.kaggle_api_extended import KaggleApi
        api = KaggleApi()
        api.authenticate()
    except BaseException as e:
        logger.warning(f"Kaggle API authentication failed: {e}")
        raise ValueError("Kaggle not configured")

    # Clean identifier
    is_competition = False
    if "kaggle.com/" in identifier:
        if "/datasets/" in identifier:
            identifier = identifier.split("/datasets/")[1].split("?")[0].rstrip("/")
        elif "/competitions/" in identifier:
            identifier = identifier.split("/competitions/")[1].split("/")[0]
            is_competition = True
        elif "/c/" in identifier:
            identifier = identifier.split("/c/")[1].split("/")[0]
            is_competition = True

    loop = asyncio.get_running_loop()
    try:
        if is_competition:
            res_list = await loop.run_in_executor(None, lambda: api.competitions_list(search=identifier))
            meta = next((m for m in res_list if str(getattr(m, 'ref', '')).lower() == identifier.lower()), res_list[0] if res_list else None)
            if not meta: raise ValueError("Competition completely mapped out of bounds.")
            
            return RawDatasetMeta(
                title=getattr(meta, 'title', identifier),
                description=getattr(meta, 'description', ""),
                tags=[], 
                size_bytes=0,
                license_name="Kaggle Competition License",
                downloads_metric=0,
                preview_url=f"https://kaggle.com/competitions/{getattr(meta, 'ref', identifier)}",
                estimated_rows=0,
                download_url_or_id=getattr(meta, 'ref', identifier)
            )
        else:
            # Datasets
            res_list = await loop.run_in_executor(None, lambda: api.dataset_list(search=identifier))
            meta = next((m for m in res_list if str(getattr(m, 'ref', '')).lower() == identifier.lower()), res_list[0] if res_list else None)
            
            # Smart Fallback parsing organically mapping physical structures when LLM hallucinates 
            if not meta and "/" in identifier:
                alt = identifier.split("/")[-1].replace("-", " ")
                res_list = await loop.run_in_executor(None, lambda: api.dataset_list(search=alt))
                meta = res_list[0] if res_list else None
                
            if not meta: raise ValueError("Dataset securely omitted or missing on Kaggle structurally.")
            
            raw_size = getattr(meta, 'size', getattr(meta, 'totalBytes', 0))

            return RawDatasetMeta(
                title=getattr(meta, 'title', identifier),
                description=getattr(meta, 'subtitle', "") or "",
                tags=[tag.name for tag in getattr(meta, 'tags', [])] if hasattr(meta, 'tags') else [],
                size_bytes=parse_kaggle_size(raw_size),
                license_name=getattr(meta, 'licenseName', "Unknown"),
                downloads_metric=getattr(meta, 'downloadCount', 0),
                preview_url=f"https://kaggle.com/datasets/{getattr(meta, 'ref', identifier)}",
                estimated_rows=0, 
                download_url_or_id=getattr(meta, 'ref', identifier)
            )
    except Exception as e:
        logger.error(f"Failed to fetch metadata from Kaggle for {identifier}: {e}")
        raise

async def fetch_from_huggingface(identifier: str) -> RawDatasetMeta:
    """Extracts HF specific tagging params matching requirements securely."""
    await asyncio.sleep(0.5) 
    if "huggingface.co/datasets/" in identifier:
        identifier = identifier.split("/datasets/")[1].split("?")[0].rstrip("/")
    
    api = HfApi()
    loop = asyncio.get_running_loop()
    
    def internal_hf_fetch(id_str):
        try:
            return api.dataset_info(id_str)
        except Exception as e:
            fallback = list(api.list_datasets(search=id_str, limit=3))
            if not fallback and "/" in id_str:
                alt = id_str.split("/")[-1].replace("-", " ")
                fallback = list(api.list_datasets(search=alt, limit=3))
            
            if fallback:
                return api.dataset_info(fallback[0].id)
            raise ValueError("Repository natively rejected organically mapped searches.")
            
    try:
        meta = await loop.run_in_executor(None, internal_hf_fetch, identifier)
        
        parsed_rows = 0
        card_data = getattr(meta, "cardData", {}) or {}
        size_cats = card_data.get("size_categories", [])
        
        if size_cats:
            cat = size_cats[0]
            if "1K<n<10K" in cat: parsed_rows = 5000
            elif "10K<n<100K" in cat: parsed_rows = 55000
            elif "100K<n<1M" in cat: parsed_rows = 500000
            elif "1M<n<10M" in cat: parsed_rows = 5000000
        
        tags = meta.tags or []
        license_str = "Unknown"
        for t in tags:
            if t.startswith("license:"): license_str = t.split(":", 1)[1]
        
        # Calculate size from siblings safely mapping None bounds organically.
        total_size = sum((getattr(s, 'size', None) or 0) for s in getattr(meta, 'siblings', []) or [])

        return RawDatasetMeta(
            title=getattr(meta, 'id', identifier),
            description=card_data.get("dataset_info", "") or "",
            tags=tags,
            size_bytes=total_size, 
            license_name=license_str,
            downloads_metric=hasattr(meta, 'downloads') and meta.downloads or 0,
            preview_url=f"https://huggingface.co/datasets/{getattr(meta, 'id', identifier)}",
            estimated_rows=parsed_rows,
            download_url_or_id=getattr(meta, 'id', identifier)
        )
    except Exception as e:
        logger.error(f"Failed to fetch metadata from HF for {identifier}: {e}")
        raise

async def fetch_from_uci(identifier: str) -> RawDatasetMeta:
    raise NotImplementedError("UCI not strictly implemented for full 4-axis analysis yet.")

FETCHERS = {
    "kaggle": fetch_from_kaggle,
    "huggingface": fetch_from_huggingface,
    "uci": fetch_from_uci
}

# --- Component 4: Four-Axis Scorer ---

def _sync_cosine_relevance(user_intent_text: str, dataset_text: str) -> float:
    if not _ST_MODEL: return 3.0 
    embeddings = _ST_MODEL.encode([user_intent_text, dataset_text], convert_to_tensor=True)
    score = util.pytorch_cos_sim(embeddings[0], embeddings[1]).item()
    return max(0.0, score) * 5.0 

def _sync_health_scoring_kaggle(identifier: str, target: str) -> Tuple[float, List[str]]:
    """Strictly downloads Kaggle zip securely bounded within tmp context."""
    try:
        from kaggle.api.kaggle_api_extended import KaggleApi
        api = KaggleApi()
        api.authenticate()
    except BaseException as e:
        logger.warning(f"Health scoring Kaggle auth failed: {e}")
        return 0.5, ["Kaggle auth failed, skipping health check."]
    
    tmp_path = tempfile.mkdtemp()
    try:
        api.dataset_download_files(identifier, path=tmp_path, unzip=True)
        csv_files = [f for f in os.listdir(tmp_path) if f.endswith(".csv")]
        if not csv_files:
            return 0.5, ["No valid CSV found natively for standard evaluation scoring."]
        
        target_path = os.path.join(tmp_path, csv_files[0])
        df = pd.read_csv(target_path, nrows=500)
    except Exception as e:
        logger.warning(f"Health scoring download failed on {identifier}: {e}")
        return 0.5, [f"Could not parse physical constraints natively: {e}"]
    finally:
        shutil.rmtree(tmp_path, ignore_errors=True)

    return _compute_health_from_df(df, target)
    
def _sync_health_scoring_hf(identifier: str, target: str) -> Tuple[float, List[str]]:
    try:
        url = f"hf://datasets/{identifier}"
        df = pd.read_parquet(url, engine='auto')
        df = df.head(500)
    except Exception as e:
        logger.warning(f"HF Parquet streaming health check failed for {identifier}: {e}")
        return 0.5, ["Failed structured health ingestion check via streaming bindings."]
    return _compute_health_from_df(df, target)

def _compute_health_from_df(df: pd.DataFrame, target_col: str) -> Tuple[float, List[str]]:
    flags = []
    
    missing_ratio = df.isnull().mean().mean()
    if missing_ratio > 0.2:
        flags.append(f"High missing values overall: {missing_ratio:.0%} metrics average.")
        
    dup_ratio = df.duplicated().mean()
    if dup_ratio > 0.1:
        flags.append(f"Duplicate ratio detected mapping: {dup_ratio:.0%}.")
        
    imbalance_score = 0
    if target_col and target_col in df.columns:
        counts = df[target_col].value_counts(normalize=True)
        imbalance_score = counts.max()
        if imbalance_score > 0.8:
            flags.append(f"Class imbalance detected: {imbalance_score:.0%} majority mapping.")
            
    health_score = max(0.0, 1.0 - (0.5 * missing_ratio + 0.3 * imbalance_score + 0.2 * dup_ratio))
    if not flags: flags.append("Dataset structure looks comprehensively robust.")
    
    return float(health_score), flags
    

async def score_dataset(raw_meta: RawDatasetMeta, source: str, search_intent: object) -> DatasetScores:
    loop = asyncio.get_running_loop()
    
    # Relevance 
    task_name = search_intent.inferred_task or ""
    tgt = search_intent.inferred_target or ""
    feats = " ".join(search_intent.required_features)
    intent_desc = f"{task_name} predicting {tgt}. Features: {feats}"
    dataset_desc = f"{raw_meta.title} {raw_meta.description} {' '.join(raw_meta.tags)}"
    
    rel_score = await loop.run_in_executor(None, _sync_cosine_relevance, intent_desc, dataset_desc)
    
    # Health 
    target = search_intent.inferred_target or ""
    if source == "kaggle":
        health_score, health_flags = await loop.run_in_executor(None, _sync_health_scoring_kaggle, raw_meta.download_url_or_id, target)
    elif source == "huggingface":
        health_score, health_flags = await loop.run_in_executor(None, _sync_health_scoring_hf, raw_meta.download_url_or_id, target)
    else:
        health_score, health_flags = 0.5, ["Unsupported health protocol."]
        
    # License 
    comm_use = any((c.lower() in raw_meta.license_name.lower()) for c in COMMERCIAL_LICENSES)
    lic_score = 1.0 if comm_use else 0.3
    if "unknown" in raw_meta.license_name.lower(): lic_score = 0.5
    
    # Size 
    size_alert = raw_meta.size_bytes > MAX_RECOMMENDED_BYTES
    size_score = max(0.0, 1.0 - (raw_meta.size_bytes / MAX_RECOMMENDED_BYTES) if raw_meta.size_bytes else 1.0)
    
    # Composite Score Generation Constraints mapped natively:
    composite = (0.45 * (rel_score/5.0)) + (0.30 * health_score) + (0.15 * lic_score) + (0.10 * size_score)
    
    return DatasetScores(
        relevance_score=rel_score,
        health_score=health_score,
        health_flags=health_flags,
        license_score=lic_score,
        size_score=size_score,
        size_alert=size_alert,
        composite_score=composite
    )


def build_dataset_card(meta: RawDatasetMeta, scores: DatasetScores, source: str) -> DatasetCard:
    comm_use = any((c.lower() in meta.license_name.lower()) for c in COMMERCIAL_LICENSES)
    return DatasetCard(
        name=meta.title,
        source=source,
        identifier=meta.download_url_or_id,
        description=meta.description[:300] + ("..." if len(meta.description)>300 else ""),
        relevance_score=scores.relevance_score,
        health_score=scores.health_score,
        health_flags=scores.health_flags,
        license_name=meta.license_name,
        commercial_use_allowed=comm_use,
        size_bytes=meta.size_bytes,
        size_alert=scores.size_alert,
        estimated_rows=meta.estimated_rows,
        composite_score=scores.composite_score,
        import_ready=scores.composite_score > 0.6,
        preview_url=meta.preview_url,
        downloads_metric=meta.downloads_metric,
        tags=meta.tags[:3]
    )

# --- Component 6: Main Entry Point ---

async def fetch_top_datasets(search_result: Dict) -> Dict:
    """Orchestrates candidate routing, threaded loop handling natively mapping top 3 outputs strictly."""
    from services.dataset_search import SearchResult
    
    # Validate mapping parameters logically
    try:
        sr = SearchResult(**search_result)
    except Exception as e:
        logger.error(f"Invalid format mapped: {e}")
        return {"error": "Invalid dict object format generated.", "dataset_cards": []}

    final_cards = []
    
    for candidate in sr.candidate_datasets:
        source = candidate.source.lower()
        if source not in FETCHERS:
            logger.warning(f"Unknown source wrapper framework mapping fallback logic: {source}.")
            continue
            
        fetcher_func = FETCHERS[source]
        try:
            raw_meta = await fetcher_func(candidate.identifier)
            scores = await score_dataset(raw_meta, source, sr.search_intent)
            card = build_dataset_card(raw_meta, scores, source)
            final_cards.append(card)
        except Exception as e:
            logger.warning(f"Failed handling pipeline fetch extraction candidate {candidate.identifier}: {e}")
            pass
            
    # Sort rigorously and bind out the payload 
    final_cards.sort(key=lambda x: x.composite_score, reverse=True)
    top_3 = final_cards[:3]
    
    high_score_cards = [c for c in top_3 if c.composite_score > 0.5]
    fallback_required = len(high_score_cards) < 2
    
    return {
        "dataset_cards": [c.model_dump() for c in top_3],
        "fallback_required": fallback_required,
        "search_query_used": sr.search_query_used
    }
