-- Multi-Mine & Multi-Tenant Schema Migration (Phase 6)
-- Smart India Hackathon 2026 (Problem Statement 26025)

-- 1. Add mine_id and panel_id to sensor_telemetry
ALTER TABLE IF EXISTS sensor_telemetry 
ADD COLUMN IF NOT EXISTS mine_id VARCHAR(32) DEFAULT 'MOONIDIH',
ADD COLUMN IF NOT EXISTS panel_id VARCHAR(32) DEFAULT 'P-4';

CREATE INDEX IF NOT EXISTS idx_telemetry_mine_panel ON sensor_telemetry(mine_id, panel_id, timestamp DESC);

-- 2. Add mine_id and panel_id to system_alerts
ALTER TABLE IF EXISTS system_alerts 
ADD COLUMN IF NOT EXISTS mine_id VARCHAR(32) DEFAULT 'MOONIDIH',
ADD COLUMN IF NOT EXISTS panel_id VARCHAR(32) DEFAULT 'P-4';

CREATE INDEX IF NOT EXISTS idx_alerts_mine_panel ON system_alerts(mine_id, panel_id, created_at DESC);

-- 3. Add mine_id and panel_id to risk_analysis
ALTER TABLE IF EXISTS risk_analysis 
ADD COLUMN IF NOT EXISTS mine_id VARCHAR(32) DEFAULT 'MOONIDIH',
ADD COLUMN IF NOT EXISTS panel_id VARCHAR(32) DEFAULT 'P-4';

CREATE INDEX IF NOT EXISTS idx_risk_mine_panel ON risk_analysis(mine_id, panel_id, timestamp DESC);

-- 4. Add mine_id and panel_id to telemetry_minute
ALTER TABLE IF EXISTS telemetry_minute 
ADD COLUMN IF NOT EXISTS mine_id VARCHAR(32) DEFAULT 'MOONIDIH',
ADD COLUMN IF NOT EXISTS panel_id VARCHAR(32) DEFAULT 'P-4';

CREATE INDEX IF NOT EXISTS idx_minute_mine_panel ON telemetry_minute(mine_id, panel_id, bucket_start DESC);

-- 5. Add mine_id and panel_id to audit_logs
ALTER TABLE IF EXISTS audit_logs 
ADD COLUMN IF NOT EXISTS mine_id VARCHAR(32) DEFAULT 'MOONIDIH',
ADD COLUMN IF NOT EXISTS panel_id VARCHAR(32) DEFAULT 'P-4';

CREATE INDEX IF NOT EXISTS idx_audit_logs_mine_panel ON audit_logs(mine_id, panel_id, timestamp DESC);
