from datasets import load_dataset
import sys

datasets_to_test = [
    "scikit-learn/california-housing",
    "scikit-learn/iris",
    "scikit-learn/wine",
    "scikit-learn/heart-disease"
]

for ds_name in datasets_to_test:
    try:
        print(f"Testing {ds_name}...")
        ds = load_dataset(ds_name)
        print(f"Successfully loaded {ds_name}. Splits: {list(ds.keys())}")
    except Exception as e:
        print(f"FAILED to load {ds_name}: {str(e)}")
