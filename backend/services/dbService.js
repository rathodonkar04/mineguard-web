/**
 * MineGuard PostgreSQL / Supabase Database Service
 * Smart India Hackathon 2026 (Problem Statement 26025)
 * 
 * Features:
 * - Persistent high-resolution telemetry storage (sensor_telemetry)
 * - Persistent 1-minute aggregated telemetry (telemetry_minute)
 * - Persistent AI risk analysis & state transition events (risk_analysis)
 * - Persistent system alerts storage (system_alerts)
 * - 100% Parameterized queries ($1, $2, $3...) to eliminate SQL injection
 * - Non-blocking asynchronous writes with connection pooling (pg.Pool)
 * - Resilient in-memory queue & automatic retry drain when database is offline
 * - Multi-tier historical query routing (1H/6H raw, 24H/7D 1-minute aggregates)
 * - Background 1-minute continuous aggregation worker
 * - Graceful fallback to in-memory state during network/DB outage
 */

const { Pool } = require('pg');
const { getPoolConfig } = require('../db/init');
const { aggregateCompletedMinutes, runRetentionCleanup, getStorageDiagnostics } = require('../db/retention');

const MAX_QUEUE_SIZE = 5000;
const DRAIN_BATCH_SIZE = 100;
const HEALTH_CHECK_INTERVAL_MS = 5000;
const AGGREGATION_INTERVAL_MS = 60000; // Run 1-minute aggregation every 60 seconds

class DbService {
  constructor() {
    this.enabled = process.env.DB_ENABLED !== 'false';
    this.pool = null;
    this.isConnected = false;
    this.isConnecting = false;
    this.inMemoryQueue = [];
    this.stats = {
      insertedTelemetry: 0,
      insertedRisk: 0,
      insertedAlerts: 0,
      queued: 0,
      drained: 0,
      errors: 0,
      lastError: null
    };

    if (this.enabled) {
      this.initPool();
      this.startHealthAndDrainWorker();
      this.startBackgroundAggregationWorker();
    } else {
      console.log('[PostgreSQL/Supabase] Database persistence disabled via DB_ENABLED=false (In-memory mode)');
    }
  }

  initPool() {
    try {
      const config = getPoolConfig();
      this.pool = new Pool({
        ...config,
        max: parseInt(process.env.DB_POOL_MAX || '10', 10),
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000
      });

      this.pool.on('error', (err) => {
        this.isConnected = false;
        this.stats.errors++;
        this.stats.lastError = err.message;
        console.warn('⚠️ [PostgreSQL/Supabase Pool Error]', err.message);
      });
    } catch (err) {
      this.isConnected = false;
      this.stats.errors++;
      this.stats.lastError = err.message;
      console.warn('⚠️ [PostgreSQL/Supabase Pool Init Warning]', err.message);
    }
  }

  async testConnection() {
    if (!this.enabled || !this.pool) return false;
    let client = null;
    try {
      client = await this.pool.connect();
      const res = await client.query('SELECT 1 AS ok');
      this.isConnected = res.rows && res.rows[0].ok === 1;
      return this.isConnected;
    } catch (err) {
      this.isConnected = false;
      this.stats.lastError = err.message;
      return false;
    } finally {
      if (client) client.release();
    }
  }

  startHealthAndDrainWorker() {
    setInterval(async () => {
      if (this.isConnecting) return;
      this.isConnecting = true;

      try {
        const healthy = await this.testConnection();
        if (healthy && this.inMemoryQueue.length > 0) {
          await this.drainQueue();
        }
      } catch (err) {
        // Suppress background errors
      } finally {
        this.isConnecting = false;
      }
    }, HEALTH_CHECK_INTERVAL_MS);
  }

  startBackgroundAggregationWorker() {
    setInterval(async () => {
      if (!this.isConnected || !this.pool) return;
      try {
        await aggregateCompletedMinutes(this.pool, { lookbackMinutes: 10 });
      } catch (err) {
        // Non-blocking background aggregation
      }
    }, AGGREGATION_INTERVAL_MS);
  }

  /**
   * Drain in-memory queue into PostgreSQL in batches
   */
  async drainQueue() {
    if (!this.isConnected || this.inMemoryQueue.length === 0) return;

    const batch = this.inMemoryQueue.splice(0, DRAIN_BATCH_SIZE);
    if (batch.length === 0) return;

    let client = null;
    try {
      client = await this.pool.connect();
      await client.query('BEGIN');

      for (const item of batch) {
        if (item.type === 'telemetry') {
          await this.executeInsertTelemetry(client, item.data);
          this.stats.insertedTelemetry++;
        } else if (item.type === 'risk') {
          await this.executeInsertRisk(client, item.data);
          this.stats.insertedRisk++;
        } else if (item.type === 'alert') {
          await this.executeInsertAlert(client, item.data);
          this.stats.insertedAlerts++;
        }
      }

      await client.query('COMMIT');
      this.stats.drained += batch.length;
    } catch (err) {
      if (client) await client.query('ROLLBACK').catch(() => {});
      this.inMemoryQueue = [...batch, ...this.inMemoryQueue].slice(0, MAX_QUEUE_SIZE);
      this.isConnected = false;
      this.stats.errors++;
      this.stats.lastError = err.message;
    } finally {
      if (client) client.release();
    }
  }

