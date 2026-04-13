import os
import uuid
import json
import logging
import asyncio
import pandas as pd
from typing import Dict, List, Optional, Any
from pydantic import BaseModel, ConfigDict

from services.dataset_search import (
    search_datasets, SearchResult, ScopeViolationError, SearchIntent
)
from services.dataset_fetcher import (
    fetch_top_datasets, FETCHERS, DatasetCard
)
from services.synthetic_generator import (
    design_schema, build_confirmation_payload, generate_dataset_sync,
    export_synthetic_dataset, DatasetSchema
)
from services.dataset_search import _call_llm, _clean_json_output

logger = logging.getLogger(__name__)

TEMP_ROOT = "/tmp/automl_datasets/"

# --- Models ---
class PipelineResult(BaseModel):
    mode: str  # "fetch", "extend", "synthesize"
    dataset_cards: Optional[List[dict]] = None
    requires_confirmation: bool = False
    pending_schema: Optional[dict] = None

class ImportResult(BaseModel):
    file_path: str
    health_summary: dict
    source: str
    identifier: str

class ChatHandoff(BaseModel):
    project_id: str
    dataset_path: str
    first_message: str
    suggested_queries: List[str]
    profile_summary: dict
    chat_session_id: str

# In-memory session tracking for GUI pause boundaries natively mapping IDs.
_PENDING_SCHEMAS: Dict[str, DatasetSchema] = {}
_LAST_INTENT: Dict[str, SearchIntent] = {}


# --- COMPONENT 1: Pipeline Orchestrator ---

async def run_discovery_pipeline(user_input: dict, project_id: str) -> PipelineResult:
    """Calculates dataset intent tree natively filtering against cold starts vs fetches."""
    try:
        raw_search = await search_datasets(user_input)
        search_result = SearchResult(**raw_search)
    except ScopeViolationError as e:
        raise
    except Exception as e:
        logger.error(f"Failed semantic extraction natively mapping string intent searches: {e}")
        raise ValueError("Invalid Search Architecture bounds.")

    _LAST_INTENT[project_id] = search_result.search_intent

    if search_result.search_intent.out_of_scope:
        raise ScopeViolationError("Text/NLP boundaries blocked strictly outside of AutoML V1 schema limitations.")

    high_conf = [c for c in search_result.candidate_datasets if c.confidence >= 0.6]

    if len(high_conf) >= 2:
        raw_cards = await fetch_top_datasets(search_result.model_dump())
        cards_list = raw_cards.get("dataset_cards", [])
        if cards_list:
            return PipelineResult(
                mode="fetch",
                dataset_cards=cards_list,
                requires_confirmation=False
            )

    raw_cards = await fetch_top_datasets(search_result.model_dump())
    cards = raw_cards.get("dataset_cards", [])
    
    if cards:
        card = DatasetCard(**cards[0])
        if card.estimated_rows >= 500:
            return PipelineResult(mode="fetch", dataset_cards=cards, requires_confirmation=False)
        else:
            schema = await design_schema(search_result.search_intent)
            _PENDING_SCHEMAS[project_id] = schema
            return PipelineResult(
                mode="extend",
                dataset_cards=cards,
                requires_confirmation=True,
                pending_schema=build_confirmation_payload(schema)
            )
            
    return await _trigger_cold_start(search_result.search_intent, project_id)


async def _trigger_cold_start(intent: SearchIntent, project_id: str) -> PipelineResult:
    schema = await design_schema(intent)
    _PENDING_SCHEMAS[project_id] = schema
    return PipelineResult(
        mode="synthesize",
        requires_confirmation=True,
        pending_schema=build_confirmation_payload(schema)
    )

# --- COMPONENT 2: Import Handler ---

