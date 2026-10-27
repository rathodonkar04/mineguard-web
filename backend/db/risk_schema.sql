-- ============================================================================
-- MineGuard Persistent AI & Risk Analysis PostgreSQL/Supabase Schema
-- Smart India Hackathon 2026 (Problem Statement 26025)
-- "AI-enabled Real-Time Mine Subsidence Monitoring & Early Warning System"
-- ============================================================================

-- 1. Base Sensor Telemetry Time-Series Table
CREATE TABLE IF NOT EXISTS sensor_telemetry (
  id                      BIGSERIAL PRIMARY KEY,
  node_id                 VARCHAR(16) NOT NULL,          -- 'NODE_01', 'NODE_02', 'NODE_03', 'NODE_04'
  node_short_id           VARCHAR(8)  NOT NULL,          -- 'N1', 'N2', 'N3', 'N4'
  timestamp               TIMESTAMPTZ NOT NULL,          -- Reading timestamp (ISO-8601)
  tilt_x                  NUMERIC(6, 3) NOT NULL,        -- Pitch in degrees
  tilt_y                  NUMERIC(6, 3) NOT NULL,        -- Roll in degrees
  tilt_angle              NUMERIC(6, 3) NOT NULL,        -- Resultant tilt: sqrt(tilt_x^2 + tilt_y^2)
  displacement            NUMERIC(6, 2) NOT NULL DEFAULT 0.00,  -- Surface displacement in mm
  vibration               NUMERIC(6, 3) NOT NULL DEFAULT 0.000, -- Strata vibration index in g
  temperature             NUMERIC(5, 2) NOT NULL DEFAULT 25.00, -- Ambient/casing temp in °C
  crack_detected          BOOLEAN NOT NULL DEFAULT FALSE,       -- Visual / acoustic crack flag
  gateway_id              VARCHAR(16) DEFAULT 'N3',             -- Receiving root gateway
  sequence                BIGINT,                               -- Hardware packet counter
  hop_count               SMALLINT DEFAULT 0,                   -- Mesh hops from origin to gateway
  status                  VARCHAR(16) NOT NULL,                 -- 'Normal', 'Warning', 'Critical'
  risk_score              SMALLINT NOT NULL,                    -- Composite statutory risk score (0-100)
  ai_anomaly_score        SMALLINT,                             -- Isolation Forest continuous anomaly score (0-100)
  ai_status               VARCHAR(16),                          -- 'ACTIVE', 'CALIBRATING', 'STANDALONE'
  risk_reason             TEXT,                                 -- Transparent geotechnical diagnostic reason
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. System Alerts & Alarms Table
CREATE TABLE IF NOT EXISTS system_alerts (
  id                      VARCHAR(64) PRIMARY KEY,       -- e.g. 'ALT-CRIT-N3-1788004330435'
  node_id                 VARCHAR(16) NOT NULL,
  node_short_id           VARCHAR(8)  NOT NULL,
  zone                    VARCHAR(32),                   -- 'Zone A', 'Zone B', 'Zone C'
  severity                VARCHAR(16) NOT NULL,          -- 'Warning', 'Critical'
  title                   VARCHAR(128) NOT NULL,
  message                 TEXT NOT NULL,
  tilt_value              NUMERIC(6, 3),
  anomaly_score           SMALLINT,
  statutory_standard      VARCHAR(64),                   -- DGMS Surface Guidelines
  acknowledged            BOOLEAN NOT NULL DEFAULT FALSE,
  acknowledged_at         TIMESTAMPTZ,
  acknowledged_by         VARCHAR(64),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Dedicated Persistent AI & Risk Analysis Table
-- Stores complete geotechnical decision context, feature snapshots, and diagnostic reasoning
CREATE TABLE IF NOT EXISTS risk_analysis (
  id                      BIGSERIAL PRIMARY KEY,
  node_id                 VARCHAR(16) NOT NULL,          -- 'NODE_01', 'NODE_02', 'NODE_03', 'NODE_04'
  node_short_id           VARCHAR(8)  NOT NULL,          -- 'N1', 'N2', 'N3', 'N4'
  telemetry_id            BIGINT,                        -- Optional reference to sensor_telemetry(id)
  timestamp               TIMESTAMPTZ NOT NULL,          -- Telemetry timestamp when evaluated
  anomaly_score           SMALLINT CHECK (anomaly_score IS NULL OR (anomaly_score >= 0 AND anomaly_score <= 100)),
  raw_decision_function   NUMERIC(10, 6),                -- Raw Isolation Forest decision function output
  risk_score              SMALLINT NOT NULL CHECK (risk_score >= 0 AND risk_score <= 100),
  risk_level              VARCHAR(16) NOT NULL,          -- 'SAFE', 'WARNING', 'CRITICAL', 'CALIBRATING'
  status                  VARCHAR(16) NOT NULL,          -- 'Normal', 'Warning', 'Critical'
  reason                  TEXT NOT NULL,                 -- Detailed geotechnical diagnostic reason
  tilt_angle              NUMERIC(6, 3) NOT NULL,        -- Resultant tilt at analysis time (deg)
  tilt_rate               NUMERIC(10, 6),                -- Rate of inclination change (deg/s)
  displacement            NUMERIC(6, 2),                 -- Surface displacement (mm)
  displacement_rate       NUMERIC(10, 6),                -- Rate of displacement (mm/s)
  vibration               NUMERIC(6, 3),                 -- Vibration index (g)
  temperature             NUMERIC(5, 2),                 -- Ambient temperature (°C)
  model_version           VARCHAR(64) DEFAULT '1.0.0-isolation-forest-300trees',
  feature_snapshot        JSONB,                         -- Complete 16 canonical feature snapshot
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 4. High-Performance Indexes
-- ============================================================================

-- Telemetry indexes
CREATE INDEX IF NOT EXISTS idx_telemetry_node_time ON sensor_telemetry (node_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_time ON sensor_telemetry (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_anomalies ON sensor_telemetry (timestamp DESC) WHERE ai_anomaly_score >= 50;

-- Alerts indexes
CREATE INDEX IF NOT EXISTS idx_alerts_created ON system_alerts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_unack ON system_alerts (acknowledged) WHERE acknowledged = FALSE;

-- Risk Analysis indexes
CREATE INDEX IF NOT EXISTS idx_risk_node_time ON risk_analysis (node_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_risk_time ON risk_analysis (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_risk_level ON risk_analysis (risk_level, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_risk_anomalies ON risk_analysis (anomaly_score, timestamp DESC) WHERE anomaly_score >= 50;
CREATE INDEX IF NOT EXISTS idx_risk_feature_gin ON risk_analysis USING gin (feature_snapshot);