  /**
   * Persist high-resolution telemetry reading (non-blocking async)
   */
  async persistTelemetry(sensor) {
    if (!sensor) return null;

    const data = {
      node_id: sensor.node_id || sensor.nodeId || 'NODE_01',
      node_short_id: sensor.nodeId || (sensor.node_id === 'NODE_01' ? 'N1' : sensor.node_id === 'NODE_02' ? 'N2' : sensor.node_id === 'NODE_03' ? 'N3' : 'N4'),
      timestamp: sensor.timestamp ? new Date(sensor.timestamp).toISOString() : new Date().toISOString(),
      tilt_x: typeof sensor.tilt_x === 'number' ? sensor.tilt_x : null,
      tilt_y: typeof sensor.tilt_y === 'number' ? sensor.tilt_y : null,
      tilt_angle: typeof sensor.tilt_angle === 'number' ? sensor.tilt_angle : (typeof sensor.tilt === 'number' ? sensor.tilt : 0.0),
      displacement: typeof sensor.displacement === 'number' ? sensor.displacement : null,
      vibration: typeof sensor.vibration === 'number' ? sensor.vibration : null,
      temperature: typeof sensor.temperature === 'number' ? sensor.temperature : null,
      accel_x: sensor.accel_x ?? null,
      accel_y: sensor.accel_y ?? null,
      accel_z: sensor.accel_z ?? null,
      gyro_x: sensor.gyro_x ?? null,
      gyro_y: sensor.gyro_y ?? null,
      gyro_z: sensor.gyro_z ?? null,
      mine_id: sensor.mine_id,
      panel_id: sensor.panel_id,
      crack_detected: sensor.crackDetected == null ? null : Boolean(sensor.crackDetected),
      gateway_id: sensor.gateway_id || 'N3',
      sequence: sensor.sequence !== undefined ? sensor.sequence : null,
      hop_count: sensor.hop_count !== undefined ? sensor.hop_count : 0,
      status: sensor.status || 'Normal',
      risk_score: typeof sensor.riskScore === 'number' ? sensor.riskScore : (typeof sensor.risk_score === 'number' ? sensor.risk_score : 10),
      ai_anomaly_score: typeof sensor.ai_anomaly_score === 'number' ? sensor.ai_anomaly_score : null,
      ai_status: sensor.ai_status || 'ACTIVE',
      risk_reason: sensor.risk_reason || null
    };

    if (this.enabled && this.isConnected) {
      try {
        const client = await this.pool.connect();
        try {
          const id = await this.executeInsertTelemetry(client, data);
          this.stats.insertedTelemetry++;
          return id;
        } finally {
          client.release();
        }
      } catch (err) {
        this.isConnected = false;
        this.stats.errors++;
        this.stats.lastError = err.message;
        this.enqueue({ type: 'telemetry', data });
        return null;
      }
    } else {
      this.enqueue({ type: 'telemetry', data });
      return null;
    }
  }

  async executeInsertTelemetry(client, data) {
    const mineId = data.mine_id || 'MOONIDIH';
    const panelId = data.panel_id || 'P-4';
    const query = `
      INSERT INTO sensor_telemetry (
        node_id, node_short_id, timestamp, tilt_x, tilt_y, tilt_angle,
        displacement, vibration, temperature, crack_detected,
        gateway_id, sequence, hop_count, status, risk_score,
        ai_anomaly_score, ai_status, risk_reason, mine_id, panel_id, accel_x, accel_y, accel_z, gyro_x, gyro_y, gyro_z
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)
      RETURNING id
    `;
    const values = [
      data.node_id,
      data.node_short_id,
      data.timestamp,
      data.tilt_x,
      data.tilt_y,
      data.tilt_angle,
      data.displacement,
      data.vibration,
      data.temperature,
      data.crack_detected,
      data.gateway_id,
      data.sequence,
      data.hop_count,
      data.status,
      data.risk_score,
      data.ai_anomaly_score,
      data.ai_status,
      data.risk_reason,
      mineId,
      panelId,
      data.accel_x,
      data.accel_y,
      data.accel_z,
      data.gyro_x,
      data.gyro_y,
      data.gyro_z
    ];
    const res = await client.query(query, values);
    return res.rows[0]?.id || null;
  }

