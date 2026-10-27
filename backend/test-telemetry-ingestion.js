/**
 * Real Hardware Telemetry Ingestion Verification Test Suite
 * Smart India Hackathon 2026 (Problem Statement 26025)
 * 
 * Verifies that the software ingestion pipeline accepts and processes canonical
 * ESP32 sensor telemetry payloads, emits real-time Socket.IO events, and rejects
 * malformed inputs with 400 Bad Request.
 */

const http = require('http');
const { io } = require('socket.io-client');
const { server } = require('./server');

const TEST_PORT = 5002;

function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: '127.0.0.1',
      port: TEST_PORT,
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

async function runRealTelemetryTests() {
  console.log('\n================================================================');
  console.log(' MineGuard ESP32 Real Telemetry Ingestion Test Suite');
  console.log(' Target: Hardware Ingestion API & Socket.IO Event Verification');
  console.log('================================================================\n');

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

  // Start test server on port 5002
  await new Promise((resolve) => server.listen(TEST_PORT, resolve));
  console.log(`Ingestion Test Server listening on http://127.0.0.1:${TEST_PORT}\n`);

  try {
    // 1. Setup Socket.IO client to listen for real-time sensor updates
    const socket = io(`http://127.0.0.1:${TEST_PORT}`, {
      transports: ['websocket'],
      forceNew: true
    });

    const receivedUpdates = [];
    socket.on('sensorUpdate', (update) => {
      receivedUpdates.push(update);
    });

    await new Promise((resolve) => socket.on('connect', resolve));
    assert(socket.connected, 'Socket.IO client connected for real-time telemetry verification');

    // 2. Canonical Telemetry Test for NODE_01 (Stable Reference, Normal Status)
    const node1Payload = {
      node_id: "NODE_01",
      timestamp: "2026-08-28T10:30:00.000Z",
      tilt_x: 0.15,
      tilt_y: 0.10,
      tilt_angle: 0.18,
      temperature: 26.8,
      vibration: 0.02,
      displacement: 0.35
    };

    const res1 = await makeRequest('POST', '/api/telemetry', node1Payload);
    assert(res1.status === 200, 'POST /api/telemetry accepts canonical NODE_01 payload (200 OK)');
    assert(res1.data.success === true, 'Response indicates success = true');
    assert(res1.data.sensor.node_id === 'NODE_01', 'Response contains node_id = "NODE_01"');
    assert(res1.data.sensor.nodeId === 'N1', 'Response maps to React dashboard nodeId = "N1"');
    assert(res1.data.sensor.tilt === 0.18, 'Sensor tilt matches tilt_angle (0.18°)');
    assert(res1.data.sensor.tilt_x === 0.15 && res1.data.sensor.tilt_y === 0.10, 'Sensor tilt_x and tilt_y stored accurately');
    assert(res1.data.sensor.temperature === 26.8, 'Sensor temperature stored (26.8°C)');
    assert(res1.data.sensor.status === 'Normal', 'Sensor status calculated as "Normal" (<1.0°)');

    // 3. Canonical Telemetry Test for NODE_02 (Warning Threshold Transition)
    const node2Payload = {
      node_id: "NODE_02",
      timestamp: "2026-08-28T10:30:01.000Z",
      tilt_x: 1.15,
      tilt_y: 0.82,
      tilt_angle: 1.41,
      temperature: 27.5,
      vibration: 0.06,
      displacement: 1.12
    };

    const res2 = await makeRequest('POST', '/api/telemetry', node2Payload);
    assert(res2.status === 200, 'POST /api/telemetry accepts canonical NODE_02 payload (200 OK)');
    assert(res2.data.sensor.node_id === 'NODE_02' && res2.data.sensor.nodeId === 'N2', 'NODE_02 mapped correctly');
    assert(res2.data.sensor.status === 'Warning', 'Sensor status calculated as "Warning" (1.41° in 1.0°-2.0° range)');
    assert(res2.data.sensor.riskScore >= 40 && res2.data.sensor.riskScore <= 69, 'Sensor risk score in Warning range (40-69)');

    // 4. Derived Tilt Angle Vector Calculation (when tilt_x & tilt_y are provided without tilt_angle)
    const vectorPayload = {
      node_id: "NODE_01",
      timestamp: "2026-08-28T10:30:02.000Z",
      tilt_x: 0.30,
      tilt_y: 0.40,
      // sqrt(0.3^2 + 0.4^2) = 0.50
      temperature: 27.0,
      vibration: 0.03,
      displacement: 0.42
    };

    const resVector = await makeRequest('POST', '/api/telemetry', vectorPayload);
    assert(resVector.status === 200, 'POST /api/telemetry derives tilt_angle from vector components (tilt_x, tilt_y)');
    assert(Math.abs(resVector.data.sensor.tilt - 0.50) < 0.01, 'Derived tilt_angle equals 0.50°');

    // 5. Verification of Validation Rules & 400 Bad Request Error Handling
    // A. Missing node_id
    const errMissingNode = await makeRequest('POST', '/api/telemetry', {
      tilt_x: 0.2, tilt_y: 0.1, displacement: 0.4, vibration: 0.02
    });
    assert(errMissingNode.status === 400, 'Rejects payload with missing node_id (400 Bad Request)');

    // B. Invalid node_id
    const errInvalidNode = await makeRequest('POST', '/api/telemetry', {
      node_id: "UNKNOWN_NODE_999",
      tilt_angle: 0.5, displacement: 0.4, vibration: 0.02
    });
    assert(errInvalidNode.status === 400, 'Rejects invalid/unknown node_id format (400 Bad Request)');

    // C. Non-numeric tilt
    const errNonNumericTilt = await makeRequest('POST', '/api/telemetry', {
      node_id: "NODE_01",
      tilt_angle: "invalid_tilt",
      displacement: 0.4, vibration: 0.02
    });
    assert(errNonNumericTilt.status === 400, 'Rejects non-numeric tilt_angle (400 Bad Request)');

    // D. Non-numeric displacement
    const errNonNumericDisp = await makeRequest('POST', '/api/telemetry', {
      node_id: "NODE_01",
      tilt_angle: 0.5,
      displacement: "not_a_number",
      vibration: 0.02
    });
    assert(errNonNumericDisp.status === 400, 'Rejects non-numeric displacement (400 Bad Request)');

    // E. Non-numeric vibration
    const errNonNumericVib = await makeRequest('POST', '/api/telemetry', {
      node_id: "NODE_01",
      tilt_angle: 0.5,
      displacement: 0.4,
      vibration: null
    });
    assert(errNonNumericVib.status === 400, 'Rejects missing/non-numeric vibration (400 Bad Request)');

    // F. Non-numeric temperature
    const errNonNumericTemp = await makeRequest('POST', '/api/telemetry', {
      node_id: "NODE_01",
      tilt_angle: 0.5,
      displacement: 0.4,
      vibration: 0.02,
      temperature: "too_hot"
    });
    assert(errNonNumericTemp.status === 400, 'Rejects non-numeric temperature (400 Bad Request)');

    // G. Malformed timestamp
    const errBadTimestamp = await makeRequest('POST', '/api/telemetry', {
      node_id: "NODE_01",
      tilt_angle: 0.5,
      displacement: 0.4,
      vibration: 0.02,
      timestamp: "invalid-date-string-321"
    });
    assert(errBadTimestamp.status === 400, 'Rejects malformed timestamp (400 Bad Request)');

    // 6. Verify REST Retrieval by Canonical ID
    const getByCanonical = await makeRequest('GET', '/api/sensors/NODE_01');
    assert(getByCanonical.status === 200, 'GET /api/sensors/NODE_01 returns sensor by canonical hardware ID');
    assert(getByCanonical.data.sensor.node_id === 'NODE_01', 'Returned sensor contains canonical node_id');

    // 7. Verify Real-time Socket.IO Broadcast
    await new Promise((r) => setTimeout(r, 200));
    assert(receivedUpdates.length >= 3, `Socket.IO received ${receivedUpdates.length} real-time sensorUpdate broadcasts`);
    
    const lastUpdate = receivedUpdates[receivedUpdates.length - 1];
    assert(lastUpdate && lastUpdate.node_id && lastUpdate.tilt !== undefined, 'Broadcast payload contains canonical node_id and tilt');

    socket.disconnect();

  } catch (err) {
    console.error('Fatal Telemetry Ingestion Test Error:', err);
    failed++;
  } finally {
    server.close();
  }

  console.log('\n================================================================');
  console.log(` REAL TELEMETRY INGESTION TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runRealTelemetryTests();
