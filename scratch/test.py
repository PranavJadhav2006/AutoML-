import sys
import os
import json

sys.path.insert(0, os.path.abspath('ml-service'))

from trainer import auto_train

def test():
    try:
        print("Testing auto_train with 'titanic passenger survival'...")
        res = auto_train("titanic passenger survival")
        print("\nSUCCESS!")
        print(json.dumps(res, indent=2))
    except Exception as e:
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test()
