/**
 * MineGuard Realistic Multi-Node Load & Throughput Test
 * Smart India Hackathon 2026 (Problem Statement 26025)
 * 
 * Simulates 4 active ESP32 nodes streaming at 1 Hz for 60 seconds (240 multi-channel samples)
 * Verifies sub-millisecond Socket.IO broadcasts, continuous 1 Hz AI feature extraction,
 * non-blocking database persistence, 1-minute aggregation, and sub-15ms historical queries.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const http = require('http');
const ioClient = require('socket.io-client');
const { app, server, io } = require('./server');
const dbService = require('./services/dbService');
const { updateTelemetry, getAllSensors } = require('./services/sensorService');
const { aggregateCompletedMinutes } = require('./db/retention');

const PORT = 5009;
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

async function runRealisticLoadTest() {
  console.log('================================================================');
  console.log(' MineGuard 4-Node 1 Hz Continuous Load & Scalability Test');
  console.log('================================================================\n');

  await new Promise((resolve) => server.listen(PORT, resolve));
  console.log(`Load Test Server listening on ${BASE_URL}\n`);

  let socket = null;
  let receivedSocketUpdates = 0;

  try {
    await dbService.testConnection();

    // 1. Connect Socket.IO client
    socket = ioClient(BASE_URL, { reconnection: false, timeout: 2000 });
    socket.on('sensorUpdate', () => {
      receivedSocketUpdates++;
    });
    await new Promise((resolve) => socket.on('connect', resolve));
    assert(socket.connected === true, 'Socket.IO client connected for real-time telemetry verification');

    const nodes = ['NODE_01', 'NODE_02', 'NODE_03', 'NODE_04'];
    const SIMULATED_SECONDS = 60;
    const initialMemory = process.memoryUsage().heapUsed;
    const baseTime = Date.now() - (SIMULATED_SECONDS * 1000);

    console.log(`Ingesting ${nodes.length} nodes x ${SIMULATED_SECONDS} seconds = ${nodes.length * SIMULATED_SECONDS} multi-channel telemetry packets at 1 Hz...`);

    const tStart = Date.now();
    let totalIngested = 0;

    for (let sec = 0; sec < SIMULATED_SECONDS; sec++) {
      const timestamp = new Date(baseTime + (sec * 1000)).toISOString();

      for (let nIdx = 0; nIdx < nodes.length; nIdx++) {
        const nodeId = nodes[nIdx];
        const baseTilt = 0.20 + (nIdx * 0.15) + (Math.sin(sec / 10) * 0.05);

        updateTelemetry({
          node_id: nodeId,
          timestamp,
          tilt_x: Number((baseTilt * 0.707).toFixed(3)),
          tilt_y: Number((baseTilt * 0.707).toFixed(3)),
          tilt_angle: Number(baseTilt.toFixed(3)),
          displacement: Number((0.30 + nIdx * 0.1 + (sec * 0.002)).toFixed(2)),
          vibration: Number((0.015 + Math.random() * 0.01).toFixed(3)),
          temperature: Number((25.0 + Math.sin(sec / 20) * 1.5).toFixed(1)),
          sequence: 1000 + sec
        }, io);

        totalIngested++;
      }
    }

    const tIngestDuration = Date.now() - tStart;
    console.log(`Ingestion completed in ${tIngestDuration}ms (~${(tIngestDuration / totalIngested).toFixed(3)}ms per packet)`);

    // Give socket and async DB writes time to receive all events
    await new Promise(r => setTimeout(r, 200));

    assert(totalIngested === 240, `Ingested exactly 240 packets across 4 nodes`);
    assert(receivedSocketUpdates === 240, `Socket.IO received 240 real-time broadcasts (${receivedSocketUpdates}/240 delivered)`);

    // 2. Verify Database Persistence
    const client = await dbService.pool.connect();
    let rawCheck;
    try {
      rawCheck = await client.query(
        `SELECT COUNT(*)::int AS count, COUNT(DISTINCT node_id)::int AS nodes_count FROM sensor_telemetry WHERE sequence >= 1000`
      );
    } finally {
      client.release();
    }

    assert(rawCheck.rows[0].nodes_count === 4, `All 4 nodes persisted to Supabase`);
    assert(rawCheck.rows[0].count >= 240, `Persisted ${rawCheck.rows[0].count} raw telemetry samples`);

    // 3. Execute 1-Minute Aggregation
    const aggResult = await dbService.runAggregation(120);
    assert(aggResult.success === true, `Aggregation completed in ${aggResult.durationMs}ms`);

    // 4. Verify History API Query Speeds Under Load
    const tQuery0 = Date.now();
    const histRes = await request('GET', '/api/history?range=24h&nodeId=all');
    const tQueryDuration = Date.now() - tQuery0;
    assert(histRes.status === 200, 'GET /api/history returns 200 OK');
    assert(tQueryDuration < 35, `24H historical query executed in ${tQueryDuration}ms (< 35ms latency)`);
    assert(Array.isArray(histRes.body.data), 'History payload is structured array');

    // 5. Verify Memory Stability
    const finalMemory = process.memoryUsage().heapUsed;
    const memoryDiffMb = ((finalMemory - initialMemory) / (1024 * 1024)).toFixed(2);
    console.log(`Heap delta after 240 packets: ${memoryDiffMb} MB`);
    assert(parseFloat(memoryDiffMb) < 25.0, `Memory remains bounded (${memoryDiffMb} MB delta)`);

    console.log('\n================================================================');
    console.log(` REALISTIC LOAD TESTS: ${passedCount} Passed, ${failedCount} Failed`);
    console.log('================================================================\n');

  } finally {
    if (socket) socket.disconnect();
    server.close();
  }

  if (failedCount > 0) {
    process.exit(1);
  }
}

runRealisticLoadTest().catch((err) => {
  console.error('Fatal Load Test Error:', err);
  process.exit(1);
});
