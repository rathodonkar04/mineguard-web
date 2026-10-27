# MineGuard Persistent Telemetry & AI Risk Analysis Database
**Smart India Hackathon 2026 (Problem Statement 26025)**  
*"AI-enabled Real-Time Mine Subsidence Monitoring & Early Warning System"*

---

## 1. Database Architecture & Design

MineGuard employs a **hybrid real-time & persistent architecture**:

```
ESP32 Node 1 / Node 2 / Node 3 Gateway
                 │
                 ▼
         MineGuard Backend (Port 5000)
                 ├─────────────────────────────────────────┐
                 │                                         │
        [ FAST REAL-TIME PATH ]                  [ PERSISTENT STORAGE PATH ]
                 │                                         │
                 ├─► 1. In-Memory sensorState.js           └─► 4. Asynchronous dbService.js
                 │      (Instant current readings)                (pg.Pool non-blocking writes)
                 │                                                 │
                 ├─► 2. AI Inference Engine                        ▼
                 │      (16 causal features + Isolation Forest)   [ Supabase PostgreSQL ]
                 │                                                - sensor_telemetry (Timeseries)
                 └─► 3. Socket.IO Real-Time Stream                - risk_analysis (AI Diagnoses)
                        (Sub-millisecond broadcast)                - system_alerts (Alarm Log)
                                │                                  │
                                ▼                                  ▼
                     [ React Monitor Dashboard ]          [ History / Reports Analytics ]
```

---

## 2. Table Specifications & Relationships

### A. `sensor_telemetry` Table
Stores raw and normalized sensor measurements:

| Column | Type | Description |
|---|---|---|
| `id` | `BIGSERIAL PRIMARY KEY` | Auto-incrementing primary key |
| `node_id` | `VARCHAR(16) NOT NULL` | Canonical node identifier (`'NODE_01'`, `'NODE_02'`, `'NODE_03'`, `'NODE_04'`) |
| `node_short_id` | `VARCHAR(8) NOT NULL` | Short UI identifier (`'N1'`, `'N2'`, `'N3'`, `'N4'`) |
| `timestamp` | `TIMESTAMPTZ NOT NULL` | Reading timestamp with timezone |
| `tilt_x` | `NUMERIC(6, 3) NOT NULL` | Pitch in degrees |
| `tilt_y` | `NUMERIC(6, 3) NOT NULL` | Roll in degrees |
| `tilt_angle` | `NUMERIC(6, 3) NOT NULL` | Resultant inclination: $\sqrt{\text{tilt\_x}^2 + \text{tilt\_y}^2}$ |
| `displacement` | `NUMERIC(6, 2) NOT NULL` | Surface settlement displacement in mm |
| `vibration` | `NUMERIC(6, 3) NOT NULL` | Dynamic vibration index in $g$ |
| `temperature` | `NUMERIC(5, 2) NOT NULL` | Casing/ambient temperature in $^\circ\text{C}$ |
| `crack_detected` | `BOOLEAN NOT NULL` | Visual / acoustic strata fracture flag |
| `gateway_id` | `VARCHAR(16)` | Receiving root gateway (`'N3'`) |
| `sequence` | `BIGINT` | Hardware packet counter |
| `hop_count` | `SMALLINT` | Mesh hops from sensor to gateway |
| `status` | `VARCHAR(16) NOT NULL` | Operating state (`'Normal'`, `'Warning'`, `'Critical'`) |
| `risk_score` | `SMALLINT NOT NULL` | Composite statutory risk score ($0\text{--}100$) |
| `ai_anomaly_score` | `SMALLINT` | Isolation Forest anomaly score ($0\text{--}100$) |
| `ai_status` | `VARCHAR(16)` | AI pipeline state (`'ACTIVE'`, `'CALIBRATING'`) |
| `risk_reason` | `TEXT` | Diagnostic reason explanation |
| `created_at` | `TIMESTAMPTZ DEFAULT NOW()` | Server insertion timestamp |

---

### B. `risk_analysis` Table
Stores granular AI evaluations, causal feature vectors, and transparent diagnostic reasons:

| Column | Type | Description |
|---|---|---|
| `id` | `BIGSERIAL PRIMARY KEY` | Auto-incrementing primary key |
| `node_id` | `VARCHAR(16) NOT NULL` | Canonical node identifier |
| `node_short_id` | `VARCHAR(8) NOT NULL` | Short UI identifier |
| `telemetry_id` | `BIGINT` | Optional link to `sensor_telemetry(id)` |
| `timestamp` | `TIMESTAMPTZ NOT NULL` | Telemetry timestamp when evaluated |
| `anomaly_score` | `SMALLINT` | Continuous anomaly score ($0\text{--}100$) |
| `raw_decision_function` | `NUMERIC(10, 6)` | Raw Isolation Forest decision function score |
| `risk_score` | `SMALLINT NOT NULL` | Calculated composite risk score ($0\text{--}100$) |
| `risk_level` | `VARCHAR(16) NOT NULL` | AI risk classification (`'SAFE'`, `'WARNING'`, `'CRITICAL'`, `'CALIBRATING'`) |
| `status` | `VARCHAR(16) NOT NULL` | Operational status (`'Normal'`, `'Warning'`, `'Critical'`) |
| `reason` | `TEXT NOT NULL` | Transparent geotechnical diagnostic reason |
| `tilt_angle` | `NUMERIC(6, 3) NOT NULL` | Resultant tilt at analysis time ($^\circ$) |
| `tilt_rate` | `NUMERIC(10, 6)` | First derivative rate of change ($^\circ/\text{s}$) |
| `displacement` | `NUMERIC(6, 2)` | Surface displacement (mm) |
| `displacement_rate` | `NUMERIC(10, 6)` | Rate of displacement ($\text{mm}/\text{s}$) |
| `vibration` | `NUMERIC(6, 3)` | Strata vibration ($g$) |
| `temperature` | `NUMERIC(5, 2)` | Temperature ($^\circ\text{C}$) |
| `model_version` | `VARCHAR(64)` | `'1.0.0-isolation-forest-300trees'` |
| `feature_snapshot` | `JSONB` | Complete 16 canonical feature snapshot object |
| `created_at` | `TIMESTAMPTZ DEFAULT NOW()` | Server insertion timestamp |

