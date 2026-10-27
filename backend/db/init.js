/**
 * MineGuard PostgreSQL Schema Migration & Initialization Script
 * Smart India Hackathon 2026 (Problem Statement 26025)
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const fs = require('fs');
const { Pool } = require('pg');

function getPoolConfig() {
  if (process.env.DATABASE_URL) {
    const isSsl = process.env.DB_SSL === 'true' || 
                  process.env.DATABASE_URL.includes('sslmode=require') || 
                  process.env.DATABASE_URL.includes('supabase.co');
    return {
      connectionString: process.env.DATABASE_URL,
      ssl: isSsl ? { rejectUnauthorized: false } : false
    };
  }
  return {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'mineguard',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
  };
}

async function initDatabase(customPool = null) {
  const pool = customPool || new Pool(getPoolConfig());
  let client = null;

  try {
    const riskSchemaPath = path.join(__dirname, 'risk_schema.sql');
    const retentionSchemaPath = path.join(__dirname, 'retention_schema.sql');
    const authSchemaPath = path.join(__dirname, 'auth_schema.sql');
    const multiMineSchemaPath = path.join(__dirname, 'multi_mine_schema.sql');

    const riskSql = fs.readFileSync(riskSchemaPath, 'utf8').replace(/^\uFEFF/, '');
    const retentionSql = fs.existsSync(retentionSchemaPath) 
      ? fs.readFileSync(retentionSchemaPath, 'utf8').replace(/^\uFEFF/, '')
      : '';
    const authSql = fs.existsSync(authSchemaPath)
      ? fs.readFileSync(authSchemaPath, 'utf8').replace(/^\uFEFF/, '')
      : '';
    const multiMineSql = fs.existsSync(multiMineSchemaPath)
      ? fs.readFileSync(multiMineSchemaPath, 'utf8').replace(/^\uFEFF/, '')
      : '';

    client = await pool.connect();
    console.log('[PostgreSQL/Supabase] Connected to database server.');
    console.log('[PostgreSQL/Supabase] Executing schema DDL migrations (sensor_telemetry, system_alerts, risk_analysis, telemetry_minute, users, multi_mine)...');

    await client.query(riskSql);
    await client.query(fs.readFileSync(path.join(__dirname, 'motion_schema.sql'), 'utf8'));
    if (retentionSql) {
      await client.query(retentionSql);
    }
    if (authSql) {
      await client.query(authSql);
    }
    if (multiMineSql) {
      await client.query(multiMineSql);
    }

    // Seed default admin user if not exists
    const bcrypt = require('bcryptjs');
    const adminCheck = await client.query('SELECT id FROM users WHERE username = $1', ['admin']);
    if (adminCheck.rows.length === 0) {
      const defaultHash = await bcrypt.hash('Admin@123', 10);
      await client.query(
        `INSERT INTO users (username, email, password_hash, full_name, role)
         VALUES ($1, $2, $3, $4, $5)`,
        ['admin', 'admin@mineguard.gov.in', defaultHash, 'Chief Mine Safety Administrator', 'admin']
      );
      console.log('✅ [PostgreSQL/Supabase] Default admin user seeded: username="admin", password="Admin@123"');
    }

    console.log('✅ [PostgreSQL/Supabase] Schema migration complete: sensor_telemetry, system_alerts, risk_analysis, telemetry_minute, and users ready.');
    return true;
  } catch (err) {
    console.warn('⚠️ [PostgreSQL/Supabase Migration Notice]', err.message);
    return false;
  } finally {
    if (client) client.release();
    if (!customPool) await pool.end();
  }
}

if (require.main === module) {
  initDatabase().then((success) => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = { initDatabase, getPoolConfig };