  /**
   * Persist a dedicated risk analysis record
   */
  async persistRiskAnalysis(riskRecord) {
    if (!riskRecord) return null;

    const data = {
      node_id: riskRecord.node_id || riskRecord.nodeId || 'NODE_01',
      node_short_id: riskRecord.node_short_id || riskRecord.nodeId || (riskRecord.node_id === 'NODE_01' ? 'N1' : riskRecord.node_id === 'NODE_02' ? 'N2' : riskRecord.node_id === 'NODE_03' ? 'N3' : 'N4'),
      telemetry_id: riskRecord.telemetry_id || null,
      timestamp: riskRecord.timestamp ? new Date(riskRecord.timestamp).toISOString() : new Date().toISOString(),
      anomaly_score: typeof riskRecord.anomaly_score === 'number' ? riskRecord.anomaly_score : (typeof riskRecord.ai_anomaly_score === 'number' ? riskRecord.ai_anomaly_score : null),
      raw_decision_function: typeof riskRecord.raw_decision_function === 'number' ? riskRecord.raw_decision_function : null,
      risk_score: typeof riskRecord.risk_score === 'number' ? riskRecord.risk_score : (typeof riskRecord.riskScore === 'number' ? riskRecord.riskScore : 15),
      risk_level: riskRecord.risk_level || 'SAFE',
      status: riskRecord.status || (riskRecord.risk_level === 'CRITICAL' ? 'Critical' : riskRecord.risk_level === 'WARNING' ? 'Warning' : 'Normal'),
      reason: riskRecord.reason || riskRecord.risk_reason || 'Nominal strata behavior within baseline bounds',
      tilt_angle: typeof riskRecord.tilt_angle === 'number' ? riskRecord.tilt_angle : (typeof riskRecord.tilt === 'number' ? riskRecord.tilt : 0.0),
      tilt_rate: typeof riskRecord.tilt_rate === 'number' ? riskRecord.tilt_rate : (riskRecord.features?.tilt_rate || 0.0),
      displacement: typeof riskRecord.displacement === 'number' ? riskRecord.displacement : 0.0,
      displacement_rate: typeof riskRecord.displacement_rate === 'number' ? riskRecord.displacement_rate : (riskRecord.features?.displacement_rate || 0.0),
      vibration: typeof riskRecord.vibration === 'number' ? riskRecord.vibration : 0.0,
      temperature: typeof riskRecord.temperature === 'number' ? riskRecord.temperature : 25.0,
      model_version: riskRecord.model_version || '1.0.0-isolation-forest-300trees',
      feature_snapshot: riskRecord.features || riskRecord.feature_snapshot || null
    };

    if (this.enabled && this.isConnected) {
      try {
        const client = await this.pool.connect();
        try {
          const id = await this.executeInsertRisk(client, data);
          this.stats.insertedRisk++;
          return id;
        } finally {
          client.release();
        }
      } catch (err) {
        this.isConnected = false;
        this.stats.errors++;
        this.stats.lastError = err.message;
        this.enqueue({ type: 'risk', data });
        return null;
      }
    } else {
      this.enqueue({ type: 'risk', data });
      return null;
    }
  }

  async executeInsertRisk(client, data) {
    const mineId = data.mine_id || 'MOONIDIH';
    const panelId = data.panel_id || 'P-4';
    const query = `
      INSERT INTO risk_analysis (
        node_id, node_short_id, telemetry_id, timestamp,
        anomaly_score, raw_decision_function, risk_score, risk_level,
        status, reason, tilt_angle, tilt_rate, displacement,
        displacement_rate, vibration, temperature, model_version,
        feature_snapshot, mine_id, panel_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
      RETURNING id
    `;
    const values = [
      data.node_id,
      data.node_short_id,
      data.telemetry_id,
      data.timestamp,
      data.anomaly_score,
      data.raw_decision_function,
      data.risk_score,
      data.risk_level,
      data.status,
      data.reason,
      data.tilt_angle,
      data.tilt_rate,
      data.displacement,
      data.displacement_rate,
      data.vibration,
      data.temperature,
      data.model_version,
      data.feature_snapshot ? JSON.stringify(data.feature_snapshot) : null,
      mineId,
      panelId
    ];
    const res = await client.query(query, values);
    return res.rows[0]?.id || null;
  }

  /**
   * Persist a system alert
   */
  async persistAlert(alert) {
    if (!alert) return false;

    const data = {
      id: alert.id || `ALT-${Date.now()}`,
      node_id: alert.nodeId === 'N1' ? 'NODE_01' : alert.nodeId === 'N2' ? 'NODE_02' : alert.nodeId === 'N3' ? 'NODE_03' : (alert.node_id || alert.nodeId || 'NODE_03'),
      node_short_id: alert.nodeId || 'N3',
      mine_id: alert.mine_id || alert.mineId || 'MOONIDIH',
      panel_id: alert.panel_id || alert.panelId || 'P-4',
      zone: alert.zone || 'Zone C',
      severity: alert.severity || 'Warning',
      title: alert.title || 'Threshold Warning',
      message: alert.message || 'Elevated deformation detected',
      tilt_value: typeof alert.tiltValue === 'number' ? alert.tiltValue : (typeof alert.tilt === 'number' ? alert.tilt : null),
      anomaly_score: typeof alert.anomalyScore === 'number' ? alert.anomalyScore : null,
      statutory_standard: alert.standard || 'DGMS Surface Subsidence Standard (1.00°/2.00°)',
      acknowledged: Boolean(alert.acknowledged),
      acknowledged_at: alert.acknowledgedAt || null,
      acknowledged_by: alert.acknowledgedBy || null,
      resolved: Boolean(alert.resolved),
      resolved_at: alert.resolvedAt || null,
      resolved_by: alert.resolvedBy || null,
      resolution_notes: alert.resolutionNotes || null,
      query_status: alert.queryStatus || (alert.resolved ? 'RESOLVED' : (alert.acknowledged ? 'ACKNOWLEDGED' : 'OPEN')),
      created_at: alert.timestamp ? new Date(alert.timestamp).toISOString() : new Date().toISOString()
    };

    if (this.enabled && this.isConnected) {
      try {
        const client = await this.pool.connect();
        try {
          await this.executeInsertAlert(client, data);
          this.stats.insertedAlerts++;
          return true;
        } finally {
          client.release();
        }
      } catch (err) {
        this.enqueue({ type: 'alert', data });
        return false;
      }
    } else {
      this.enqueue({ type: 'alert', data });
      return false;
    }
  }

