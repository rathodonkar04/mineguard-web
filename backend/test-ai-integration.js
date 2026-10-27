const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const ioClient = require('socket.io-client');

const telemetryRoutes = require('./routes/telemetry');
const aiService = require('./services/aiService');
const { resetSensorState, updateTelemetry } = require('./services/sensorService');

const TEST_PORT = 5004;

function createTestServer() {
  const app = express();
  app.use(express.json());

  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: '*' } });
  app.set('io', io);
  app.use('/api', telemetryRoutes);

  return { app, server, io };
}

function requestPost(urlPath, payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const req = http.request({
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path: urlPath,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function runTests() {
  console.log('================================================================');
  console.log(' Starting MineGuard AI Subsystem & Telemetry Integration Tests');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(` ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(` ❌ FAIL: ${message}`);
      failed++;
    }
  }

  const { server, io } = createTestServer();

  await new Promise((resolve) => server.listen(TEST_PORT, resolve));
  console.log(`AI Test Server listening on http://127.0.0.1:${TEST_PORT}\n`);

  // Connect Socket.IO client
  const clientSocket = ioClient(`http://127.0.0.1:${TEST_PORT}`, {
    transports: ['websocket']
  });

  await new Promise((resolve) => {
    clientSocket.on('connect', () => {
      assert(true, 'Socket.IO client connected for AI live verification');
      resolve();
    });
  });

  try {
    resetSensorState();

    // --------------------------------------------------------------------------
    // Test 1: Feature Vector Ordering (16 Canonical Features)
    // --------------------------------------------------------------------------
    const expectedFeatures = [
      'z_tilt', 'z_displacement', 'z_vibration', 'z_temperature',
      'tilt_rate', 'displacement_rate', 'displacement_acceleration', 'vibration_rate',
      'tilt_mean_30s', 'tilt_std_30s', 'displacement_mean_30s', 'vibration_mean_30s',
      'vibration_std_30s', 'volatility_ratio', 'delta_temperature', 'detrended_tilt'
    ];
    assert(
      JSON.stringify(aiService.CANONICAL_FEATURES) === JSON.stringify(expectedFeatures),
      'Exact 16 canonical features match training feature ordering from model_metadata.json'
    );

    // --------------------------------------------------------------------------
    // Test 2: Node-Specific Baseline & Calibration Guard
    // --------------------------------------------------------------------------
    const node1Baseline = aiService.getNodeBaseline('NODE_01');
    assert(node1Baseline !== null, 'NODE_01 has pre-calibrated baseline loaded');
    assert(typeof node1Baseline.statistics.tilt_angle.mean === 'number', 'NODE_01 baseline contains tilt_angle statistics');

    const uncalibratedRes = aiService.processTelemetry({
      node_id: 'NODE_04',
      tilt_angle: 0.20,
      displacement: 0.10,
      vibration: 0.01,
      temperature: 25.0
    });
    assert(uncalibratedRes.ai_status === 'CALIBRATING', 'Uncalibrated node (NODE_04) returns ai_status = "CALIBRATING"');
    assert(uncalibratedRes.risk_level === 'CALIBRATING', 'Uncalibrated node returns risk_level = "CALIBRATING"');

    // --------------------------------------------------------------------------
    // Test 3: Causal Warm-up Window (samples < 30)
    // --------------------------------------------------------------------------
    aiService.resetNodeBuffers('NODE_01');
    let warmupRes;
    for (let i = 0; i < 15; i++) {
      warmupRes = aiService.processTelemetry({
        node_id: 'NODE_01',
        tilt_angle: 0.131,
        displacement: 0.22,
        vibration: 0.0165,
        temperature: 24.28
      });
    }
    assert(warmupRes.ai_status === 'CALIBRATING', 'NODE_01 returns "CALIBRATING" during initial warm-up (<30 samples)');
    assert(warmupRes.history_samples === 15, 'Buffer correctly tracks 15 accumulated samples');

    // --------------------------------------------------------------------------
    // Test 4: Full 30s Causal Window Transition & AI Inference
    // --------------------------------------------------------------------------
    let activeRes;
    for (let i = 15; i < 35; i++) {
      activeRes = aiService.processTelemetry({
        node_id: 'NODE_01',
        tilt_angle: 0.131,
        displacement: 0.22,
        vibration: 0.0165,
        temperature: 24.28
      });
    }
    assert(activeRes.ai_status === 'ACTIVE', 'NODE_01 transitions to "ACTIVE" once >=30 samples accumulated');
    assert(typeof activeRes.ai_anomaly_score === 'number', 'Calculates numeric ai_anomaly_score');
    assert(activeRes.ai_anomaly_score < 40, `Baseline reading yields nominal anomaly score (${activeRes.ai_anomaly_score}/100)`);
    assert(activeRes.risk_level === 'SAFE', 'Baseline reading classified as risk_level = "SAFE"');

    // --------------------------------------------------------------------------
    // Test 5: Simulated Inflexion & Anomaly Score Escalation
    // --------------------------------------------------------------------------
    let anomRes;
    for (let i = 0; i < 10; i++) {
      anomRes = aiService.processTelemetry({
        node_id: 'NODE_01',
        tilt_angle: 1.45 + (i * 0.05),
        displacement: 0.85 + (i * 0.05),
        vibration: 0.04,
        temperature: 26.5
      });
    }
    assert(anomRes.ai_anomaly_score > 50, `Elevated deformation escalates anomaly score (${anomRes.ai_anomaly_score}/100)`);
    assert(anomRes.risk_level === 'WARNING', `Elevated tilt (1.90°) classified as risk_level = "WARNING"`);
    assert(anomRes.risk_reason.length > 0, `Generates transparent risk reason: "${anomRes.risk_reason}"`);

    // --------------------------------------------------------------------------
    // Test 6: Critical Subsidence Breach Classification
    // --------------------------------------------------------------------------
    const critRes = aiService.processTelemetry({
      node_id: 'NODE_01',
      tilt_angle: 2.45,
      displacement: 2.10,
      vibration: 0.12,
      temperature: 28.0
    });
    assert(critRes.risk_level === 'CRITICAL', 'Tilt > 2.00° classified as risk_level = "CRITICAL"');
    assert(critRes.ai_anomaly_score >= 80, `Critical anomaly score high (${critRes.ai_anomaly_score}/100)`);

    // --------------------------------------------------------------------------
    // Test 7: HTTP POST Ingestion with Live AI Results
    // --------------------------------------------------------------------------
    aiService.setNodeBaseline('NODE_03', node1Baseline);
    aiService.setNodeBaseline('N3', node1Baseline);

    // Warm up NODE_03 via HTTP
    for (let i = 0; i < 31; i++) {
      await requestPost('/api/telemetry', {
        node_id: 'NODE_03',
        tilt_angle: 0.25,
        displacement: 0.30,
        vibration: 0.02,
        temperature: 25.5
      });
    }

    const httpRes = await requestPost('/api/telemetry', {
      node_id: 'NODE_03',
      tilt_angle: 0.25,
      displacement: 0.30,
      vibration: 0.02,
      temperature: 25.5
    });
    assert(httpRes.status === 200, 'POST /api/telemetry returns 200 OK');
    assert(httpRes.data.sensor.ai_status === 'ACTIVE', 'Response includes sensor.ai_status = "ACTIVE"');
    assert(typeof httpRes.data.sensor.ai_anomaly_score === 'number', 'Response includes numeric sensor.ai_anomaly_score');
    assert(httpRes.data.sensor.risk_level === 'SAFE', 'Response includes sensor.risk_level = "SAFE"');

    // --------------------------------------------------------------------------
    // Test 8: Socket.IO Event Broadcast with AI Fields
    // --------------------------------------------------------------------------
    let receivedSocketEvent = null;
    clientSocket.on('sensorUpdate', (data) => {
      if (data.node_id === 'NODE_03') {
        receivedSocketEvent = data;
      }
    });

    await requestPost('/api/readings', {
      node_id: 'NODE_03',
      tilt_x_deg: 0.15,
      tilt_y_deg: 0.12,
      temperature_C: 25.8
    });

    await new Promise(r => setTimeout(r, 200));
    assert(receivedSocketEvent !== null, 'Socket.IO received real-time sensorUpdate broadcast');
    assert(receivedSocketEvent.node_id === 'NODE_03', 'Broadcast matches node_id = "NODE_03"');
    assert(receivedSocketEvent.ai_status === 'ACTIVE', 'Broadcast contains ai_status = "ACTIVE"');
    assert(typeof receivedSocketEvent.ai_anomaly_score === 'number', 'Broadcast contains numeric ai_anomaly_score');

    // --------------------------------------------------------------------------
    // Test 9: Rejection of Malformed Telemetry
    // --------------------------------------------------------------------------
    const malformedRes = await requestPost('/api/telemetry', {
      node_id: 'NODE_01',
      tilt_angle: 'invalid_string'
    });
    assert(malformedRes.status === 400, 'Rejects non-numeric tilt payload (400 Bad Request)');

    // --------------------------------------------------------------------------
    // Test 10: Multi-Node Isolation (Buffers do not cross-talk)
    // --------------------------------------------------------------------------
    aiService.resetNodeBuffers();
    aiService.setNodeBaseline('NODE_02', node1Baseline);

    // Send 35 samples for NODE_01, 5 samples for NODE_02
    for (let i = 0; i < 35; i++) {
      aiService.processTelemetry({ node_id: 'NODE_01', tilt_angle: 0.13, displacement: 0.2, vibration: 0.01, temperature: 24.0 });
    }
    for (let i = 0; i < 5; i++) {
      aiService.processTelemetry({ node_id: 'NODE_02', tilt_angle: 0.13, displacement: 0.2, vibration: 0.01, temperature: 24.0 });
    }

    const n1State = aiService.processTelemetry({ node_id: 'NODE_01', tilt_angle: 0.13, displacement: 0.2, vibration: 0.01, temperature: 24.0 });
    const n2State = aiService.processTelemetry({ node_id: 'NODE_02', tilt_angle: 0.13, displacement: 0.2, vibration: 0.01, temperature: 24.0 });

    assert(n1State.ai_status === 'ACTIVE', 'NODE_01 buffer is ACTIVE (>=30 samples)');
    assert(n2State.ai_status === 'CALIBRATING', 'NODE_02 buffer is CALIBRATING (<30 samples, isolated buffer)');

  } finally {
    clientSocket.disconnect();
    server.close();
  }

  console.log('\n================================================================');
  console.log(` AI INTEGRATION TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log('================================================================\n');

  if (failed > 0) process.exit(1);
  process.exit(0);
}

runTests().catch(err => {
  console.error('Test Runner Error:', err);
  process.exit(1);
});
