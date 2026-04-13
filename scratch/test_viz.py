import os
import sys

# Add ml-service to path
sys.path.append(os.path.join(os.path.dirname(__file__), "..", "ml-service"))

from trainer import auto_train

if __name__ == "__main__":
    result = auto_train("iris flower")
    plots = result.get("plots", {})
    print(f"Generated plots: {list(plots.keys())}")
    for k, v in plots.items():
        print(f"{k} length: {len(v)}")
        