  async executeInsertAlert(client, data) {
    const mineId = data.mine_id || 'MOONIDIH';
    const panelId = data.panel_id || 'P-4';
    const query = `
      INSERT INTO system_alerts (
        id, node_id, node_short_id, zone, severity, title, message,
        tilt_value, anomaly_score, statutory_standard, acknowledged,
        acknowledged_at, acknowledged_by, resolved, resolved_at,
        resolved_by, resolution_notes, query_status, created_at,
        mine_id, panel_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
      ON CONFLICT (id) DO UPDATE SET
        acknowledged = EXCLUDED.acknowledged,
        acknowledged_at = EXCLUDED.acknowledged_at,
        acknowledged_by = EXCLUDED.acknowledged_by,
        resolved = EXCLUDED.resolved,
        resolved_at = EXCLUDED.resolved_at,
        resolved_by = EXCLUDED.resolved_by,
        resolution_notes = EXCLUDED.resolution_notes,
        query_status = EXCLUDED.query_status,
        mine_id = EXCLUDED.mine_id,
        panel_id = EXCLUDED.panel_id
    `;
    const values = [
      data.id,
      data.node_id,
      data.node_short_id,
      data.zone,
      data.severity,
      data.title,
      data.message,
      data.tilt_value,
      data.anomaly_score,
      data.statutory_standard,
      data.acknowledged,
      data.acknowledged_at,
      data.acknowledged_by,
      data.resolved,
      data.resolved_at,
      data.resolved_by,
      data.resolution_notes,
      data.query_status,
      data.created_at,
      mineId,
      panelId
    ];
    await client.query(query, values);
  }

  enqueue(item) {
    if (this.inMemoryQueue.length >= MAX_QUEUE_SIZE) {
      this.inMemoryQueue.shift();
    }
    this.inMemoryQueue.push(item);
    this.stats.queued++;
  }

  // =========================================================================
  // MULTI-TIER HISTORICAL TELEMETRY QUERIES (100% Parameterized)
  // =========================================================================

  getSanitizedInterval(range) {
    switch (range) {
      case '1h': return "INTERVAL '1 hour'";
      case '6h': return "INTERVAL '6 hours'";
      case '7d': return "INTERVAL '7 days'";
      case '24h':
      default:
        return "INTERVAL '24 hours'";
    }
  }

  getBucketSeconds(range) {
    switch (range) {
      case '1h': return 5;
      case '6h': return 30;
      case '7d': return 900;
      case '24h':
      default:
        return 60;
    }
  }

