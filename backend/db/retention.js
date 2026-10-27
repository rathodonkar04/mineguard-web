/**
 * MineGuard Retention & Aggregation Engine
 * Smart India Hackathon 2026 (Problem Statement 26025)
 * 
 * Features:
 * - 1-Minute continuous/on-demand aggregation from sensor_telemetry to telemetry_minute
 * - Configurable rolling window pruning (RAW_RETENTION_HOURS, AGGREGATE_RETENTION_DAYS, RISK_RETENTION_DAYS)
 * - Safe, non-blocking, parameterized SQL executions
 * - Storage diagnostics and real-world scalability estimation
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const DEFAULT_RAW_RETENTION_HOURS = parseInt(process.env.RAW_RETENTION_HOURS || '6', 10);
const DEFAULT_AGGREGATE_RETENTION_DAYS = parseInt(process.env.AGGREGATE_RETENTION_DAYS || '7', 10);
const DEFAULT_RISK_RETENTION_DAYS = parseInt(process.env.RISK_RETENTION_DAYS || '30', 10);

/**
 * Aggregate raw telemetry into 1-minute buckets in telemetry_minute
 * @param {Object} clientOrPool - pg Client or Pool
 * @param {Object} options - { lookbackMinutes: 60 }
 */
async function aggregateCompletedMinutes(clientOrPool, options = {}) {
  const { lookbackMinutes = 120 } = options;
  const startTime = Date.now();

  const query = `
    INSERT INTO telemetry_minute (
      node_id,
      node_short_id,
      bucket_start,
      bucket_end,
      reading_count,
      avg_tilt,
      min_tilt,
      max_tilt,
      avg_tilt_x,
      max_tilt_x,
      avg_tilt_y,
      max_tilt_y,
      avg_displacement,
      max_displacement,
      avg_vibration,
      max_vibration,
      avg_temperature,
      min_temperature,
      max_temperature,
      avg_risk_score,
      max_risk_score,
      avg_anomaly_score,
      max_anomaly_score,
      peak_risk_level,
      dominant_status,
      crack_detected_count
    )
    SELECT
      node_id,
      node_short_id,
      date_trunc('minute', timestamp) AS bucket_start,
      date_trunc('minute', timestamp) + INTERVAL '1 minute' AS bucket_end,
      COUNT(*)::int AS reading_count,
      ROUND(AVG(tilt_angle)::numeric, 3) AS avg_tilt,
      ROUND(MIN(tilt_angle)::numeric, 3) AS min_tilt,
      ROUND(MAX(tilt_angle)::numeric, 3) AS max_tilt,
      ROUND(AVG(tilt_x)::numeric, 3) AS avg_tilt_x,
      ROUND(MAX(tilt_x)::numeric, 3) AS max_tilt_x,
      ROUND(AVG(tilt_y)::numeric, 3) AS avg_tilt_y,
      ROUND(MAX(tilt_y)::numeric, 3) AS max_tilt_y,
      ROUND(AVG(displacement)::numeric, 2) AS avg_displacement,
      ROUND(MAX(displacement)::numeric, 2) AS max_displacement,
      ROUND(AVG(vibration)::numeric, 3) AS avg_vibration,
      ROUND(MAX(vibration)::numeric, 3) AS max_vibration,
      ROUND(AVG(temperature)::numeric, 2) AS avg_temperature,
      ROUND(MIN(temperature)::numeric, 2) AS min_temperature,
      ROUND(MAX(temperature)::numeric, 2) AS max_temperature,
      ROUND(AVG(risk_score)::numeric, 0)::smallint AS avg_risk_score,
      ROUND(MAX(risk_score)::numeric, 0)::smallint AS max_risk_score,
      ROUND(AVG(COALESCE(ai_anomaly_score, 0))::numeric, 0)::smallint AS avg_anomaly_score,
      ROUND(MAX(COALESCE(ai_anomaly_score, 0))::numeric, 0)::smallint AS max_anomaly_score,
      CASE 
        WHEN BOOL_OR(risk_score >= 70 OR status = 'Critical') THEN 'CRITICAL'
        WHEN BOOL_OR(risk_score >= 40 OR status = 'Warning') THEN 'WARNING'
        ELSE 'SAFE'
      END AS peak_risk_level,
      MODE() WITHIN GROUP (ORDER BY status) AS dominant_status,
      COUNT(CASE WHEN crack_detected = TRUE THEN 1 END)::int AS crack_detected_count
    FROM sensor_telemetry
    WHERE timestamp >= NOW() - (INTERVAL '1 minute' * $1)
    GROUP BY node_id, node_short_id, date_trunc('minute', timestamp)
    ON CONFLICT (node_id, bucket_start) DO UPDATE SET
      reading_count = EXCLUDED.reading_count,
      avg_tilt = EXCLUDED.avg_tilt,
      min_tilt = EXCLUDED.min_tilt,
      max_tilt = EXCLUDED.max_tilt,
      avg_tilt_x = EXCLUDED.avg_tilt_x,
      max_tilt_x = EXCLUDED.max_tilt_x,
      avg_tilt_y = EXCLUDED.avg_tilt_y,
      max_tilt_y = EXCLUDED.max_tilt_y,
      avg_displacement = EXCLUDED.avg_displacement,
      max_displacement = EXCLUDED.max_displacement,
      avg_vibration = EXCLUDED.avg_vibration,
      max_vibration = EXCLUDED.max_vibration,
      avg_temperature = EXCLUDED.avg_temperature,
      min_temperature = EXCLUDED.min_temperature,
      max_temperature = EXCLUDED.max_temperature,
      avg_risk_score = EXCLUDED.avg_risk_score,
      max_risk_score = EXCLUDED.max_risk_score,
      avg_anomaly_score = EXCLUDED.avg_anomaly_score,
      max_anomaly_score = EXCLUDED.max_anomaly_score,
      peak_risk_level = EXCLUDED.peak_risk_level,
      dominant_status = EXCLUDED.dominant_status,
      crack_detected_count = EXCLUDED.crack_detected_count
    RETURNING id
  `;

  try {
    const res = await clientOrPool.query(query, [lookbackMinutes]);
    const duration = Date.now() - startTime;
    return {
      success: true,
      upsertedCount: res.rowCount,
      durationMs: duration
    };
  } catch (err) {
    console.warn('⚠️ [Retention Aggregation Warning]', err.message);
    return {
      success: false,
      error: err.message,
      durationMs: Date.now() - startTime
    };
  }
}

