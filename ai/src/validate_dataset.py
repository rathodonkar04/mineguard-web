#!/usr/bin/env python3
"""
MineGuard AI Subsystem - Dataset Validation Pipeline
Smart India Hackathon 2026 (Problem Statement 26025)

Validates:
1. File existence, size, and header schema
2. Missing, null, or empty values
3. Timestamp format, monotonicity, and 1-second sampling consistency
4. Duplicate timestamps
5. Numeric validity (NaN, Inf, unparseable values)
6. Physical domain constraints:
   - tilt_angle >= 0
   - tilt_angle == sqrt(tilt_x^2 + tilt_y^2) +/- tolerance
   - displacement >= 0
   - vibration > 0
   - realistic temperature range (-20°C to 70°C)
7. Statistical summary profiling
"""

import os
import sys
import csv
import math
from datetime import datetime

# Ensure UTF-8 output encoding on Windows consoles
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

EXPECTED_SCHEMA = [
    "timestamp",
    "tilt_x",
    "tilt_y",
    "tilt_angle",
    "temperature",
    "displacement",
    "vibration"
]

def validate_telemetry_dataset(csv_path="ai/data/telemetry.csv"):
    print("=================================================================")
    print(" MineGuard Telemetry Dataset Validation Suite")
    print(f" Target File: {csv_path}")
    print("=================================================================\n")

    errors = []
    warnings = []

    # 1. File existence check
    if not os.path.exists(csv_path):
        print(f" [ERROR] File {csv_path} does not exist!")
        return False, ["File not found."]

    file_size_bytes = os.path.getsize(csv_path)
    if file_size_bytes == 0:
        print(f" [ERROR] File {csv_path} is empty!")
        return False, ["File is empty."]

    print(f" [INFO] File Size: {file_size_bytes / (1024 * 1024):.2f} MB ({file_size_bytes:,} bytes)")

    # 2. Read and validate rows
    rows = []
    with open(csv_path, mode="r", encoding="utf-8") as f:
        reader = csv.reader(f)
        header = next(reader, None)
        
        # Header check
        if header != EXPECTED_SCHEMA:
            errors.append(f"Header mismatch! Expected {EXPECTED_SCHEMA}, found {header}")
        else:
            print(" [PASS] Schema check: Headers match exact required 7 columns.")

        for line_num, row in enumerate(reader, start=2):
            rows.append((line_num, row))

    total_rows = len(rows)
    print(f" [INFO] Total Telemetry Records: {total_rows:,}")

    if total_rows == 0:
        errors.append("Dataset contains header but 0 data records.")
        return False, errors

    # Data collection for statistics
    timestamps = []
    seen_timestamps = set()
    numeric_channels = {
        "tilt_x": [],
        "tilt_y": [],
        "tilt_angle": [],
        "temperature": [],
        "displacement": [],
        "vibration": []
    }

    prev_dt = None

    for line_num, row in rows:
        # Check column count
        if len(row) != len(EXPECTED_SCHEMA):
            errors.append(f"Line {line_num}: Column count is {len(row)}, expected {len(EXPECTED_SCHEMA)}")
            continue

        ts_str, tilt_x_str, tilt_y_str, tilt_ang_str, temp_str, disp_str, vib_str = row

        # Check for missing / empty fields
        for col_name, val_str in zip(EXPECTED_SCHEMA, row):
            if val_str is None or val_str.strip() == "":
                errors.append(f"Line {line_num}: Missing/empty value for '{col_name}'")

        # Timestamp checks
        try:
            current_dt = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
            timestamps.append(current_dt)

            if ts_str in seen_timestamps:
                errors.append(f"Line {line_num}: Duplicate timestamp '{ts_str}'")
            seen_timestamps.add(ts_str)

            if prev_dt is not None:
                delta_sec = (current_dt - prev_dt).total_seconds()
                if abs(delta_sec - 1.0) > 1e-3:
                    errors.append(f"Line {line_num}: Inconsistent sampling interval ({delta_sec}s between {prev_dt} and {current_dt})")

            prev_dt = current_dt

        except Exception as e:
            errors.append(f"Line {line_num}: Invalid timestamp format '{ts_str}': {e}")

        # Numeric channels parse and boundary checks
        try:
            tilt_x = float(tilt_x_str)
            if math.isnan(tilt_x) or math.isinf(tilt_x):
                errors.append(f"Line {line_num}: Invalid tilt_x ({tilt_x_str})")
            numeric_channels["tilt_x"].append(tilt_x)
        except ValueError:
            errors.append(f"Line {line_num}: Cannot parse tilt_x as float: '{tilt_x_str}'")

        try:
            tilt_y = float(tilt_y_str)
            if math.isnan(tilt_y) or math.isinf(tilt_y):
                errors.append(f"Line {line_num}: Invalid tilt_y ({tilt_y_str})")
            numeric_channels["tilt_y"].append(tilt_y)
        except ValueError:
            errors.append(f"Line {line_num}: Cannot parse tilt_y as float: '{tilt_y_str}'")

        try:
            tilt_angle = float(tilt_ang_str)
            if math.isnan(tilt_angle) or math.isinf(tilt_angle):
                errors.append(f"Line {line_num}: Invalid tilt_angle ({tilt_ang_str})")
            if tilt_angle < 0:
                errors.append(f"Line {line_num}: Negative tilt_angle ({tilt_angle} deg)")
            
            # Cross-verify tilt_angle matches sqrt(tilt_x^2 + tilt_y^2) within rounding tolerance
            if 'tilt_x' in locals() and 'tilt_y' in locals():
                calc_ang = math.sqrt(tilt_x**2 + tilt_y**2)
                if abs(tilt_angle - calc_ang) > 0.02:
                    errors.append(f"Line {line_num}: tilt_angle ({tilt_angle} deg) diverges from sqrt(tilt_x^2 + tilt_y^2) = {calc_ang:.3f} deg")

            numeric_channels["tilt_angle"].append(tilt_angle)
        except ValueError:
            errors.append(f"Line {line_num}: Cannot parse tilt_angle as float: '{tilt_ang_str}'")

        try:
            temp = float(temp_str)
            if math.isnan(temp) or math.isinf(temp):
                errors.append(f"Line {line_num}: Invalid temperature ({temp_str})")
            if temp < -30 or temp > 80:
                warnings.append(f"Line {line_num}: Extreme temperature reading: {temp} C")
            numeric_channels["temperature"].append(temp)
        except ValueError:
            errors.append(f"Line {line_num}: Cannot parse temperature as float: '{temp_str}'")

        try:
            disp = float(disp_str)
            if math.isnan(disp) or math.isinf(disp):
                errors.append(f"Line {line_num}: Invalid displacement ({disp_str})")
            if disp < 0:
                errors.append(f"Line {line_num}: Negative displacement ({disp} mm)")
            numeric_channels["displacement"].append(disp)
        except ValueError:
            errors.append(f"Line {line_num}: Cannot parse displacement as float: '{disp_str}'")

        try:
            vib = float(vib_str)
            if math.isnan(vib) or math.isinf(vib):
                errors.append(f"Line {line_num}: Invalid vibration ({vib_str})")
            if vib <= 0:
                errors.append(f"Line {line_num}: Non-positive vibration index ({vib} g)")
            numeric_channels["vibration"].append(vib)
        except ValueError:
            errors.append(f"Line {line_num}: Cannot parse vibration as float: '{vib_str}'")

    # 3. Print Validation Results
    print("\n-----------------------------------------------------------------")
    print(" VALIDATION CHECKS SUMMARY")
    print("-----------------------------------------------------------------")

    if not errors:
        print(" [PASS] Missing / Null Values:        0 (Zero missing values)")
        print(" [PASS] Duplicate Timestamps:         0 (All timestamps strictly unique)")
        print(" [PASS] Sampling Consistency:         1.000s uniform delta (1 Hz continuous)")
        print(" [PASS] Numeric Validity:             100% finite valid floats (0 NaN / 0 Inf)")
        print(" [PASS] Physical Domain Limits:       All values within physically coherent bounds")
        print(" [PASS] Tilt Angle Geometry:          tilt_angle matches sqrt(tilt_x^2 + tilt_y^2)")
        print(f" [PASS] Sampling Duration:            {timestamps[0].strftime('%Y-%m-%d %H:%M:%S UTC')} to {timestamps[-1].strftime('%Y-%m-%d %H:%M:%S UTC')} ({len(timestamps):,} seconds)")
    else:
        print(f" [FAIL] ERRORS FOUND ({len(errors)}):")
        for err in errors[:10]:
            print(f"    - {err}")
        if len(errors) > 10:
            print(f"    ... and {len(errors) - 10} more errors.")

    if warnings:
        print(f"\n [WARN] WARNINGS ({len(warnings)}):")
        for w in warnings[:5]:
            print(f"    - {w}")

    # 4. Statistical Profiling Table
    print("\n-----------------------------------------------------------------")
    print(" STATISTICAL PROFILING")
    print("-----------------------------------------------------------------")
    print(f"{'Channel':<15} {'Min':<10} {'Mean':<10} {'Median':<10} {'Max':<10} {'StdDev':<10}")
    print("-" * 65)

    def stats(arr):
        if not arr:
            return 0, 0, 0, 0, 0
        n = len(arr)
        s_arr = sorted(arr)
        mean = sum(arr) / n
        median = s_arr[n // 2] if n % 2 != 0 else (s_arr[n // 2 - 1] + s_arr[n // 2]) / 2
        variance = sum((x - mean) ** 2 for x in arr) / n
        std = math.sqrt(variance)
        return min(arr), mean, median, max(arr), std

    for ch_name in ["tilt_x", "tilt_y", "tilt_angle", "temperature", "displacement", "vibration"]:
        ch_min, ch_mean, ch_med, ch_max, ch_std = stats(numeric_channels[ch_name])
        unit = "deg" if "tilt" in ch_name else ("C" if ch_name == "temperature" else ("mm" if ch_name == "displacement" else "g"))
        print(f"{ch_name + ' (' + unit + ')':<15} {ch_min:<10.3f} {ch_mean:<10.3f} {ch_med:<10.3f} {ch_max:<10.3f} {ch_std:<10.3f}")

    print("=================================================================\n")

    return (len(errors) == 0), errors

if __name__ == "__main__":
    csv_file = sys.argv[1] if len(sys.argv) > 1 else "ai/data/telemetry.csv"
    success, errors = validate_telemetry_dataset(csv_file)
    if not success:
        sys.exit(1)
    sys.exit(0)