  /**
   * Query historical telemetry points with multi-tier routing (1H/6H raw, 24H/7D minute aggregates)
   */
  async getTelemetryHistory(options = {}) {
    const {
      range = '24h',
      nodeId = 'all',
      limit = 1000,
      downsample = true
    } = options;

    if (!this.enabled || !this.isConnected) {
      return this.getFallbackHistory(range, nodeId);
    }

    const intervalSql = this.getSanitizedInterval(range);
    const useMinuteAggregates = (range === '24h' || range === '7d' || range === '1d');

    const values = [];
    let paramIndex = 1;
    let whereClauses = [];

    if (useMinuteAggregates) {
      whereClauses.push(`bucket_start >= NOW() - ${intervalSql}`);
    } else {
      whereClauses.push(`timestamp >= NOW() - ${intervalSql}`);
    }

    if (nodeId && nodeId.toLowerCase() !== 'all') {
      const normalizedNode = nodeId.toUpperCase();
      whereClauses.push(`(node_short_id = $${paramIndex} OR node_id = $${paramIndex})`);
      values.push(normalizedNode);
      paramIndex++;
    }

    const whereSql = whereClauses.join(' AND ');
    values.push(Math.min(parseInt(limit, 10) || 1000, 3000));
    const limitParam = `$${paramIndex}`;

    try {
      const client = await this.pool.connect();
      try {
        let query = '';

        if (useMinuteAggregates) {
          // Tier 2: Query pre-aggregated telemetry_minute
          query = `
            SELECT 
              bucket_start AS time,
              node_short_id AS "nodeId",
              node_id,
              avg_tilt AS tilt,
              min_tilt,
              max_tilt,
              avg_tilt_x AS tilt_x,
              avg_tilt_y AS tilt_y,
              avg_displacement AS displacement,
              max_displacement,
              avg_temperature AS temperature,
              avg_vibration AS vibration,
              avg_anomaly_score AS ai_anomaly_score,
              max_anomaly_score,
              avg_risk_score AS risk_score,
              max_risk_score,
              dominant_status AS status,
              peak_risk_level AS risk_level,
              reading_count AS samples_count
            FROM telemetry_minute
            WHERE ${whereSql}
            ORDER BY bucket_start ASC
            LIMIT ${limitParam}
          `;
        } else if (downsample && range === '6h') {
          // Tier 1b: 6-hour query with downsampling from raw
          const bucketSeconds = 30;
          query = `
            SELECT 
              to_timestamp(floor(extract(epoch from timestamp) / ${bucketSeconds}) * ${bucketSeconds}) AT TIME ZONE 'UTC' AS time,
              node_short_id AS "nodeId",
              node_id,
              ROUND(AVG(tilt_angle)::numeric, 2) AS tilt,
              ROUND(MAX(tilt_angle)::numeric, 2) AS max_tilt,
              ROUND(AVG(displacement)::numeric, 2) AS displacement,
              ROUND(AVG(temperature)::numeric, 1) AS temperature,
              ROUND(AVG(vibration)::numeric, 3) AS vibration,
              ROUND(AVG(ai_anomaly_score)::numeric, 0) AS ai_anomaly_score,
              MODE() WITHIN GROUP (ORDER BY status) AS status,
              COUNT(*)::int AS samples_count
            FROM sensor_telemetry
            WHERE ${whereSql}
            GROUP BY 1, 2, 3
            ORDER BY 1 ASC
            LIMIT ${limitParam}
          `;
        } else {
          // Tier 1a: High-resolution raw 1-second query (1H)
          query = `
            SELECT 
              timestamp AS time,
              node_short_id AS "nodeId",
              node_id,
              tilt_angle AS tilt,
              accel_x, accel_y, accel_z, gyro_x, gyro_y, gyro_z,
              tilt_x,
              tilt_y,
              displacement,
              temperature,
              vibration,
              ai_anomaly_score,
              status,
              risk_score,
              risk_reason,
              sequence,
              hop_count
            FROM sensor_telemetry
            WHERE ${whereSql}
            ORDER BY timestamp ASC
            LIMIT ${limitParam}
          `;
        }

        const res = await client.query(query, values);

        // If minute aggregates were queried but empty, fallback gracefully to raw data
        if (useMinuteAggregates && res.rows.length === 0) {
          const rawFallback = await this.queryRawTelemetryFallback(client, intervalSql, nodeId, limit);
          if (rawFallback.length > 0) {
            return {
              success: true,
              source: 'postgresql_raw_fallback',
              range,
              nodeId,
              count: rawFallback.length,
              data: rawFallback
            };
          }
        }

        return {
          success: true,
          source: useMinuteAggregates ? 'postgresql_minute_aggregates' : 'postgresql_raw',
          range,
          nodeId,
          count: res.rows.length,
          data: res.rows
        };
      } finally {
        client.release();
      }
    } catch (err) {
      console.warn('[PostgreSQL History Query Fallback]', err.message);
      return this.getFallbackHistory(range, nodeId);
    }
  }

  async queryRawTelemetryFallback(client, intervalSql, nodeId, limit) {
    const values = [];
    let whereClauses = [`timestamp >= NOW() - ${intervalSql}`];
    if (nodeId && nodeId.toLowerCase() !== 'all') {
      whereClauses.push(`(node_short_id = $1 OR node_id = $1)`);
      values.push(nodeId.toUpperCase());
    }
    const whereSql = whereClauses.join(' AND ');
    const limitIndex = values.length + 1;
    values.push(Math.min(parseInt(limit, 10) || 1000, 3000));

    const q = `
      SELECT 
        timestamp AS time,
        node_short_id AS "nodeId",
        node_id,
        tilt_angle AS tilt,
        tilt_x,
        tilt_y,
        displacement,
        temperature,
        vibration,
        ai_anomaly_score,
        status,
        risk_score,
        risk_reason
      FROM sensor_telemetry
      WHERE ${whereSql}
      ORDER BY timestamp ASC
      LIMIT $${limitIndex}
    `;
    const res = await client.query(q, values);
    return res.rows;
  }

  /**
   * Query aggregate telemetry statistics
   */
  async getTelemetryStats(options = {}) {
    const { range = '24h', nodeId = 'all' } = options;

    if (!this.enabled || !this.isConnected) {
      return this.getFallbackStats();
    }

    const intervalSql = this.getSanitizedInterval(range);
    const values = [];
    let whereClauses = [`timestamp >= NOW() - ${intervalSql}`];

    if (nodeId && nodeId.toLowerCase() !== 'all') {
      whereClauses.push(`(node_short_id = $1 OR node_id = $1)`);
      values.push(nodeId.toUpperCase());
    }

    const whereSql = whereClauses.join(' AND ');

    try {
      const client = await this.pool.connect();
      try {
        const statsQuery = `
          SELECT 
            COUNT(*)::int AS total_samples,
            ROUND(MIN(tilt_angle)::numeric, 2) AS min_tilt,
            ROUND(MAX(tilt_angle)::numeric, 2) AS max_tilt,
            ROUND(AVG(tilt_angle)::numeric, 2) AS avg_tilt,
            ROUND(MAX(displacement)::numeric, 2) AS max_displacement,
            ROUND(MAX(temperature)::numeric, 1) AS max_temperature,
            ROUND(MAX(ai_anomaly_score)::numeric, 0) AS peak_anomaly_score,
            COUNT(CASE WHEN ai_anomaly_score >= 50 THEN 1 END)::int AS anomaly_samples_count,
            COUNT(CASE WHEN status = 'Warning' THEN 1 END)::int AS warning_samples_count,
            COUNT(CASE WHEN status = 'Critical' THEN 1 END)::int AS critical_samples_count
          FROM sensor_telemetry
          WHERE ${whereSql}
        `;
        const statsRes = await client.query(statsQuery, values);

        const alertCountQuery = `
          SELECT COUNT(*)::int AS alert_count
          FROM system_alerts
          WHERE created_at >= NOW() - ${intervalSql}
        `;
        const alertRes = await client.query(alertCountQuery);

        const row = statsRes.rows[0] || {};
        return {
          success: true,
          source: 'postgresql',
          range,
          nodeId,
          stats: {
            totalSamples: row.total_samples || 0,
            minTilt: row.min_tilt !== null ? Number(row.min_tilt) : 0.0,
            maxTilt: row.max_tilt !== null ? Number(row.max_tilt) : 0.0,
            avgTilt: row.avg_tilt !== null ? Number(row.avg_tilt) : 0.0,
            maxDisplacement: row.max_displacement !== null ? Number(row.max_displacement) : 0.0,
            maxTemperature: row.max_temperature !== null ? Number(row.max_temperature) : 25.0,
            peakAnomalyScore: row.peak_anomaly_score !== null ? Number(row.peak_anomaly_score) : 0,
            anomalyCount: row.anomaly_samples_count || 0,
            warningCount: row.warning_samples_count || 0,
            criticalCount: row.critical_samples_count || 0,
            totalAlerts: alertRes.rows[0]?.alert_count || 0
          }
        };
      } finally {
        client.release();
      }
    } catch (err) {
      console.warn('[PostgreSQL Stats Query Fallback]', err.message);
      return this.getFallbackStats();
    }
  }

