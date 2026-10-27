import json
import csv
import numpy as np
import joblib

from features import ENGINEERED_FEATURE_NAMES, load_baseline_model, transform_telemetry_stream

def diagnose():
    baseline_payload = load_baseline_model("ai/models/baseline.json")
    model = joblib.load("ai/models/isolation_forest.joblib")
    with open("ai/models/model_metadata.json") as f:
        metadata = json.load(f)

    raw_rows = []
    with open("ai/data/telemetry.csv", mode="r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            raw_rows.append(row)

    transformed = transform_telemetry_stream(raw_rows, baseline_payload)
    
    # Phases
    phases = [
        ("NORMAL_BASELINE", 29, 14400),
        ("NORMAL_HOLDOUT", 14400, 18000),
        ("ANOM-01-INFLEXION", 18000, 28800),
        ("ANOM-02-SUBSIDENCE", 28800, 36000),
        ("ANOM-03-SETTLEMENT", 36000, 46800),
        ("STABILIZED_01", 46800, 57600),
        ("ANOM-04-MICROTREMOR", 57600, 61200),
        ("STABILIZED_02", 61200, len(transformed))
    ]

    print("=== PHASE ANOMALY SCORE AND FEATURE SHIFT DIAGNOSIS ===")
    
    phase_data = {}
    for name, start, end in phases:
        slice_rows = transformed[start:end]
        X_p = np.array([[r[f] for f in ENGINEERED_FEATURE_NAMES] for r in slice_rows])
        dec = model.decision_function(X_p)
        score = 50.0 * (1.0 - np.tanh(dec / 0.051307))
        flagged = (dec < 0)
        phase_data[name] = {
            "X": X_p,
            "mean_score": float(np.mean(score)),
            "pct_flagged": float(np.mean(flagged) * 100.0)
        }
        print(f"{name:<25}: Mean Score = {np.mean(score):.2f}, Flagged = {np.mean(flagged)*100:.2f}%")

    print("\n=== FEATURE MEAN COMPARISONS ===")
    print(f"{'Feature':<28} {'BASELINE':<12} {'HOLDOUT':<12} {'STABILIZED_01':<15} {'STABILIZED_02':<15}")
    print("-" * 85)
    
    base_means = np.mean(phase_data["NORMAL_BASELINE"]["X"], axis=0)
    hold_means = np.mean(phase_data["NORMAL_HOLDOUT"]["X"], axis=0)
    stab1_means = np.mean(phase_data["STABILIZED_01"]["X"], axis=0)
    stab2_means = np.mean(phase_data["STABILIZED_02"]["X"], axis=0)

    for idx, f in enumerate(ENGINEERED_FEATURE_NAMES):
        print(f"{f:<28} {base_means[idx]:<12.4f} {hold_means[idx]:<12.4f} {stab1_means[idx]:<15.4f} {stab2_means[idx]:<15.4f}")

if __name__ == "__main__":
    diagnose()
