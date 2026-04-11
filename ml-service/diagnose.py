import sys
import pandas as pd
import numpy as np
import sklearn
from sklearn.datasets import load_iris, fetch_california_housing
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score

def test_iris():
    try:
        print("Testing Iris...")
        data = load_iris()
        df = pd.DataFrame(data.data, columns=data.feature_names)
        df['target'] = data.target
        X = df.iloc[:, :-1]
        y = df.iloc[:, -1]
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
        model = RandomForestClassifier(n_estimators=10)
        model.fit(X_train, y_train)
        score = accuracy_score(y_test, model.predict(X_test))
        print(f"Iris Success! Score: {score}")
        return True
    except Exception as e:
        print(f"Iris Failed: {e}")
        return False

def test_housing():
    try:
        print("Testing Housing...")
        data = fetch_california_housing()
        df = pd.DataFrame(data.data, columns=data.feature_names)
        df['target'] = data.target
        print(f"Housing Success! Shape: {df.shape}")
        return True
    except Exception as e:
        print(f"Housing Failed: {e}")
        return False

if __name__ == "__main__":
    print(f"Python version: {sys.version}")
    print(f"Pandas version: {pd.__version__}")
    print(f"Scikit-learn version: {sklearn.__version__}")
    
    i_ok = test_iris()
    h_ok = test_housing()
    
    if i_ok and h_ok:
        print("\nDIAGNOSIS: The core ML logic works perfectly. The issue is likely in the FastAPI server communication or environment.")
    else:
        print("\nDIAGNOSIS: There is a problem with your Python environment or dependencies.")
