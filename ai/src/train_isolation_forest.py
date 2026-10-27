#!/usr/bin/env python3
"""
MineGuard AI Subsystem - Isolation Forest Anomaly Detection
Smart India Hackathon 2026 (Problem Statement 26025)

=============================================================================
PURPOSE:
=============================================================================
Trains and evaluates an unsupervised Isolation Forest model on the clean baseline
calibration period (t = 0s to 14,400s / first 4 hours) to learn nominal multivariate
ground strata behavior and detect abnormal deviations (caving, shear creep, tremor).

CRITICAL CONSTRAINTS:
1. TRAIN ON BASELINE ONLY: No anomaly-period data is used during training.
2. 16 CAUSAL FEATURES: Uses strictly past-only rolling and differential features.
3. NORMALIZED SCORE: Produces both raw decision_function and a normalized
   presentation score ai_anomaly_score in [0, 100] (0 = normal, 100 = anomaly).
4. NOT A PROBABILITY: Explicitly documented as a diagnostic heuristic score.
5. ZERO DATA LEAKAGE: Strict separation between training, holdout, and anomalies.

DISCLAIMER:
SYNTHETIC DEMONSTRATION PROTOTYPE. Not a certified mine-safety prediction system.
=============================================================================
"""

import os
import sys
import csv
import json
import math
from datetime import datetime

# Ensure UTF-8 console output on Windows
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

try:
    import numpy as np
    import sklearn
    from sklearn.ensemble import IsolationForest
    import joblib
except ImportError as e:
    print(f"[ERROR] Required ML packages missing: {e}")
    print("Please ensure scikit-learn, joblib, and numpy are installed.")
    sys.exit(1)

from features import (
    ENGINEERED_FEATURE_NAMES,
    load_baseline_model,
    transform_telemetry_stream
)

WARMUP_PERIOD_SAMPLES = 29     # Rows 0-28 contain NaNs for 30s rolling stats
BASELINE_END_SAMPLE = 14400    # Row 14,400 (4.0 hours)
HOLDOUT_END_SAMPLE = 18000     # Row 18,000 (5.0 hours)

