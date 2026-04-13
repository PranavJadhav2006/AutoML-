import os
from dotenv import load_dotenv

# Load environment variables before other imports that might depend on them
load_dotenv()

# --- Kaggle credential normalization ---
# The Kaggle SDK requires KAGGLE_USERNAME + KAGGLE_KEY.
# Our .env stores the token as KAGGLE_API_TOKEN, so we bridge the gap here
# BEFORE any kaggle import occurs.
_kaggle_token = os.getenv("KAGGLE_API_TOKEN") or os.getenv("KAGGLE_KEY", "")
_kaggle_user  = os.getenv("KAGGLE_USERNAME", "")
if _kaggle_token:
    os.environ["KAGGLE_KEY"] = _kaggle_token
if not _kaggle_user:
    os.environ.setdefault("KAGGLE_USERNAME", "dummy")
if not _kaggle_token:
    os.environ.setdefault("KAGGLE_KEY", "dummy")

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from trainer import auto_train, retrain_from_artifact
from predictor import predict
from chat_engine import chat_with_dataset
from services.dataset_service import DatasetService
from routes.dataset_routes import dataset_router

app = FastAPI(title="AutoML Studio ML Service", version="1.0.0")
app.include_router(dataset_router)
dataset_service = DatasetService()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class TrainRequest(BaseModel):
    problem_description: str


class PredictRequest(BaseModel):
    model_id: str
    features: dict


class ChatRequest(BaseModel):
    model_id: str
    question: str


class RetrainRequest(BaseModel):
    model_id: str


@app.get("/health")
def health():
    return {"status": "ok", "service": "AutoML Studio ML Service"}


@app.post("/auto-train")
async def auto_train_endpoint(req: TrainRequest):
    """
    Accepts a plain-English problem description, finds the best matching
    dataset, trains multiple ML models, selects the best one, saves it,
    and returns training results.
    """
    result = auto_train(req.problem_description)
    return result


@app.post("/predict")
async def predict_endpoint(req: PredictRequest):
    """
    Loads a previously saved model and returns a prediction for the
    provided feature values.
    """
    result = predict(req.model_id, req.features)
    return result


@app.post("/chat")
async def chat_endpoint(req: ChatRequest):
    """
    Answers natural language questions about the dataset associated
    with the given model_id using pandas analysis.
    """
    result = chat_with_dataset(req.model_id, req.question)
    return result


@app.post("/search-datasets")
async def search_datasets_endpoint(req: TrainRequest):
    """
    Searches multiple sources (HF, OpenML, Kaggle) for datasets 
    matching the problem description and returns a ranked list.
    """
    hf = dataset_service.search_huggingface(req.problem_description)
    oml = dataset_service.search_openml(req.problem_description)
    kag = dataset_service.search_kaggle(req.problem_description)
    
    all_ds = hf + oml + kag
    # Use the existing ranking logic to add scores
    dataset_service.rank_datasets(all_ds, req.problem_description)
    
    # Sort by score descending
    sorted_ds = sorted(all_ds, key=lambda x: x.get("_score", 0), reverse=True)
    
    return {"datasets": sorted_ds}


@app.post("/retrain")
async def retrain_endpoint(req: RetrainRequest):
    """
    Retrains the model utilizing the dataset tied to the model ID, which
    may have been modified via the chat interaction pipeline.
    """
    result = retrain_from_artifact(req.model_id)
    return result
