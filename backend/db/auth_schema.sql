-- ============================================================================
-- MineGuard User Authentication & Query Resolution Schema
-- Smart India Hackathon 2026 (Problem Statement 26025)
-- ============================================================================

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
  id              BIGSERIAL PRIMARY KEY,
  username        VARCHAR(64) UNIQUE NOT NULL,
  email           VARCHAR(128) UNIQUE NOT NULL,
  password_hash   VARCHAR(255) NOT NULL,
  full_name       VARCHAR(128) NOT NULL,
  role            VARCHAR(32) NOT NULL DEFAULT 'operator', -- 'admin', 'operator', 'planner', 'regulator'
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- 2. Ensure system_alerts tracks persistent acknowledgment, query resolution & timestamp
ALTER TABLE system_alerts ADD COLUMN IF NOT EXISTS resolved BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE system_alerts ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
ALTER TABLE system_alerts ADD COLUMN IF NOT EXISTS resolved_by VARCHAR(64);
ALTER TABLE system_alerts ADD COLUMN IF NOT EXISTS resolution_notes TEXT;
ALTER TABLE system_alerts ADD COLUMN IF NOT EXISTS query_status VARCHAR(32) DEFAULT 'OPEN';

CREATE INDEX IF NOT EXISTS idx_alerts_resolved ON system_alerts(resolved);
CREATE INDEX IF NOT EXISTS idx_alerts_query_status ON system_alerts(query_status);