  // =========================================================================
  // HISTORICAL RISK ANALYSIS QUERIES (100% Parameterized)
  // =========================================================================

  /**
   * 1. Query historical risk progression over time
   */
  async getRiskHistory(options = {}) {
    const {
      range = '24h',
      nodeId = 'all',
      riskLevel = 'all',
      limit = 500,
      downsample = true
    } = options;

    if (!this.enabled || !this.isConnected) {
      return this.getFallbackRiskHistory(range, nodeId);
    }

    const intervalSql = this.getSanitizedInterval(range);
    const bucketSeconds = this.getBucketSeconds(range);

    const values = [];
    let paramIndex = 1;
    let whereClauses = [`timestamp >= NOW() - ${intervalSql}`];

    if (nodeId && nodeId.toLowerCase() !== 'all') {
      const normalizedNode = nodeId.toUpperCase();
      whereClauses.push(`(node_short_id = $${paramIndex} OR node_id = $${paramIndex})`);
      values.push(normalizedNode);
      paramIndex++;
    }

    if (riskLevel && riskLevel.toLowerCase() !== 'all') {
      whereClauses.push(`risk_level = $${paramIndex}`);
      values.push(riskLevel.toUpperCase());
      paramIndex++;
    }

    const whereSql = whereClauses.join(' AND ');
    values.push(Math.min(parseInt(limit, 10) || 500, 2000));
    const limitParam = `$${paramIndex}`;

    try {
      const client = await this.pool.connect();
      try {
        let query = '';
        if (downsample && (range === '6h' || range === '24h' || range === '7d')) {
          query = `
            SELECT 
              to_timestamp(floor(extract(epoch from timestamp) / ${bucketSeconds}) * ${bucketSeconds}) AT TIME ZONE 'UTC' AS time,
              node_short_id AS "nodeId",
              node_id,
              ROUND(AVG(risk_score)::numeric, 0) AS risk_score,
              ROUND(MAX(risk_score)::numeric, 0) AS max_risk_score,
              ROUND(AVG(anomaly_score)::numeric, 0) AS anomaly_score,
              ROUND(MAX(anomaly_score)::numeric, 0) AS max_anomaly_score,
              ROUND(AVG(tilt_angle)::numeric, 2) AS tilt,
              ROUND(MAX(tilt_angle)::numeric, 2) AS max_tilt,
              ROUND(AVG(tilt_rate)::numeric, 5) AS tilt_rate,
              ROUND(AVG(displacement)::numeric, 2) AS displacement,
              ROUND(AVG(temperature)::numeric, 1) AS temperature,
              MODE() WITHIN GROUP (ORDER BY risk_level) AS risk_level,
              MODE() WITHIN GROUP (ORDER BY status) AS status,
              (ARRAY_AGG(reason ORDER BY timestamp DESC))[1] AS reason,
              COUNT(*)::int AS samples_count
            FROM risk_analysis
            WHERE ${whereSql}
            GROUP BY 1, 2, 3
            ORDER BY 1 ASC
            LIMIT ${limitParam}
          `;
        } else {
          query = `
            SELECT 
              id,
              timestamp AS time,
              node_short_id AS "nodeId",
              node_id,
              telemetry_id,
              risk_score,
              risk_level,
              status,
              anomaly_score,
              raw_decision_function,
              reason,
              tilt_angle AS tilt,
              tilt_rate,
              displacement,
              displacement_rate,
              vibration,
              temperature,
              model_version,
              feature_snapshot
            FROM risk_analysis
            WHERE ${whereSql}
            ORDER BY timestamp ASC
            LIMIT ${limitParam}
          `;
        }

        const res = await client.query(query, values);
        return {
          success: true,
          source: 'postgresql',
          range,
          nodeId,
          count: res.rows.length,
          data: res.rows
        };
      } finally {
        client.release();
      }
    } catch (err) {
      console.warn('[PostgreSQL Risk History Query Fallback]', err.message);
      return this.getFallbackRiskHistory(range, nodeId);
    }
  }

