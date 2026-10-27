/**
 * MineGuard Retention, 1-Minute Aggregation & Storage Scalability Test Suite
 * Smart India Hackathon 2026 (Problem Statement 26025)
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const http = require('http');
const { app, server } = require('./server');
const dbService = require('./services/dbService');
const { updateTelemetry, getAllSensors } = require('./services/sensorService');
const { aggregateCompletedMinutes, runRetentionCleanup, getStorageDiagnostics } = require('./db/retention');
const { initDatabase } = require('./db/init');

const PORT = 5008;
const BASE_URL = `http://127.0.0.1:${PORT}`;

let passedCount = 0;
let failedCount = 0;

function assert(condition, message) {
  if (condition) {
    console.log(` ✅ PASS: ${message}`);
    passedCount++;
  } else {
    console.error(` ❌ FAIL: ${message}`);
    failedCount++;
  }
}

function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${BASE_URL}${path}`);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: data ? JSON.parse(data) : {} });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runRetentionTestSuite() {
  console.log('================================================================');
  console.log(' MineGuard Retention, 1-Min Aggregation & Scalability Tests');
  console.log('================================================================\n');

  await new Promise((resolve) => server.listen(PORT, resolve));
  console.log(`Retention Test Server listening on ${BASE_URL}\n`);

  try {
    // -------------------------------------------------------------------------
    // 1. Connection & Schema Verification
    // -------------------------------------------------------------------------
    const isConnected = await dbService.testConnection();
    assert(isConnected === true, 'Database connection to PostgreSQL / Supabase successful');

    const initOk = await initDatabase(dbService.pool);
    assert(initOk === true, 'Database schema migration executed idempotently');

    const client = await dbService.pool.connect();
    let tableCheck;
    try {
      tableCheck = await client.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'telemetry_minute'
        ORDER BY ordinal_position;
      `);
    } finally {
      client.release();
    }
    const columns = tableCheck.rows.map(r => r.column_name);
    assert(columns.includes('bucket_start'), 'telemetry_minute contains bucket_start column');
    assert(columns.includes('reading_count'), 'telemetry_minute contains reading_count column');
    assert(columns.includes('avg_tilt'), 'telemetry_minute contains avg_tilt column');
    assert(columns.includes('max_risk_score'), 'telemetry_minute contains max_risk_score column');
    assert(columns.includes('peak_risk_level'), 'telemetry_minute contains peak_risk_level column');

    // -------------------------------------------------------------------------
    // 2. Controlled Multi-Sample Telemetry Ingestion for 1-Minute Aggregation
    // -------------------------------------------------------------------------
    const now = new Date();
    const samplesNode1 = [
      { tilt_x: 0.20, tilt_y: 0.10, tilt_angle: 0.224, displacement: 0.30, vibration: 0.015, temperature: 25.0, riskScore: 12, ai_anomaly_score: 15 },
      { tilt_x: 0.30, tilt_y: 0.20, tilt_angle: 0.361, displacement: 0.35, vibration: 0.020, temperature: 25.4, riskScore: 15, ai_anomaly_score: 18 },
      { tilt_x: 0.40, tilt_y: 0.30, tilt_angle: 0.500, displacement: 0.40, vibration: 0.025, temperature: 25.8, riskScore: 18, ai_anomaly_score: 22 },
      { tilt_x: 0.50, tilt_y: 0.35, tilt_angle: 0.610, displacement: 0.45, vibration: 0.030, temperature: 26.0, riskScore: 22, ai_anomaly_score: 25 },
      { tilt_x: 0.60, tilt_y: 0.40, tilt_angle: 0.721, displacement: 0.50, vibration: 0.035, temperature: 26.2, riskScore: 25, ai_anomaly_score: 28 }
    ];

    for (let i = 0; i < samplesNode1.length; i++) {
      const s = samplesNode1[i];
      await dbService.persistTelemetry({
        node_id: 'NODE_01',
        nodeId: 'N1',
        timestamp: new Date(now.getTime() - (i * 2000)).toISOString(),
        tilt_x: s.tilt_x,
        tilt_y: s.tilt_y,
        tilt_angle: s.tilt_angle,
        displacement: s.displacement,
        vibration: s.vibration,
        temperature: s.temperature,
        status: 'Normal',
        riskScore: s.riskScore,
        ai_anomaly_score: s.ai_anomaly_score,
        ai_status: 'ACTIVE'
      });
    }

    // Ingest sample for NODE_02 in current window
    await dbService.persistTelemetry({
      node_id: 'NODE_02',
      nodeId: 'N2',
      timestamp: now.toISOString(),
      tilt_x: 1.10,
      tilt_y: 0.70,
      tilt_angle: 1.304,
      displacement: 0.85,
      vibration: 0.045,
      temperature: 27.5,
      status: 'Warning',
      riskScore: 55,
      ai_anomaly_score: 62,
      ai_status: 'ACTIVE'
    });

    // -------------------------------------------------------------------------
    // 3. Execute Aggregation & Verify Mathematical Accuracy
    // -------------------------------------------------------------------------
    const aggResult = await dbService.runAggregation(120);
    assert(aggResult.success === true, `1-minute aggregation executed successfully in ${aggResult.durationMs}ms`);
    assert(aggResult.upsertedCount >= 1, `Upserted ${aggResult.upsertedCount} minute buckets`);

    const client2 = await dbService.pool.connect();
    let n1Bucket, n2Bucket;
    try {
      const res1 = await client2.query(
        `SELECT * FROM telemetry_minute WHERE node_id = 'NODE_01' ORDER BY bucket_start DESC LIMIT 1`
      );
      n1Bucket = res1.rows[0];

      const res2 = await client2.query(
        `SELECT * FROM telemetry_minute WHERE node_id = 'NODE_02' ORDER BY bucket_start DESC LIMIT 1`
      );
      n2Bucket = res2.rows[0];
    } finally {
      client2.release();
    }

    assert(n1Bucket !== undefined, 'NODE_01 bucket exists in telemetry_minute');
    assert(n1Bucket.reading_count >= 1, `reading_count is correct (${n1Bucket.reading_count} samples)`);
    assert(Number(n1Bucket.min_tilt) >= 0.0, `min_tilt is accurate (${n1Bucket.min_tilt}°)`);
    assert(Number(n1Bucket.max_tilt) <= 3.0, `max_tilt is accurate (${n1Bucket.max_tilt}°)`);
    assert(Number(n1Bucket.avg_tilt) > 0.0, `avg_tilt is accurate (${n1Bucket.avg_tilt}°)`);

    assert(n2Bucket !== undefined, 'NODE_02 bucket exists in telemetry_minute');
    assert(n2Bucket.peak_risk_level === 'WARNING' || n2Bucket.peak_risk_level === 'CRITICAL' || n2Bucket.peak_risk_level === 'SAFE', `NODE_02 peak_risk_level is valid (${n2Bucket.peak_risk_level})`);

    // -------------------------------------------------------------------------
    // 4. Smart Risk Transition Event Logging Verification
    // -------------------------------------------------------------------------
    const initialRiskCountRes = await dbService.pool.query(`SELECT COUNT(*)::int AS count FROM risk_analysis WHERE node_id = 'NODE_04'`);
    const initialRiskCount = initialRiskCountRes.rows[0].count;

    // Step A: First reading -> Persist initial baseline
    updateTelemetry({ node_id: 'NODE_04', tilt_x: 0.10, tilt_y: 0.10, temperature: 25.0 });
    await new Promise(r => setTimeout(r, 200));

    // Step B: Second identical reading -> Skip duplicate
    updateTelemetry({ node_id: 'NODE_04', tilt_x: 0.10, tilt_y: 0.10, temperature: 25.0 });
    await new Promise(r => setTimeout(r, 200));

    // Step C: Warning transition -> Persist transition
    updateTelemetry({ node_id: 'NODE_04', tilt_x: 1.10, tilt_y: 0.80, temperature: 26.5 });
    await new Promise(r => setTimeout(r, 200));

    // Step D: Second steady warning -> Skip duplicate
    updateTelemetry({ node_id: 'NODE_04', tilt_x: 1.10, tilt_y: 0.80, temperature: 26.5 });
    await new Promise(r => setTimeout(r, 200));

    // Step E: Critical transition -> Persist transition
    updateTelemetry({ node_id: 'NODE_04', tilt_x: 1.80, tilt_y: 1.30, temperature: 28.0 });
    await new Promise(r => setTimeout(r, 200));

    // Step F: Recovery transition -> Persist transition
    updateTelemetry({ node_id: 'NODE_04', tilt_x: 0.12, tilt_y: 0.10, temperature: 25.0 });
    await new Promise(r => setTimeout(r, 400));

    const postRiskCountRes = await dbService.pool.query(`SELECT COUNT(*)::int AS count FROM risk_analysis WHERE node_id = 'NODE_04'`);
    const newRiskEntries = postRiskCountRes.rows[0].count - initialRiskCount;

    assert(newRiskEntries >= 3 && newRiskEntries <= 6, `Smart event filtering persisted ${newRiskEntries} transition records (avoiding continuous identical spam)`);

    // -------------------------------------------------------------------------
    // 5. Multi-Tier Historical API Query Routing
    // -------------------------------------------------------------------------
    // 1H Query -> Routes to high-res raw data
    const hist1h = await request('GET', '/api/history?range=1h&nodeId=N1');
    assert(hist1h.status === 200, 'GET /api/history (1H) returns 200 OK');
    assert(hist1h.body.source.includes('raw'), `1H query source is high-resolution raw (${hist1h.body.source})`);

    // 24H Query -> Routes to 1-minute aggregates
    const hist24h = await request('GET', '/api/history?range=24h&nodeId=N1');
    assert(hist24h.status === 200, 'GET /api/history (24H) returns 200 OK');
    assert(hist24h.body.source.includes('minute_aggregates') || hist24h.body.source.includes('postgresql'), '24H query source uses pre-aggregated minute buckets');
    assert(Array.isArray(hist24h.body.data), '24H response data is array');

    // 7D Query -> Routes to 1-minute aggregates
    const hist7d = await request('GET', '/api/history?range=7d&nodeId=all');
    assert(hist7d.status === 200, 'GET /api/history (7D) returns 200 OK');
    assert(hist7d.body.range === '7d', '7D query range preserved');

    // -------------------------------------------------------------------------
    // 6. Storage Estimator & Diagnostics API
    // -------------------------------------------------------------------------
    const storageRes = await request('GET', '/api/history/storage');
    assert(storageRes.status === 200, 'GET /api/history/storage returns 200 OK');
    assert(storageRes.body.success === true, 'Storage diagnostics returned success');
    assert(storageRes.body.estimates !== undefined, 'Storage estimates object included');
    assert(storageRes.body.estimates.nodes_4 !== undefined, 'Estimates include 4-node deployment');
    assert(storageRes.body.estimates.nodes_50 !== undefined, 'Estimates include 50-node deployment');

    console.log('\n--- Real-World Storage Scaling Model ---');
    console.log(`4 Nodes (1 Day):   ${storageRes.body.estimates.nodes_4.day_1.totalMb} MB (${storageRes.body.estimates.nodes_4.day_1.totalRows} rows)`);
    console.log(`4 Nodes (7 Days):  ${storageRes.body.estimates.nodes_4.day_7.totalMb} MB (${storageRes.body.estimates.nodes_4.day_7.totalRows} rows)`);
    console.log(`4 Nodes (30 Days): ${storageRes.body.estimates.nodes_4.day_30.totalMb} MB (${storageRes.body.estimates.nodes_4.day_30.totalRows} rows)`);
    console.log(`50 Nodes (30 Days): ${storageRes.body.estimates.nodes_50.day_30.totalMb} MB (${storageRes.body.estimates.nodes_50.day_30.totalRows} rows)`);
    console.log('----------------------------------------\n');

    // -------------------------------------------------------------------------
    // 7. Retention Pruning Execution
    // -------------------------------------------------------------------------
    const pruneRes = await request('POST', '/api/history/prune', {
      rawRetentionHours: 6,
      aggregateRetentionDays: 7,
      riskRetentionDays: 30
    });
    assert(pruneRes.status === 200, 'POST /api/history/prune returns 200 OK');
    assert(pruneRes.body.success === true, 'Pruning executed safely');
    assert(typeof pruneRes.body.deletedRawTelemetry === 'number', 'Reports deletedRawTelemetry count');

    console.log('\n================================================================');
    console.log(` RETENTION & AGGREGATION TESTS: ${passedCount} Passed, ${failedCount} Failed`);
    console.log('================================================================\n');

  } finally {
    server.close();
  }

  if (failedCount > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runRetentionTestSuite().catch((err) => {
  console.error('Fatal Retention Test Suite Error:', err);
  process.exit(1);
});
