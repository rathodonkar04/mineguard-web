/**
 * End-to-End Live Integration Test for MineGuard
 * Validates Frontend <-> Backend <-> Socket.IO flow
 */

const http = require('http');
const { io } = require('socket.io-client');

const BACKEND_PORT = 5000;
const BACKEND_URL = `http://localhost:${BACKEND_PORT}`;

function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: BACKEND_PORT,
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

async function runIntegrationTests() {
  console.log('\n======================================================');
  console.log(' MineGuard End-to-End Live Integration Test');
  console.log(` Target Server: ${BACKEND_URL}`);
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

  try {
    // 1. Verify GET /api/health
    const health = await makeRequest('GET', '/api/health');
    assert(health.status === 200 && health.data.status === 'ok', '1. GET /api/health returns 200 OK');

    // 2. Verify Initial Page Load Data: GET /api/sensors
    const sensorsRes = await makeRequest('GET', '/api/sensors');
    assert(sensorsRes.status === 200 && sensorsRes.data.success === true, '2. GET /api/sensors returns 200 OK');
    assert(sensorsRes.data.sensors.length === 3, '3. GET /api/sensors returns exactly 3 prototype nodes');

    const nodeIds = sensorsRes.data.sensors.map(s => s.nodeId);
    assert(nodeIds.includes('N1') && nodeIds.includes('N2') && nodeIds.includes('N3'), '4. Nodes are strictly N1 (Zone A), N2 (Zone B), N3 (Zone C)');

    // 3. Connect Socket.IO client (simulating React frontend)
    const socket = io(BACKEND_URL, {
      transports: ['websocket', 'polling'],
      forceNew: true
    });

    const receivedUpdates = [];
    const receivedAlerts = [];
    const receivedAcks = [];

    socket.on('sensorUpdate', (data) => {
      receivedUpdates.push(data);
    });

    socket.on('alertCreated', (data) => {
      receivedAlerts.push(data);
    });

    socket.on('alertAcknowledged', (data) => {
      receivedAcks.push(data);
    });

    await new Promise((resolve) => {
      socket.on('connect', resolve);
    });
    assert(socket.connected, '5. Socket.IO client connected to backend server');

    // 4. Test Demo Simulation Sequence: Normal (0.3°) -> Warning (1.0°, 1.5°) -> Critical (2.1°, 2.4°)
    
    // Step 0: 0.3° Normal
    const step0 = await makeRequest('POST', '/api/demo/simulate', { step: 0 });
    assert(step0.status === 200 && step0.data.sensor.tilt === 0.3 && step0.data.sensor.status === 'Normal', '6. Step 0: N3 set to 0.30° (Normal)');
    
    // Step 4: 1.0° Warning
    const step4 = await makeRequest('POST', '/api/demo/simulate', { step: 4 });
    assert(step4.status === 200 && step4.data.sensor.tilt === 1.0 && step4.data.sensor.status === 'Warning', '7. Step 4: N3 set to 1.00° (Warning)');

    // Step 5: 1.5° Warning
    const step5 = await makeRequest('POST', '/api/demo/simulate', { step: 5 });
    assert(step5.status === 200 && step5.data.sensor.tilt === 1.5 && step5.data.sensor.status === 'Warning', '8. Step 5: N3 set to 1.50° (Warning)');

    // Step 6: 2.1° Critical (Threshold crossed)
    const step6 = await makeRequest('POST', '/api/demo/simulate', { step: 6 });
    assert(step6.status === 200 && step6.data.sensor.tilt === 2.1 && step6.data.sensor.status === 'Critical', '9. Step 6: N3 set to 2.10° (Critical - Alert Triggered)');

    // Step 7: 2.4° Peak Critical
    const step7 = await makeRequest('POST', '/api/demo/simulate', { step: 7 });
    assert(step7.status === 200 && step7.data.sensor.tilt === 2.4 && step7.data.sensor.status === 'Critical', '10. Step 7: N3 set to 2.40° (Peak Critical)');

    // Give socket events time to arrive
    await new Promise((r) => setTimeout(r, 300));

    assert(receivedUpdates.length >= 5, `11. Socket.IO received live sensorUpdate events (count: ${receivedUpdates.length})`);
    assert(receivedAlerts.length >= 1, `12. Socket.IO received live alertCreated event for Critical threshold (count: ${receivedAlerts.length})`);

    // 5. Test Alert Ingestion and Acknowledgement Flow
    const alertsRes = await makeRequest('GET', '/api/alerts');
    assert(alertsRes.status === 200 && alertsRes.data.alerts.length > 0, '13. GET /api/alerts returns active alerts');

    const criticalAlert = alertsRes.data.alerts.find(a => a.severity === 'Critical' && !a.acknowledged);
    assert(criticalAlert !== undefined, '14. Critical alert for Node N3 is present in active alerts list');

    if (criticalAlert) {
      const ackRes = await makeRequest('POST', `/api/alerts/${criticalAlert.id}/acknowledge`);
      assert(ackRes.status === 200 && ackRes.data.alert.acknowledged === true, '15. POST /api/alerts/:id/acknowledge successfully acknowledges alert');
    }

    // 6. Test Demo Reset to Baseline
    const resetRes = await makeRequest('POST', '/api/demo/reset');
    assert(resetRes.status === 200 && resetRes.data.success === true, '16. POST /api/demo/reset successfully resets all nodes');

    socket.disconnect();

  } catch (err) {
    console.error('Fatal Integration Test Error:', err);
    failed++;
  }

  console.log('\n======================================================');
  console.log(` INTEGRATION TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runIntegrationTests();
