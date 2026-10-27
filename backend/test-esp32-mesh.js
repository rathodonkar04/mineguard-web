/**
 * MineGuard ESP32 Firmware & Wireless Mesh Integration Test Suite
 * Smart India Hackathon 2026 (Problem Statement 26025)
 * 
 * Verifies:
 * 1. Binary MeshPacket struct serialization, endianness, and byte alignment (44 bytes)
 * 2. CRC-16 CCITT checksum generation and bit-flip corruption rejection
 * 3. Fixed-point scaling (centi-degrees, centi-Celsius, milli-g, battery mV)
 * 4. Multi-hop relay traversal and hop_count incrementing
 * 5. Gateway transcoding into canonical MineGuard JSON
 * 6. Live end-to-end HTTP ingestion via POST /api/readings & POST /api/telemetry
 * 7. Socket.IO real-time broadcast of gateway-ingested telemetry
 */

const http = require('http');
const { io } = require('socket.io-client');
const { server } = require('./server');
const { 
  packMeshPacket, 
  unpackMeshPacket, 
  calculateCrc16, 
  transcodeToGatewayJson,
  FLAGS 
} = require('../firmware/tools/virtual_mesh_simulator');

const TEST_PORT = 5004;

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

async function runEsp32MeshTests() {
  console.log('\n================================================================');
  console.log(' MineGuard ESP32 Firmware, Sensor Mesh & Gateway Test Suite');
  console.log(' SIH 2026 PS 26025 (Phase 5 Verification)');
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

  // -------------------------------------------------------------
  // TEST GROUP 1: Binary Struct Alignment & Serialization
  // -------------------------------------------------------------
  console.log('--- TEST GROUP 1: Binary Packet Alignment & Serialization ---');
  
  const testNodeData = {
    node_id: 'NODE_01',
    gateway_id: 'N3',
    sequence: 1401,
    hop_count: 1,
    rssi: -67,
    tilt_x_deg: 0.245,
    tilt_y_deg: -0.182,
    tilt_mag_deg: 0.305,
    temperature_C: 26.8,
    vibration_g: 0.042,
    battery_v: 3.96,
    displacement: 0.45,
    status_flags: 0
  };

  const binaryBuf = packMeshPacket(testNodeData);
  assert(Buffer.isBuffer(binaryBuf), 'packMeshPacket produces valid binary Buffer');
  assert(binaryBuf.length === 42, `Binary struct length is exactly 42 bytes (got ${binaryBuf.length})`);
  assert(binaryBuf.readUInt8(0) === 0x4D && binaryBuf.readUInt8(1) === 0x47, 'Magic bytes are 0x4D 0x47 ("MG")');
  assert(binaryBuf.readUInt8(2) === 0x01, 'Protocol version is 0x01');

  // Verify node ID string extraction
  const rawNodeStr = binaryBuf.toString('ascii', 4, 12).replace(/\0/g, '').trim();
  assert(rawNodeStr === 'NODE_01', `Node ID serialized accurately as "NODE_01" (got "${rawNodeStr}")`);

  // Verify sequence endianness (Little-Endian)
  assert(binaryBuf.readUInt32LE(20) === 1401, 'Sequence number encoded as 32-bit Little Endian uint (1401)');

  // Verify fixed-point scaling
  const rawTiltX = binaryBuf.readInt16LE(26);
  assert(rawTiltX === 25, `Tilt X centi-degrees scaled correctly: 0.245° -> 25 centi-deg (got ${rawTiltX})`);
  
  const rawTiltY = binaryBuf.readInt16LE(28);
  assert(rawTiltY === -18, `Tilt Y centi-degrees scaled correctly: -0.182° -> -18 centi-deg (got ${rawTiltY})`);

  const rawTemp = binaryBuf.readInt16LE(32);
  assert(rawTemp === 2680, `Temperature centi-Celsius scaled correctly: 26.8°C -> 2680 (got ${rawTemp})`);

  const rawVib = binaryBuf.readUInt16LE(34);
  assert(rawVib === 42, `Dynamic vibration milli-g scaled correctly: 0.042g -> 42 mg (got ${rawVib})`);

  const rawBatt = binaryBuf.readUInt16LE(36);
  assert(rawBatt === 3960, `Battery voltage mV scaled correctly: 3.96V -> 3960 mV (got ${rawBatt})`);

  // -------------------------------------------------------------
  // TEST GROUP 2: CRC-16 Checksum & Corruption Detection
  // -------------------------------------------------------------
  console.log('\n--- TEST GROUP 2: CRC-16 CCITT & Bit-Flip Corruption Rejection ---');

  const stampedCrc = binaryBuf.readUInt16LE(40);
  const recomputedCrc = calculateCrc16(binaryBuf, 40);
  assert(stampedCrc === recomputedCrc, `Stamped CRC-16 (0x${stampedCrc.toString(16)}) matches recomputed CCITT checksum`);

  // Unpack valid packet
  const unpacked = unpackMeshPacket(binaryBuf);
  assert(unpacked.node_id === 'NODE_01', 'Unpacked node_id matches "NODE_01"');
  assert(unpacked.sequence === 1401, 'Unpacked sequence matches 1401');
  assert(unpacked.temperature_C === 26.8, 'Unpacked temperature matches 26.8 °C');
  assert(unpacked.battery_v === 3.96, 'Unpacked battery matches 3.96 V');

  // Single bit-flip corruption test
  const corruptedBuf = Buffer.from(binaryBuf);
  corruptedBuf[15] ^= 0x01; // Invert single bit in gateway ID field

  let corruptionCaught = false;
  try {
    unpackMeshPacket(corruptedBuf);
  } catch (err) {
    corruptionCaught = true;
    assert(err.message.includes('CRC mismatch'), 'Bit-flip corruption triggers CRC mismatch rejection');
  }
  assert(corruptionCaught, 'Gateway safely drops bit-flipped packet before processing');

  // Magic bytes corruption test
  const invalidMagicBuf = Buffer.from(binaryBuf);
  invalidMagicBuf[0] = 0x00;
  let magicCaught = false;
  try {
    unpackMeshPacket(invalidMagicBuf);
  } catch (err) {
    magicCaught = true;
    assert(err.message.includes('Invalid magic bytes'), 'Invalid magic bytes rejected');
  }
  assert(magicCaught, 'Non-MineGuard packet dropped by header guard');

  // -------------------------------------------------------------
  // TEST GROUP 3: Multi-Hop Routing & Transcoding
  // -------------------------------------------------------------
  console.log('\n--- TEST GROUP 3: Multi-Hop Mesh Routing & Gateway Transcoding ---');

  const node4Relayed = {
    node_id: 'NODE_04',
    gateway_id: 'N3',
    sequence: 2100,
    hop_count: 2, // Relayed through Node 2
    rssi: -74,
    tilt_x_deg: 0.15,
    tilt_y_deg: 0.10,
    temperature_C: 25.4,
    battery_v: 4.10,
    vibration_g: 0.015,
    displacement: 0.22,
    status_flags: FLAGS.RELAY_HOPPED
  };

  const node4Packet = packMeshPacket(node4Relayed);
  const unpackedNode4 = unpackMeshPacket(node4Packet);
  assert(unpackedNode4.hop_count === 2, 'Hop count preserved across mesh relay (2 hops)');
  assert(Boolean(unpackedNode4.status_flags & FLAGS.RELAY_HOPPED), 'FLAG_RELAY_HOPPED bitmask preserved');

  const gatewayJson = transcodeToGatewayJson(unpackedNode4);
  assert(gatewayJson.node_id === 'NODE_04', 'Transcoded JSON contains node_id = "NODE_04"');
  assert(gatewayJson.gateway_id === 'N3', 'Transcoded JSON contains gateway_id = "N3"');
  assert(gatewayJson.hop_count === 2, 'Transcoded JSON preserves hop_count = 2');
  assert(gatewayJson.tilt_x_deg === 0.15, 'Transcoded JSON preserves tilt_x_deg');

  // -------------------------------------------------------------
  // TEST GROUP 4: End-to-End Live Backend Ingestion & Socket.IO
  // -------------------------------------------------------------
  console.log('\n--- TEST GROUP 4: Live HTTP Ingestion & Socket.IO Real-Time Stream ---');

  await new Promise((resolve) => server.listen(TEST_PORT, resolve));
  console.log(`Mesh Test Server listening on http://127.0.0.1:${TEST_PORT}\n`);

  try {
    const socket = io(`http://127.0.0.1:${TEST_PORT}`, {
      transports: ['websocket'],
      forceNew: true
    });

    const broadcastUpdates = [];
    socket.on('sensorUpdate', (update) => {
      broadcastUpdates.push(update);
    });

    await new Promise((resolve) => socket.on('connect', resolve));
    assert(socket.connected, 'Socket.IO client connected for real-time mesh verification');

    // Transmit Node 1 telemetry via Gateway JSON
    const res1 = await makeRequest('POST', '/api/readings', transcodeToGatewayJson(unpacked));
    assert(res1.status === 200, 'POST /api/readings ingests binary-transcoded Node 1 telemetry (200 OK)');
    assert(res1.data.success === true, 'Response success === true');
    assert(res1.data.sensor.nodeId === 'N1', 'Backend maps NODE_01 to short dashboard ID "N1"');
    assert(res1.data.sensor.status === 'Normal', 'DGMS status evaluated as "Normal" (<1.0° tilt)');

    // Transmit Node 2 Warning packet (tilt = 1.45°)
    const node2WarningData = {
      node_id: 'NODE_02',
      gateway_id: 'N3',
      sequence: 3001,
      hop_count: 0,
      rssi: -62,
      tilt_x_deg: 1.15,
      tilt_y_deg: 0.88,
      temperature_C: 27.8,
      battery_v: 3.88,
      vibration_g: 0.05,
      displacement: 1.25,
      status_flags: FLAGS.ALARM_WARNING
    };

    const node2Buf = packMeshPacket(node2WarningData);
    const unpackedNode2 = unpackMeshPacket(node2Buf);
    const res2 = await makeRequest('POST', '/api/readings', transcodeToGatewayJson(unpackedNode2));
    
    assert(res2.status === 200, 'POST /api/readings ingests Warning telemetry from Node 2 (200 OK)');
    assert(res2.data.sensor.status === 'Warning', 'Node 2 status evaluated as "Warning" (1.0° - 2.0° range)');
    assert(res2.data.sensor.riskScore >= 40 && res2.data.sensor.riskScore < 70, 'Risk score elevated to Warning band');

    // Transmit Node 3 Critical packet (tilt = 2.45° + critical flag)
    const node3CriticalData = {
      node_id: 'NODE_03',
      gateway_id: 'N3',
      sequence: 4001,
      hop_count: 0,
      rssi: -58,
      tilt_x_deg: 2.10,
      tilt_y_deg: 1.25,
      temperature_C: 28.5,
      battery_v: 3.82,
      vibration_g: 0.18, // Above critical vibration limit (0.15g)
      displacement: 3.80,
      status_flags: FLAGS.ALARM_CRITICAL | FLAGS.CRACK_TRIGGER
    };

    const node3Buf = packMeshPacket(node3CriticalData);
    const unpackedNode3 = unpackMeshPacket(node3Buf);
    const res3 = await makeRequest('POST', '/api/telemetry', transcodeToGatewayJson(unpackedNode3));

    assert(res3.status === 200, 'POST /api/telemetry ingests Critical telemetry from Node 3 (200 OK)');
    assert(res3.data.sensor.status === 'Critical', 'Node 3 status evaluated as "Critical" (>2.0° tilt & high vibration)');
    assert(res3.data.alert && res3.data.alert.severity === 'Critical', 'Critical alert generated in real-time alert center');

    // Verify Socket.IO updates were delivered
    await new Promise((r) => setTimeout(r, 100));
    assert(broadcastUpdates.length >= 3, `Socket.IO received all ${broadcastUpdates.length} sensor broadcasts in real time`);

    socket.disconnect();
  } finally {
    await new Promise((resolve) => server.close(resolve));
    console.log('\nMesh Test Server stopped.');
  }

  // Final Summary
  console.log('\n================================================================');
  console.log(` ESP32 Firmware & Mesh Test Suite: ${passed} Passed, ${failed} Failed`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

if (require.main === module) {
  runEsp32MeshTests().catch((err) => {
    console.error('Fatal Test Runner Error:', err);
    process.exit(1);
  });
}

module.exports = { runEsp32MeshTests };
