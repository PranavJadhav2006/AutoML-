import os
import json
import logging
import asyncio
from typing import List, Optional, Tuple, Any, Dict
import httpx
from pydantic import BaseModel

logger = logging.getLogger(__name__)

# COMPONENT 6 - Config & Credentials
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

SEARCH_TIMEOUT_SECONDS = int(os.getenv("SEARCH_TIMEOUT", "30"))
MAX_CANDIDATES = 5
MIN_CONFIDENCE_THRESHOLD = 0.4

BLOCKED_MODALITIES = ["text", "nlp", "document"]
BLOCKED_TASKS = ["SentimentAnalysis", "TextClassification", 
                 "NamedEntityRecognition", "Translation"]

# Custom Exceptions
class ConfigurationError(Exception): pass
class SearchIntentError(Exception): pass
class ScopeViolationError(Exception): pass
class NoCandidatesFoundError(Exception): pass


# System Prompt Strings
INTENT_SYSTEM_PROMPT = """You are a machine learning dataset curator. Given a user's project
description, extract their ML intent as a JSON object. Be precise.

Required JSON Structure:
{
  "inferred_task": "Classification | Regression | ObjectDetection | Clustering | TimeSeriesForecasting | null",
  "inferred_target": "string (the column name or entity to predict) | null",
  "required_features": ["list", "of", "likely", "feature", "names"],
  "data_modality": "tabular | image | time_series | audio",
  "out_of_scope": boolean
}

Rules:
- If unsure about task or target, use null.
- required_features should list 3-6 likely column names or data types.
- If the task requires NLP/text classification, set out_of_scope=true.

Return ONLY valid JSON. No explanation. No markdown fences.
"""

EXTRACTION_SYSTEM_PROMPT = """Given this search result text, extract dataset references.
Return a JSON array of objects with fields:
  name, source (kaggle/huggingface/uci), identifier, confidence (0-1),
  reason (one sentence why it matches).

Rules for 'identifier':
- For Kaggle: use the slug (e.g., 'user/dataset-name' or 'competition-name').
- For HuggingFace: use the repo ID (e.g., 'user/repo-name').
- Avoid full URLs if possible, but if provided, the system will attempt to parse them.

Extract up to 5 candidates. Only include datasets that actually exist
based on the search results. Set confidence < 0.5 if uncertain.
Return ONLY the JSON array.
"""


# Schemas
class SearchInput(BaseModel):
    problem_description: str
    domain: str
    data_strategy: str
    target_variable: Optional[str] = None
    model_type: Optional[str] = None

class SearchIntent(BaseModel):
    inferred_task: Optional[str] = None
    inferred_target: Optional[str] = None
    required_features: List[str] = []
    data_modality: str = "tabular"
    out_of_scope: bool = False

class DatasetCandidate(BaseModel):
    name: str
    source: str
    identifier: str
    confidence: float
    reason: str

class SearchResult(BaseModel):
    search_intent: SearchIntent
    candidate_datasets: List[DatasetCandidate]
    fallback_required: bool
    search_query_used: str


# Helper methods
def _get_api_client_config() -> Tuple[str, str, str]:
    if GROQ_API_KEY:
        return "https://api.groq.com/openai/v1/chat/completions", GROQ_API_KEY, "llama-3.1-8b-instant"
    raise ConfigurationError("GROQ_API_KEY is not configured.")


def _clean_json_output(content: str) -> str:
    """Extracts raw JSON payloads by stripping common Markdown markdown fenced tags."""
    content = content.strip()
    if content.startswith("```json"):
        content = content.replace("```json", "", 1)
    if content.startswith("```"):
        content = content.replace("```", "", 1)
    if content.endswith("```"):
        content = content[:-3]
    return content.strip()


async def _call_llm(system_prompt: str, user_text: str) -> str:
    """Async generic executor pointing securely dynamically targeting Perplexity or Groq."""
    url, key, model = _get_api_client_config()
    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_text}
        ],
        "temperature": 0.1
    }
    
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(url, json=payload, headers=headers, timeout=15.0)
            resp.raise_for_status()
            data = resp.json()
            return data["choices"][0]["message"]["content"]
        except Exception as e:
            logger.error(f"LLM API Call framework error: {str(e)}")
            raise


