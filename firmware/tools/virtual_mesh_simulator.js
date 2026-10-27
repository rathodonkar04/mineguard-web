/**
 * MineGuard Virtual ESP-NOW Mesh Simulator
 * Smart India Hackathon 2026 (Problem Statement 26025)
 * 
 * Simulates 2.4 GHz ESP-NOW binary mesh packet generation, multi-hop relay forwarding,
 * CRC-16 calculation, and edge gateway transcoding into canonical JSON.
 */

const http = require('http');

const MINEGUARD_MAGIC_BYTE_0 = 0x4D; // 'M'
const MINEGUARD_MAGIC_BYTE_1 = 0x47; // 'G'
const MINEGUARD_PROTOCOL_VERSION = 0x01;

// Packet Status Flags
const FLAGS = {
  ALARM_CRITICAL: 1 << 0,
  ALARM_WARNING:  1 << 1,
  LOW_BATTERY:    1 << 2,
  CRACK_TRIGGER:  1 << 3,
  RELAY_HOPPED:   1 << 4,
  SENSOR_FAULT:   1 << 5
};

/**
 * CRC-16 CCITT (Polynomial 0x1021, Initial 0xFFFF)
 * Exactly mirrors C++ calculate_crc16 function in mesh_packet.h
 */
function calculateCrc16(buffer, length) {
  let crc = 0xFFFF;
  for (let i = 0; i < length; i++) {
    crc ^= (buffer[i] << 8) & 0xFFFF;
    for (let j = 0; j < 8; j++) {
      if (crc & 0x8000) {
        crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
      } else {
        crc = (crc << 1) & 0xFFFF;
      }
    }
  }
  return crc;
}

/**
 * Serializes telemetry into a packed 44-byte binary Buffer matching C struct MeshPacket
 */
function packMeshPacket(data) {
  // Struct Layout:
  // Offset  0: uint8 magic[2] (2 bytes)
  // Offset  2: uint8 version (1 byte)
  // Offset  3: uint8 status_flags (1 byte)
  // Offset  4: char node_id[8] (8 bytes)
  // Offset 12: char gateway_id[8] (8 bytes)
  // Offset 20: uint32 sequence (4 bytes, little-endian)
  // Offset 24: uint8 hop_count (1 byte)
  // Offset 25: int8 rssi (1 byte)
  // Offset 26: int16 tilt_x_centi_deg (2 bytes, little-endian)
  // Offset 28: int16 tilt_y_centi_deg (2 bytes, little-endian)
  // Offset 30: int16 tilt_mag_centi_deg (2 bytes, little-endian)
  // Offset 32: int16 temp_centi_c (2 bytes, little-endian)
  // Offset 34: uint16 vibration_milli_g (2 bytes, little-endian)
  // Offset 36: uint16 battery_mv (2 bytes, little-endian)
  // Offset 38: uint16 displacement_mm_x10 (2 bytes, little-endian)
  // Offset 40: uint16 crc16 (2 bytes, little-endian)
  // Total size: 42 bytes payload + 2 bytes CRC = 44 bytes

  const buf = Buffer.alloc(42);

  // Magic & Version
  buf.writeUInt8(MINEGUARD_MAGIC_BYTE_0, 0);
  buf.writeUInt8(MINEGUARD_MAGIC_BYTE_1, 1);
  buf.writeUInt8(MINEGUARD_PROTOCOL_VERSION, 2);
  buf.writeUInt8(data.status_flags || 0, 3);

  // Node & Gateway IDs (null-padded 8 bytes)
  const nodeBuf = Buffer.alloc(8);
  nodeBuf.write(data.node_id || 'NODE_01', 'ascii');
  nodeBuf.copy(buf, 4);

  const gwBuf = Buffer.alloc(8);
  gwBuf.write(data.gateway_id || 'N3', 'ascii');
  gwBuf.copy(buf, 12);

  // Sequence, Hops, RSSI
  buf.writeUInt32LE(data.sequence || 1, 20);
  buf.writeUInt8(data.hop_count || 0, 24);
  buf.writeInt8(data.rssi !== undefined ? data.rssi : -68, 25);

  // Fixed-point scaled measurements
  const tiltX = Math.round((data.tilt_x_deg || 0) * 100);
  const tiltY = Math.round((data.tilt_y_deg || 0) * 100);
  const tiltMag = Math.round((data.tilt_mag_deg || Math.sqrt(data.tilt_x_deg**2 + data.tilt_y_deg**2)) * 100);
  const tempC = Math.round((data.temperature_C || 25.0) * 100);
  const vibG = Math.round((data.vibration_g || 0.02) * 1000);
  const battMv = Math.round(data.battery_v ? data.battery_v * 1000 : (data.battery_mv || 3950));
  const dispX10 = Math.round((data.displacement || 0.35) * 10);

  buf.writeInt16LE(tiltX, 26);
  buf.writeInt16LE(tiltY, 28);
  buf.writeInt16LE(tiltMag, 30);
  buf.writeInt16LE(tempC, 32);
  buf.writeUInt16LE(vibG, 34);
  buf.writeUInt16LE(battMv, 36);
  buf.writeUInt16LE(dispX10, 38);

  // Calculate CRC16 across first 40 bytes (0 to 39)
  const crc = calculateCrc16(buf, 40);
  buf.writeUInt16LE(crc, 40);

  return buf;
}

