/**
 * Node 3 Hardware Gateway Compatibility Test Suite
 * Smart India Hackathon 2026 (Problem Statement 26025)
 * 
 * Verifies that the software ingestion pipeline accepts the EXACT payload produced by
 * the Node 3 ESP32 gateway firmware over both:
 * 1. POST /api/readings (Gateway's configured route)
 * 2. POST /api/telemetry (Canonical MineGuard route)
 */

const http = require('http');
const { io } = require('socket.io-client');
const { server } = require('./server');

const TEST_PORT = 5003;

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

async function runGatewayTests() {
  console.log('\n================================================================');
  console.log(' MineGuard Node 3 Hardware Gateway Compatibility Test Suite');
  console.log(' Testing exact ESP-NOW MeshPacket payload -> /api/readings');
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

  // Start test server on port 5003
  await new Promise((resolve) => server.listen(TEST_PORT, resolve));
  console.log(`Gateway Test Server listening on http://127.0.0.1:${TEST_PORT}\n`);

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
    assert(socket.connected, 'Socket.IO client connected for real-time gateway broadcast verification');

    // 2. Exact Node 3 Gateway payload for NODE_01 sent to POST /api/readings
    const gatewayNode1Payload = {
      node_id: "NODE_01",
      gateway_id: "N3",
      sequence: 123,
      hop_count: 1,
      tilt_x_deg: 0.21,
      tilt_y_deg: 0.13,
      temperature_C: 27.1
    };

    const res1 = await makeRequest('POST', '/api/readings', gatewayNode1Payload);
    assert(res1.status === 200, 'POST /api/readings accepts exact Node 3 Gateway payload (200 OK)');
    assert(res1.data.success === true, 'Response indicates success = true');
    assert(res1.data.sensor.node_id === 'NODE_01', 'Response contains node_id = "NODE_01"');
    assert(res1.data.sensor.nodeId === 'N1', 'Response maps to React dashboard nodeId = "N1"');
    assert(res1.data.sensor.gateway_id === 'N3', 'Response preserves gateway_id = "N3"');
    assert(res1.data.sensor.sequence === 123, 'Response preserves sequence = 123');
    assert(res1.data.sensor.hop_count === 1, 'Response preserves hop_count = 1');
    assert(res1.data.sensor.tilt_x === 0.21, 'tilt_x matches tilt_x_deg (0.21°)');
    assert(res1.data.sensor.tilt_y === 0.13, 'tilt_y matches tilt_y_deg (0.13°)');
    
    // sqrt(0.21^2 + 0.13^2) = sqrt(0.0441 + 0.0169) = sqrt(0.061) ≈ 0.247°
    const expectedAngle1 = Math.sqrt(0.21 * 0.21 + 0.13 * 0.13);
    assert(Math.abs(res1.data.sensor.tilt_angle - expectedAngle1) < 0.01, `tilt_angle accurately calculated as ~${expectedAngle1.toFixed(3)}°`);
    assert(res1.data.sensor.tilt === Number(expectedAngle1.toFixed(2)), `dashboard tilt rounded to ${res1.data.sensor.tilt}°`);
    assert(res1.data.sensor.temperature === 27.1, 'temperature matches temperature_C (27.1°C)');
    assert(res1.data.sensor.status === 'Normal', 'status evaluated as "Normal" (<1.0°)');

    // 3. Exact Node 3 Gateway payload for NODE_02 (Warning Elevation) sent to POST /api/readings
    const gatewayNode2Payload = {
      node_id: "NODE_02",
      gateway_id: "N3",
      sequence: 124,
      hop_count: 2,
      tilt_x_deg: 1.15,
      tilt_y_deg: 0.85,
      temperature_C: 28.0
    };

    const res2 = await makeRequest('POST', '/api/readings', gatewayNode2Payload);
    const expectedAngle2 = Math.sqrt(1.15 * 1.15 + 0.85 * 0.85); // ≈ 1.43°
    assert(res2.status === 200, 'POST /api/readings accepts NODE_02 Warning payload (200 OK)');
    assert(res2.data.sensor.status === 'Warning', 'status evaluated as "Warning" (1.43° in 1.0°-2.0° range)');
    assert(res2.data.sensor.riskScore >= 40 && res2.data.sensor.riskScore <= 69, 'riskScore in Warning range (40-69)');

    // 4. Exact Node 3 Gateway payload for NODE_03 (Critical Threshold) sent to POST /api/telemetry
    const gatewayNode3Payload = {
      node_id: "NODE_03",
      gateway_id: "N3",
      sequence: 125,
      hop_count: 0,
      tilt_x_deg: 2.05,
      tilt_y_deg: 1.45,
      temperature_C: 29.2
    };

    const res3 = await makeRequest('POST', '/api/telemetry', gatewayNode3Payload);
    assert(res3.status === 200, 'POST /api/telemetry also accepts gateway payload format (200 OK)');
    assert(res3.data.sensor.status === 'Critical', 'status evaluated as "Critical" (>2.0°)');
    assert(res3.data.alert && res3.data.alert.severity === 'Critical', 'Critical alert generated for Node 3');

    // 5. Validation error tests with Node 3 field names
    const errMissingNode = await makeRequest('POST', '/api/readings', {
      tilt_x_deg: 0.2, tilt_y_deg: 0.1, temperature_C: 25.0
    });
    assert(errMissingNode.status === 400, 'Rejects gateway payload with missing node_id (400 Bad Request)');

    const errNonNumericTiltX = await makeRequest('POST', '/api/readings', {
      node_id: "NODE_01",
      tilt_x_deg: "invalid_number",
      tilt_y_deg: 0.13,
      temperature_C: 27.1
    });
    assert(errNonNumericTiltX.status === 400, 'Rejects non-numeric tilt_x_deg (400 Bad Request)');

    const errNonNumericTemp = await makeRequest('POST', '/api/readings', {
      node_id: "NODE_01",
      tilt_x_deg: 0.21,
      tilt_y_deg: 0.13,
      temperature_C: "hot"
    });
    assert(errNonNumericTemp.status === 400, 'Rejects non-numeric temperature_C (400 Bad Request)');

    // 6. Verify real-time Socket.IO broadcasts
    await new Promise((r) => setTimeout(r, 200));
    assert(receivedUpdates.length >= 3, `Socket.IO received ${receivedUpdates.length} sensorUpdate broadcasts from gateway ingestions`);
    
    const lastUpdate = receivedUpdates[receivedUpdates.length - 1];
    assert(lastUpdate && lastUpdate.node_id === 'NODE_03', 'Socket.IO broadcast contains canonical node_id');
    assert(lastUpdate && lastUpdate.gateway_id === 'N3', 'Socket.IO broadcast contains gateway_id metadata');
    assert(lastUpdate && typeof lastUpdate.tilt === 'number', 'Socket.IO broadcast contains numeric tilt for React chart/cards');

    socket.disconnect();

  } catch (err) {
    console.error('Fatal Gateway Test Error:', err);
    failed++;
  } finally {
    server.close();
  }

  console.log('\n================================================================');
  console.log(` GATEWAY COMPATIBILITY TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runGatewayTests();