# COMPONENT 1 - Intent Resolver
async def resolve_search_intent(user_input: Dict[str, Any]) -> dict:
    """Resolves arbitrary generic text into rigorous ML Search Intent JSON metadata bounds."""
    input_text = json.dumps(user_input)
    
    # Try 1
    content = await _call_llm(INTENT_SYSTEM_PROMPT, f"User Input:\n{input_text}")
    try:
        parsed = json.loads(_clean_json_output(content))
        return SearchIntent(**parsed).model_dump()
    except Exception as e:
        logger.warning(f"Failed to cleanly parse intent JSON on pass 1. Enforcing strictness... {e}")
    
    # Try 2
    strict_prompt = INTENT_SYSTEM_PROMPT + "\nCRITICAL NOTIFICATION: OUTPUT RAW DICT FORMAT ONLY."
    content = await _call_llm(strict_prompt, f"User Input:\n{input_text}")
    try:
        parsed = json.loads(_clean_json_output(content))
        return SearchIntent(**parsed).model_dump()
    except Exception as e:
        logger.error(f"Failed intent parsing on rigid pass 2: {e}")
        raise SearchIntentError("Could not reliably extract search intent JSON natively from user prompt sequence.") from e


# COMPONENT 2 - Dataset Name Resolver
def build_search_query(intent: dict) -> str:
    """Builds a Google/Perplexity optimized web search vector query."""
    task = intent.get("inferred_task") or "Machine Learning"
    target = intent.get("inferred_target") or "data"
    modality = intent.get("data_modality", "tabular")
    domain = intent.get("domain", "")
    problem = intent.get("problem_description", "")
    
    return (
        f"best {modality} dataset for {task.lower()} "
        f"predicting {target} in {domain}. Context explicit: {problem} "
        f"site:kaggle.com OR site:huggingface.co OR site:archive.ics.uci.edu"
    )

async def find_dataset_candidates(intent: dict) -> list:
    """Bounces the query to the web engine, then forces LLM to extract JSON citations natively."""
    query = build_search_query(intent)
    
    try:
        # Context Pull
        search_context = await _call_llm(
            system_prompt="You are a dataset researcher scanning index repositories. Provide raw factual lists of existing datasets hitting these search bounds matching Kaggle/HuggingFace domains exactly.",
            user_text=f"Find datasets matching: {query}"
        )
        
        # Extractor Chain
        extraction_content = await _call_llm(EXTRACTION_SYSTEM_PROMPT, f"Search Results:\n{search_context}")
        parsed_array = json.loads(_clean_json_output(extraction_content))
        
        # Validates through Pydantic loop
        candidates = [DatasetCandidate(**item).model_dump() for item in parsed_array]
        return candidates[:MAX_CANDIDATES]
    except Exception as e:
        logger.warning(f"Failed to organically extract dataset candidates from LLM response chain. {e}")
        return []


# COMPONENT 3 - Scope Guard
def validate_scope(intent: dict) -> tuple[bool, str]:
    """Ensures Text/NLP rules properly bounce unauthorized modalities back to the client immediately."""
    if intent.get("out_of_scope"):
        return False, (
            "Text/NLP datasets are not supported in V1. "
            "AutoML Studio currently supports tabular, image, "
            "and time series data."
        )
    
    modality = intent.get("data_modality", "").lower()
    if modality in BLOCKED_MODALITIES:
        return False, "Text datasets are explicitly out of bounds for V1 architecture."
    
    task = intent.get("inferred_task")
    if task and task in BLOCKED_TASKS:
        return False, f"The ML task '{task}' is currently blocked in V1."
        
    return True, ""


# COMPONENT 4 - Fallback Detector
def assess_fallback_need(candidates: list) -> bool:
    """Triggers dataset synthetics (Chunk 3) if genuine sources fail to resolve confidence bounding >60%."""
    high_confidence = [c for c in candidates if c.get("confidence", 0) >= 0.6]
    return len(high_confidence) < 2


# COMPONENT 5 - Main Entry Point
async def search_datasets(user_input: dict) -> dict:
    """Orchestrates comprehensive multi-chain dataset resolution logic securely inside a 30s timeout bounding array."""
    # Instantly validates environment flags rather than letting LLM wrappers crash halfway asynchronously
    try:
        _get_api_client_config()
    except ConfigurationError:
        logger.critical("Backend Configuration Error. Missing API keys.")
        raise
        
    try:
        async with asyncio.timeout(SEARCH_TIMEOUT_SECONDS):
            # Stage 1
            intent = await resolve_search_intent(user_input)
            
            # Guard verification
            is_valid, reason = validate_scope(intent)
            if not is_valid:
                raise ScopeViolationError(reason)
                
            # Synthesize domain mappings securely 
            search_args = {**intent, "domain": user_input.get("domain", "")}
            
            # Stage 2
            candidates = await find_dataset_candidates(search_args)
            
            # Stage 3
            fallback = assess_fallback_need(candidates)
            query_used = build_search_query(search_args)
            
            result = SearchResult(
                search_intent=intent,
                candidate_datasets=candidates,
                fallback_required=fallback,
                search_query_used=query_used
            )
            
            return result.model_dump()
            
    except asyncio.TimeoutError:
        logger.error(f"Task globally timed out terminating processing after {SEARCH_TIMEOUT_SECONDS}s window.")
        raise
