import joblib
import json
import numpy as np

model = joblib.load("ai/models/isolation_forest.joblib")
print(f"n_estimators: {model.n_estimators}")
print(f"max_samples: {model.max_samples_}")
print(f"offset_: {model.offset_}")

# Test with a dummy vector
x_test = np.zeros((1, 16))
dec = model.decision_function(x_test)
score = 50.0 * (1.0 - np.tanh(dec[0] / 0.051307))
print(f"Dummy zeros decision_function: {dec[0]:.6f}, score: {score:.2f}")
