# MineGuard Synthetic Telemetry Dataset
### Problem Statement 26025 (SIH 2026)

- **File**: `telemetry.csv`
- **Type**: Synthetic Time-Series Geotechnical Telemetry
- **Sampling Frequency**: 1 Hz (1 sample / second)
- **Duration**: 24 Hours (86,400 Records)
- **Hardware Profile**: MPU6050 6-DOF IMU + Extensometer + Vibration Transducer

### Schema
```
timestamp,tilt_x,tilt_y,tilt_angle,temperature,displacement,vibration
```

### Notice
This dataset is **SYNTHETIC** and was generated using continuous physical differential models with auto-regressive IMU sensor noise. It is intended solely for AI/ML anomaly detection benchmarking and data pipeline validation.