---

### C. `system_alerts` Table
Stores statutory alarms, acknowledged states, and audit trails:

| Column | Type | Description |
|---|---|---|
| `id` | `VARCHAR(64) PRIMARY KEY` | Unique alert ID (`ALT-CRIT-N3-...`) |
| `node_id` | `VARCHAR(16) NOT NULL` | Affected sensor node |
| `node_short_id` | `VARCHAR(8) NOT NULL` | Short UI identifier |
| `zone` | `VARCHAR(32)` | Panel location (`'Zone A'`, `'Zone B'`, `'Zone C'`) |
| `severity` | `VARCHAR(16) NOT NULL` | Severity level (`'Warning'`, `'Critical'`) |
| `title` | `VARCHAR(128) NOT NULL` | Alert title |
| `message` | `TEXT NOT NULL` | Notification message |
| `tilt_value` | `NUMERIC(6, 3)` | Measured tilt angle |
| `anomaly_score` | `SMALLINT` | AI anomaly score |
| `statutory_standard` | `VARCHAR(64)` | Standard reference (`DGMS Guidelines`) |
| `acknowledged` | `BOOLEAN NOT NULL` | Acknowledgment status |
| `acknowledged_at` | `TIMESTAMPTZ` | Timestamp when operator acknowledged |
| `acknowledged_by` | `VARCHAR(64)` | Operator identity |
| `created_at` | `TIMESTAMPTZ DEFAULT NOW()` | Alarm trigger timestamp |

---

## 3. High-Performance Indexing Strategy

```sql
-- Fast range scans by node and timestamp
CREATE INDEX IF NOT EXISTS idx_telemetry_node_time ON sensor_telemetry (node_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_time ON sensor_telemetry (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_anomalies ON sensor_telemetry (timestamp DESC) WHERE ai_anomaly_score >= 50;

-- Risk Analysis indexes
CREATE INDEX IF NOT EXISTS idx_risk_node_time ON risk_analysis (node_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_risk_time ON risk_analysis (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_risk_level ON risk_analysis (risk_level, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_risk_anomalies ON risk_analysis (anomaly_score, timestamp DESC) WHERE anomaly_score >= 50;
CREATE INDEX IF NOT EXISTS idx_risk_feature_gin ON risk_analysis USING gin (feature_snapshot);

-- System Alerts indexes
CREATE INDEX IF NOT EXISTS idx_alerts_created ON system_alerts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_unack ON system_alerts (acknowledged) WHERE acknowledged = FALSE;
```

---

## 4. API Endpoints

### 1. `GET /api/history/risk`
- **Query Parameters**:
  - `range`: `'1h'` | `'6h'` | `'24h'` | `'7d'` (default: `'24h'`)
  - `nodeId`: `'all'` | `'N1'` | `'N2'` | `'N3'` | `'NODE_01'`
  - `riskLevel`: `'all'` | `'SAFE'` | `'WARNING'` | `'CRITICAL'`
  - `downsample`: `'true'` | `'false'`
  - `limit`: `1..2000` (default: `500`)
- **Example Response**:
```json
{
  "success": true,
  "source": "postgresql",
  "range": "1h",
  "nodeId": "NODE_01",
  "count": 60,
  "data": [
    {
      "id": 1,
      "time": "2026-08-30T13:45:00.000Z",
      "nodeId": "N1",
      "node_id": "NODE_01",
      "risk_score": 18,
      "risk_level": "SAFE",
      "status": "Normal",
      "anomaly_score": 22,
      "reason": "Nominal baseline ground conditions",
      "tilt": 0.40,
      "tilt_rate": 0.002,
      "displacement": 0.45,
      "temperature": 26.8,
      "model_version": "1.0.0-isolation-forest-300trees",
      "feature_snapshot": {
        "z_tilt": 0.25,
        "tilt_rate": 0.002,
        "displacement_mean_30s": 0.44
      }
    }
  ]
}
```

### 2. `GET /api/history/risk/latest`
Returns the most recent risk analysis evaluation for each active node.

### 3. `GET /api/history/risk/stats`
Returns aggregated risk analytics (min, max, avg risk score, peak anomaly score, warning/critical counts, first critical timestamp).

### 4. `GET /api/history/risk/:riskId`
Returns complete diagnostic details for a specific risk event, including full 16-feature JSONB snapshot.

---

## 5. Migration & Setup Instructions

1. Configure `.env` in `backend/`:
   ```env
   DATABASE_URL=postgresql://<USER>:<PASSWORD>@<SUPABASE_HOST>:5432/postgres?sslmode=require
   DB_ENABLED=true
   ```
2. Run database migration:
   ```bash
   node backend/db/init.js
   ```
3. Run automated tests:
   ```bash
   node backend/test-risk-persistence.js
   ```