async def import_dataset(identifier: str, source: str, project_id: str) -> ImportResult:
    """Pulls full original Kaggle zip sets aggressively into explicit CSV architectures locally."""
    loop = asyncio.get_running_loop()
    target_dir = os.path.join(TEMP_ROOT, project_id)
    os.makedirs(target_dir, exist_ok=True)
    out_file = os.path.join(target_dir, "dataset.csv")

    source = source.lower()
    df = None

    if source == "kaggle":
        import tempfile
        import shutil
        from kaggle.api.kaggle_api_extended import KaggleApi
        
        # 1. Clean identifier (Extract slug from URL if needed)
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

        try:
            api = KaggleApi()
            api.authenticate()
        except BaseException as e:
            logger.error(f"Kaggle authentication failed during import: {e}")
            raise ValueError(f"Kaggle credentials not configured. Ensure KAGGLE_USERNAME and KAGGLE_API_TOKEN are set in ml-service/.env")
        
        tmp = tempfile.mkdtemp()
        try:
            if is_competition:
                await loop.run_in_executor(None, lambda: api.competition_download_files(identifier, path=tmp, force=False))
                import zipfile
                for item in os.listdir(tmp):
                    if item.endswith(".zip"):
                        with zipfile.ZipFile(os.path.join(tmp, item), 'r') as zip_ref:
                            zip_ref.extractall(tmp)
            else:
                await loop.run_in_executor(None, lambda: api.dataset_download_files(identifier, path=tmp, unzip=True))

            
            csv_files = []
            for root_dir, _, files in os.walk(tmp):
                for f in files:
                    if f.endswith(".csv"):
                        csv_files.append(os.path.join(root_dir, f))
            
            if csv_files:
                target_csv = csv_files[0]
                for c in csv_files:
                    if "train" in c.lower() or "dataset" in c.lower():
                        target_csv = c
                        break
                
                df = await loop.run_in_executor(None, pd.read_csv, target_csv)
                await loop.run_in_executor(None, lambda: df.to_csv(out_file, index=False))
            else:
                raise ValueError("No viable CSV structural format mapped organically across API arrays natively.")
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

    elif source == "huggingface":
        # Clean HF identifier
        if "huggingface.co/datasets/" in identifier:
            identifier = identifier.split("/datasets/")[1].split("?")[0].rstrip("/")
            
        url = f"hf://datasets/{identifier}"
        df = await loop.run_in_executor(None, lambda: pd.read_parquet(url, engine="auto"))
        await loop.run_in_executor(None, lambda: df.to_csv(out_file, index=False))

    elif source == "synthetic":
        raise ValueError("Synthetic generation executes via streamed Confirm Route array.")

    else:
        raise ValueError("Unsupported backend framework source mapped.")

    return ImportResult(
        file_path=out_file,
        health_summary={
            "row_count": len(df),
            "col_count": len(df.columns),
            "missing_pct": float(df.isnull().mean().mean())
        },
        source=source,
        identifier=identifier
    )


# --- COMPONENT 3: Fetch-to-Chat Handoff ---

async def trigger_chat_handoff(import_result: ImportResult, project_id: str) -> ChatHandoff:
    """Seamlessly bridges analytical contexts natively pushing users proactively into interaction bounds."""
    loop = asyncio.get_running_loop()
    df = await loop.run_in_executor(None, pd.read_csv, import_result.file_path)

    intent = _LAST_INTENT.get(project_id)
    task = intent.inferred_task if intent else "Machine Learning"
    tgt = intent.inferred_target if intent else None

    # Profiler mapping natively evaluated bounds securely. 
    profile = {
        "target_col": tgt,
        "target_dtype": str(df[tgt].dtype) if tgt and tgt in df.columns else "unknown",
        "row_count": len(df),
        "col_count": len(df.columns),
        "top_missing_col": df.isnull().sum().idxmax() if df.isnull().sum().max() > 0 else "None",
        "class_distribution": df[tgt].value_counts().to_dict() if task == "Classification" and tgt in df.columns else None,
        "target_stats": df[tgt].describe().to_dict() if task == "Regression" and tgt in df.columns else None
    }

    # Proactive Intelligent Output Hook mappings internally 
    system_prompt = """You are the AutoML Studio data consultant.
A user just imported a dataset. Write ONE friendly, specific
opening message (2-3 sentences max) that:
- Names the dataset and confirms it loaded successfully
- States one specific, interesting fact about the target column
- Asks ONE actionable question to start exploration

Use the profile data provided. Be specific, not generic.
Never say "Great!" or "Awesome!". Sound like a knowledgeable colleague.

Also, return exactly 3 suggested_queries as a JSON list.
Return the entire payload AS JSON ONLY:
{
    "first_message": "string",
    "suggested_queries": ["query1", "query2", "query3"]
}
"""
    dataset_name = import_result.identifier.split("/")[-1]
    prompt_str = f"Dataset: {dataset_name}\nProfile: {json.dumps(profile)}"

    content = await _call_llm(system_prompt, prompt_str)
    
    try:
        parsed = json.loads(_clean_json_output(content))
        opener = parsed.get("first_message", "Your dataset successfully loaded!")
        queries = parsed.get("suggested_queries", ["What columns predict the target?", "Plot a correlation matrix.", "Check for missing values."])
    except Exception as e:
        logger.warning(f"Failed generating consultant opener naturally bridging loops: {e}")
        opener = f"Your dataset '{dataset_name}' natively loaded with {len(df)} rows. What would you like to explore next?"
        queries = ["Clean missing data.", "Show me feature distributions.", "Build a classification model."]

    sess_id = str(uuid.uuid4())

    return ChatHandoff(
        project_id=project_id,
        dataset_path=import_result.file_path,
        first_message=opener,
        suggested_queries=queries[:3],
        profile_summary=profile,
        chat_session_id=sess_id
    )
