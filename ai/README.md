# MineGuard AI Subsystem — Baseline Calibration, Features & Isolation Forest Anomaly Detector
### Smart India Hackathon 2026 (Problem Statement 26025)

"Development of an AI-enabled Low Cost Real Time Mine Subsidence Monitoring, Prediction and Early Warning System for Underground Coal Mines in India."

---

## 1. Important System Disclaimer

> [!WARNING]
> **SYNTHETIC DEMONSTRATION PROTOTYPE DISCLAIMER**:
> **The normalized AI anomaly score is a prototype diagnostic score and is NOT a probability of mine failure or a certified mine-safety metric.**
> This is a synthetic-data prototype and is not a certified mine-safety prediction system. All telemetry streams, baseline distributions, and feature transformations are generated using physics-based strata simulation models for software development, pipeline benchmarking, and AI algorithm evaluation. It must not be deployed for live mine regulatory compliance without site-specific geotechnical instrumentation and certified statutory calibration.

---

## 2. AI Architecture & Pipeline Flow

```
[Raw 7-Channel Telemetry (1 Hz)]
  (timestamp, tilt_x, tilt_y, tilt_angle, temperature, displacement, vibration)
             │
             ├── 1. Calibration Phase (First 14,400s / 4 Hours)
             │      │
             │      ▼
             │   [ai/src/baseline.py]
             │   - Fits site/node baseline statistics (mu, sigma, median, MAD)
             │   - Estimates empirical thermal drift coefficient (alpha_thermal = +0.003659 deg/C)
             │   - Persists: ai/models/baseline.json (Frozen, never re-fit on anomaly data)
             │
             ├── 2. Causal Feature Engineering (Streaming / Inference)
             │      │
             │      ▼
             │   [ai/src/features.py]
             │   - 16 Causal Features (No future data leakage)
             │   - Z-scores: z_tilt, z_displacement, z_vibration, z_temperature
             │   - Kinematics (5s): tilt_rate, displacement_rate, displacement_accel, vibration_rate
             │   - Rolling (30s): tilt_mean_30s, tilt_std_30s, disp_mean_30s, vib_mean_30s, vib_std_30s, volatility_ratio
             │   - Thermal: delta_temperature, detrended_tilt
             │
             └── 3. Unsupervised Anomaly Detection
                    │
                    ▼
                 [ai/src/train_isolation_forest.py]
                 - Trains Isolation Forest on clean baseline (t = 29s to 14,400s, 14,371 samples)
                 - Computes continuous normalized presentation score: ai_anomaly_score in [0, 100]
                 - Artifacts: ai/models/isolation_forest.joblib & ai/models/model_metadata.json
                 - Visualizations: ai/plots/isolation_forest_scores.svg & ai/plots/phase_scores.svg
```

---

## 3. Isolation Forest Methodology & Normalization

- **Algorithm**: `sklearn.ensemble.IsolationForest`
- **Hyperparameters**: `n_estimators = 300`, `contamination = "auto"`, `random_state = 42`, `n_jobs = -1`
- **Training Set**: Strictly the clean baseline calibration window ($t = 29\text{s} \dots 14,400\text{s}$, $N = 14,371$ samples). Timestamp is excluded from the ML feature matrix.

### Score Normalization Formula
Raw Isolation Forest `decision_function(X)` outputs negative values for anomalies and positive values for normal observations. To provide an intuitive 0–100 presentation metric for mine safety engineers without misrepresenting it as a probability:

$$\text{ai\_anomaly\_score}(x) = \text{clip}\left( 50.0 \times \left(1.0 - \tanh\left(\frac{\text{decision\_function}(x)}{\text{scale\_factor}}\right)\right), 0.0, 100.0 \right)$$

- $\text{scale\_factor} = 0.051307$ (calibrated from baseline decision standard deviation)
- $\text{decision\_function} \gg 0$ (Strongly Normal) $\implies \text{score} \to 0$
- $\text{decision\_function} = 0$ (Decision Boundary) $\implies \text{score} = 50.0$
- $\text{decision\_function} \ll 0$ (Severe Anomaly) $\implies \text{score} \to 100$

---

## 4. Phase-by-Phase Evaluation Results

