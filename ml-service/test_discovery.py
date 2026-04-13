import sys
import os

# Add current dir to path
sys.path.append(os.getcwd())

from services.dataset_service import DatasetService
from trainer import _match_dataset_registry

def test_discovery(prompt):
    print(f"\n--- Testing Prompt: '{prompt}' ---")
    
    # 1. Test Dynamic Service
    print("Testing DatasetService.get_best_dataset()...")
    ds_service = DatasetService()
    try:
        res = ds_service.get_best_dataset(prompt)
        print(f"✅ Dynamic Success: {res['dataset']} from {res['source']}")
    except Exception as e:
        print(f"❌ Dynamic Failed: {e}")

    # 2. Test Registry Fallback
    print("Testing _match_dataset_registry()...")
    entry = _match_dataset_registry(prompt)
    print(f"✅ Registry Result: {entry['name']}")

if __name__ == "__main__":
    test_discovery("Predict house prices in California")
    test_discovery("Classify iris flowers")
    test_discovery("Titanic survival prediction")
    test_discovery("Something random that should not match")
