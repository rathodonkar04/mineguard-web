-- ============================================================================
-- MineGuard Long-Term Telemetry Aggregation & Scalable Retention Schema
-- Smart India Hackathon 2026 (Problem Statement 26025)
-- ============================================================================

-- 1. Dedicated 1-Minute Aggregated Telemetry Table
CREATE TABLE IF NOT EXISTS telemetry_minute (
  id                      BIGSERIAL PRIMARY KEY,
  node_id                 VARCHAR(16) NOT NULL,          -- 'NODE_01', 'NODE_02', 'NODE_03', 'NODE_04'
  node_short_id           VARCHAR(8)  NOT NULL,          -- 'N1', 'N2', 'N3', 'N4'
  bucket_start            TIMESTAMPTZ NOT NULL,          -- Start of the 1-minute window (e.g. 10:00:00Z)
  bucket_end              TIMESTAMPTZ NOT NULL,          -- End of the 1-minute window (e.g. 10:01:00Z)
  reading_count           INTEGER NOT NULL DEFAULT 0,    -- Number of 1-second samples in this bucket

  -- Tilt Metrics (Degrees)
  avg_tilt                NUMERIC(6, 3) NOT NULL,
  min_tilt                NUMERIC(6, 3) NOT NULL,
  max_tilt                NUMERIC(6, 3) NOT NULL,
  avg_tilt_x              NUMERIC(6, 3) NOT NULL,
  max_tilt_x              NUMERIC(6, 3) NOT NULL,
  avg_tilt_y              NUMERIC(6, 3) NOT NULL,
  max_tilt_y              NUMERIC(6, 3) NOT NULL,

  -- Physical Geotechnical Metrics
  avg_displacement        NUMERIC(6, 2) NOT NULL,
  max_displacement        NUMERIC(6, 2) NOT NULL,
  avg_vibration           NUMERIC(6, 3) NOT NULL,
  max_vibration           NUMERIC(6, 3) NOT NULL,
  avg_temperature         NUMERIC(5, 2) NOT NULL,
  min_temperature         NUMERIC(5, 2) NOT NULL,
  max_temperature         NUMERIC(5, 2) NOT NULL,

  -- Risk & AI Anomaly Metrics
  avg_risk_score          SMALLINT NOT NULL,
  max_risk_score          SMALLINT NOT NULL,
  avg_anomaly_score       SMALLINT,
  max_anomaly_score       SMALLINT,
  peak_risk_level         VARCHAR(16) NOT NULL,          -- Highest severity in bucket ('CRITICAL' > 'WARNING' > 'SAFE')
  dominant_status         VARCHAR(16) NOT NULL,          -- 'Normal', 'Warning', 'Critical'
  crack_detected_count    INTEGER NOT NULL DEFAULT 0,

  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_node_bucket UNIQUE (node_id, bucket_start)
);

-- 2. High-Performance Indexes for 1-Minute Aggregates
CREATE INDEX IF NOT EXISTS idx_telemetry_minute_node_time ON telemetry_minute (node_id, bucket_start DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_minute_time ON telemetry_minute (bucket_start DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_minute_risk ON telemetry_minute (max_risk_score DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_minute_level ON telemetry_minute (peak_risk_level, bucket_start DESC);
