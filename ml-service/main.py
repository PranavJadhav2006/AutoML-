from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from trainer import auto_train
from predictor import predict
from chat_engine import chat_with_dataset

app = FastAPI(title="AutoML Studio ML Service", version="1.0.0")

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