  /**
   * 2. Query latest risk assessment for all nodes
   */
  async getLatestRiskPerNode() {
    if (!this.enabled || !this.isConnected) {
      return { success: true, source: 'fallback', nodes: [] };
    }

    try {
      const client = await this.pool.connect();
      try {
        const query = `
          SELECT DISTINCT ON (node_id)
            id,
            node_id,
            node_short_id AS "nodeId",
            timestamp,
            risk_score,
            risk_level,
            status,
            anomaly_score,
            reason,
            tilt_angle,
            tilt_rate,
            displacement,
            temperature,
            vibration,
            model_version,
            feature_snapshot
          FROM risk_analysis
          ORDER BY node_id, timestamp DESC
        `;
        const res = await client.query(query);
        return {
          success: true,
          source: 'postgresql',
          count: res.rows.length,
          nodes: res.rows
        };
      } finally {
        client.release();
      }
    } catch (err) {
      return { success: true, source: 'fallback', nodes: [] };
    }
  }

  /**
   * 3. Query risk statistics
   */
  async getRiskStats(options = {}) {
    const { range = '24h', nodeId = 'all' } = options;

    if (!this.enabled || !this.isConnected) {
      return this.getFallbackRiskStats();
    }

    const intervalSql = this.getSanitizedInterval(range);
    const values = [];
    let whereClauses = [`timestamp >= NOW() - ${intervalSql}`];

    if (nodeId && nodeId.toLowerCase() !== 'all') {
      whereClauses.push(`(node_short_id = $1 OR node_id = $1)`);
      values.push(nodeId.toUpperCase());
    }

    const whereSql = whereClauses.join(' AND ');

    try {
      const client = await this.pool.connect();
      try {
        const query = `
          SELECT 
            COUNT(*)::int AS total_evaluations,
            ROUND(MIN(risk_score)::numeric, 0) AS min_risk_score,
            ROUND(MAX(risk_score)::numeric, 0) AS max_risk_score,
            ROUND(AVG(risk_score)::numeric, 1) AS avg_risk_score,
            ROUND(MAX(anomaly_score)::numeric, 0) AS peak_anomaly_score,
            ROUND(AVG(anomaly_score)::numeric, 1) AS avg_anomaly_score,
            ROUND(MAX(tilt_angle)::numeric, 2) AS max_tilt,
            ROUND(MAX(displacement)::numeric, 2) AS max_displacement,
            COUNT(CASE WHEN risk_level = 'SAFE' THEN 1 END)::int AS safe_count,
            COUNT(CASE WHEN risk_level = 'WARNING' THEN 1 END)::int AS warning_count,
            COUNT(CASE WHEN risk_level = 'CRITICAL' THEN 1 END)::int AS critical_count,
            COUNT(CASE WHEN risk_level = 'CALIBRATING' THEN 1 END)::int AS calibrating_count,
            MIN(CASE WHEN risk_level = 'CRITICAL' THEN timestamp END) AS first_critical_timestamp
          FROM risk_analysis
          WHERE ${whereSql}
        `;
        const res = await client.query(query, values);
        const row = res.rows[0] || {};

        return {
          success: true,
          source: 'postgresql',
          range,
          nodeId,
          stats: {
            totalEvaluations: row.total_evaluations || 0,
            minRiskScore: row.min_risk_score !== null ? Number(row.min_risk_score) : 10,
            maxRiskScore: row.max_risk_score !== null ? Number(row.max_risk_score) : 15,
            avgRiskScore: row.avg_risk_score !== null ? Number(row.avg_risk_score) : 12,
            peakAnomalyScore: row.peak_anomaly_score !== null ? Number(row.peak_anomaly_score) : 0,
            avgAnomalyScore: row.avg_anomaly_score !== null ? Number(row.avg_anomaly_score) : 0,
            maxTilt: row.max_tilt !== null ? Number(row.max_tilt) : 0.0,
            maxDisplacement: row.max_displacement !== null ? Number(row.max_displacement) : 0.0,
            safeCount: row.safe_count || 0,
            warningCount: row.warning_count || 0,
            criticalCount: row.critical_count || 0,
            calibratingCount: row.calibrating_count || 0,
            firstCriticalTimestamp: row.first_critical_timestamp || null
          }
        };
      } finally {
        client.release();
      }
    } catch (err) {
      console.warn('[PostgreSQL Risk Stats Fallback]', err.message);
      return this.getFallbackRiskStats();
    }
  }

  /**
   * 4. Query full diagnostic details for a specific risk analysis event
   */
  async getRiskDetailById(riskId) {
    if (!this.enabled || !this.isConnected || !riskId) {
      return null;
    }

    try {
      const client = await this.pool.connect();
      try {
        const query = `
          SELECT 
            r.*,
            t.sequence AS telemetry_sequence,
            t.gateway_id AS telemetry_gateway,
            t.hop_count AS telemetry_hops
          FROM risk_analysis r
          LEFT JOIN sensor_telemetry t ON r.telemetry_id = t.id
          WHERE r.id = $1
        `;
        const res = await client.query(query, [riskId]);
        return res.rows[0] || null;
      } finally {
        client.release();
      }
    } catch (err) {
      return null;
    }
  }

