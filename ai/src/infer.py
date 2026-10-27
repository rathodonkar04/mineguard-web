#!/usr/bin/env python3
"""
MineGuard AI Inference Engine
Evaluates Isolation Forest on 16-feature vector with exact model metadata specification.
"""
import sys
import json
import numpy as np
import joblib

MODEL_PATH = "ai/models/isolation_forest.joblib"
METADATA_PATH = "ai/models/model_metadata.json"

_cached_model = None
_cached_metadata = None

def get_model():
    global _cached_model, _cached_metadata
    if _cached_model is None:
        _cached_model = joblib.load(MODEL_PATH)
        with open(METADATA_PATH, "r", encoding="utf-8") as f:
            _cached_metadata = json.load(f)
    return _cached_model, _cached_metadata

def predict_single_vector(feature_dict):
    """
    Evaluates Isolation Forest on a 16-feature dictionary.
    Guarantees exact feature ordering matching model_metadata.json.
    """
    model, metadata = get_model()
    feature_list = metadata["feature_engineering"]["features_list"]
    scale_factor = metadata["score_normalization"]["scale_factor"]

    # Extract ordered vector
    ordered_vec = []
    for feat_name in feature_list:
        if feat_name not in feature_dict or feature_dict[feat_name] is None:
            return {
                "error": f"Missing feature: {feat_name}",
                "ai_status": "CALIBRATING"
            }
        ordered_vec.append(float(feature_dict[feat_name]))

    X = np.array([ordered_vec], dtype=np.float64)

    if np.isnan(X).any() or np.isinf(X).any():
        return {
            "error": "NaN or Inf in feature vector",
            "ai_status": "CALIBRATING"
        }

    dec_func = float(model.decision_function(X)[0])
    
    # Normalized score: 50.0 * (1.0 - tanh(dec_func / scale_factor))
    tanh_scaled = np.tanh(dec_func / scale_factor)
    norm_score = float(np.clip(50.0 * (1.0 - tanh_scaled), 0.0, 100.0))

    return {
        "raw_decision_function": round(dec_func, 6),
        "ai_anomaly_score": int(round(norm_score)),
        "normalized_score_float": round(norm_score, 2),
        "ai_status": "ACTIVE",
        "ordered_features": feature_list,
        "feature_vector": ordered_vec
    }

if __name__ == "__main__":
    # If run via CLI: reads JSON from stdin or argument
    if len(sys.argv) > 1:
        raw_json = sys.argv[1]
    else:
        raw_json = sys.stdin.read()

    try:
        data = json.loads(raw_json)
        result = predict_single_vector(data)
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"error": str(e), "ai_status": "ERROR"}))
