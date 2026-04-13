import io
import os
import joblib
import logging
from PIL import Image

import torch
import torch.nn as nn
from torchvision import models, transforms

logger = logging.getLogger(__name__)
MODELS_DIR = "models"

def predict_image(model_id: str, image_bytes: bytes) -> dict:
    # 1. Load metadata
    artifact_path = os.path.join(MODELS_DIR, f"{model_id}.joblib")
    if not os.path.exists(artifact_path):
        raise FileNotFoundError(f"Model ID {model_id} not found.")

    metadata = joblib.load(artifact_path)
    if metadata.get("task") != "image_classification":
        raise ValueError("Model is not an image classification model.")

    n_classes = metadata["n_classes"]
    class_names = metadata["class_names"]
    weights_path = metadata["model_path"]

    # 2. Rebuild architecture
    model = models.mobilenet_v2()
    model.classifier = nn.Sequential(
        nn.Dropout(p=0.3, inplace=False),
        nn.Linear(model.last_channel, 256),
        nn.ReLU(),
        nn.Dropout(p=0.3),
        nn.Linear(256, n_classes)
    )
    
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model.load_state_dict(torch.load(weights_path, map_location=device))
    model = model.to(device)
    model.eval()

    # 3. Preprocess Image
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    
    preprocess = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
    ])
    
    input_tensor = preprocess(img)
    input_batch = input_tensor.unsqueeze(0).to(device)

    # 4. Predict
    with torch.no_grad():
        output = model(input_batch)
    
    probabilities = torch.nn.functional.softmax(output[0], dim=0)
    confidence, predicted_idx = torch.max(probabilities, 0)
    
    predicted_idx = predicted_idx.item()
    confidence = round(confidence.item() * 100, 2)
    predicted_class = class_names[predicted_idx]
    
    all_probs = {class_names[i]: round(probabilities[i].item() * 100, 2) for i in range(n_classes)}

    return {
        "prediction": predicted_class,
        "confidence": confidence,
        "all_probabilities": all_probs,
        "task_type": "image_classification"
    }