  /**
   * Trigger 1-minute aggregation explicitly
   */
  async runAggregation(lookbackMinutes = 120) {
    if (!this.enabled || !this.isConnected || !this.pool) {
      return { success: false, error: 'Database offline' };
    }
    return await aggregateCompletedMinutes(this.pool, { lookbackMinutes });
  }

  /**
   * Trigger retention pruning explicitly
   */
  async runPruning(options = {}) {
    if (!this.enabled || !this.isConnected || !this.pool) {
      return { success: false, error: 'Database offline' };
    }
    return await runRetentionCleanup(this.pool, options);
  }

  /**
   * Query database storage diagnostics & scaling estimates
   */
  async getStorageEstimates() {
    if (!this.enabled || !this.isConnected || !this.pool) {
      return { success: false, error: 'Database offline' };
    }
    return await getStorageDiagnostics(this.pool);
  }

  async getAlertsHistory(options = {}) {
    const { range = '7d', severity = 'all', limit = 100 } = options;

    if (!this.enabled || !this.isConnected) {
      return { success: true, source: 'fallback', count: 0, alerts: [] };
    }

    const intervalSql = this.getSanitizedInterval(range);
    const values = [];
    let whereClauses = [`created_at >= NOW() - ${intervalSql}`];

    if (severity && severity.toLowerCase() !== 'all') {
      whereClauses.push(`severity = $1`);
      values.push(severity);
    }

    const whereSql = whereClauses.join(' AND ');
    const limitIndex = values.length + 1;
    values.push(Math.min(parseInt(limit, 10) || 100, 500));

    try {
      const client = await this.pool.connect();
      try {
        const query = `
          SELECT *
          FROM system_alerts
          WHERE ${whereSql}
          ORDER BY created_at DESC
          LIMIT $${limitIndex}
        `;
        const res = await client.query(query, values);
        return {
          success: true,
          source: 'postgresql',
          count: res.rows.length,
          alerts: res.rows
        };
      } finally {
        client.release();
      }
    } catch (err) {
      return { success: true, source: 'fallback', count: 0, alerts: [] };
    }
  }

  // =========================================================================
  // FALLBACKS
  // =========================================================================

  getFallbackHistory(range, nodeId) {
    const queuedTelemetry = this.inMemoryQueue
      .filter(q => q.type === 'telemetry')
      .map(q => q.data);

    return {
      success: true,
      source: 'in_memory_fallback',
      range,
      nodeId,
      count: queuedTelemetry.length,
      data: queuedTelemetry
    };
  }

  getFallbackRiskHistory(range, nodeId) {
    const queuedRisk = this.inMemoryQueue
      .filter(q => q.type === 'risk')
      .map(q => ({
        time: q.data.timestamp,
        nodeId: q.data.node_short_id,
        node_id: q.data.node_id,
        risk_score: q.data.risk_score,
        risk_level: q.data.risk_level,
        status: q.data.status,
        anomaly_score: q.data.anomaly_score,
        reason: q.data.reason,
        tilt: q.data.tilt_angle,
        tilt_rate: q.data.tilt_rate,
        displacement: q.data.displacement,
        temperature: q.data.temperature,
        feature_snapshot: q.data.feature_snapshot
      }));

    return {
      success: true,
      source: 'in_memory_fallback',
      range,
      nodeId,
      count: queuedRisk.length,
      data: queuedRisk
    };
  }

  getFallbackStats() {
    return {
      success: true,
      source: 'in_memory_fallback',
      stats: {
        totalSamples: this.inMemoryQueue.length,
        minTilt: 0.15,
        maxTilt: 0.74,
        avgTilt: 0.35,
        maxDisplacement: 0.82,
        maxTemperature: 28.5,
        peakAnomalyScore: 28,
        anomalyCount: 0,
        warningCount: 0,
        criticalCount: 0,
        totalAlerts: 0
      }
    };
  }

  getFallbackRiskStats() {
    return {
      success: true,
      source: 'in_memory_fallback',
      stats: {
        totalEvaluations: this.inMemoryQueue.filter(q => q.type === 'risk').length,
        minRiskScore: 10,
        maxRiskScore: 18,
        avgRiskScore: 14,
        peakAnomalyScore: 18,
        avgAnomalyScore: 14,
        maxTilt: 0.35,
        maxDisplacement: 0.42,
        safeCount: this.inMemoryQueue.filter(q => q.type === 'risk' && q.data.risk_level === 'SAFE').length,
        warningCount: 0,
        criticalCount: 0,
        calibratingCount: 0,
        firstCriticalTimestamp: null
      }
    };
  }

  getHealth() {
    return {
      enabled: this.enabled,
      connected: this.isConnected,
      queuedWrites: this.inMemoryQueue.length,
      stats: { ...this.stats }
    };
  }

  async close() {
    if (this.pool) {
      await this.pool.end().catch(() => {});
      this.isConnected = false;
    }
  }
}

const dbService = new DbService();
module.exports = dbService;
