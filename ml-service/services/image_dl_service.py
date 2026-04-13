import os
import uuid
import logging
import numpy as np
import joblib
from typing import Dict, Any, List
from sklearn.metrics import accuracy_score
from sklearn.model_selection import train_test_split
from PIL import Image

import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, Dataset
import torchvision.models as models
from torchvision import transforms

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

MODELS_DIR = "models"
os.makedirs(MODELS_DIR, exist_ok=True)

class PILDataset(Dataset):
    def __init__(self, images: List[Image.Image], labels: List[int], transform=None):
        self.images = images
        self.labels = labels
        self.transform = transform

    def __len__(self):
        return len(self.images)

    def __getitem__(self, idx):
        img = self.images[idx]
        label = self.labels[idx]
        if self.transform:
            img = self.transform(img)
        return img, label

class ImageDLService:
    @staticmethod
    def train_model(
        pil_images: List[Image.Image],
        labels: List[int],
        class_names: List[str],
        dataset_name: str,
        source: str
    ) -> Dict[str, Any]:
        """
        Trains a MobileNetV2 model for image classification using transfer learning.
        """
        n_rows = len(pil_images)
        n_classes = len(class_names)
        
        logger.info(f"[ImageDLService] Starting MobileNetV2 Transfer Learning for {n_rows} images and {n_classes} classes.")
        
        # ── Define Preprocessing Transforms ──
        # MobileNetV2 requires 224x224 and ImageNet normalization
        train_transform = transforms.Compose([
            transforms.Resize((224, 224)),
            transforms.RandomHorizontalFlip(),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
        ])
        
        val_transform = transforms.Compose([
            transforms.Resize((224, 224)),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
        ])

        # ── Split Data ──
        # If very small dataset, use 90/10 or no split
        test_size = 0.2 if n_rows > 50 else 0.1
        try:
            X_train, X_val, y_train, y_val = train_test_split(pil_images, labels, test_size=test_size, random_state=42, stratify=labels)
        except ValueError:
            # Fallback if stratify fails due to too few samples
            X_train, X_val, y_train, y_val = train_test_split(pil_images, labels, test_size=test_size, random_state=42)

        train_ds = PILDataset(X_train, y_train, transform=train_transform)
        val_ds = PILDataset(X_val, y_val, transform=val_transform)

        train_loader = DataLoader(train_ds, batch_size=32, shuffle=True)
        val_loader = DataLoader(val_ds, batch_size=32, shuffle=False)
        
        # ── Build Architecture (Transfer Learning) ──
        model = models.mobilenet_v2(weights=models.MobileNet_V2_Weights.IMAGENET1K_V1)
        
        # Freeze backbone
        for param in model.features.parameters():
            param.requires_grad = False
            
        # Replace classifier
        model.classifier = nn.Sequential(
            nn.Dropout(p=0.3, inplace=False),
            nn.Linear(model.last_channel, 256),
            nn.ReLU(),
            nn.Dropout(p=0.3),
            nn.Linear(256, n_classes)
        )
        
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        model = model.to(device)

        criterion = nn.CrossEntropyLoss()
        optimizer = optim.Adam(model.classifier.parameters(), lr=0.001)

        # ── Training Loop ──
        epochs = 5
        best_acc = 0.0
        best_state = None
        
        for epoch in range(epochs):
            model.train()
            running_loss = 0.0
            
            for inputs, targets in train_loader:
                inputs, targets = inputs.to(device), targets.to(device)
                optimizer.zero_grad()
                outputs = model(inputs)
                loss = criterion(outputs, targets)
                loss.backward()
                optimizer.step()
                running_loss += loss.item()
                
            # Validation
            model.eval()
            all_preds, all_targs = [], []
            with torch.no_grad():
                for inputs, targets in val_loader:
                    inputs, targets = inputs.to(device), targets.to(device)
                    outputs = model(inputs)
                    _, preds = torch.max(outputs, 1)
                    all_preds.extend(preds.cpu().numpy())
                    all_targs.extend(targets.cpu().numpy())
                    
            val_acc = accuracy_score(all_targs, all_preds)
            logger.info(f"Epoch {epoch+1}/{epochs} | Loss: {running_loss/len(train_loader):.4f} | Val Acc: {val_acc:.4f}")
            
            if val_acc >= best_acc:
                best_acc = val_acc
                best_state = {k: v.clone() for k, v in model.state_dict().items()}

        if best_state:
            model.load_state_dict(best_state)

        # ── Compute Final Accuracy on Entire Dataset (for reporting) ──
        model.eval()
        full_ds = PILDataset(pil_images, labels, transform=val_transform)
        full_loader = DataLoader(full_ds, batch_size=32, shuffle=False)
        all_preds, all_targs = [], []
        with torch.no_grad():
            for inputs, targets in full_loader:
                inputs, targets = inputs.to(device), targets.to(device)
                outputs = model(inputs)
                _, preds = torch.max(outputs, 1)
                all_preds.extend(preds.cpu().numpy())
                all_targs.extend(targets.cpu().numpy())
        final_score = float(accuracy_score(all_targs, all_preds))

        # ── Save Artifacts ──
        model_id = str(uuid.uuid4())[:8]
        artifact_path = os.path.join(MODELS_DIR, f"{model_id}.pth")
        torch.save(model.state_dict(), artifact_path)
        
        metadata = {
            "model_type": "Image_MobileNetV2",
            "model_path": artifact_path,
            "task": "image_classification",
            "n_classes": n_classes,
            "class_names": class_names,
            "dataset_name": dataset_name,
        }
        joblib.dump(metadata, os.path.join(MODELS_DIR, f"{model_id}.joblib"))
        logger.info(f"[ImageDLService] Saved artifact to {artifact_path}")

        # ── Format Response ──
        return {
            "model_id":       model_id,
            "dataset_name":   dataset_name,
            "dataset":        dataset_name,
            "source":         source,
            "task":           "classification",
            "task_type":      "image_classification",
            "best_model":     "MobileNetV2 (Transfer Learning)",
            "best_score":     round(final_score, 4),
            "metrics":        {
                "accuracy": round(final_score, 4),
                "epochs_run": epochs
            },
            "model_comparison": {"MobileNetV2": round(final_score, 4)},
            "preprocessing":  {
                "dataset_analysis": {
                    "size": n_rows, 
                    "num_cols": "Image", 
                    "cat_cols": 0, 
                    "is_scaled": True
                }, 
                "target_column": "Image Class",
                "message": f"Images resized 224x224 and normalized. {n_classes} classes identified."
            },
            "features":       ["image"],
            "feature_names":  ["image"],
            "dataset_rows":   n_rows,
            "dataset_cols":   2,
            "dataset_preview": [], 
            "plots":          {},
            "mode_selected":  "dl",
            "model_type":     "DL",
            "score":          round(final_score, 4),
            "note":           f"MobileNetV2 fine-tuned with frozen features. Output layer trained for {n_classes} classes."
        }