/**
 * Deserializes a packed 42-byte binary Buffer into a JavaScript telemetry object
 */
function unpackMeshPacket(buf) {
  if (!Buffer.isBuffer(buf) || buf.length !== 42) {
    throw new Error(`Invalid packet length: ${buf ? buf.length : 0} bytes (expected 42)`);
  }

  // Validate Magic
  if (buf.readUInt8(0) !== MINEGUARD_MAGIC_BYTE_0 || buf.readUInt8(1) !== MINEGUARD_MAGIC_BYTE_1) {
    throw new Error('Invalid magic bytes');
  }

  // Validate Protocol Version
  const version = buf.readUInt8(2);
  if (version !== MINEGUARD_PROTOCOL_VERSION) {
    throw new Error(`Unsupported protocol version: ${version}`);
  }

  // Validate CRC16
  const receivedCrc = buf.readUInt16LE(40);
  const calculatedCrc = calculateCrc16(buf, 40);
  if (receivedCrc !== calculatedCrc) {
    throw new Error(`CRC mismatch: received 0x${receivedCrc.toString(16)}, calculated 0x${calculatedCrc.toString(16)}`);
  }

  // Unpack fields
  const status_flags = buf.readUInt8(3);
  const node_id = buf.toString('ascii', 4, 12).replace(/\0/g, '').trim();
  const gateway_id = buf.toString('ascii', 12, 20).replace(/\0/g, '').trim();
  const sequence = buf.readUInt32LE(20);
  const hop_count = buf.readUInt8(24);
  const rssi = buf.readInt8(25);

  const tilt_x_deg = Number((buf.readInt16LE(26) / 100.0).toFixed(3));
  const tilt_y_deg = Number((buf.readInt16LE(28) / 100.0).toFixed(3));
  const tilt_mag_deg = Number((buf.readInt16LE(30) / 100.0).toFixed(3));
  const temperature_C = Number((buf.readInt16LE(32) / 100.0).toFixed(1));
  const vibration_g = Number((buf.readUInt16LE(34) / 1000.0).toFixed(3));
  const battery_v = Number((buf.readUInt16LE(36) / 1000.0).toFixed(2));
  const displacement = Number((buf.readUInt16LE(38) / 10.0).toFixed(2));

  return {
    node_id,
    gateway_id,
    sequence,
    hop_count,
    rssi,
    status_flags,
    tilt_x_deg,
    tilt_y_deg,
    tilt_mag_deg,
    tilt_angle: Number(Math.sqrt(tilt_x_deg**2 + tilt_y_deg**2).toFixed(3)),
    temperature_C,
    vibration_g,
    battery_v,
    displacement,
    crc16: receivedCrc
  };
}

/**
 * Transcodes an unpacked mesh packet into the exact JSON expected by POST /api/readings
 */
function transcodeToGatewayJson(unpacked) {
  return {
    node_id: unpacked.node_id,
    gateway_id: unpacked.gateway_id,
    sequence: unpacked.sequence,
    hop_count: unpacked.hop_count,
    tilt_x_deg: unpacked.tilt_x_deg,
    tilt_y_deg: unpacked.tilt_y_deg,
    temperature_C: unpacked.temperature_C,
    battery_v: unpacked.battery_v,
    vibration_g: unpacked.vibration_g,
    displacement: unpacked.displacement
  };
}

module.exports = {
  MINEGUARD_MAGIC_BYTE_0,
  MINEGUARD_MAGIC_BYTE_1,
  MINEGUARD_PROTOCOL_VERSION,
  FLAGS,
  calculateCrc16,
  packMeshPacket,
  unpackMeshPacket,
  transcodeToGatewayJson
};
