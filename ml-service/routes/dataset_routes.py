from fastapi import APIRouter, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Dict, Any, Optional
import json
import asyncio

from services.dataset_pipeline import (
    run_discovery_pipeline, import_dataset, trigger_chat_handoff, 
    _PENDING_SCHEMAS, ImportResult
)
from services.synthetic_generator import generate_dataset_sync, export_synthetic_dataset, DatasetSchema

dataset_router = APIRouter(prefix="/api/dataset", tags=["Dataset Search Pipeline"])

class DiscoverBody(BaseModel):
    user_input: Dict[str, Any]
    project_id: str

class ImportBody(BaseModel):
    project_id: str
    identifier: str
    source: str

class SchemaConfirmBody(BaseModel):
    project_id: str
    confirmed_schema: dict

    
@dataset_router.post("/discover")
async def discover_datasets(payload: DiscoverBody):
    """Chunks 1-2 Execution Node: Spits Frontend Pydantic API Responses."""
    try:
        res = await run_discovery_pipeline(payload.user_input, payload.project_id)
        return res.model_dump()
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@dataset_router.post("/import")
async def import_real_dataset(payload: ImportBody):
    """Fetches non-synthetic datasets specifically caching into bounded memory limits."""
    try:
        import_res = await import_dataset(payload.identifier, payload.source, payload.project_id)
        handoff = await trigger_chat_handoff(import_res, payload.project_id)
        return {
            "import_result": dict(import_res),
            "chat_handoff": handoff.model_dump()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Import failed evaluating bounds: {e}")

class DatasetChatBody(BaseModel):
    dataset_path: str
    question: str
    session_id: Optional[str] = None

@dataset_router.post("/chat")
async def chat_with_imported_dataset(payload: DatasetChatBody):
    """Answers natural-language questions about an imported dataset directly from its CSV path."""
    import pandas as pd
    import re
    
    try:
        df = pd.read_csv(payload.dataset_path)
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Could not load dataset: {e}")

    q = payload.question.lower().strip()
    columns = list(df.columns)

    def find_col(question, cols):
        for c in cols:
            if c.lower() in question:
                return c
        return None

    # Row / column count
    if any(kw in q for kw in ["how many rows", "row count", "number of rows", "size", "shape"]):
        return {"answer": f"The dataset has **{len(df):,} rows** and **{len(df.columns)} columns**.", "data": None}

    # Feature names
    if any(kw in q for kw in ["feature", "column", "fields", "variables", "attributes"]):
        return {"answer": f"The dataset has **{len(columns)} columns**: {', '.join(f'`{c}`' for c in columns)}", "data": {"columns": columns}}

    # Describe
    if any(kw in q for kw in ["describe", "statistics", "summary", "overview", "stats"]):
        desc = df.describe(include="all").round(4)
        return {"answer": "Here is a statistical summary of the dataset:", "data": desc.to_dict()}

    # Missing values
    if any(kw in q for kw in ["missing", "null", "nan", "empty"]):
        nulls = df.isnull().sum()
        missing = nulls[nulls > 0].to_dict()
        if not missing:
            return {"answer": "✅ No missing values found in this dataset.", "data": None}
        return {"answer": f"Found missing values in **{len(missing)} column(s)**:", "data": missing}

    # Class distribution
    if any(kw in q for kw in ["class distribution", "target distribution", "label distribution", "class balance", "categories"]):
        col = find_col(q, columns) or columns[-1]
        dist = df[col].value_counts().to_dict()
        return {"answer": f"Value distribution for `{col}`:", "data": {str(k): v for k, v in dist.items()}}

    # Correlation
    if "correlation" in q or "corr" in q:
        num_cols = df.select_dtypes(include="number").columns.tolist()
        mentioned = [c for c in num_cols if c.lower() in q]
        if len(mentioned) >= 2:
            val = df[mentioned[:2]].corr().iloc[0, 1]
            strength = "strong" if abs(val) > 0.7 else "moderate" if abs(val) > 0.4 else "weak"
            return {"answer": f"Correlation between `{mentioned[0]}` and `{mentioned[1]}`: **{val:.4f}** ({strength}).", "data": None}
        corr = df[num_cols].corr().round(4)
        return {"answer": "Full correlation matrix (numeric columns):", "data": corr.to_dict()}

    # Mean/max/min of a column
    for kw, op in [("mean","mean"),("average","mean"),("max","max"),("maximum","max"),("min","min"),("minimum","min"),("median","median"),("std","std")]:
        if kw in q:
            col = find_col(q, columns)
            if col and pd.api.types.is_numeric_dtype(df[col]):
                val = getattr(df[col], op)()
                return {"answer": f"The **{op}** of `{col}` is **{val:.4f}**.", "data": None}

    # What is this dataset
    if any(kw in q for kw in ["what is this", "what dataset", "about"]):
        return {"answer": f"This dataset has **{len(df):,} rows** and **{len(columns)} columns**: {', '.join(f'`{c}`' for c in columns[:8])}{'...' if len(columns)>8 else ''}.", "data": None}

    # Fallback
    return {
        "answer": (
            "I can answer questions about this dataset such as:\n"
            "- Row/column count\n- Column names\n- Missing values\n"
            "- Statistical summary\n- Correlation between columns\n"
            "- Mean/max/min of a column\n- Value distribution\n\n"
            "Try: *\"How many rows?\"* or *\"Describe the data\"*"
        ),
        "data": None
    }


@dataset_router.post("/confirm-schema")
async def confirm_schema_and_generate(payload: SchemaConfirmBody):
    """Chunk 3 SSE Generator evaluating constraints strictly. Uses StreamingResponse mimicking node event-streams."""
    project_id = payload.project_id
    
    if project_id not in _PENDING_SCHEMAS:
        raise HTTPException(status_code=404, detail="Session expired or invalid schema payload.")

    # Load User's modified Pydantic limits 
    try:
        confirmed_schema = DatasetSchema(**payload.confirmed_schema)
    except Exception as e:
        raise HTTPException(status_code=400, detail="Schema Validation explicitly failed. Frontend sent bounds incorrectly!")
        
    async def sse_generator():
        # Using sleep arrays naturally to push frontend visual chunks preventing rapid 1s flashes cleanly natively. 
        yield 'data: {"step": "designing_schema", "pct": 10}\n\n'
        await asyncio.sleep(0.5)
        
        yield 'data: {"step": "building_seed", "pct": 25}\n\n'
        
        # Loop run evaluation bound executing GaussianCopula thread pools safely
        loop = asyncio.get_running_loop()
        
        try:
            yield 'data: {"step": "fitting_model", "pct": 50}\n\n'
            # Simulating large fit process logic natively mapping bounds safely 
            df, quality = await loop.run_in_executor(None, generate_dataset_sync, confirmed_schema, "full", None)
            
            yield 'data: {"step": "enforcing_rules", "pct": 90}\n\n'
            await asyncio.sleep(0.5) # Provide frontend UI breath natively
            
            # Export payload locally bounded
            res = await export_synthetic_dataset(df, confirmed_schema, "full", quality)
            
            # Generate chat handoff naturally bypassing the import_dataset route logic
            import_obj = ImportResult(
                file_path=res.file_path, 
                health_summary={"row_count": res.row_count, "col_count": res.column_count},
                source="synthetic",
                identifier="synthetic"
            )
            handoff = await trigger_chat_handoff(import_obj, project_id)
            
            final_data = {
                "step": "complete",
                "pct": 100,
                "file_path": res.file_path,
                "chat_handoff": handoff.model_dump()
            }
            yield f'data: {json.dumps(final_data)}\n\n'
            
        except Exception as e:
            yield f'data: {{"step": "error", "error": "{str(e)}"}}\n\n'
            
    return StreamingResponse(sse_generator(), media_type="text/event-stream")