def train_and_evaluate_isolation_forest(
    telemetry_csv="ai/data/telemetry.csv",
    baseline_json="ai/models/baseline.json",
    metadata_json="ai/data/anomaly_metadata.json",
    model_output_joblib="ai/models/isolation_forest.joblib",
    model_metadata_path="ai/models/model_metadata.json",
    score_plot_svg="ai/plots/isolation_forest_scores.svg",
    phase_plot_svg="ai/plots/phase_scores.svg"
):
    print("=================================================================")
    print(" MineGuard AI Subsystem — Isolation Forest Training & Evaluation")
    print("=================================================================")
    print(f" Telemetry Source:        {telemetry_csv}")
    print(f" Baseline Model:          {baseline_json}")
    print(f" Model Output:            {model_output_joblib}")
    print(f" Metadata Output:         {model_metadata_path}")
    print(f" Scikit-Learn Version:    {sklearn.__version__}")
    print("=================================================================\n")

    # 1. Load Raw Telemetry and Ground Truth Metadata
    if not os.path.exists(telemetry_csv):
        raise FileNotFoundError(f"Telemetry file not found: {telemetry_csv}")
    if not os.path.exists(baseline_json):
        raise FileNotFoundError(f"Baseline file not found: {baseline_json}")
    if not os.path.exists(metadata_json):
        raise FileNotFoundError(f"Metadata file not found: {metadata_json}")

    with open(metadata_json, mode="r", encoding="utf-8") as f:
        meta = json.load(f)
        anomaly_events = meta.get("anomaly_events", [])

    baseline_payload = load_baseline_model(baseline_json)

    raw_rows = []
    with open(telemetry_csv, mode="r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            raw_rows.append(row)

    total_stream_samples = len(raw_rows)
    print(f" [OK] Loaded {total_stream_samples:,} raw telemetry records.")

    # 2. Causal Feature Engineering
    transformed_records = transform_telemetry_stream(raw_rows, baseline_payload)
    print(f" [OK] Causal feature transformation completed for {len(transformed_records):,} records.")

    # 3. Extract Feature Matrix (Dropping initial warm-up NaNs)
    # Extract arrays
    timestamps = [r["timestamp"] for r in transformed_records]
    
    X_full = []
    for r in transformed_records:
        row_vec = [r[f] for f in ENGINEERED_FEATURE_NAMES]
        X_full.append(row_vec)
    
    X_full = np.array(X_full, dtype=np.float64)

    # 4. Strict Validation of Feature Matrix
    print("\n-----------------------------------------------------------------")
    print(" DATA MATRIX & CAUSALITY VALIDATION")
    print("-----------------------------------------------------------------")
    print(f" Total Stream Dimensions:       {X_full.shape[0]:,} samples x {X_full.shape[1]} features")
    print(f" Warm-up Samples (NaN buffer):  {WARMUP_PERIOD_SAMPLES} samples (t=0s to 28s)")

    # Verify NaNs exist ONLY in the warm-up period
    nan_mask = np.isnan(X_full)
    nans_outside_warmup = np.sum(nan_mask[WARMUP_PERIOD_SAMPLES:, :])
    if nans_outside_warmup > 0:
        raise ValueError(f"CRITICAL: Found {nans_outside_warmup} NaNs outside warm-up period!")
    print(f" [PASS] 0 NaNs detected outside warm-up window.")

    inf_mask = np.isinf(X_full)
    if np.sum(inf_mask) > 0:
        raise ValueError("CRITICAL: Infinite values detected in feature matrix!")
    print(f" [PASS] 0 Infinite values detected in feature matrix.")

    # 5. Training Slice: Strictly Baseline Window (t = 29s to 14,400s)
    X_train = X_full[WARMUP_PERIOD_SAMPLES:BASELINE_END_SAMPLE]
    train_timestamps = timestamps[WARMUP_PERIOD_SAMPLES:BASELINE_END_SAMPLE]
    n_train = len(X_train)

    print(f"\n [OK] Training Dataset: {n_train:,} samples ({train_timestamps[0]} to {train_timestamps[-1]})")
    print(f"      Features: {len(ENGINEERED_FEATURE_NAMES)} (timestamp excluded from ML inputs)")

    # 6. Fit Isolation Forest
    print("\n-----------------------------------------------------------------")
    print(" TRAINING ISOLATION FOREST")
    print("-----------------------------------------------------------------")
    model = IsolationForest(
        n_estimators=300,
        contamination="auto",
        random_state=42,
        n_jobs=-1
    )
    
    model.fit(X_train)
    print(" [OK] Isolation Forest fitted successfully.")

    # 7. Decision Function & Score Normalization
    # Compute baseline training decision function distribution to calibrate score scaling
    train_decision = model.decision_function(X_train)
    train_score_samples = model.score_samples(X_train)

    # In sklearn: decision_function(X) > 0 = Normal, < 0 = Anomaly
    # Baseline decision stats:
    d_mean = float(np.mean(train_decision))
    d_std = float(np.std(train_decision))
    scale_factor = max(d_std * 1.5, 0.04)

    print(f" Baseline Decision Function: mean={d_mean:.4f}, std={d_std:.4f}, scale_factor={scale_factor:.4f}")

    def normalize_score(decision_vals):
        """
        Maps decision_function values to [0, 100] continuous presentation score:
        ai_anomaly_score = 50.0 * (1.0 - tanh(decision_function / scale_factor))
        - decision_function >> 0 (very normal) => score -> 0
        - decision_function == 0 (decision boundary) => score = 50.0
        - decision_function << 0 (severe anomaly) => score -> 100
        """
        tanh_scaled = np.tanh(decision_vals / scale_factor)
        norm_score = 50.0 * (1.0 - tanh_scaled)
        return np.clip(norm_score, 0.0, 100.0)

    # Compute scores for the entire valid time-series (t >= 29s)
    valid_indices = np.arange(WARMUP_PERIOD_SAMPLES, total_stream_samples)
    X_valid = X_full[valid_indices]
    
    raw_decision = model.decision_function(X_valid)
    raw_scores = model.score_samples(X_valid)
    ai_anomaly_scores = normalize_score(raw_decision)
    
    # Binary predictions: -1 (anomaly), +1 (normal)
    raw_predictions = model.predict(X_valid)
    flagged_anomalies = (raw_predictions == -1)  # Equivalent to decision_function < 0 or ai_anomaly_score > 50

    # 8. Ground Truth Phase Partitioning & Evaluation
    # Ground truth labeling for each valid second:
    # 0 = Normal, 1 = Anomaly
    # Anomaly intervals from metadata:
    # ANOM-01: 18000 - 28800
    # ANOM-02: 28800 - 36000
    # ANOM-03: 36000 - 46800
    # ANOM-04: 57600 - 61200
    
    phases = [
        {"name": "NORMAL_BASELINE", "start": WARMUP_PERIOD_SAMPLES, "end": 14400, "is_anomaly": False, "desc": "Undisturbed Ground (Training Period)"},
        {"name": "NORMAL_HOLDOUT", "start": 14400, "end": 18000, "is_anomaly": False, "desc": "Undisturbed Ground (Unseen Holdout)"},
        {"name": "ANOM-01-INFLEXION", "start": 18000, "end": 28800, "is_anomaly": True, "desc": "Gradual Strata Inflexion & Shear Creep"},
        {"name": "ANOM-02-SUBSIDENCE", "start": 28800, "end": 36000, "is_anomaly": True, "desc": "Rapid Subsidence & Non-linear Caving"},
        {"name": "ANOM-03-SETTLEMENT", "start": 36000, "end": 46800, "is_anomaly": True, "desc": "Post-Caving Settlement & Relaxation"},
        {"name": "STABILIZED_01", "start": 46800, "end": 57600, "is_anomaly": False, "desc": "Stabilized Plateau Monitoring (Post-Caving)"},
        {"name": "ANOM-04-MICROTREMOR", "start": 57600, "end": 61200, "is_anomaly": True, "desc": "Secondary Dynamic Micro-Tremor"},
        {"name": "STABILIZED_02", "start": 61200, "end": total_stream_samples, "is_anomaly": False, "desc": "Final Equilibrium Monitoring"}
    ]

    phase_results = []
    
    print("\n-----------------------------------------------------------------")
    print(" PHASE-BY-PHASE EVALUATION")
    print("-----------------------------------------------------------------")
    print(f"{'Phase':<22} {'Samples':<10} {'Mean Score':<12} {'Max Score':<12} {'% Flagged':<12} {'Detection / FPR'}")
    print("-" * 80)

    for p in phases:
        p_start_offset = p["start"] - WARMUP_PERIOD_SAMPLES
        p_end_offset = p["end"] - WARMUP_PERIOD_SAMPLES

        p_scores = ai_anomaly_scores[p_start_offset:p_end_offset]
        p_flagged = flagged_anomalies[p_start_offset:p_end_offset]

        n_p = len(p_scores)
        mean_s = float(np.mean(p_scores)) if n_p > 0 else 0.0
        max_s = float(np.max(p_scores)) if n_p > 0 else 0.0
        pct_flagged = (np.sum(p_flagged) / n_p * 100.0) if n_p > 0 else 0.0

        label_type = "Detection Rate" if p["is_anomaly"] else "False Positive Rate"
        rate_str = f"{pct_flagged:.2f}% ({label_type})"

        phase_results.append({
            "phase": p["name"],
            "description": p["desc"],
            "is_anomaly": p["is_anomaly"],
            "samples": n_p,
            "mean_score": round(mean_s, 2),
            "max_score": round(max_s, 2),
            "pct_flagged": round(pct_flagged, 2),
            "flagged_count": int(np.sum(p_flagged))
        })

        print(f"{p['name']:<22} {n_p:<10,} {mean_s:<12.2f} {max_s:<12.2f} {pct_flagged:<11.2f}% {rate_str}")

    # 9. Test Set (t >= 14,400s) Classification Metrics
    # Evaluation set excludes the training baseline
    test_start_offset = BASELINE_END_SAMPLE - WARMUP_PERIOD_SAMPLES
    y_test_pred = flagged_anomalies[test_start_offset:]
    
    # Construct binary ground truth for test set
    y_test_true = np.zeros(len(y_test_pred), dtype=bool)
    for p in phases:
        if p["is_anomaly"]:
            start_in_test = max(0, p["start"] - BASELINE_END_SAMPLE)
            end_in_test = min(len(y_test_true), p["end"] - BASELINE_END_SAMPLE)
            if start_in_test < end_in_test:
                y_test_true[start_in_test:end_in_test] = True

    TP = int(np.sum(y_test_true & y_test_pred))
    FP = int(np.sum((~y_test_true) & y_test_pred))
    TN = int(np.sum((~y_test_true) & (~y_test_pred)))
    FN = int(np.sum(y_test_true & (~y_test_pred)))

    precision = TP / (TP + FP) if (TP + FP) > 0 else 0.0
    recall = TP / (TP + FN) if (TP + FN) > 0 else 0.0
    f1 = 2 * (precision * recall) / (precision + recall) if (precision + recall) > 0 else 0.0

    print("\n-----------------------------------------------------------------")
    print(" TEST SET OVERALL CLASSIFICATION METRICS (t = 14,400s to 86,400s)")
    print("-----------------------------------------------------------------")
    print(f" Total Evaluation Samples:    {len(y_test_true):,} seconds (20.0 Hours)")
    print(f" True Positives (TP):         {TP:,} seconds")
    print(f" False Positives (FP):        {FP:,} seconds")
    print(f" True Negatives (TN):         {TN:,} seconds")
    print(f" False Negatives (FN):        {FN:,} seconds")
    print(f" Precision:                   {precision:.4f} ({precision*100:.2f}%)")
    print(f" Recall (Sensitivity):        {recall:.4f} ({recall*100:.2f}%)")
    print(f" F1-Score:                    {f1:.4f}")
    print(f"\n Confusion Matrix: [[TN={TN}, FP={FP}], [FN={FN}, TP={TP}]]")

    # 10. Feature Ablation / Permutation Diagnostic Analysis
    print("\n-----------------------------------------------------------------")
    print(" DIAGNOSTIC FEATURE ABLATION / IMPORTANCE ANALYSIS")
    print(" (Measures mean anomaly score drop when feature is shuffled)")
    print("-----------------------------------------------------------------")
    
    # Evaluate score delta on anomaly subset
    anomaly_indices = np.where(y_test_true)[0]
    X_test_anom = X_valid[test_start_offset:][anomaly_indices]
    base_anom_scores = np.mean(normalize_score(model.decision_function(X_test_anom)))

    feature_importances = []
    rng = np.random.RandomState(42)

    for f_idx, f_name in enumerate(ENGINEERED_FEATURE_NAMES):
        X_perm = X_test_anom.copy()
        # Shuffle this feature across anomaly samples
        X_perm[:, f_idx] = rng.permutation(X_perm[:, f_idx])
        perm_scores = np.mean(normalize_score(model.decision_function(X_perm)))
        
        # Impact is the drop in anomaly score when feature is scrambled
        importance_delta = base_anom_scores - perm_scores
        feature_importances.append({
            "feature": f_name,
            "importance_delta": round(float(importance_delta), 4)
        })

    # Sort by importance delta
    feature_importances = sorted(feature_importances, key=lambda k: k["importance_delta"], reverse=True)

    for r_idx, imp in enumerate(feature_importances, start=1):
        print(f" {r_idx:>2}. {imp['feature']:<30} Delta: {imp['importance_delta']:>+7.4f}")

    # 11. Save Model Artifacts
    os.makedirs(os.path.dirname(model_output_joblib), exist_ok=True)
    joblib.dump(model, model_output_joblib)
    print(f"\n [OK] Model artifact saved to: {model_output_joblib}")

    model_metadata = {
        "model_type": "sklearn.ensemble.IsolationForest",
        "sklearn_version": sklearn.__version__,
        "hyperparameters": {
            "n_estimators": 300,
            "contamination": "auto",
            "random_state": 42,
            "n_jobs": -1
        },
        "training_metadata": {
            "training_period_seconds": "0s to 14,400s (first 4 hours)",
            "training_samples_count": n_train,
            "warmup_samples_dropped": WARMUP_PERIOD_SAMPLES,
            "baseline_source": baseline_json,
            "telemetry_source": telemetry_csv,
            "created_at": datetime.now().isoformat() + "Z"
        },
        "feature_engineering": {
            "version": "1.0.0",
            "feature_count": len(ENGINEERED_FEATURE_NAMES),
            "features_list": ENGINEERED_FEATURE_NAMES
        },
        "score_normalization": {
            "method": "Continuous hyperbolic tangent mapping anchored at decision_function=0.0",
            "formula": "ai_anomaly_score = 50.0 * (1.0 - tanh(decision_function / scale_factor))",
            "scale_factor": round(scale_factor, 6),
            "anomaly_decision_threshold": 50.0,
            "scale_range": "[0.0, 100.0] (0 = Strongly Normal, 100 = Strongly Anomalous)",
            "disclaimer": "Diagnostic presentation score. NOT a probability of mine failure."
        },
        "evaluation_metrics": {
            "normal_baseline_fpr_pct": phase_results[0]["pct_flagged"],
            "normal_holdout_fpr_pct": phase_results[1]["pct_flagged"],
            "anom_01_inflexion_recall_pct": phase_results[2]["pct_flagged"],
            "anom_02_subsidence_recall_pct": phase_results[3]["pct_flagged"],
            "anom_03_settlement_recall_pct": phase_results[4]["pct_flagged"],
            "anom_04_microtremor_recall_pct": phase_results[6]["pct_flagged"],
            "test_precision": round(precision, 4),
            "test_recall": round(recall, 4),
            "test_f1_score": round(f1, 4),
            "confusion_matrix": {"TP": TP, "FP": FP, "TN": TN, "FN": FN}
        },
        "phase_breakdown": phase_results,
        "feature_importance_ablation": feature_importances
    }

    with open(model_metadata_path, mode="w", encoding="utf-8") as f:
        json.dump(model_metadata, f, indent=2)

    print(f" [OK] Model metadata saved to: {model_metadata_path}")

    # 12. Generate Diagnostic Plots (SVG)
    generate_isolation_forest_plot(
        valid_indices,
        ai_anomaly_scores,
        phases,
        score_plot_svg
    )

    generate_phase_bar_plot(
        phase_results,
        phase_plot_svg
    )

    return model, model_metadata

def generate_isolation_forest_plot(valid_indices, scores, phases, output_svg_path, downsample=60):
    """
    Generates time vs. normalized AI anomaly score plot with shaded anomaly periods.
    """
    os.makedirs(os.path.dirname(output_svg_path), exist_ok=True)
    
    sampled_indices = valid_indices[::downsample]
    sampled_scores = scores[::downsample]
    total_samples = len(valid_indices)
    max_t = 86400

    width = 1200
    height = 550
    margin_left = 80
    margin_right = 50
    margin_top = 70
    plot_width = width - margin_left - margin_right
    plot_height = 380
    bottom_y = margin_top + plot_height

    svg = []
    svg.append(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" width="{width}" height="{height}" style="background:#090d16; font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, monospace;">')
    svg.append(f'<text x="{margin_left}" y="32" fill="#f8fafc" font-size="18" font-weight="bold">MineGuard AI Subsystem — Isolation Forest Anomaly Detection Profile</text>')
    svg.append(f'<text x="{margin_left}" y="52" fill="#94a3b8" font-size="12">Continuous 1 Hz Inference | 16 Causal Features | Calibrated Baseline: t=0h to 4h | Threshold = 50.0</text>')

    # Defs
    svg.append('<defs>')
    svg.append('  <pattern id="ifGrid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1e293b" stroke-width="0.5" stroke-opacity="0.5"/></pattern>')
    svg.append('</defs>')

    # Plot Frame
    svg.append(f'<rect x="{margin_left}" y="{margin_top}" width="{plot_width}" height="{plot_height}" fill="#0f172a" stroke="#1e293b" stroke-width="1" rx="4"/>')
    svg.append(f'<rect x="{margin_left}" y="{margin_top}" width="{plot_width}" height="{plot_height}" fill="url(#ifGrid)" rx="4"/>')

    # Shaded Anomaly Regions
    for p in phases:
        x1 = margin_left + (p["start"] / max_t) * plot_width
        x2 = margin_left + (p["end"] / max_t) * plot_width
        w = max(2, x2 - x1)
        if p["is_anomaly"]:
            col = "#ef4444" if "SUBSIDENCE" in p["name"] else ("#f59e0b" if "INFLEXION" in p["name"] else "#ec4899")
            svg.append(f'<rect x="{x1:.1f}" y="{margin_top}" width="{w:.1f}" height="{plot_height}" fill="{col}" fill-opacity="0.15" stroke="{col}" stroke-opacity="0.35" stroke-dasharray="2,2"/>')
            svg.append(f'<text x="{x1 + 4:.1f}" y="{margin_top + 18}" fill="{col}" font-size="9.5" font-weight="bold">{p["name"]}</text>')
        elif p["name"] == "NORMAL_BASELINE":
            svg.append(f'<rect x="{x1:.1f}" y="{margin_top}" width="{w:.1f}" height="{plot_height}" fill="#10b981" fill-opacity="0.08" stroke="#10b981" stroke-opacity="0.3" stroke-dasharray="2,2"/>')
            svg.append(f'<text x="{x1 + 6:.1f}" y="{margin_top + 18}" fill="#34d399" font-size="9.5" font-weight="bold">TRAINING BASELINE</text>')

    # Y-Ticks (0 to 100)
    for score_tick in [0, 25, 50, 75, 100]:
        norm = score_tick / 100.0
        y_pos = bottom_y - norm * plot_height
        svg.append(f'<line x1="{margin_left}" y1="{y_pos:.1f}" x2="{margin_left + plot_width}" y2="{y_pos:.1f}" stroke="#334155" stroke-width="0.5" stroke-dasharray="3,3"/>')
        svg.append(f'<text x="{margin_left - 8}" y="{y_pos + 4:.1f}" fill="#94a3b8" font-size="10" text-anchor="end" font-family="monospace">{score_tick}</text>')

    # Decision Boundary Line at Score = 50.0
    y_thresh = bottom_y - 0.50 * plot_height
    svg.append(f'<line x1="{margin_left}" y1="{y_thresh:.1f}" x2="{margin_left + plot_width}" y2="{y_thresh:.1f}" stroke="#f43f5e" stroke-width="1.5" stroke-dasharray="4,3"/>')
    svg.append(f'<text x="{margin_left + plot_width - 170}" y="{y_thresh - 6}" fill="#f43f5e" font-size="10" font-weight="bold">Anomaly Threshold (50.0)</text>')

    # Plot Score Curve
    pts = []
    for t_sec, sc in zip(sampled_indices, sampled_scores):
        x = margin_left + (t_sec / max_t) * plot_width
        y = bottom_y - (sc / 100.0) * plot_height
        pts.append(f"{x:.1f},{y:.1f}")

    svg.append(f'<polyline points="{" ".join(pts)}" fill="none" stroke="#38bdf8" stroke-width="2.0"/>')

    # Bottom X-Axis Time Ticks (Hours)
    axis_y = bottom_y + 10
    svg.append(f'<line x1="{margin_left}" y1="{axis_y}" x2="{margin_left + plot_width}" y2="{axis_y}" stroke="#64748b" stroke-width="1.5"/>')

    for h in range(13):
        frac = h / 12.0
        x_pos = margin_left + frac * plot_width
        hour_val = frac * 24.0
        time_str = f"T+{hour_val:.0f}h"
        svg.append(f'<line x1="{x_pos:.1f}" y1="{axis_y}" x2="{x_pos:.1f}" y2="{axis_y + 5}" stroke="#94a3b8" stroke-width="1"/>')
        svg.append(f'<text x="{x_pos:.1f}" y="{axis_y + 18}" fill="#cbd5e1" font-size="10" text-anchor="middle" font-family="monospace">{time_str}</text>')

    svg.append(f'<text x="{width/2}" y="{height - 12}" fill="#64748b" font-size="10" text-anchor="middle">Elapsed Time (Hours) | ai_anomaly_score in [0, 100] | Isolation Forest Anomaly Subsystem</text>')
    svg.append('</svg>')

    with open(output_svg_path, mode="w", encoding="utf-8") as f:
        f.write("\n".join(svg))

    print(f" [OK] Anomaly score plot generated: {output_svg_path}")

def generate_phase_bar_plot(phase_results, output_svg_path):
    """
    Generates bar chart comparing Mean Score and % Flagged per phase.
    """
    os.makedirs(os.path.dirname(output_svg_path), exist_ok=True)
    
    width = 950
    height = 500
    margin_left = 180
    margin_right = 60
    margin_top = 70
    plot_width = width - margin_left - margin_right
    bar_height = 32
    bar_gap = 18

    svg = []
    svg.append(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" width="{width}" height="{height}" style="background:#090d16; font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, monospace;">')
    svg.append(f'<text x="{margin_left}" y="32" fill="#f8fafc" font-size="18" font-weight="bold">MineGuard AI — Phase-by-Phase Anomaly Score Comparison</text>')
    svg.append(f'<text x="{margin_left}" y="52" fill="#94a3b8" font-size="12">Mean AI Anomaly Score (0 to 100) across Ground-Truth Intervals</text>')

    for idx, p in enumerate(phase_results):
        y_pos = margin_top + idx * (bar_height + bar_gap)
        score = p["mean_score"]
        bar_w = (score / 100.0) * plot_width

        bar_col = "#ef4444" if p["is_anomaly"] else "#10b981"
        if "INFLEXION" in p["phase"]:
            bar_col = "#f59e0b"
        elif "MICROTREMOR" in p["phase"]:
            bar_col = "#ec4899"

        # Background track
        svg.append(f'<rect x="{margin_left}" y="{y_pos}" width="{plot_width}" height="{bar_height}" fill="#1e293b" rx="4"/>')
        # Filled bar
        svg.append(f'<rect x="{margin_left}" y="{y_pos}" width="{max(2, bar_w):.1f}" height="{bar_height}" fill="{bar_col}" rx="4"/>')

        # Threshold guide (50.0)
        x_thresh = margin_left + 0.50 * plot_width
        svg.append(f'<line x1="{x_thresh:.1f}" y1="{margin_top}" x2="{x_thresh:.1f}" y2="{margin_top + len(phase_results) * (bar_height + bar_gap) - bar_gap}" stroke="#f43f5e" stroke-width="1.2" stroke-dasharray="3,2"/>')

        # Label
        svg.append(f'<text x="{margin_left - 10}" y="{y_pos + 20}" fill="#cbd5e1" font-size="11" font-weight="bold" text-anchor="end">{p["phase"]}</text>')
        # Value
        svg.append(f'<text x="{margin_left + bar_w + 8:.1f}" y="{y_pos + 20}" fill="#ffffff" font-size="11" font-family="monospace">{score:.1f} ({p["pct_flagged"]:.1f}% flagged)</text>')

    svg.append(f'<text x="{x_thresh}" y="{margin_top - 8}" fill="#f43f5e" font-size="10" font-weight="bold" text-anchor="middle">Anomaly Threshold (50.0)</text>')
    svg.append('</svg>')

    with open(output_svg_path, mode="w", encoding="utf-8") as f:
        f.write("\n".join(svg))

    print(f" [OK] Phase bar plot generated: {output_svg_path}")

if __name__ == "__main__":
    train_and_evaluate_isolation_forest()
