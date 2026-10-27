/**
 * Automated Verification Suite for MineGuard Backend
 * Tests all REST endpoints, validation rules, risk calculations, and Socket.IO events.
 */

const http = require('http');
const { io } = require('socket.io-client');
const { server } = require('./server');

const PORT = 5001; // Use separate test port

function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: '127.0.0.1',
      port: PORT,
      path,
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('\n======================================================');
  console.log(' Starting MineGuard Backend Test Suite...');
  console.log('======================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, name, details = '') {
    if (condition) {
      console.log(` ✅ PASS: ${name}`);
      passed++;
    } else {
      console.error(` ❌ FAIL: ${name} ${details}`);
      failed++;
    }
  }

  // Start test server
  await new Promise((resolve) => server.listen(PORT, resolve));
  console.log(`Test server active on port ${PORT}\n`);

  try {
    // 1. GET /api/health
    const health = await makeRequest('GET', '/api/health');
    assert(health.status === 200 && health.data.status === 'ok', 'GET /api/health returns 200 OK');

    // 2. GET /api/sensors
    const sensorsRes = await makeRequest('GET', '/api/sensors');
    assert(sensorsRes.status === 200 && Array.isArray(sensorsRes.data.sensors), 'GET /api/sensors returns 200 OK');
    assert(sensorsRes.data.sensors.length === 0, 'No seeded readings at startup');
    
    const nodeIds = sensorsRes.data.sensors.map(s => s.nodeId);
    assert(nodeIds.length === 0, 'Nodes appear only after telemetry');

    // 3. GET /api/sensors/:nodeId
    const n1Res = await makeRequest('GET', '/api/sensors/N1');
    assert(n1Res.status === 404, 'N1 has no reading before upload');

    const n2Res = await makeRequest('GET', '/api/sensors/N2');
    assert(n2Res.status === 404, 'N2 has no reading before upload');

    const n3Res = await makeRequest('GET', '/api/sensors/N3');
    assert(n3Res.status === 404, 'N3 has no reading before upload');

    const invalidNodeRes = await makeRequest('GET', '/api/sensors/N12');
    assert(invalidNodeRes.status === 404, 'GET /api/sensors/N12 returns 404 Not Found');

    // 4. Socket.IO Client Test Setup
    const socket = io(`http://127.0.0.1:${PORT}`, {
      transports: ['websocket'],
      forceNew: true
    });

    const receivedEvents = {
      initialState: false,
      sensorUpdate: [],
      alertCreated: []
    };

    socket.on('initialState', (data) => {
      receivedEvents.initialState = true;
    });

    socket.on('sensorUpdate', (data) => {
      receivedEvents.sensorUpdate.push(data);
    });

    socket.on('alertCreated', (data) => {
      receivedEvents.alertCreated.push(data);
    });

    // Wait for connection
    await new Promise((resolve) => {
      socket.on('connect', resolve);
    });
    assert(socket.connected, 'Socket.IO client connected successfully');

    // 5. POST /api/telemetry - Validation Tests
    const invalidTelemetry1 = await makeRequest('POST', '/api/telemetry', {
      nodeId: 'N12',
      tilt: 0.5,
      displacement: 0.5,
      vibration: 0.02
    });
    assert(invalidTelemetry1.status === 400, 'POST /api/telemetry rejects invalid nodeId "N12" (400)');

    const invalidTelemetry2 = await makeRequest('POST', '/api/telemetry', {
      nodeId: 'N1',
      tilt: 'invalid-tilt',
      displacement: 0.5,
      vibration: 0.02
    });
    assert(invalidTelemetry2.status === 400, 'POST /api/telemetry rejects non-numeric tilt (400)');

    // 6. POST /api/telemetry - Valid Updates & Threshold Transitions
    // Normal test (< 1.0°)
    const normalTelemetry = await makeRequest('POST', '/api/telemetry', {
      nodeId: 'N1',
      tilt: 0.25,
      displacement: 0.38,
      vibration: 0.02
    });
    assert(normalTelemetry.status === 200 && normalTelemetry.data.sensor.status === 'Normal', 'POST /api/telemetry updates N1 (Normal <1°)');

    // Warning test (1.0° - 2.0°)
    const warningTelemetry = await makeRequest('POST', '/api/telemetry', {
      nodeId: 'N2',
      tilt: 1.45,
      displacement: 1.10,
      vibration: 0.07
    });
    assert(warningTelemetry.status === 200 && warningTelemetry.data.sensor.status === 'Warning', 'POST /api/telemetry updates N2 (Warning 1°-2°)');

    // Critical test (> 2.0°)
    const criticalTelemetry = await makeRequest('POST', '/api/telemetry', {
      nodeId: 'N3',
      tilt: 2.45,
      displacement: 2.18,
      vibration: 0.16
    });
    assert(criticalTelemetry.status === 200 && criticalTelemetry.data.sensor.status === 'Critical', 'POST /api/telemetry updates N3 (Critical >2°)');
    assert(criticalTelemetry.data.alert && criticalTelemetry.data.alert.severity === 'Critical', 'Critical alert generated in telemetry response');

    // Allow socket events to propagate
    await new Promise((r) => setTimeout(r, 200));

    assert(receivedEvents.sensorUpdate.length >= 3, 'Socket.IO emitted "sensorUpdate" events');
    assert(receivedEvents.alertCreated.length >= 1, 'Socket.IO emitted "alertCreated" event for Critical reading');

    // 7. GET /api/alerts & POST /api/alerts/:id/acknowledge
    const alertsRes = await makeRequest('GET', '/api/alerts');
    assert(alertsRes.status === 200 && alertsRes.data.alerts.length > 0, 'GET /api/alerts returns alerts list');

    const firstAlertId = alertsRes.data.alerts[0].id;
    const ackRes = await makeRequest('POST', `/api/alerts/${firstAlertId}/acknowledge`);
    assert(ackRes.status === 200 && ackRes.data.alert.acknowledged === true, `POST /api/alerts/:id/acknowledge successfully acknowledged alert`);

    // 8. POST /api/demo/simulate (Single Step)
    const simStepRes = await makeRequest('POST', '/api/demo/simulate', { step: 4 });
    assert(simStepRes.status === 410, 'Simulation uploads disabled');

    // 9. POST /api/demo/reset
    const resetRes = await makeRequest('POST', '/api/demo/reset');
    assert(resetRes.status === 410, 'Demo reset disabled');

    socket.disconnect();

  } catch (err) {
    console.error('Fatal Test Error:', err);
    failed++;
  } finally {
    server.close();
  }

  console.log('\n======================================================');
  console.log(` TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests();
