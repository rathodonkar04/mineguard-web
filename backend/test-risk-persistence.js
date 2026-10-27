/**
 * MineGuard PostgreSQL / Supabase Persistent Risk Analysis Test Suite
 * Smart India Hackathon 2026 (Problem Statement 26025)
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const http = require('http');
const { performance } = require('perf_hooks');
const { app, server } = require('./server');
const dbService = require('./services/dbService');
const { initDatabase } = require('./db/init');

const PORT = 5006;
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

async function runRiskPersistenceTestSuite() {
  console.log('================================================================');
  console.log(' MineGuard Persistent Risk Analysis & Supabase Storage Tests');
  console.log('================================================================\n');

  await new Promise((resolve) => server.listen(PORT, resolve));
  console.log(`Risk Test Server listening on ${BASE_URL}\n`);

  let createdRiskId = null;

  try {
    // -------------------------------------------------------------------------
    // 1. Database Connection & Schema Verification
    // -------------------------------------------------------------------------
    const isConnected = await dbService.testConnection();
    assert(isConnected === true, 'Database connection to PostgreSQL / Supabase successful');

    const schemaMigrated = await initDatabase(dbService.pool);
    assert(schemaMigrated === true, 'Schema initialization idempotent and verified');

    // -------------------------------------------------------------------------
    // 2. Direct Telemetry & Risk Analysis Persistence
    // -------------------------------------------------------------------------
    const t0 = performance.now();
    const telemetryId = await dbService.persistTelemetry({
      node_id: 'NODE_01',
      nodeId: 'N1',
      tilt_x: 0.35,
      tilt_y: 0.20,
      tilt_angle: 0.40,
      displacement: 0.45,
      vibration: 0.022,
      temperature: 26.8,
      crackDetected: false,
      status: 'Normal',
      riskScore: 18,
      ai_anomaly_score: 22,
      ai_status: 'ACTIVE',
      risk_reason: 'Nominal baseline ground conditions'
    });
    const t1 = performance.now();
    assert(telemetryId !== null, `persistTelemetry stored record in ${(t1 - t0).toFixed(2)} ms (ID: ${telemetryId})`);

    const riskId = await dbService.persistRiskAnalysis({
      node_id: 'NODE_01',
      node_short_id: 'N1',
      telemetry_id: telemetryId,
      timestamp: new Date().toISOString(),
      anomaly_score: 22,
      raw_decision_function: 0.1245,
      risk_score: 18,
      risk_level: 'SAFE',
      status: 'Normal',
      reason: 'Nominal baseline ground conditions',
      tilt_angle: 0.40,
      tilt_rate: 0.002,
      displacement: 0.45,
      displacement_rate: 0.001,
      vibration: 0.022,
      temperature: 26.8,
      model_version: '1.0.0-isolation-forest-300trees',
      features: {
        z_tilt: 0.25,
        z_displacement: 0.18,
        z_vibration: 0.05,
        z_temperature: 0.10,
        tilt_rate: 0.002,
        displacement_rate: 0.001,
        displacement_acceleration: 0.000,
        vibration_rate: 0.000,
        tilt_mean_30s: 0.38,
        tilt_std_30s: 0.012,
        displacement_mean_30s: 0.44,
        vibration_mean_30s: 0.021,
        vibration_std_30s: 0.001,
        volatility_ratio: 1.02,
        delta_temperature: 0.3,
        detrended_tilt: 0.39
      }
    });
    assert(riskId !== null, `persistRiskAnalysis stored risk record with 16-feature JSONB snapshot (ID: ${riskId})`);
    createdRiskId = riskId;

    // -------------------------------------------------------------------------
    // 3. End-to-End Ingestion -> AI -> Risk -> DB Persistence Flow
    // -------------------------------------------------------------------------
    // Ingest Warning Reading for Node 1
    const postWarningRes = await request('POST', '/api/telemetry', {
      node_id: 'NODE_01',
      tilt_x: 1.25,
      tilt_y: 0.85,
      temperature: 27.5,
      displacement: 0.85,
      vibration: 0.045
    });
    assert(postWarningRes.status === 200, 'POST /api/telemetry ingests elevated warning reading (200 OK)');
    assert(postWarningRes.body.sensor.status === 'Warning', 'Telemetry evaluated as Warning status');
    assert(postWarningRes.body.sensor.node_id === 'NODE_01', 'Sensor node_id is canonical NODE_01');

    // Ingest Critical Reading for Node 3
    const postCritRes = await request('POST', '/api/readings', {
      node_id: 'NODE_03',
      gateway_id: 'N3',
      sequence: 201,
      hop_count: 0,
      tilt_x_deg: 2.15,
      tilt_y_deg: 0.95,
      temperature_C: 29.2
    });
    assert(postCritRes.status === 200, 'POST /api/readings ingests critical gateway reading (200 OK)');
    assert(postCritRes.body.sensor.status === 'Critical', 'Critical reading evaluated as Critical status');

    // Give async database writes 200ms to settle
    await new Promise(r => setTimeout(r, 200));

    // -------------------------------------------------------------------------
    // 4. Historical Risk Query Endpoints
    // -------------------------------------------------------------------------
    // Query 1H Risk History
    const riskHist1h = await request('GET', '/api/history/risk?range=1h&nodeId=NODE_01');
    assert(riskHist1h.status === 200, 'GET /api/history/risk (range=1h) returns 200 OK');
    assert(riskHist1h.body.success === true, 'Risk history response indicates success = true');
    assert(Array.isArray(riskHist1h.body.data), 'Risk history data is an array');
    assert(riskHist1h.body.data.length > 0, `Risk history contains recorded evaluations (${riskHist1h.body.data.length} records)`);

    // Verify properties of recorded risk entry
    const firstRiskEntry = riskHist1h.body.data[0];
    assert(firstRiskEntry.risk_score !== undefined, 'Risk entry contains numeric risk_score');
    assert(firstRiskEntry.risk_level !== undefined, 'Risk entry contains risk_level');
    assert(firstRiskEntry.reason !== undefined, 'Risk entry contains diagnostic reason');

    // Query 24H Downsampled Risk History
    const riskHist24h = await request('GET', '/api/history/risk?range=24h&nodeId=all&downsample=true');
    assert(riskHist24h.status === 200, 'GET /api/history/risk (range=24h downsampled) returns 200 OK');
    assert(riskHist24h.body.range === '24h', 'Response preserves range = 24h');

    // Query Risk Level Filtering
    const riskCritOnly = await request('GET', '/api/history/risk?range=24h&riskLevel=CRITICAL');
    assert(riskCritOnly.status === 200, 'GET /api/history/risk (riskLevel=CRITICAL) returns 200 OK');
    assert(Array.isArray(riskCritOnly.body.data), 'Filtered risk level query returns array');

    // -------------------------------------------------------------------------
    // 5. Latest Risk Assessment per Node (/api/history/risk/latest)
    // -------------------------------------------------------------------------
    const latestRiskRes = await request('GET', '/api/history/risk/latest');
    assert(latestRiskRes.status === 200, 'GET /api/history/risk/latest returns 200 OK');
    assert(latestRiskRes.body.success === true, 'Latest risk query indicates success');
    assert(Array.isArray(latestRiskRes.body.nodes), 'Latest risk query returns nodes array');
    assert(latestRiskRes.body.nodes.length >= 1, `Latest risk query returned ${latestRiskRes.body.nodes.length} active nodes`);

    // -------------------------------------------------------------------------
    // 6. Aggregate Risk Statistics (/api/history/risk/stats)
    // -------------------------------------------------------------------------
    const riskStatsRes = await request('GET', '/api/history/risk/stats?range=24h&nodeId=all');
    assert(riskStatsRes.status === 200, 'GET /api/history/risk/stats returns 200 OK');
    assert(riskStatsRes.body.success === true, 'Risk stats response indicates success');
    const stats = riskStatsRes.body.stats;
    assert(typeof stats.totalEvaluations === 'number', 'Stats includes totalEvaluations count');
    assert(typeof stats.maxRiskScore === 'number', 'Stats includes maxRiskScore');
    assert(typeof stats.avgRiskScore === 'number', 'Stats includes avgRiskScore');
    assert(typeof stats.warningCount === 'number', 'Stats includes warningCount');
    assert(typeof stats.criticalCount === 'number', 'Stats includes criticalCount');

    // -------------------------------------------------------------------------
    // 7. Full Diagnostic Detail Query by ID (/api/history/risk/:riskId)
    // -------------------------------------------------------------------------
    if (createdRiskId) {
      const riskDetailRes = await request('GET', `/api/history/risk/${createdRiskId}`);
      assert(riskDetailRes.status === 200, `GET /api/history/risk/${createdRiskId} returns 200 OK`);
      assert(riskDetailRes.body.success === true, 'Risk detail response indicates success');
      assert(riskDetailRes.body.risk.model_version === '1.0.0-isolation-forest-300trees', 'Risk detail preserves model_version');
      assert(riskDetailRes.body.risk.feature_snapshot !== null, 'Risk detail preserves 16-feature JSONB snapshot');
      assert(riskDetailRes.body.risk.feature_snapshot.z_tilt !== undefined, 'Feature snapshot includes z_tilt');
    }

    // -------------------------------------------------------------------------
    // 8. Offline Resilience & Queue Draining
    // -------------------------------------------------------------------------
    const initialQueued = dbService.inMemoryQueue.length;
    dbService.enqueue({
      type: 'risk',
      data: {
        node_id: 'NODE_01',
        node_short_id: 'N1',
        timestamp: new Date().toISOString(),
        risk_score: 20,
        risk_level: 'SAFE',
        status: 'Normal',
        reason: 'Buffered test risk evaluation',
        tilt_angle: 0.35
      }
    });
    assert(dbService.inMemoryQueue.length === initialQueued + 1, 'Risk analysis record successfully buffered when offline');
    await dbService.drainQueue();
    assert(dbService.inMemoryQueue.length === 0, 'In-memory queue successfully drained into Supabase on reconnection');

    console.log('\n================================================================');
    console.log(` PERSISTENT RISK ANALYSIS TESTS: ${passedCount} Passed, ${failedCount} Failed`);
    console.log('================================================================\n');

  } finally {
    server.close();
  }

  if (failedCount > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runRiskPersistenceTestSuite().catch((err) => {
  console.error('Fatal Risk Test Suite Error:', err);
  process.exit(1);
});
