#!/usr/bin/env python3
"""
MineGuard AI Subsystem - Synthetic Telemetry Dataset Generator
Smart India Hackathon 2026 (Problem Statement 26025)

=============================================================================
SYNTHETIC DATASET DISCLAIMER:
=============================================================================
This script generates purely SYNTHETIC demonstration telemetry for development
and validation of the MineGuard AI/ML pipeline. 
- The data is generated using physical time-series simulation models.
- It DOES NOT represent real mine monitoring or certified mine-safety data.
- It MUST NOT be used for regulatory safety compliance or actual mining operations.
=============================================================================

HARDWARE SPECIFICATIONS MODELED:
- Sensor Hardware: MPU6050 6-DOF IMU (Accelerometer + Gyroscope fusion for tilt)
- Sampling Frequency: Exactly 1 reading / second (1 Hz)
- Prototype Nodes: Mesh-networked surface nodes (Node ID unassigned in hardware)
- Schema: timestamp, tilt_x, tilt_y, tilt_angle, temperature, displacement, vibration
"""

import os
import sys
import csv
import math
import random
import json
from datetime import datetime, timedelta, timezone

# Ensure UTF-8 output encoding on Windows consoles
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

def generate_telemetry_dataset(
    output_csv_path="ai/data/telemetry.csv",
    metadata_json_path="ai/data/anomaly_metadata.json",
    duration_seconds=86400,  # 24 hours at 1 Hz
    start_time_iso="2026-08-26T00:00:00Z",
    random_seed=42
):
    """
    Generates a realistic temporal time-series dataset with physically correlated
    geotechnical deformation events, sensor noise, and thermal cycles.
    """
    random.seed(random_seed)
    
    # Ensure parent directories exist
    os.makedirs(os.path.dirname(output_csv_path), exist_ok=True)
    os.makedirs(os.path.dirname(metadata_json_path), exist_ok=True)
    
    start_dt = datetime.fromisoformat(start_time_iso.replace("Z", "+00:00"))
    
    print("=================================================================")
    print(" MineGuard Synthetic Telemetry Generator (SIH 2026 PS 26025)")
    print("=================================================================")
    print(f" Target File:         {output_csv_path}")
    print(f" Duration:            {duration_seconds} seconds ({duration_seconds/3600:.1f} hours)")
    print(f" Sampling Frequency:  1 Hz (1 reading/second)")
    print(f" Total Rows:          {duration_seconds}")
    print(f" Random Seed:         {random_seed}")
    print("=================================================================\n")

    # Define synthetic anomaly event windows (for future ML evaluation)
    anomaly_events = [
        {
            "event_id": "ANOM-01-INFLEXION",
            "type": "Gradual Strata Inflexion",
            "start_time_sec": 18000,   # 5h 00m
            "end_time_sec": 28800,     # 8h 00m
            "description": "Slow progressive shear deformation with rising tilt and gradual displacement."
        },
        {
            "event_id": "ANOM-02-SUBSIDENCE",
            "type": "Rapid Subsidence & Caving Anomaly",
            "start_time_sec": 28800,   # 8h 00m
            "end_time_sec": 36000,     # 10h 00m
            "description": "Severe non-linear tilt acceleration (>2.0 deg), step displacement, and high vibration spikes."
        },
        {
            "event_id": "ANOM-03-SETTLEMENT",
            "type": "Post-Caving Settlement & Relaxation",
            "start_time_sec": 36000,   # 10h 00m
            "end_time_sec": 46800,     # 13h 00m
            "description": "Strata stabilization into new equilibrium with residual plastic strain."
        },
        {
            "event_id": "ANOM-04-MICROTREMOR",
            "type": "Secondary Dynamic Tremor",
            "start_time_sec": 57600,   # 16h 00m
            "end_time_sec": 61200,     # 17h 00m
            "description": "Transient high-frequency vibration burst with rapid tilt step and subsequent damping."
        }
    ]

    # Time-series state variables
    base_tilt_x = 0.12
    base_tilt_y = 0.08
    base_disp = 0.22
    base_vib = 0.015
    base_temp = 28.0

    # Auto-regressive pink noise buffers for realistic MPU6050 sensor drift
    ar_noise_x = 0.0
    ar_noise_y = 0.0
    ar_noise_disp = 0.0
    ar_noise_vib = 0.0

    records = []
    
    for t in range(duration_seconds):
        current_time = start_dt + timedelta(seconds=t)
        time_iso = current_time.strftime("%Y-%m-%dT%H:%M:%SZ")
        
        # 1. Thermal diurnal cycle (24-hour sinusoid + noise)
        diurnal_temp = base_temp + 4.5 * math.sin(2 * math.pi * (t - 21600) / 86400)
        temp_noise = random.gauss(0, 0.12)
        temperature = round(diurnal_temp + temp_noise, 2)
        
        # Temperature-induced slight IMU thermal drift coefficient
        temp_drift_x = (temperature - base_temp) * 0.003
        temp_drift_y = (temperature - base_temp) * 0.002

        # 2. Physics-based deformation phase calculations
        target_tilt_x = base_tilt_x + temp_drift_x
        target_tilt_y = base_tilt_y + temp_drift_y
        target_disp = base_disp
        target_vib = base_vib
        
        # Event 1: Gradual Inflexion (18,000s -> 28,800s)
        if 18000 <= t < 28800:
            progress = (t - 18000) / (28800 - 18000)
            # S-curve gradual progression
            s_curve = 0.5 * (1 - math.cos(math.pi * progress))
            target_tilt_x += s_curve * 0.55
            target_tilt_y += s_curve * 0.40
            target_disp += s_curve * 0.65
            target_vib += s_curve * 0.025
            
        # Event 2: Rapid Subsidence & Caving Anomaly (28,800s -> 36,000s)
        elif 28800 <= t < 36000:
            progress = (t - 28800) / (36000 - 28800)
            # Exponential ramp + sinusoidal crack bursts
            ramp = math.pow(progress, 1.4)
            burst = 0.08 * math.sin(2 * math.pi * t / 45) * math.exp(-0.5 * ((progress - 0.6) / 0.15)**2)
            
            target_tilt_x += 0.55 + ramp * 1.55 + burst
            target_tilt_y += 0.40 + ramp * 1.15 + (burst * 0.7)
            target_disp += 0.65 + ramp * 1.60
            
            # Vibration spikes during active subsidence
            vib_burst = 0.15 * math.exp(-0.5 * ((progress - 0.55) / 0.12)**2) + random.uniform(0, 0.04)
            target_vib += 0.025 + ramp * 0.08 + vib_burst
            
        # Event 3: Settlement & Post-Caving Stabilization (36,000s -> 46,800s)
        elif 36000 <= t < 46800:
            progress = (t - 36000) / (46800 - 36000)
            decay = math.exp(-2.5 * progress)
            
            # Plastic deformation remains, elastic strain relaxes slightly
            target_tilt_x += 0.55 + 1.55 - (1 - decay) * 0.25
            target_tilt_y += 0.40 + 1.15 - (1 - decay) * 0.18
            target_disp += 0.65 + 1.60 - (1 - decay) * 0.10
            target_vib += 0.025 + decay * 0.06
            
        # Event 4: Secondary Micro-Tremor (57,600s -> 61,200s)
        elif 57600 <= t < 61200:
            progress = (t - 57600) / (61200 - 57600)
            # High frequency impulse with damped oscillation
            tremor_env = math.exp(-4.0 * progress) * math.sin(2 * math.pi * progress * 8)
            tremor_step = 1.0 / (1.0 + math.exp(-20 * (progress - 0.15)))
            
            target_tilt_x += 1.85 + tremor_step * 0.28 + tremor_env * 0.05
            target_tilt_y += 1.37 + tremor_step * 0.19 + tremor_env * 0.04
            target_disp += 2.15 + tremor_step * 0.12
            target_vib += 0.020 + math.exp(-6.0 * progress) * 0.14 + abs(tremor_env) * 0.04
            
        # Post-Stabilization (46,800s onwards except during tremor)
        elif t >= 46800:
            target_tilt_x += 1.85
            target_tilt_y += 1.37
            target_disp += 2.15
            target_vib += 0.018

        # 3. Apply AR(1) temporal correlated sensor noise + white noise
        ar_noise_x = 0.85 * ar_noise_x + 0.15 * random.gauss(0, 0.012)
        ar_noise_y = 0.85 * ar_noise_y + 0.15 * random.gauss(0, 0.012)
        ar_noise_disp = 0.90 * ar_noise_disp + 0.10 * random.gauss(0, 0.008)
        ar_noise_vib = 0.70 * ar_noise_vib + 0.30 * random.gauss(0, 0.004)

        white_noise_tilt = random.gauss(0, 0.006)
        white_noise_disp = random.gauss(0, 0.004)
        white_noise_vib = random.uniform(0, 0.003)

        tilt_x_val = target_tilt_x + ar_noise_x + white_noise_tilt
        tilt_y_val = target_tilt_y + ar_noise_y + white_noise_tilt
        disp_val = max(0.0, target_disp + ar_noise_disp + white_noise_disp)
        vib_val = max(0.002, target_vib + ar_noise_vib + white_noise_vib)

        # Composite overall tilt angle: sqrt(tilt_x^2 + tilt_y^2)
        tilt_angle_val = math.sqrt(tilt_x_val**2 + tilt_y_val**2)

        records.append({
            "timestamp": time_iso,
            "tilt_x": f"{tilt_x_val:.3f}",
            "tilt_y": f"{tilt_y_val:.3f}",
            "tilt_angle": f"{tilt_angle_val:.3f}",
            "temperature": f"{temperature:.2f}",
            "displacement": f"{disp_val:.3f}",
            "vibration": f"{vib_val:.4f}"
        })

    # Write telemetry CSV
    fieldnames = [
        "timestamp",
        "tilt_x",
        "tilt_y",
        "tilt_angle",
        "temperature",
        "displacement",
        "vibration"
    ]
    
    with open(output_csv_path, mode="w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(records)

    print(f" [OK] Telemetry CSV written successfully to: {output_csv_path}")
    print(f"      Rows: {len(records):,} | Columns: {len(fieldnames)}")

    # Write anomaly ground truth metadata (for ML evaluation)
    metadata = {
        "dataset_name": "MineGuard Synthetic Surface Telemetry",
        "problem_statement": "SIH 2026 - PS 26025",
        "is_synthetic": True,
        "disclaimer": "SYNTHETIC DEMONSTRATION DATA ONLY. Not real mine measurements.",
        "sampling_frequency_hz": 1.0,
        "sampling_interval_seconds": 1.0,
        "total_samples": len(records),
        "duration_seconds": duration_seconds,
        "start_time": start_time_iso,
        "end_time": records[-1]["timestamp"],
        "schema": fieldnames,
        "sensor_hardware": "MPU6050 IMU + Displacement + Dynamic Vibration Transducer",
        "anomaly_events": anomaly_events
    }

    with open(metadata_json_path, mode="w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)

    print(f" [OK] Ground Truth Metadata written to: {metadata_json_path}")
    print(f"      Anomaly Events Defined: {len(anomaly_events)}")
    for ev in anomaly_events:
        print(f"       - [{ev['event_id']}] {ev['type']} (t={ev['start_time_sec']}s to {ev['end_time_sec']}s)")

    return output_csv_path, metadata_json_path

if __name__ == "__main__":
    generate_telemetry_dataset()
