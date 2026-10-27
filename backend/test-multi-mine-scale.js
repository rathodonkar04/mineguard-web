/**
 * MineGuard Multi-Mine Scalability & High-Throughput Load Test Suite
 * Smart India Hackathon 2026 (Problem Statement 26025)
 * 
 * Verifies:
 * 1. 4-tier organizational hierarchy REST endpoints (/api/hierarchy, /api/mines, /api/mines/:id/panels/:id)
 * 2. Multi-tenant telemetry ingestion with mine and extraction panel query isolation
 * 3. Backward compatibility: legacy payloads default to 'MOONIDIH' and 'P-4'
 * 4. High-throughput concurrent ingestion load test (50 concurrent sensor transmissions)
 * 5. Latency benchmarking: verifies sub-50ms average response time
 */

const http = require('http');
const { server } = require('./server');

const TEST_PORT = 5005;

function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path,
      method,
      headers: { 'Content-Type': 'application/json' }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed });
        } catch (_e) {
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

async function runMultiMineScaleTests() {
  console.log('\n================================================================');
  console.log(' MineGuard Multi-Mine Scalability & Performance Test Suite');
  console.log(' SIH 2026 PS 26025 (Phase 6 Verification)');
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

  await new Promise((resolve) => server.listen(TEST_PORT, resolve));
  console.log(`Scale Test Server listening on http://127.0.0.1:${TEST_PORT}\n`);

  try {
    // -------------------------------------------------------------
    // SUITE 1: Organizational Hierarchy Endpoints
    // -------------------------------------------------------------
    console.log('--- SUITE 1: 4-Tier Organizational Hierarchy Endpoints ---');

    const resHier = await makeRequest('GET', '/api/hierarchy');
    assert(resHier.status === 200, 'GET /api/hierarchy returns 200 OK');
    assert(resHier.data.success === true, 'Hierarchy response success === true');
    assert(Array.isArray(resHier.data.hierarchy), 'Returns array of coalfields');
    assert(resHier.data.hierarchy.length >= 3, `Hierarchy includes all 3 coalfields (got ${resHier.data.hierarchy.length})`);

    const bccl = resHier.data.hierarchy.find(c => c.id === 'BCCL');
    assert(Boolean(bccl), 'BCCL (Bharat Coking Coal Limited) present in hierarchy');
    assert(bccl.mines.length >= 2, 'BCCL contains Moonidih and Jharia collieries');

    const resMines = await makeRequest('GET', '/api/mines');
    assert(resMines.status === 200, 'GET /api/mines returns 200 OK');
    assert(resMines.data.mines.length >= 4, `List of mines contains >= 4 collieries (got ${resMines.data.mines.length})`);

    const moonidih = resMines.data.mines.find(m => m.id === 'MOONIDIH');
    assert(moonidih && moonidih.coalfieldId === 'BCCL', 'Moonidih mapped to BCCL');
    assert(moonidih.panelCount >= 2, 'Moonidih has multiple extraction panels (P-4, P-5)');

    // Specific Mine Details
    const resMoon = await makeRequest('GET', '/api/mines/MOONIDIH');
    assert(resMoon.status === 200, 'GET /api/mines/MOONIDIH returns 200 OK');
    assert(resMoon.data.mine.name === 'Moonidih Colliery', 'Returns Moonidih Colliery name');

    // Specific Panel Geotechnical Configuration
    const resPanel = await makeRequest('GET', '/api/mines/MOONIDIH/panels/P-4');
    assert(resPanel.status === 200, 'GET /api/mines/MOONIDIH/panels/P-4 returns 200 OK');
    assert(resPanel.data.panel.depthMeters === 280, 'Panel P-4 depth is 280m');
    assert(resPanel.data.panel.miningMethod.includes('Longwall'), 'Panel P-4 mining method is Longwall');
    assert(resPanel.data.geotechnical.angleDrawDeg === 25.0, 'Panel P-4 angle of draw is 25.0°');

    // Jharia Colliery Panel J-2 (Fire Overburden)
    const resJharia = await makeRequest('GET', '/api/mines/JHARIA/panels/J-2');
    assert(resJharia.status === 200, 'GET /api/mines/JHARIA/panels/J-2 returns 200 OK');
    assert(resJharia.data.panel.depthMeters === 160, 'Panel J-2 depth is 160m (shallow fire zone)');
    assert(resJharia.data.panel.miningMethod.includes('Bord & Pillar'), 'Panel J-2 method is Bord & Pillar');

    // 404 Guard for non-existent mine
    const res404Mine = await makeRequest('GET', '/api/mines/UNKNOWN_COLLIERY');
    assert(res404Mine.status === 404, 'GET /api/mines/UNKNOWN returns 404 Not Found');

    // -------------------------------------------------------------
    // SUITE 2: Multi-Tenant Telemetry Ingestion & Isolation
    // -------------------------------------------------------------
    console.log('\n--- SUITE 2: Multi-Tenant Telemetry Ingestion & Isolation ---');

    // Ingest Moonidih Panel P-4 Telemetry
    const p4Payload = {
      node_id: 'NODE_01',
      mine_id: 'MOONIDIH',
      panel_id: 'P-4',
      tilt_x_deg: 0.18,
      tilt_y_deg: 0.12,
      temperature_C: 26.5
    };
    const resP4 = await makeRequest('POST', '/api/telemetry', p4Payload);
    assert(resP4.status === 200, 'Ingests Moonidih Panel P-4 telemetry (200 OK)');
    assert(resP4.data.sensor.mine_id === 'MOONIDIH', 'Sensor preserves mine_id = "MOONIDIH"');
    assert(resP4.data.sensor.panel_id === 'P-4', 'Sensor preserves panel_id = "P-4"');

    // Ingest Jharia Panel J-2 Telemetry (Thermal Zone)
    const jhariaPayload = {
      node_id: 'NODE_02',
      mine_id: 'JHARIA',
      panel_id: 'J-2',
      tilt_x_deg: 0.35,
      tilt_y_deg: 0.28,
      temperature_C: 38.5 // Elevated surface temperature in fire area
    };
    const resJh = await makeRequest('POST', '/api/telemetry', jhariaPayload);
    assert(resJh.status === 200, 'Ingests Jharia Panel J-2 telemetry (200 OK)');
    assert(resJh.data.sensor.mine_id === 'JHARIA', 'Sensor updates to mine_id = "JHARIA"');
    assert(resJh.data.sensor.panel_id === 'J-2', 'Sensor updates to panel_id = "J-2"');

    // Backward compatibility test: payload without mine_id or panel_id
    const legacyPayload = {
      node_id: 'NODE_03',
      tilt_x_deg: 0.22,
      tilt_y_deg: 0.16,
      temperature_C: 27.0
    };
    const resLeg = await makeRequest('POST', '/api/readings', legacyPayload);
    assert(resLeg.status === 200, 'Ingests legacy firmware payload without mine_id (200 OK)');
    assert(resLeg.data.sensor.mine_id === 'MOONIDIH', 'Legacy payload seamlessly defaults to "MOONIDIH"');
    assert(resLeg.data.sensor.panel_id === 'P-4', 'Legacy payload seamlessly defaults to "P-4"');

    // -------------------------------------------------------------
    // SUITE 3: High-Throughput Concurrent Scale & Latency Benchmark
    // -------------------------------------------------------------
    console.log('\n--- SUITE 3: Concurrent Multi-Mine Load & Latency Benchmark ---');

    const CONCURRENT_REQUESTS = 50;
    const testMines = [
      { mine: 'MOONIDIH', panel: 'P-4', node: 'NODE_01' },
      { mine: 'MOONIDIH', panel: 'P-5', node: 'NODE_02' },
      { mine: 'JHARIA', panel: 'J-2', node: 'NODE_03' },
      { mine: 'RANIGANJ', panel: 'R-1', node: 'NODE_04' }
    ];

    const requests = [];
    const startTime = Date.now();

    for (let i = 0; i < CONCURRENT_REQUESTS; i++) {
      const cfg = testMines[i % testMines.length];
      const payload = {
        node_id: cfg.node,
        mine_id: cfg.mine,
        panel_id: cfg.panel,
        sequence: 5000 + i,
        tilt_x_deg: Number((0.15 + (i * 0.01)).toFixed(3)),
        tilt_y_deg: Number((0.10 + (i * 0.008)).toFixed(3)),
        temperature_C: Number((26.0 + (i * 0.1)).toFixed(1))
      };
      requests.push(makeRequest('POST', '/api/readings', payload));
    }

    const results = await Promise.all(requests);
    const totalDurationMs = Date.now() - startTime;
    const avgLatencyMs = totalDurationMs / CONCURRENT_REQUESTS;

    const successful = results.filter(r => r.status === 200).length;
    assert(successful === CONCURRENT_REQUESTS, `All ${CONCURRENT_REQUESTS} concurrent requests processed successfully (200 OK)`);
    assert(avgLatencyMs < 50, `Average request latency is ${avgLatencyMs.toFixed(2)}ms (sub-50ms benchmark passed)`);

    console.log(`\n  ⚡ Benchmark Metrics:`);
    console.log(`     - Total Requests: ${CONCURRENT_REQUESTS}`);
    console.log(`     - Total Time: ${totalDurationMs} ms`);
    console.log(`     - Throughput: ${(CONCURRENT_REQUESTS / (totalDurationMs / 1000)).toFixed(1)} req/sec`);
    console.log(`     - Avg Latency: ${avgLatencyMs.toFixed(2)} ms / req`);
    console.log(`     - Success Rate: ${(successful / CONCURRENT_REQUESTS * 100).toFixed(1)}%`);

  } finally {
    await new Promise((resolve) => server.close(resolve));
    console.log('\nScale Test Server stopped.');
  }

  // Summary
  console.log('\n================================================================');
  console.log(` Multi-Mine Scale & Benchmark: ${passed} Passed, ${failed} Failed`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

if (require.main === module) {
  runMultiMineScaleTests().catch((err) => {
    console.error('Fatal Test Runner Error:', err);
    process.exit(1);
  });
}

module.exports = { runMultiMineScaleTests };