/**
 * Execute retention cleanup: prunes expired raw telemetry and aggregate history
 * @param {Object} clientOrPool - pg Client or Pool
 * @param {Object} options - { rawRetentionHours, aggregateRetentionDays, riskRetentionDays }
 */
async function runRetentionCleanup(clientOrPool, options = {}) {
  const rawRetentionHours = options.rawRetentionHours !== undefined ? options.rawRetentionHours : DEFAULT_RAW_RETENTION_HOURS;
  const aggregateRetentionDays = options.aggregateRetentionDays !== undefined ? options.aggregateRetentionDays : DEFAULT_AGGREGATE_RETENTION_DAYS;
  const riskRetentionDays = options.riskRetentionDays !== undefined ? options.riskRetentionDays : DEFAULT_RISK_RETENTION_DAYS;

  const result = {
    success: true,
    deletedRawTelemetry: 0,
    deletedAggregates: 0,
    deletedRiskEvents: 0,
    rawRetentionHours,
    aggregateRetentionDays,
    riskRetentionDays
  };

  try {
    // 1. Delete raw telemetry older than rawRetentionHours
    if (rawRetentionHours > 0) {
      const delRaw = await clientOrPool.query(
        `DELETE FROM sensor_telemetry WHERE timestamp < NOW() - (INTERVAL '1 hour' * $1)`,
        [rawRetentionHours]
      );
      result.deletedRawTelemetry = delRaw.rowCount || 0;
    }

    // 2. Delete aggregates older than aggregateRetentionDays
    if (aggregateRetentionDays > 0) {
      const delAgg = await clientOrPool.query(
        `DELETE FROM telemetry_minute WHERE bucket_start < NOW() - (INTERVAL '1 day' * $1)`,
        [aggregateRetentionDays]
      );
      result.deletedAggregates = delAgg.rowCount || 0;
    }

    // 3. Delete risk events older than riskRetentionDays (keeping all critical alerts)
    if (riskRetentionDays > 0) {
      const delRisk = await clientOrPool.query(
        `DELETE FROM risk_analysis WHERE timestamp < NOW() - (INTERVAL '1 day' * $1) AND risk_level = 'SAFE'`,
        [riskRetentionDays]
      );
      result.deletedRiskEvents = delRisk.rowCount || 0;
    }

    return result;
  } catch (err) {
    console.warn('⚠️ [Retention Cleanup Warning]', err.message);
    result.success = false;
    result.error = err.message;
    return result;
  }
}

/**
 * Storage diagnostics and multi-node scaling estimator
 * @param {Object} clientOrPool - pg Client or Pool
 */
