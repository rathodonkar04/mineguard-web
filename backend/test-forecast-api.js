/**
 * Integration Test: Geotechnical Subsidence Forecast API Endpoints
 * Smart India Hackathon 2026 (Problem Statement 26025)
 */

const http = require('http');

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    console.log(` ✅ PASS: ${msg}`);
    passed++;
  } else {
    console.error(` ❌ FAIL: ${msg}`);
    failed++;
  }
}

function request(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, headers: res.headers, body: parsed });
        } catch (_err) {
          resolve({ status: res.statusCode, headers: res.headers, body: data });
        }
      });
    });

    req.on('error', reject);

    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

async function runApiTests() {
  console.log('======================================================');
  console.log(' Starting Geotechnical Forecast API Integration Tests...');
  console.log('======================================================\n');

  try {
    // 1. GET /api/forecast/parameters
    const paramsRes = await request({
      hostname: 'localhost',
      port: 5000,
      path: '/api/forecast/parameters',
      method: 'GET'
    });

    assert(paramsRes.status === 200, 'GET /api/forecast/parameters returns 200 OK');
    assert(paramsRes.body.success === true, 'Parameters response success === true');
    assert(paramsRes.body.parameters.miningDepth === 240, 'Returns baseline mining depth = 240m');
    assert(Boolean(paramsRes.body.panelProperties.radiusOfInfluenceMeters), 'Returns derived panel influence properties');
    assert(Boolean(paramsRes.body.constraints.miningDepth), 'Returns validation parameter constraints');

    // 2. GET /api/forecast/subsidence
    const forecastRes = await request({
      hostname: 'localhost',
      port: 5000,
      path: '/api/forecast/subsidence?nodeId=N3',
      method: 'GET'
    });

    assert(forecastRes.status === 200, 'GET /api/forecast/subsidence returns 200 OK');
    assert(forecastRes.body.success === true, 'Subsidence forecast success === true');
    assert(forecastRes.body.metadata.modelVersion === 'KNOTHE-DGMS-V1.2', 'Returns model version KNOTHE-DGMS-V1.2');
    assert(Boolean(forecastRes.body.milestones.forecast24Hours), 'Returns 24-hour forecast milestone');
    assert(Boolean(forecastRes.body.milestones.forecast7Days), 'Returns 7-day forecast milestone');
    assert(Array.isArray(forecastRes.body.timeSeriesCurve), 'Returns timeSeriesCurve array');
    assert(Array.isArray(forecastRes.body.spatialTransect), 'Returns spatialTransect array');
    assert(forecastRes.body.monitoredSensor.nodeId === 'N3', 'Monitored sensor matches requested nodeId N3');

    // 3. POST /api/forecast/calculate (Valid Simulation)
    const simRes = await request({
      hostname: 'localhost',
      port: 5000,
      path: '/api/forecast/calculate',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      parameters: {
        miningDepth: 310.0,
        seamThickness: 3.2,
        knotheCoefficient: 0.045
      },
      observations: {
        nodeId: 'SIM_01',
        currentDispMm: 15.0,
        currentTiltDeg: 0.85
      }
    });

    assert(simRes.status === 200, 'POST /api/forecast/calculate returns 200 OK');
    assert(simRes.body.success === true, 'Simulation calculation success === true');
    assert(simRes.body.inputParameters.miningDepth === 310.0, 'Simulated depth is 310.0m');
    assert(simRes.body.milestones.forecast24Hours.subsidenceExpectedMm > 0, '24h forecast subsidence is calculated');

    // 4. POST /api/forecast/calculate (Invalid Parameters Boundary Guard)
    const errRes = await request({
      hostname: 'localhost',
      port: 5000,
      path: '/api/forecast/calculate',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      parameters: {
        miningDepth: -50.0, // Invalid negative depth
        seamThickness: 50.0  // Impossible 50m thickness
      }
    });

    assert(errRes.status === 400, 'POST /api/forecast/calculate rejects invalid parameters with 400 Bad Request');
    assert(errRes.body.success === false, 'Error response success === false');
    assert(Array.isArray(errRes.body.errors) && errRes.body.errors.length >= 2, 'Returns descriptive validation error array');

    console.log('\n======================================================');
    console.log(` FORECAST API INTEGRATION TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
    console.log('======================================================\n');

    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error('Test execution failed:', err);
    process.exit(1);
  }
}

runApiTests();