Evaluated against ground truth intervals defined in [`ai/data/anomaly_metadata.json`](file:///C:/Users/LENOVO/.gemini/antigravity/scratch/mineguard-dashboard/ai/data/anomaly_metadata.json):

| Phase Name | Time Window (s) | Sample Count | Mean Score | Max Score | % Flagged (Score $\ge 50$) | Interpretation |
|---|---|---|---|---|---|---|
| `NORMAL_BASELINE` | $29 - 14,400$ | 14,371 | **19.66** | 99.57 | **9.93%** | Training calibration baseline |
| `NORMAL_HOLDOUT` | $14,400 - 18,000$ | 3,600 | **58.11** | 98.91 | **61.78%** | Pre-inflexion holdout (thermal rise) |
| `ANOM-01-INFLEXION` | $18,000 - 28,800$ | 10,800 | **97.56** | 99.96 | **99.21%** | **Early shear creep detection** |
| `ANOM-02-SUBSIDENCE` | $28,800 - 36,000$ | 7,200 | **99.97** | 99.99 | **100.00%** | Active caving & peak subsidence |
| `ANOM-03-SETTLEMENT` | $36,000 - 46,800$ | 10,800 | **99.65** | 99.98 | **100.00%** | Post-caving settlement & relaxation |
| `STABILIZED_01` | $46,800 - 57,600$ | 10,800 | **99.65** | 99.99 | **100.00%** | Residual plastic ground state |
| `ANOM-04-MICROTREMOR` | $57,600 - 61,200$ | 3,600 | **99.69** | 99.99 | **100.00%** | Secondary dynamic tremor impulse |
| `STABILIZED_02` | $61,200 - 86,400$ | 25,200 | **99.07** | 99.99 | **100.00%** | Final equilibrium monitoring |

### Test Set Classification Metrics ($t \ge 14,400\text{s}$, 72,000 Samples)
- **True Positives (TP)**: 32,315 seconds
- **False Positives (FP)**: 38,224 seconds (primarily post-subsidence permanently deformed ground)
- **True Negatives (TN)**: 1,376 seconds
- **False Negatives (FN)**: 85 seconds
- **Recall (Sensitivity)**: **99.74%**
- **Precision**: **45.81%**
- **F1-Score**: **0.6278**

---

## 5. Diagnostic Feature Importance (Ablation Analysis)

Measured via drop in mean anomaly score on the anomaly subset when each feature is independently permuted:

| Rank | Feature Name | Category | Importance Delta |
|---|---|---|---|
| 1 | `vibration_mean_30s` | Rolling | $-0.3439$ |
| 2 | `z_vibration` | Baseline Z-score | $-0.3290$ |
| 3 | `z_displacement` | Baseline Z-score | $-0.2968$ |
| 4 | `z_tilt` | Baseline Z-score | $-0.2964$ |
| 5 | `detrended_tilt` | Thermal Decoupled | $-0.2715$ |
| 6 | `vibration_std_30s` | Rolling Volatility | $-0.1515$ |
| 7 | `volatility_ratio` | Rolling Volatility | $-0.1404$ |
| 8 | `displacement_mean_30s` | Rolling | $-0.1356$ |
| 9 | `vibration_rate` | Kinematics | $-0.0919$ |
| 10 | `tilt_std_30s` | Rolling Volatility | $-0.0778$ |
| 11 | `tilt_rate` | Kinematics | $-0.0431$ |
| 12 | `displacement_rate` | Kinematics | $-0.0328$ |
| 13 | `tilt_mean_30s` | Rolling | $-0.0255$ |
| 14 | `displacement_acceleration` | Kinematics | $-0.0223$ |
| 15 | `delta_temperature` | Thermal | $+0.0000$ |
| 16 | `z_temperature` | Thermal | $+0.0000$ |

---

## 6. Execution Commands

```bash
# 1. Generate synthetic raw telemetry (24h at 1 Hz)
python ai/src/generate_dataset.py

# 2. Fit and persist site/node baseline calibration
python ai/src/baseline.py

# 3. Execute causal feature engineering pipeline
python ai/src/features.py

# 4. Train Isolation Forest model and generate evaluation artifacts
python ai/src/train_isolation_forest.py
```

---

## 7. Real-World Proxy Dataset Validation

To assess how real-world multi-sensor field deployments behave outside idealized simulation models, an external real-world landslide monitoring dataset (`Raw_Sensor_Data_Landslide_Monitoring.xlsx`) was audited as a **Real-World Proxy Dataset**.

### 1. Dataset Profile & Characteristics
- **Source File**: `Raw_Sensor_Data_Landslide_Monitoring.xlsx` (Main `RawData` sheet)
- **Total Records**: 40,637 entries across two sensor stations:
  - `Node1`: 17,410 records
  - `Node2`: 23,227 records
- **Recorded Channels (15 Fields)**:
  `Date`, `Name`, `Rotation X`, `Rotation Y`, `Rotation Z`, `Acceleration X`, `Acceleration Y`, `Acceleration Z`, `Raindrop`, `Vibration`, `Soil20cm`, `Soil40cm`, `Soil60cm`, `Temperature`, `Humidity`
- **Data Quality**: High integrity with zero missing values (0 nulls) and zero duplicate timestamps within each node partition.

### 2. Relevance to MineGuard
While collected in a slope-monitoring context, this dataset provides valuable empirical reference for:
- **Physical Sensor Noise**: Observing realistic field noise profiles across tri-axial accelerometers and tilt sensors.
- **Environmental Multi-Depth Infiltration**: Understanding the interaction between rainfall events, soil moisture at multiple depths (20cm, 40cm, 60cm), ambient temperature, and relative humidity.
- **Multi-Node Deployment Characteristics**: Demonstrating real distributed telemetry acquisition across multiple concurrent nodes (`Node1` and `Node2`).

### 3. Why It Cannot Directly Replace the MineGuard Dataset
1. **Geotechnical Mechanism Difference**: The dataset captures surface hillside slope stability and mass wasting (landslides), which operate under shear plane sliding mechanics. In contrast, MineGuard is specifically tailored for **underground coal mine subsidence** (longwall goaf collapse, roof sag, continuous panel extraction, vertical surface settlement, and tensile ground strains).
2. **Absence of Ground-Truth Geotechnical Event Labels**: The records are unannotated field readings without timestamped event phase classifications or statutory DGMS mine safety threshold annotations.
3. **No Direct Ground Displacement Transects**: The dataset lacks calibrated high-precision extensometer surface subsidence measurements ($d$ in mm) tied to an underground panel extraction sequence.

### 4. Irregular Sampling Constraints (Incompatible with 1-Hz Causal Pipeline)
- **Sampling Frequency**: The records are logged irregularly rather than at a uniform 1 Hz cadence:
  - `Node1`: Median interval $\approx 73\text{ seconds}$
  - `Node2`: Median interval $\approx 89\text{ seconds}$
- **Mathematical Incompatibility with 1-Hz Features**:
  - MineGuard's 5-second kinematic derivatives (`tilt_rate`, `displacement_rate`, `vibration_rate`, `displacement_acceleration`) explicitly assume uniform $\Delta t = 1.0\,\text{s}$ spacing between successive array indices.
  - MineGuard's 30-sample rolling statistics (`tilt_mean_30s`, `tilt_std_30s`, `vibration_std_30s`, `volatility_ratio`) represent a 30-second physical time window at 1 Hz. On this dataset, a 30-sample window would span approximately $36\text{ to }45\text{ minutes}$, completely distorting short-term dynamic volatility calculations.
  - Consequently, this dataset **must NOT be directly fed** into the current 1-Hz feature extraction pipeline without introducing an explicit time-aware continuous derivative ($\Delta x / \Delta t$) layer and irregular-interval rolling estimators.

### 5. Future Channel Utility Assessment

| Field Group | Specific Channels | Potential Future Value | Integration Prerequisite |
|---|---|---|---|
| **Tri-Axial Acceleration** | `Acceleration X`, `Acceleration Y`, `Acceleration Z` | Pitch/roll inclination estimation, static gravity alignment, dynamic shock detection | Gravitational unit scaling ($g$ vs $\text{m/s}^2$) and zero-g calibration |
| **Hydrological & Weather** | `Raindrop`, `Soil20cm`, `Soil40cm`, `Soil60cm` | Investigating pore-pressure changes and surface softening over shallow goaf panels during heavy rainfall | Correlation mapping with surface soil strata type |
| **Ambient Weather** | `Temperature`, `Humidity` | Validating environmental thermal drift correction models on physical hardware | Baseline thermal regression against static inclination |

### 6. Fields Requiring Further Sensor Documentation
- **`Rotation X, Rotation Y, Rotation Z`**: Sensor measurement units (degrees, radians, or raw gyroscope integration values), frame of reference, and coordinate axis conventions are undocumented. They cannot be equated with MineGuard's `tilt_x`, `tilt_y`, or resultant `tilt_angle` without hardware datasheets.
- **`Vibration`**: The exact metric (peak acceleration, RMS velocity, or analog transducer count) and sampling bandwidth require explicit sensor specification before thresholding.

### 7. Strategic Role in the MineGuard Data Hierarchy

```
┌────────────────────────────────────────────────────────────────────────┐
│                        MINEGUARD DATA ECOSYSTEM                        │
├────────────────────────────────────────────────────────────────────────┤
│ 1. Synthetic Benchmark Dataset (ai/data/telemetry.csv)                 │
│    - Role: Controlled 1-Hz benchmark with known ground-truth phases.   │
│    - Purpose: Algorithmic validation, ML ablation, pipeline testing.   │
├────────────────────────────────────────────────────────────────────────┤
│ 2. Real-World Proxy Dataset (Landslide Monitoring Reference)           │
│    - Role: Empirical field noise & environmental multi-sensor proxy.   │
│    - Purpose: Studying moisture/thermal coupling & irregular logging.  │
├────────────────────────────────────────────────────────────────────────┤
│ 3. Physical Hardware Telemetry (ESP32 Nodes N1 / N2 / N3)              │
│    - Role: Actual live MineGuard deployment data.                      │
│    - Purpose: Real-time subsidence monitoring, early warning & alarms. │
└────────────────────────────────────────────────────────────────────────┘
```