async function getStorageDiagnostics(clientOrPool) {
  try {
    const tableSizesQuery = `
      SELECT
        c.relname AS table_name,
        pg_total_relation_size(c.oid) AS total_bytes,
        pg_relation_size(c.oid) AS table_bytes,
        pg_indexes_size(c.oid) AS index_bytes,
        c.reltuples::bigint AS estimated_rows
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname IN ('sensor_telemetry', 'telemetry_minute', 'risk_analysis', 'system_alerts')
      ORDER BY c.relname;
    `;
    const sizesRes = await clientOrPool.query(tableSizesQuery);

    const countsQuery = `
      SELECT 
        (SELECT COUNT(*)::int FROM sensor_telemetry) AS raw_count,
        (SELECT COUNT(*)::int FROM telemetry_minute) AS minute_count,
        (SELECT COUNT(*)::int FROM risk_analysis) AS risk_count,
        (SELECT COUNT(*)::int FROM system_alerts) AS alert_count,
        (SELECT COUNT(DISTINCT node_id)::int FROM sensor_telemetry) AS active_nodes;
    `;
    const countsRes = await clientOrPool.query(countsQuery);
    const counts = countsRes.rows[0] || {};

    const tables = sizesRes.rows.map(r => ({
      table: r.table_name,
      totalBytes: parseInt(r.total_bytes, 10),
      tableBytes: parseInt(r.table_bytes, 10),
      indexBytes: parseInt(r.index_bytes, 10),
      rows: r.table_name === 'sensor_telemetry' ? counts.raw_count :
            r.table_name === 'telemetry_minute' ? counts.minute_count :
            r.table_name === 'risk_analysis' ? counts.risk_count : counts.alert_count
    }));

    const totalDbBytes = tables.reduce((acc, t) => acc + t.totalBytes, 0);

    // Realistic byte per row estimates based on schema:
    // sensor_telemetry: ~160 bytes table + ~80 bytes index = ~240 bytes/row
    // telemetry_minute: ~220 bytes table + ~90 bytes index = ~310 bytes/row
    // risk_analysis (smart event filtered ~1 per 5 min): ~450 bytes/row (JSONB)
    const RAW_ROW_BYTES = 240;
    const MINUTE_ROW_BYTES = 310;
    const RISK_EVENT_BYTES = 450;

    // Scaling model with Retention:
    // Raw: 6 hours = 21,600 rows/node
    // Minute Aggregates: 1,440 rows/node/day (kept 7 days = 10,080 rows/node)
    // Risk Events: ~300 rows/node/day (kept 30 days = 9,000 rows/node)
    const calculateStorage = (nodeCount, days) => {
      // If days <= 0.25 (6 hours), raw rows = nodeCount * days * 86400
      const rawRows = nodeCount * Math.min(days * 86400, DEFAULT_RAW_RETENTION_HOURS * 3600);
      const aggRows = nodeCount * Math.min(days * 1440, DEFAULT_AGGREGATE_RETENTION_DAYS * 1440);
      const riskRows = nodeCount * Math.min(days * 288, DEFAULT_RISK_RETENTION_DAYS * 288);

      const rawBytes = rawRows * RAW_ROW_BYTES;
      const aggBytes = aggRows * MINUTE_ROW_BYTES;
      const riskBytes = riskRows * RISK_EVENT_BYTES;
      const totalBytes = rawBytes + aggBytes + riskBytes;

      return {
        nodeCount,
        days,
        rawRows,
        aggRows,
        riskRows,
        totalRows: rawRows + aggRows + riskRows,
        totalBytes,
        totalMb: (totalBytes / (1024 * 1024)).toFixed(2),
        totalGb: (totalBytes / (1024 * 1024 * 1024)).toFixed(3)
      };
    };

    const estimates = {
      nodes_1: {
        day_1: calculateStorage(1, 1),
        day_7: calculateStorage(1, 7),
        day_30: calculateStorage(1, 30)
      },
      nodes_4: {
        day_1: calculateStorage(4, 1),
        day_7: calculateStorage(4, 7),
        day_30: calculateStorage(4, 30)
      },
      nodes_10: {
        day_1: calculateStorage(10, 1),
        day_7: calculateStorage(10, 7),
        day_30: calculateStorage(10, 30)
      },
      nodes_50: {
        day_1: calculateStorage(50, 1),
        day_7: calculateStorage(50, 7),
        day_30: calculateStorage(50, 30)
      }
    };

    return {
      success: true,
      activeNodes: counts.active_nodes || 0,
      currentCounts: counts,
      tables,
      totalDatabaseBytes: totalDbBytes,
      totalDatabaseMb: (totalDbBytes / (1024 * 1024)).toFixed(2),
      retentionPolicy: {
        rawRetentionHours: DEFAULT_RAW_RETENTION_HOURS,
        aggregateRetentionDays: DEFAULT_AGGREGATE_RETENTION_DAYS,
        riskRetentionDays: DEFAULT_RISK_RETENTION_DAYS
      },
      estimates
    };
  } catch (err) {
    return {
      success: false,
      error: err.message
    };
  }
}

module.exports = {
  aggregateCompletedMinutes,
  runRetentionCleanup,
  getStorageDiagnostics,
  DEFAULT_RAW_RETENTION_HOURS,
  DEFAULT_AGGREGATE_RETENTION_DAYS,
  DEFAULT_RISK_RETENTION_DAYS
};
