#!/usr/bin/env python3
"""
MineGuard AI Subsystem - Model Diagnostic & Root-Cause Analysis Suite
Smart India Hackathon 2026 (Problem Statement 26025)

=============================================================================
PURPOSE:
=============================================================================
Performs a deep mathematical and empirical diagnostic investigation into the
false positives observed in Isolation Forest V1:
- NORMAL_HOLDOUT FPR (61.78%)
- STABILIZED_01 / STABILIZED_02 FPR (100.00%)
- Baseline FPR (9.93%)

Evaluates:
1. Feature distribution shifts (mean, std, median, 5th, 95th percentiles) across all 8 phases.
2. Top false-positive observations in NORMAL_HOLDOUT and STABILIZED_01.
3. Feature ablation / leave-one-out impact on NORMAL_HOLDOUT FPR.
4. Pearson & Spearman correlation with Time, Temperature, Tilt, Displacement, and Vibration.
5. Score distribution visualizations and feature shift charts.

DO NOT MODIFY MODEL WEIGHTS OR THRESHOLDS. DIAGNOSTIC ONLY.
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

import numpy as np
import joblib
from features import (
    ENGINEERED_FEATURE_NAMES,
    load_baseline_model,
    transform_telemetry_stream
)

WARMUP_PERIOD_SAMPLES = 29
BASELINE_END_SAMPLE = 14400

PHASE_DEFINITIONS = [
    {"name": "NORMAL_BASELINE", "start": 29, "end": 14400, "is_anomaly": False},
    {"name": "NORMAL_HOLDOUT", "start": 14400, "end": 18000, "is_anomaly": False},
    {"name": "ANOM-01-INFLEXION", "start": 18000, "end": 28800, "is_anomaly": True},
    {"name": "ANOM-02-SUBSIDENCE", "start": 28800, "end": 36000, "is_anomaly": True},
    {"name": "ANOM-03-SETTLEMENT", "start": 36000, "end": 46800, "is_anomaly": True},
    {"name": "STABILIZED_01", "start": 46800, "end": 57600, "is_anomaly": False},
    {"name": "ANOM-04-MICROTREMOR", "start": 57600, "end": 61200, "is_anomaly": True},
    {"name": "STABILIZED_02", "start": 61200, "end": 86400, "is_anomaly": False}
]

def percentile(arr, p):
    return float(np.percentile(arr, p)) if len(arr) > 0 else 0.0

def run_diagnostics(
    telemetry_csv="ai/data/telemetry.csv",
    baseline_json="ai/models/baseline.json",
    model_joblib="ai/models/isolation_forest.joblib",
    model_meta_json="ai/models/model_metadata.json",
    score_dist_svg="ai/plots/score_distribution.svg",
    feature_shift_svg="ai/plots/feature_shift.svg",
    top_fp_csv="ai/data/top_false_positives.csv"
):
    print("=================================================================")
    print(" MineGuard Isolation Forest Diagnostic & Root Cause Investigation")
    print("=================================================================\n")

    # Load baseline, model, and telemetry
    baseline_payload = load_baseline_model(baseline_json)
    model = joblib.load(model_joblib)
    
    with open(model_meta_json, mode="r", encoding="utf-8") as f:
        model_meta = json.load(f)
    scale_factor = model_meta["score_normalization"]["scale_factor"]

    raw_rows = []
    with open(telemetry_csv, mode="r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            raw_rows.append(row)

    transformed_records = transform_telemetry_stream(raw_rows, baseline_payload)
    total_samples = len(transformed_records)

    # Build full matrix
    timestamps = [r["timestamp"] for r in transformed_records]
    raw_tilt = np.array([float(r["tilt_angle"]) for r in raw_rows])
    raw_temp = np.array([float(r["temperature"]) for r in raw_rows])
    raw_disp = np.array([float(r["displacement"]) for r in raw_rows])
    raw_vib = np.array([float(r["vibration"]) for r in raw_rows])
    time_hours = np.arange(total_samples) / 3600.0

    X_full = np.array([[r[f] for f in ENGINEERED_FEATURE_NAMES] for r in transformed_records], dtype=np.float64)

    # Valid slice
    valid_idx = np.arange(WARMUP_PERIOD_SAMPLES, total_samples)
    X_valid = X_full[valid_idx]
    
    decision_func_all = model.decision_function(X_valid)
    tanh_scaled = np.tanh(decision_func_all / scale_factor)
    ai_scores_all = np.clip(50.0 * (1.0 - tanh_scaled), 0.0, 100.0)
    flagged_all = (ai_scores_all >= 50.0)

    # Map full stream scores (NaN for warmup)
    full_scores = np.full(total_samples, np.nan)
    full_decision = np.full(total_samples, np.nan)
    full_scores[valid_idx] = ai_scores_all
    full_decision[valid_idx] = decision_func_all

    # =========================================================================
    # 1. FEATURE DISTRIBUTION SHIFTS ACROSS ALL 8 PHASES
    # =========================================================================
    print("=================================================================")
    print(" 1. FEATURE DISTRIBUTION STATISTICAL PROFILE BY PHASE")
    print("=================================================================")

    phase_data_slices = {}
    for p in PHASE_DEFINITIONS:
        start_idx = p["start"]
        end_idx = p["end"]
        phase_data_slices[p["name"]] = {
            "X": X_full[start_idx:end_idx],
            "scores": full_scores[start_idx:end_idx],
            "decision": full_decision[start_idx:end_idx],
            "timestamps": timestamps[start_idx:end_idx],
            "indices": np.arange(start_idx, end_idx)
        }

    base_stats = {}
    feature_shifts_summary = []

    # Calculate baseline reference stats for each feature
    X_base = phase_data_slices["NORMAL_BASELINE"]["X"]
    for f_idx, f_name in enumerate(ENGINEERED_FEATURE_NAMES):
        col = X_base[:, f_idx]
        base_stats[f_name] = {
            "mean": float(np.mean(col)),
            "std": float(np.std(col)),
            "median": float(np.median(col)),
            "p5": percentile(col, 5),
            "p95": percentile(col, 95)
        }

    # Compare distribution shifts across all phases
    all_phase_feature_profiles = {}
    for p in PHASE_DEFINITIONS:
        p_name = p["name"]
        all_phase_feature_profiles[p_name] = {}
        X_p = phase_data_slices[p_name]["X"]
        
        for f_idx, f_name in enumerate(ENGINEERED_FEATURE_NAMES):
            col = X_p[:, f_idx]
            mean_val = float(np.mean(col))
            std_val = float(np.std(col))
            median_val = float(np.median(col))
            p5_val = percentile(col, 5)
            p95_val = percentile(col, 95)
            min_val = float(np.min(col))
            max_val = float(np.max(col))
            
            # Standardized mean difference relative to baseline: (mu_phase - mu_base) / sigma_base
            base_sigma = max(base_stats[f_name]["std"], 1e-6)
            std_diff = (mean_val - base_stats[f_name]["mean"]) / base_sigma

            all_phase_feature_profiles[p_name][f_name] = {
                "mean": round(mean_val, 4),
                "std": round(std_val, 4),
                "median": round(median_val, 4),
                "min": round(min_val, 4),
                "max": round(max_val, 4),
                "p5": round(p5_val, 4),
                "p95": round(p95_val, 4),
                "std_diff_vs_baseline": round(std_diff, 2)
            }

    # Print Distribution Shift Comparison for NORMAL_BASELINE vs NORMAL_HOLDOUT vs STABILIZED_01
    print(f"{'Feature Name':<28} {'Base Mean (std)':<18} {'Holdout Mean (diff)':<22} {'Stab_01 Mean (diff)':<22}")
    print("-" * 92)
    for f_name in ENGINEERED_FEATURE_NAMES:
        b_m = all_phase_feature_profiles["NORMAL_BASELINE"][f_name]["mean"]
        b_s = all_phase_feature_profiles["NORMAL_BASELINE"][f_name]["std"]
        h_m = all_phase_feature_profiles["NORMAL_HOLDOUT"][f_name]["mean"]
        h_d = all_phase_feature_profiles["NORMAL_HOLDOUT"][f_name]["std_diff_vs_baseline"]
        s_m = all_phase_feature_profiles["STABILIZED_01"][f_name]["mean"]
        s_d = all_phase_feature_profiles["STABILIZED_01"][f_name]["std_diff_vs_baseline"]

        print(f"{f_name:<28} {b_m:>7.3f} (±{b_s:.3f})   {h_m:>7.3f} ({h_d:>+5.1f}σ)     {s_m:>7.3f} ({s_d:>+5.1f}σ)")

    # =========================================================================
    # 2. TOP FALSE POSITIVES IN NORMAL_HOLDOUT & STABILIZED_01
    # =========================================================================
    print("\n=================================================================")
    print(" 2. TOP FALSE POSITIVE OBSERVATIONS INSPECTION")
    print("=================================================================")

    def get_top_fp_records(phase_name, top_n=100):
        p_info = phase_data_slices[phase_name]
        indices = p_info["indices"]
        scores = p_info["scores"]
        decisions = p_info["decision"]
        
        # Sort descending by anomaly score
        sorted_rel_idx = np.argsort(-scores)[:top_n]
        top_records = []
        for rel_i in sorted_rel_idx:
            abs_i = indices[rel_i]
            rec = transformed_records[abs_i].copy()
            rec["ai_anomaly_score"] = round(scores[rel_i], 2)
            rec["decision_function"] = round(decisions[rel_i], 5)
            rec["phase"] = phase_name
            top_records.append(rec)
        return top_records

    top_holdout_fp = get_top_fp_records("NORMAL_HOLDOUT", top_n=100)
    top_stab_fp = get_top_fp_records("STABILIZED_01", top_n=100)

    # Write top false positives CSV for diagnostic inspection
    os.makedirs(os.path.dirname(top_fp_csv), exist_ok=True)
    all_top_fp = top_holdout_fp + top_stab_fp
    fieldnames = ["timestamp", "phase", "ai_anomaly_score", "decision_function"] + [f for f in ENGINEERED_FEATURE_NAMES]
    
    with open(top_fp_csv, mode="w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction='ignore')
        writer.writeheader()
        for r in all_top_fp:
            writer.writerow(r)

    print(f" [OK] Saved top 100 false positives for Holdout and Stabilized_01 to: {top_fp_csv}")
    print(f"\n Sample Top False Positive in NORMAL_HOLDOUT (Highest Score: {top_holdout_fp[0]['ai_anomaly_score']}):")
    print(f"   Timestamp:      {top_holdout_fp[0]['timestamp']}")
    print(f"   z_temperature:  {top_holdout_fp[0]['z_temperature']} (T={top_holdout_fp[0]['temperature']}°C vs base 24.28°C)")
    print(f"   delta_temp:     {top_holdout_fp[0]['delta_temperature']}°C")
    print(f"   z_tilt:         {top_holdout_fp[0]['z_tilt']}")
    print(f"   detrended_tilt: {top_holdout_fp[0]['detrended_tilt']}°")
    print(f"   z_displacement: {top_holdout_fp[0]['z_displacement']}")
    print(f"   z_vibration:    {top_holdout_fp[0]['z_vibration']}")
    print(f"   tilt_rate:      {top_holdout_fp[0]['tilt_rate']} deg/s")

    print(f"\n Sample Top False Positive in STABILIZED_01 (Highest Score: {top_stab_fp[0]['ai_anomaly_score']}):")
    print(f"   Timestamp:      {top_stab_fp[0]['timestamp']}")
    print(f"   z_displacement: {top_stab_fp[0]['z_displacement']} (disp={top_stab_fp[0]['displacement']}mm vs base 0.22mm)")
    print(f"   z_tilt:         {top_stab_fp[0]['z_tilt']} (tilt={top_stab_fp[0]['tilt_angle']}° vs base 0.13°)")
    print(f"   tilt_mean_30s:  {top_stab_fp[0]['tilt_mean_30s']}°")
    print(f"   tilt_rate:      {top_stab_fp[0]['tilt_rate']} deg/s")
    print(f"   disp_rate:      {top_stab_fp[0]['displacement_rate']} mm/s")
    print(f"   volatility:     {top_stab_fp[0]['volatility_ratio']}")

    # =========================================================================
    # 3. FEATURE ABLATION / LEAVE-ONE-OUT ON NORMAL_HOLDOUT FPR
    # =========================================================================
    print("\n=================================================================")
    print(" 3. FEATURE ABLATION / LEAVE-ONE-OUT ON NORMAL_HOLDOUT FPR")
    print(" (Identifies which features cause normal holdout false positives)")
    print("=================================================================")

    # In baseline model:
    # We test how replacing each feature in NORMAL_HOLDOUT with its baseline mean reduces holdout FPR
    X_train = phase_data_slices["NORMAL_BASELINE"]["X"]
    X_holdout = phase_data_slices["NORMAL_HOLDOUT"]["X"]
    
    baseline_holdout_dec = model.decision_function(X_holdout)
    baseline_holdout_scores = np.clip(50.0 * (1.0 - np.tanh(baseline_holdout_dec / scale_factor)), 0.0, 100.0)
    raw_holdout_fpr = float(np.mean(baseline_holdout_scores >= 50.0) * 100.0)

    print(f" Current NORMAL_HOLDOUT False Positive Rate (All 16 features): {raw_holdout_fpr:.2f}%\n")

    holdout_ablation_results = []

    for f_idx, f_name in enumerate(ENGINEERED_FEATURE_NAMES):
        # Neutralize feature by replacing with its baseline mean
        X_holdout_ablated = X_holdout.copy()
        X_holdout_ablated[:, f_idx] = base_stats[f_name]["mean"]

        ablated_dec = model.decision_function(X_holdout_ablated)
        ablated_scores = np.clip(50.0 * (1.0 - np.tanh(ablated_dec / scale_factor)), 0.0, 100.0)
        ablated_fpr = float(np.mean(ablated_scores >= 50.0) * 100.0)
        fpr_reduction = raw_holdout_fpr - ablated_fpr
        mean_score_reduction = float(np.mean(baseline_holdout_scores) - np.mean(ablated_scores))

        holdout_ablation_results.append({
            "feature": f_name,
            "ablated_fpr": round(ablated_fpr, 2),
            "fpr_reduction": round(fpr_reduction, 2),
            "mean_score_reduction": round(mean_score_reduction, 2)
        })

    # Sort by FPR reduction (highest impact first)
    holdout_ablation_results = sorted(holdout_ablation_results, key=lambda k: k["fpr_reduction"], reverse=True)

    print(f"{'Rank':<5} {'Feature Name':<28} {'New Holdout FPR':<18} {'FPR Reduction':<16} {'Mean Score Drop'}")
    print("-" * 85)
    for rank, res in enumerate(holdout_ablation_results, start=1):
        print(f"{rank:<5} {res['feature']:<28} {res['ablated_fpr']:>6.2f}%            {res['fpr_reduction']:>+6.2f}%          {res['mean_score_reduction']:>+6.2f} pts")

    # =========================================================================
    # 4. CORRELATION ANALYSIS (PEARSON & SPEARMAN)
    # =========================================================================
    print("\n=================================================================")
    print(" 4. CORRELATION WITH ENVIRONMENTAL & KINEMATIC VARIABLES")
    print("=================================================================")

    # Valid evaluation subset (t >= 29s)
    valid_scores = full_scores[valid_idx]
    valid_time_hrs = time_hours[valid_idx]
    valid_temp = raw_temp[valid_idx]
    valid_disp = raw_disp[valid_idx]
    valid_tilt = raw_tilt[valid_idx]
    valid_vib = raw_vib[valid_idx]

    def pearson_corr(x, y):
        mx = np.mean(x)
        my = np.mean(y)
        sx = np.std(x)
        sy = np.std(y)
        if sx == 0 or sy == 0:
            return 0.0
        return float(np.mean((x - mx) * (y - my)) / (sx * sy))

    corr_variables = [
        ("Time Elapsed (Hours)", valid_time_hrs),
        ("Temperature (°C)", valid_temp),
        ("Displacement (mm)", valid_disp),
        ("Tilt Angle (°)", valid_tilt),
        ("Vibration (g)", valid_vib)
    ]

    print(f"{'Variable':<26} {'Full 24h Correlation (r)':<26} {'Baseline-Only (r)':<20} {'Holdout-Only (r)'}")
    print("-" * 88)

    # Slices
    base_idx = phase_data_slices["NORMAL_BASELINE"]["indices"]
    hold_idx = phase_data_slices["NORMAL_HOLDOUT"]["indices"]

    for var_name, var_arr in corr_variables:
        r_full = pearson_corr(valid_scores, var_arr)
        r_base = pearson_corr(full_scores[base_idx], raw_temp[base_idx] if "Temp" in var_name else (raw_tilt[base_idx] if "Tilt" in var_name else (raw_disp[base_idx] if "Disp" in var_name else (raw_vib[base_idx] if "Vib" in var_name else time_hours[base_idx]))))
        r_hold = pearson_corr(full_scores[hold_idx], raw_temp[hold_idx] if "Temp" in var_name else (raw_tilt[hold_idx] if "Tilt" in var_name else (raw_disp[hold_idx] if "Disp" in var_name else (raw_vib[hold_idx] if "Vib" in var_name else time_hours[hold_idx]))))

        print(f"{var_name:<26} {r_full:>+7.4f}                   {r_base:>+7.4f}              {r_hold:>+7.4f}")

    # =========================================================================
    # 5. GENERATE DIAGNOSTIC VISUALIZATION PLOTS
    # =========================================================================
    generate_score_distribution_plot(phase_data_slices, score_dist_svg)
    generate_feature_shift_plot(all_phase_feature_profiles, feature_shift_svg)

    print(f"\n [OK] Saved score distribution plot: {score_dist_svg}")
    print(f" [OK] Saved feature shift plot:      {feature_shift_svg}\n")

    return {
        "all_phase_profiles": all_phase_feature_profiles,
        "holdout_ablation": holdout_ablation_results,
        "top_holdout_fp": top_holdout_fp,
        "top_stab_fp": top_stab_fp
    }

def generate_score_distribution_plot(phase_data_slices, output_svg):
    """
    Generates multi-phase box-and-whisker & distribution plot for anomaly scores.
    """
    os.makedirs(os.path.dirname(output_svg), exist_ok=True)
    width = 1100
    height = 580
    margin_left = 190
    margin_right = 60
    margin_top = 70
    plot_width = width - margin_left - margin_right
    row_height = 48
    row_gap = 12

    phases = PHASE_DEFINITIONS

    svg = []
    svg.append(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" width="{width}" height="{height}" style="background:#090d16; font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, monospace;">')
    svg.append(f'<text x="{margin_left}" y="32" fill="#f8fafc" font-size="17" font-weight="bold">MineGuard AI — Anomaly Score Distribution Across All Operational Phases</text>')
    svg.append(f'<text x="{margin_left}" y="52" fill="#94a3b8" font-size="11.5">Box plots showing Median, IQR (25th-75th), and 5th-95th Percentile Ranges | Threshold = 50.0</text>')

    for idx, p in enumerate(phases):
        p_name = p["name"]
        scores = phase_data_slices[p_name]["scores"]
        valid_scores = scores[~np.isnan(scores)]
        
        y_center = margin_top + idx * (row_height + row_gap) + row_height / 2
        y_top = y_center - row_height / 2 + 6
        box_h = row_height - 12

        med = percentile(valid_scores, 50)
        p25 = percentile(valid_scores, 25)
        p75 = percentile(valid_scores, 75)
        p5 = percentile(valid_scores, 5)
        p95 = percentile(valid_scores, 95)
        mean_v = float(np.mean(valid_scores)) if len(valid_scores) > 0 else 0.0

        col = "#ef4444" if p["is_anomaly"] else ("#f59e0b" if "HOLDOUT" in p_name else "#10b981")
        if "STABILIZED" in p_name:
            col = "#8b5cf6"

        # Background row track
        svg.append(f'<rect x="{margin_left}" y="{y_top}" width="{plot_width}" height="{box_h}" fill="#0f172a" stroke="#1e293b" rx="4"/>')

        # Whisker line (5th to 95th)
        x_p5 = margin_left + (p5 / 100.0) * plot_width
        x_p95 = margin_left + (p95 / 100.0) * plot_width
        svg.append(f'<line x1="{x_p5:.1f}" y1="{y_center:.1f}" x2="{x_p95:.1f}" y2="{y_center:.1f}" stroke="{col}" stroke-width="1.5"/>')
        svg.append(f'<line x1="{x_p5:.1f}" y1="{y_center - 6:.1f}" x2="{x_p5:.1f}" y2="{y_center + 6:.1f}" stroke="{col}" stroke-width="1.5"/>')
        svg.append(f'<line x1="{x_p95:.1f}" y1="{y_center - 6:.1f}" x2="{x_p95:.1f}" y2="{y_center + 6:.1f}" stroke="{col}" stroke-width="1.5"/>')

        # Box (25th to 75th)
        x_p25 = margin_left + (p25 / 100.0) * plot_width
        x_p75 = margin_left + (p75 / 100.0) * plot_width
        box_w = max(2.0, x_p75 - x_p25)
        svg.append(f'<rect x="{x_p25:.1f}" y="{y_center - 10:.1f}" width="{box_w:.1f}" height="20" fill="{col}" fill-opacity="0.3" stroke="{col}" stroke-width="1.5" rx="3"/>')

        # Median tick
        x_med = margin_left + (med / 100.0) * plot_width
        svg.append(f'<line x1="{x_med:.1f}" y1="{y_center - 10:.1f}" x2="{x_med:.1f}" y2="{y_center + 10:.1f}" stroke="#ffffff" stroke-width="2"/>')

        # Mean point (diamond)
        x_mean = margin_left + (mean_v / 100.0) * plot_width
        svg.append(f'<circle cx="{x_mean:.1f}" cy="{y_center:.1f}" r="3" fill="#fbbf24"/>')

        # Phase Label
        svg.append(f'<text x="{margin_left - 12}" y="{y_center + 4:.1f}" fill="#cbd5e1" font-size="10.5" font-weight="bold" text-anchor="end">{p_name}</text>')
        # Score annotations
        svg.append(f'<text x="{margin_left + plot_width + 8}" y="{y_center + 4:.1f}" fill="#94a3b8" font-size="10" font-family="monospace">μ={mean_v:.1f} m={med:.1f}</text>')

    # Anomaly Threshold Guide at 50.0
    x_thresh = margin_left + 0.50 * plot_width
    svg.append(f'<line x1="{x_thresh:.1f}" y1="{margin_top - 10}" x2="{x_thresh:.1f}" y2="{margin_top + len(phases) * (row_height + row_gap)}" stroke="#f43f5e" stroke-width="1.5" stroke-dasharray="4,2"/>')
    svg.append(f'<text x="{x_thresh}" y="{margin_top - 16}" fill="#f43f5e" font-size="10" font-weight="bold" text-anchor="middle">Anomaly Decision Boundary (50.0)</text>')

    # Bottom Axis
    axis_y = margin_top + len(phases) * (row_height + row_gap)
    svg.append(f'<line x1="{margin_left}" y1="{axis_y}" x2="{margin_left + plot_width}" y2="{axis_y}" stroke="#64748b" stroke-width="1"/>')
    for sc in [0, 20, 40, 50, 60, 80, 100]:
        x_tick = margin_left + (sc / 100.0) * plot_width
        svg.append(f'<line x1="{x_tick:.1f}" y1="{axis_y}" x2="{x_tick:.1f}" y2="{axis_y + 5}" stroke="#94a3b8" stroke-width="1"/>')
        svg.append(f'<text x="{x_tick:.1f}" y="{axis_y + 18}" fill="#94a3b8" font-size="10" text-anchor="middle" font-family="monospace">{sc}</text>')

    svg.append('</svg>')

    with open(output_svg, mode="w", encoding="utf-8") as f:
        f.write("\n".join(svg))

def generate_feature_shift_plot(profiles, output_svg):
    """
    Generates bar chart showing largest standardized feature shifts (in standard deviations)
    between Baseline and Normal Holdout vs Stabilized_01.
    """
    os.makedirs(os.path.dirname(output_svg), exist_ok=True)
    width = 1100
    height = 700
    margin_left = 220
    margin_right = 60
    margin_top = 70
    plot_width = width - margin_left - margin_right
    bar_height = 14
    bar_gap = 22

    features = ENGINEERED_FEATURE_NAMES

    # Compute max absolute shift for scaling
    max_shift = 0.0
    for f in features:
        h_d = abs(profiles["NORMAL_HOLDOUT"][f]["std_diff_vs_baseline"])
        s_d = abs(profiles["STABILIZED_01"][f]["std_diff_vs_baseline"])
        max_shift = max(max_shift, h_d, s_d)

    scale_max = max(max_shift * 1.1, 5.0)

    svg = []
    svg.append(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" width="{width}" height="{height}" style="background:#090d16; font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, monospace;">')
    svg.append(f'<text x="{margin_left}" y="32" fill="#f8fafc" font-size="17" font-weight="bold">MineGuard AI — Standardized Feature Distribution Shifts (vs. Baseline)</text>')
    svg.append(f'<text x="{margin_left}" y="52" fill="#94a3b8" font-size="11.5">Shift in Standard Deviations: (μ_phase - μ_baseline) / σ_baseline | Amber: Normal Holdout | Purple: Stabilized_01</text>')

    # Zero center line
    x_zero = margin_left + (plot_width / 2.0)
    svg.append(f'<line x1="{x_zero:.1f}" y1="{margin_top - 5}" x2="{x_zero:.1f}" y2="{margin_top + len(features) * (bar_height * 2 + bar_gap)}" stroke="#64748b" stroke-width="1.5"/>')
    svg.append(f'<text x="{x_zero}" y="{margin_top - 12}" fill="#cbd5e1" font-size="10" font-weight="bold" text-anchor="middle">Baseline 0.0 σ</text>')

    for idx, f in enumerate(features):
        y_top = margin_top + idx * (bar_height * 2 + bar_gap)
        
        h_shift = profiles["NORMAL_HOLDOUT"][f]["std_diff_vs_baseline"]
        s_shift = profiles["STABILIZED_01"][f]["std_diff_vs_baseline"]

        # Clamp for visualization to +/- scale_max
        h_clamp = np.clip(h_shift, -scale_max, scale_max)
        s_clamp = np.clip(s_shift, -scale_max, scale_max)

        h_w = (h_clamp / scale_max) * (plot_width / 2.0)
        s_w = (s_clamp / scale_max) * (plot_width / 2.0)

        # Bar 1: Normal Holdout (Amber)
        y_b1 = y_top
        x_b1 = x_zero if h_w >= 0 else x_zero + h_w
        svg.append(f'<rect x="{x_b1:.1f}" y="{y_b1}" width="{abs(h_w):.1f}" height="{bar_height}" fill="#f59e0b" rx="2"/>')

        # Bar 2: Stabilized_01 (Purple)
        y_b2 = y_top + bar_height + 2
        x_b2 = x_zero if s_w >= 0 else x_zero + s_w
        svg.append(f'<rect x="{x_b2:.1f}" y="{y_b2}" width="{abs(s_w):.1f}" height="{bar_height}" fill="#a855f7" rx="2"/>')

        # Label
        svg.append(f'<text x="{margin_left - 12}" y="{y_top + bar_height + 2}" fill="#cbd5e1" font-size="10" font-weight="bold" text-anchor="end">{f}</text>')

        # Value annotation
        svg.append(f'<text x="{margin_left + plot_width + 8}" y="{y_top + bar_height + 2}" fill="#94a3b8" font-size="9.5" font-family="monospace">H:{h_shift:>+5.1f}σ S:{s_shift:>+5.1f}σ</text>')

    # Legend
    svg.append(f'<rect x="{width - 280}" y="20" width="14" height="10" fill="#f59e0b" rx="2"/>')
    svg.append(f'<text x="{width - 260}" y="29" fill="#f59e0b" font-size="10.5" font-weight="bold">NORMAL_HOLDOUT</text>')
    svg.append(f'<rect x="{width - 150}" y="20" width="14" height="10" fill="#a855f7" rx="2"/>')
    svg.append(f'<text x="{width - 130}" y="29" fill="#a855f7" font-size="10.5" font-weight="bold">STABILIZED_01</text>')

    svg.append('</svg>')

    with open(output_svg, mode="w", encoding="utf-8") as f:
        f.write("\n".join(svg))

if __name__ == "__main__":
    run_diagnostics()
