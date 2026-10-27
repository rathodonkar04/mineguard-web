#!/usr/bin/env python3
"""
MineGuard AI Subsystem - Baseline Calibration System
Smart India Hackathon 2026 (Problem Statement 26025)

=============================================================================
PURPOSE:
=============================================================================
Calculates and persists site/node baseline statistical parameters over a clean,
undisturbed calibration period (first 14,400s / 4 hours) to support:
- Statistical Z-score standardization: Z = (x - mu) / sigma
- Robust non-parametric statistics (Median, Median Absolute Deviation)
- Thermal sensitivity estimation (alpha_thermal) for thermal decoupling
- Safe handling of zero/near-zero variance without division-by-zero errors

DISCLAIMER:
SYNTHETIC DEMONSTRATION DATASET. Not certified mine-safety measurements.
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

BASELINE_CHANNELS = [
    "tilt_x",
    "tilt_y",
    "tilt_angle",
    "temperature",
    "displacement",
    "vibration"
]

EPSILON = 1e-6

def compute_channel_statistics(values):
    """
    Computes parametric and non-parametric statistics for a sequence of numbers.
    Does not assume normal distribution.
    """
    n = len(values)
    if n == 0:
        raise ValueError("Cannot compute statistics on empty sequence.")

    s_vals = sorted(values)
    mean_val = sum(values) / n

    # Variance and Standard Deviation (Sample Std, ddof=1)
    if n > 1:
        var_val = sum((x - mean_val) ** 2 for x in values) / (n - 1)
        std_val = math.sqrt(var_val)
    else:
        var_val = 0.0
        std_val = 0.0

    # Median
    if n % 2 != 0:
        median_val = s_vals[n // 2]
    else:
        median_val = (s_vals[n // 2 - 1] + s_vals[n // 2]) / 2.0

    # Median Absolute Deviation (MAD) & Normalized MAD (consistency for normal distribution)
    abs_deviations = sorted([abs(x - median_val) for x in values])
    if n % 2 != 0:
        mad_raw = abs_deviations[n // 2]
    else:
        mad_raw = (abs_deviations[n // 2 - 1] + abs_deviations[n // 2]) / 2.0
    
    mad_normalized = 1.4826 * mad_raw

    # Safeguard against zero std for downstream division
    safe_std = max(std_val, EPSILON)
    safe_mad = max(mad_normalized, EPSILON)

    return {
        "count": n,
        "mean": round(mean_val, 6),
        "std": round(std_val, 6),
        "safe_std": round(safe_std, 6),
        "median": round(median_val, 6),
        "mad_raw": round(mad_raw, 6),
        "mad_normalized": round(mad_normalized, 6),
        "safe_mad": round(safe_mad, 6),
        "min": round(min(values), 6),
        "max": round(max(values), 6)
    }

def estimate_thermal_sensitivity(temp_vals, tilt_vals):
    """
    Performs Ordinary Least Squares (OLS) linear regression of tilt_angle against temperature
    on clean baseline data to estimate thermal drift coefficient (alpha_thermal).
    
    tilt_angle(t) ~ alpha_thermal * delta_T + intercept
    """
    n = len(temp_vals)
    if n < 10:
        return {"alpha_thermal": 0.0, "r_squared": 0.0, "is_statistically_meaningful": False}

    mean_t = sum(temp_vals) / n
    mean_tilt = sum(tilt_vals) / n

    ss_tt = sum((t - mean_t) ** 2 for t in temp_vals)
    ss_tilt_tilt = sum((y - mean_tilt) ** 2 for y in tilt_vals)
    ss_t_tilt = sum((t - mean_t) * (y - mean_tilt) for t, y in zip(temp_vals, tilt_vals))

    if ss_tt <= EPSILON or ss_tilt_tilt <= EPSILON:
        return {
            "alpha_thermal": 0.0,
            "r_squared": 0.0,
            "is_statistically_meaningful": False,
            "note": "Near-zero temperature or tilt variance during baseline."
        }

    slope = ss_t_tilt / ss_tt
    intercept = mean_tilt - slope * mean_t
    r_squared = (ss_t_tilt ** 2) / (ss_tt * ss_tilt_tilt)

    # Detrending is considered meaningful if R^2 > 0.05 and slope magnitude > 0.0005 deg/C
    is_meaningful = (r_squared >= 0.05) and (abs(slope) >= 0.0005)

    return {
        "alpha_thermal": round(slope, 6),
        "intercept": round(intercept, 6),
        "r_squared": round(r_squared, 4),
        "is_statistically_meaningful": is_meaningful,
        "description": f"Slope: {slope:.6f} deg/C (R^2: {r_squared:.4f})"
    }

def fit_baseline(
    csv_path="ai/data/telemetry.csv",
    output_baseline_path="ai/models/baseline.json",
    baseline_duration_seconds=14400  # First 4 hours at 1 Hz
):
    """
    Loads telemetry CSV, extracts the baseline calibration window, computes statistics,
    and writes ai/models/baseline.json.
    """
    print("=================================================================")
    print(" MineGuard Baseline Calibration Engine")
    print(f" Input CSV:               {csv_path}")
    print(f" Calibration Window:      First {baseline_duration_seconds:,} seconds ({baseline_duration_seconds/3600:.1f} hours)")
    print(f" Output JSON:             {output_baseline_path}")
    print("=================================================================\n")

    if not os.path.exists(csv_path):
        raise FileNotFoundError(f"Input telemetry file not found: {csv_path}")

    os.makedirs(os.path.dirname(output_baseline_path), exist_ok=True)

    channel_data = {ch: [] for ch in BASELINE_CHANNELS}
    timestamps = []

    with open(csv_path, mode="r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for idx, row in enumerate(reader):
            if idx >= baseline_duration_seconds:
                break
            timestamps.append(row["timestamp"])
            for ch in BASELINE_CHANNELS:
                channel_data[ch].append(float(row[ch]))

    sample_count = len(timestamps)
    if sample_count == 0:
        raise ValueError(f"No records read from {csv_path}")

    print(f" [OK] Loaded {sample_count:,} calibration samples ({timestamps[0]} to {timestamps[-1]})")

    # Compute baseline statistics for each channel
    feature_stats = {}
    for ch in BASELINE_CHANNELS:
        feature_stats[ch] = compute_channel_statistics(channel_data[ch])

    # Estimate thermal sensitivity
    thermal_model = estimate_thermal_sensitivity(
        channel_data["temperature"],
        channel_data["tilt_angle"]
    )

    baseline_payload = {
        "calibration_metadata": {
            "created_at": datetime.now().isoformat() + "Z",
            "source_csv": csv_path,
            "sample_count": sample_count,
            "sampling_frequency_hz": 1.0,
            "duration_seconds": sample_count,
            "start_time": timestamps[0],
            "end_time": timestamps[-1],
            "epsilon_regularizer": EPSILON,
            "disclaimer": "SYNTHETIC DEMONSTRATION BASELINE. Not real mine measurements."
        },
        "statistics": feature_stats,
        "thermal_coupling": thermal_model
    }

    with open(output_baseline_path, mode="w", encoding="utf-8") as f:
        json.dump(baseline_payload, f, indent=2)

    print(f" [OK] Baseline statistics successfully saved to: {output_baseline_path}\n")
    print("-----------------------------------------------------------------")
    print(f"{'Channel':<15} {'Mean':<12} {'StdDev':<12} {'Median':<12} {'MAD (Norm)':<12}")
    print("-----------------------------------------------------------------")
    for ch in BASELINE_CHANNELS:
        st = feature_stats[ch]
        unit = "deg" if "tilt" in ch else ("C" if ch == "temperature" else ("mm" if ch == "displacement" else "g"))
        print(f"{ch + ' (' + unit + ')':<15} {st['mean']:<12.4f} {st['std']:<12.4f} {st['median']:<12.4f} {st['mad_normalized']:<12.4f}")
    print("-----------------------------------------------------------------")
    print(f" Thermal Sensitivity (alpha_thermal): {thermal_model['alpha_thermal']:.6f} deg/C (R^2: {thermal_model['r_squared']:.4f})")
    print(f" Thermal Detrending Active:          {thermal_model['is_statistically_meaningful']}")
    print("=================================================================\n")

    return baseline_payload

if __name__ == "__main__":
    fit_baseline()
