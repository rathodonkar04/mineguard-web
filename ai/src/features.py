#!/usr/bin/env python3
"""
MineGuard AI Subsystem - Causal Feature Engineering Pipeline
Smart India Hackathon 2026 (Problem Statement 26025)

=============================================================================
PURPOSE:
=============================================================================
Transforms raw 7-channel telemetry into a feature-engineered representation
for baseline deviation monitoring, kinematic dynamics, and unsupervised
Isolation Forest anomaly detection.

KEY DESIGN PRINCIPLES:
1. STRICT CAUSALITY: All rolling windows and finite-difference derivatives
   use only past observations [t - K, t]. Never uses future data.
2. NO DATA LEAKAGE: Baseline statistics (mu, sigma, alpha_thermal) are fit
   strictly on the initial calibration period (t <= 14,400s) and loaded from
   ai/models/baseline.json.
3. EXPLICIT INITIAL EDGE HANDLING: Initial rows lacking full historical context
   (e.g. first 29 rows for 30s rolling stats) contain NaN and are explicitly
   accounted for.
4. ZERO-DIVISION SAFETY: All divisions use safe baseline standard deviations.
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

ENGINEERED_FEATURE_NAMES = [
    # Baseline Z-scores
    "z_tilt",
    "z_displacement",
    "z_vibration",
    "z_temperature",
    # Kinematic derivatives (5-second finite differences)
    "tilt_rate",
    "displacement_rate",
    "displacement_acceleration",
    "vibration_rate",
    # Rolling statistics (30-second causal window)
    "tilt_mean_30s",
    "tilt_std_30s",
    "displacement_mean_30s",
    "vibration_mean_30s",
    "vibration_std_30s",
    "volatility_ratio",
    # Thermal features
    "delta_temperature",
    "detrended_tilt"
]

def load_baseline_model(baseline_json_path="ai/models/baseline.json"):
    """
    Loads baseline calibration parameters from JSON.
    """
    if not os.path.exists(baseline_json_path):
        raise FileNotFoundError(
            f"Baseline file {baseline_json_path} not found. Run ai/src/baseline.py first."
        )
    with open(baseline_json_path, mode="r", encoding="utf-8") as f:
        return json.load(f)

def compute_rolling_stats(buffer_vals):
    """
    Computes sample mean and sample standard deviation over a buffer.
    """
    n = len(buffer_vals)
    if n == 0:
        return float('nan'), float('nan')
    mean_val = sum(buffer_vals) / n
    if n > 1:
        var_val = sum((x - mean_val) ** 2 for x in buffer_vals) / (n - 1)
        std_val = math.sqrt(max(0.0, var_val))
    else:
        std_val = 0.0
    return mean_val, std_val

def transform_telemetry_stream(
    raw_records,
    baseline_payload,
    finite_diff_interval=5,
    rolling_window_size=30
):
    """
    Transforms raw telemetry records into engineered feature dictionaries.
    Strictly causal implementation.
    """
    stats = baseline_payload["statistics"]
    thermal = baseline_payload["thermal_coupling"]
    
    alpha_thermal = thermal["alpha_thermal"] if thermal.get("is_statistically_meaningful", False) else 0.0

    # Extract baseline mu and safe_std
    mu_tilt = stats["tilt_angle"]["mean"]
    sigma_tilt = stats["tilt_angle"]["safe_std"]

    mu_disp = stats["displacement"]["mean"]
    sigma_disp = stats["displacement"]["safe_std"]

    mu_vib = stats["vibration"]["mean"]
    sigma_vib = stats["vibration"]["safe_std"]

    mu_temp = stats["temperature"]["mean"]
    sigma_temp = stats["temperature"]["safe_std"]

    transformed_records = []
    
    # Historical rolling buffers (strictly past-only)
    tilt_history = []
    disp_history = []
    vib_history = []
    temp_history = []
    disp_rate_history = []

    for t_idx, row in enumerate(raw_records):
        t_sec = t_idx
        ts_str = row["timestamp"]

        tilt_x = float(row["tilt_x"])
        tilt_y = float(row["tilt_y"])
        tilt_angle = float(row["tilt_angle"])
        temperature = float(row["temperature"])
        displacement = float(row["displacement"])
        vibration = float(row["vibration"])

        # Append to causal historical buffers
        tilt_history.append(tilt_angle)
        disp_history.append(displacement)
        vib_history.append(vibration)
        temp_history.append(temperature)

        # 1. Baseline Z-Scores (Pointwise)
        z_tilt = (tilt_angle - mu_tilt) / sigma_tilt
        z_displacement = (displacement - mu_disp) / sigma_disp
        z_vibration = (vibration - mu_vib) / sigma_vib
        z_temperature = (temperature - mu_temp) / sigma_temp

        # 2. Thermal Features
        delta_temperature = temperature - mu_temp
        detrended_tilt = tilt_angle - (alpha_thermal * delta_temperature)

        # 3. Kinematic Derivatives (5-second causal difference: x[t] - x[t - 5])
        if t_sec >= finite_diff_interval:
            tilt_rate = (tilt_history[t_sec] - tilt_history[t_sec - finite_diff_interval]) / float(finite_diff_interval)
            displacement_rate = (disp_history[t_sec] - disp_history[t_sec - finite_diff_interval]) / float(finite_diff_interval)
            vibration_rate = (vib_history[t_sec] - vib_history[t_sec - finite_diff_interval]) / float(finite_diff_interval)
        else:
            tilt_rate = float('nan')
            displacement_rate = float('nan')
            vibration_rate = float('nan')

        disp_rate_history.append(displacement_rate)

        # Displacement Acceleration: (disp_rate[t] - disp_rate[t - 5]) / 5.0
        if t_sec >= (2 * finite_diff_interval) and not math.isnan(disp_rate_history[t_sec - finite_diff_interval]):
            displacement_acceleration = (disp_rate_history[t_sec] - disp_rate_history[t_sec - finite_diff_interval]) / float(finite_diff_interval)
        else:
            displacement_acceleration = float('nan')

        # 4. Rolling Statistics (30-second causal window: [t - 29, t])
        if t_sec >= (rolling_window_size - 1):
            tilt_win = tilt_history[t_sec - rolling_window_size + 1 : t_sec + 1]
            disp_win = disp_history[t_sec - rolling_window_size + 1 : t_sec + 1]
            vib_win = vib_history[t_sec - rolling_window_size + 1 : t_sec + 1]

            tilt_mean_30s, tilt_std_30s = compute_rolling_stats(tilt_win)
            disp_mean_30s, _ = compute_rolling_stats(disp_win)
            vib_mean_30s, vib_std_30s = compute_rolling_stats(vib_win)

            # Volatility Ratio: current local vibration std / baseline vibration std
            volatility_ratio = vib_std_30s / sigma_vib
        else:
            tilt_mean_30s = float('nan')
            tilt_std_30s = float('nan')
            disp_mean_30s = float('nan')
            vib_mean_30s = float('nan')
            vib_std_30s = float('nan')
            volatility_ratio = float('nan')

        feat_dict = {
            "timestamp": ts_str,
            # Raw channels preserved
            "tilt_x": tilt_x,
            "tilt_y": tilt_y,
            "tilt_angle": tilt_angle,
            "temperature": temperature,
            "displacement": displacement,
            "vibration": vibration,
            # Baseline Z-scores
            "z_tilt": round(z_tilt, 4),
            "z_displacement": round(z_displacement, 4),
            "z_vibration": round(z_vibration, 4),
            "z_temperature": round(z_temperature, 4),
            # Kinematic derivatives
            "tilt_rate": round(tilt_rate, 6) if not math.isnan(tilt_rate) else float('nan'),
            "displacement_rate": round(displacement_rate, 6) if not math.isnan(displacement_rate) else float('nan'),
            "displacement_acceleration": round(displacement_acceleration, 6) if not math.isnan(displacement_acceleration) else float('nan'),
            "vibration_rate": round(vibration_rate, 6) if not math.isnan(vibration_rate) else float('nan'),
            # Rolling statistics (30s)
            "tilt_mean_30s": round(tilt_mean_30s, 4) if not math.isnan(tilt_mean_30s) else float('nan'),
            "tilt_std_30s": round(tilt_std_30s, 5) if not math.isnan(tilt_std_30s) else float('nan'),
            "displacement_mean_30s": round(disp_mean_30s, 4) if not math.isnan(disp_mean_30s) else float('nan'),
            "vibration_mean_30s": round(vib_mean_30s, 5) if not math.isnan(vib_mean_30s) else float('nan'),
            "vibration_std_30s": round(vib_std_30s, 6) if not math.isnan(vib_std_30s) else float('nan'),
            "volatility_ratio": round(volatility_ratio, 4) if not math.isnan(volatility_ratio) else float('nan'),
            # Thermal features
            "delta_temperature": round(delta_temperature, 4),
            "detrended_tilt": round(detrended_tilt, 4)
        }

        transformed_records.append(feat_dict)

    return transformed_records

def validate_engineered_features(records, expected_features=ENGINEERED_FEATURE_NAMES):
    """
    Validates engineered feature records against quality checks.
    """
    errors = []
    warnings = []
    
    total_records = len(records)
    if total_records == 0:
        return False, ["Zero records provided for validation."]

    # 1. Feature names check
    sample_keys = set(records[0].keys())
    missing_keys = [f for f in expected_features if f not in sample_keys]
    if missing_keys:
        errors.append(f"Missing expected engineered features: {missing_keys}")

    # 2. Count NaNs and Infs per feature
    nan_counts = {f: 0 for f in expected_features}
    inf_counts = {f: 0 for f in expected_features}

    for row_idx, row in enumerate(records):
        for f in expected_features:
            val = row[f]
            if math.isnan(val):
                nan_counts[f] += 1
            elif math.isinf(val):
                inf_counts[f] += 1
                errors.append(f"Row {row_idx}: Infinite value in feature '{f}'")

    # Verify that NaNs occur ONLY in expected initial historical warm-up window
    # 30s rolling window -> max 29 NaNs
    # 5s finite diff -> max 5 NaNs
    # 5s 2nd diff -> max 10 NaNs
    for f, count in nan_counts.items():
        if "30s" in f or "volatility" in f:
            if count != 29:
                warnings.append(f"Feature '{f}' has {count} NaNs (expected exactly 29 for 30s causal window).")
        elif "acceleration" in f:
            if count != 10:
                warnings.append(f"Feature '{f}' has {count} NaNs (expected exactly 10 for 2-step finite difference).")
        elif "rate" in f:
            if count != 5:
                warnings.append(f"Feature '{f}' has {count} NaNs (expected exactly 5 for 5s finite difference).")
        elif "z_" in f or "delta_" in f or "detrended" in f:
            if count != 0:
                errors.append(f"Feature '{f}' has unexpected {count} NaNs (pointwise features should have 0 NaNs).")

    return (len(errors) == 0), errors, warnings, nan_counts

def generate_features_pipeline(
    raw_csv_path="ai/data/telemetry.csv",
    baseline_json_path="ai/models/baseline.json",
    preview_csv_path="ai/data/engineered_features_preview.csv",
    plot_svg_path="ai/plots/features_diagnostic.svg"
):
    """
    Main driver executing feature transformation, validation, preview CSV, and diagnostic plots.
    """
    print("=================================================================")
    print(" MineGuard Feature Engineering Pipeline")
    print(f" Raw Telemetry:           {raw_csv_path}")
    print(f" Baseline Model:          {baseline_json_path}")
    print(f" Preview Output:          {preview_csv_path}")
    print(f" Diagnostic Plot:         {plot_svg_path}")
    print("=================================================================\n")

    # Load baseline
    baseline_model = load_baseline_model(baseline_json_path)

    # Read raw telemetry CSV
    raw_rows = []
    with open(raw_csv_path, mode="r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            raw_rows.append(row)

    print(f" [OK] Loaded {len(raw_rows):,} raw telemetry records.")

    # Transform features
    transformed = transform_telemetry_stream(raw_rows, baseline_model)
    print(f" [OK] Feature transformation complete ({len(transformed):,} records transformed).")

    # Validate
    valid, errors, warnings, nan_counts = validate_engineered_features(transformed)
    
    print("\n-----------------------------------------------------------------")
    print(" FEATURE VALIDATION & WARM-UP PROFILE")
    print("-----------------------------------------------------------------")
    print(f" Total Engineered Features: {len(ENGINEERED_FEATURE_NAMES)}")
    print(f" Status:                    {'[PASS] All Validation Checks Passed' if valid else '[FAIL] Validation Errors Found'}")
    print("\n Feature NaN Summary (Initial Causal Warm-up Window):")
    print(f" {'Feature Name':<30} {'NaN Count':<12} {'Valid Samples':<15} {'Coverage %':<10}")
    print("-" * 70)
    for feat_name in ENGINEERED_FEATURE_NAMES:
        nans = nan_counts[feat_name]
        valid_cnt = len(transformed) - nans
        cov_pct = (valid_cnt / len(transformed)) * 100.0
        print(f" {feat_name:<30} {nans:<12} {valid_cnt:<15,} {cov_pct:<10.2f}%")

    if errors:
        print("\n [ERROR] Errors detected:")
        for err in errors:
            print(f"   - {err}")

    # Write representative preview CSV (first 50 rows + periodic phase samples across all 24 hours)
    # Include warm-up rows (0-35), inflexion (t=20000-20020), subsidence (t=32000-32020), recovery (t=60000-60020)
    preview_indices = list(range(0, 50)) + list(range(20000, 20025)) + list(range(32000, 32035)) + list(range(60000, 60025))
    preview_indices = sorted(list(set(preview_indices)))

    fieldnames = ["timestamp", "tilt_x", "tilt_y", "tilt_angle", "temperature", "displacement", "vibration"] + ENGINEERED_FEATURE_NAMES
    
    with open(preview_csv_path, mode="w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for idx in preview_indices:
            writer.writerow(transformed[idx])

    print(f"\n [OK] Diagnostic preview CSV written: {preview_csv_path} ({len(preview_indices)} representative rows)")

    # Generate Diagnostic Plot (SVG)
    generate_diagnostic_svg_plot(transformed, plot_svg_path)

    return transformed, baseline_model

def generate_diagnostic_svg_plot(records, output_svg_path="ai/plots/features_diagnostic.svg", downsample=60):
    """
    Generates a 6-panel diagnostic SVG plot showing:
    1. raw tilt vs detrended tilt
    2. z_tilt
    3. displacement rate
    4. displacement acceleration
    5. vibration
    6. volatility ratio
    """
    os.makedirs(os.path.dirname(output_svg_path), exist_ok=True)
    
    # Downsample for visualization
    sampled = records[::downsample]
    total_samples = len(records)
    max_t = total_samples - 1

    width = 1200
    height = 1250
    margin_left = 95
    margin_right = 50
    margin_top = 70
    plot_width = width - margin_left - margin_right

    panel_height = 150
    panel_gap = 35

    panels = [
        {"title": "1. Raw Tilt Angle vs Detrended Tilt (°)", "unit": "°", "series": ["tilt_angle", "detrended_tilt"], "colors": ["#f43f5e", "#06b6d4"]},
        {"title": "2. Statistical Deviation: Z-Score of Tilt (z_tilt)", "unit": "σ", "series": ["z_tilt"], "colors": ["#e11d48"]},
        {"title": "3. Kinematic Displacement Rate (mm/s)", "unit": "mm/s", "series": ["displacement_rate"], "colors": ["#38bdf8"]},
        {"title": "4. Displacement Acceleration (mm/s²)", "unit": "mm/s²", "series": ["displacement_acceleration"], "colors": ["#ec4899"]},
        {"title": "5. Strata Dynamic Vibration Index (g)", "unit": "g", "series": ["vibration"], "colors": ["#a855f7"]},
        {"title": "6. Short-Term Volatility Ratio (vibration_std_30s / σ_baseline)", "unit": "x", "series": ["volatility_ratio"], "colors": ["#f59e0b"]}
    ]

    svg = []
    svg.append(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" width="{width}" height="{height}" style="background:#090d16; font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, monospace;">')
    svg.append(f'<text x="{margin_left}" y="32" fill="#f8fafc" font-size="18" font-weight="bold">MineGuard AI — Causal Feature Engineering Diagnostic Plot</text>')
    svg.append(f'<text x="{margin_left}" y="52" fill="#94a3b8" font-size="12">16 Engineered Features | Baseline Window: t=0h to 4h (14,400s) | No Future Data Leakage | 1 Hz Telemetry Stream</text>')

    # Defs
    svg.append('<defs>')
    svg.append('  <pattern id="diagGrid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1e293b" stroke-width="0.5" stroke-opacity="0.5"/></pattern>')
    svg.append('</defs>')

    for p_idx, p in enumerate(panels):
        top_y = margin_top + p_idx * (panel_height + panel_gap)
        bottom_y = top_y + panel_height

        # Panel Box
        svg.append(f'<rect x="{margin_left}" y="{top_y}" width="{plot_width}" height="{panel_height}" fill="#0f172a" stroke="#1e293b" stroke-width="1" rx="4"/>')
        svg.append(f'<rect x="{margin_left}" y="{top_y}" width="{plot_width}" height="{panel_height}" fill="url(#diagGrid)" rx="4"/>')

        # Highlight Baseline Training Period (0s - 14,400s)
        x_base_end = margin_left + (14400 / max_t) * plot_width
        svg.append(f'<rect x="{margin_left}" y="{top_y}" width="{x_base_end - margin_left:.1f}" height="{panel_height}" fill="#10b981" fill-opacity="0.08" stroke="#10b981" stroke-opacity="0.25" stroke-dasharray="2,2"/>')
        if p_idx == 0:
            svg.append(f'<text x="{margin_left + 8}" y="{top_y + 14}" fill="#34d399" font-size="9" font-weight="bold">CALIBRATION BASELINE (t=0h to 4h)</text>')

        # Highlight Subsidence Anomaly Window (28,800s - 36,000s)
        x_sub_start = margin_left + (28800 / max_t) * plot_width
        x_sub_end = margin_left + (36000 / max_t) * plot_width
        svg.append(f'<rect x="{x_sub_start:.1f}" y="{top_y}" width="{x_sub_end - x_sub_start:.1f}" height="{panel_height}" fill="#ef4444" fill-opacity="0.10" stroke="#ef4444" stroke-opacity="0.2" stroke-dasharray="2,2"/>')
        if p_idx == 0:
            svg.append(f'<text x="{x_sub_start + 4:.1f}" y="{top_y + 14}" fill="#f87171" font-size="9" font-weight="bold">SUBSIDENCE ANOMALY</text>')

        # Compute min and max across all series for this panel
        all_vals = []
        for s_name in p["series"]:
            for r in sampled:
                v = r[s_name]
                if not math.isnan(v):
                    all_vals.append(v)

        if not all_vals:
            all_vals = [0.0, 1.0]

        val_min = min(all_vals)
        val_max = max(all_vals)
        if abs(val_max - val_min) < 1e-5:
            val_max += 1.0
            val_min -= 1.0

        val_range = val_max - val_min

        def y_coord(val):
            norm = (val - val_min) / val_range
            return bottom_y - norm * (panel_height - 24) - 12

        # Grid lines and Y-labels
        num_ticks = 3
        for t_idx in range(num_ticks + 1):
            tick_val = val_min + t_idx * (val_range / num_ticks)
            y_pos = y_coord(tick_val)
            svg.append(f'<line x1="{margin_left}" y1="{y_pos:.1f}" x2="{margin_left + plot_width}" y2="{y_pos:.1f}" stroke="#334155" stroke-width="0.5" stroke-dasharray="3,3"/>')
            svg.append(f'<text x="{margin_left - 8}" y="{y_pos + 4:.1f}" fill="#94a3b8" font-size="10" text-anchor="end" font-family="monospace">{tick_val:.3f} {p["unit"]}</text>')

        # Zero reference line if within bounds
        if val_min <= 0.0 <= val_max:
            y_zero = y_coord(0.0)
            svg.append(f'<line x1="{margin_left}" y1="{y_zero:.1f}" x2="{margin_left + plot_width}" y2="{y_zero:.1f}" stroke="#64748b" stroke-width="1" stroke-dasharray="4,2"/>')

        # Title
        svg.append(f'<text x="{margin_left + 10}" y="{top_y + 20}" fill="#38bdf8" font-size="11.5" font-weight="bold">{p["title"]}</text>')

        # Plot each series in panel
        for s_idx, (s_name, s_col) in enumerate(zip(p["series"], p["colors"])):
            pts = []
            for r_idx, r in enumerate(sampled):
                t_sec = r_idx * downsample
                v = r[s_name]
                if not math.isnan(v):
                    x = margin_left + (t_sec / max_t) * plot_width
                    y = y_coord(v)
                    pts.append(f"{x:.1f},{y:.1f}")

            if pts:
                dash_attr = ' stroke-dasharray="3,2"' if s_idx > 0 else ''
                svg.append(f'<polyline points="{" ".join(pts)}" fill="none" stroke="{s_col}" stroke-width="1.8"{dash_attr}/>')

    # Bottom X-Axis Time Ticks (Hours)
    axis_y = margin_top + len(panels) * panel_height + (len(panels) - 1) * panel_gap + 15
    svg.append(f'<line x1="{margin_left}" y1="{axis_y}" x2="{margin_left + plot_width}" y2="{axis_y}" stroke="#64748b" stroke-width="1.5"/>')

    num_h_ticks = 12
    hours_total = total_samples / 3600.0
    for h in range(num_h_ticks + 1):
        frac = h / num_h_ticks
        x_pos = margin_left + frac * plot_width
        hour_val = frac * hours_total
        time_str = f"T+{hour_val:.0f}h"
        svg.append(f'<line x1="{x_pos:.1f}" y1="{axis_y}" x2="{x_pos:.1f}" y2="{axis_y + 5}" stroke="#94a3b8" stroke-width="1"/>')
        svg.append(f'<text x="{x_pos:.1f}" y="{axis_y + 18}" fill="#cbd5e1" font-size="10" text-anchor="middle" font-family="monospace">{time_str}</text>')

    svg.append(f'<text x="{width/2}" y="{height - 15}" fill="#64748b" font-size="10" text-anchor="middle">Time Elapsed (Hours) | Continuous 1 Hz Telemetry | MineGuard AI Feature Extraction Subsystem</text>')
    svg.append('</svg>')

    with open(output_svg_path, mode="w", encoding="utf-8") as f:
        f.write("\n".join(svg))

    print(f" [OK] Diagnostic SVG Plot generated: {output_svg_path}")

if __name__ == "__main__":
    generate_features_pipeline()
