/**
 * Canonical Telemetry & Hardware Gateway Payload Validator
 * Validates incoming sensor payloads from ESP32 mesh nodes, Node 3 gateway, or simulation clients.
 */

const ALLOWED_NODE_IDS = ['NODE_01', 'NODE_02', 'NODE_03', 'NODE_04', 'N1', 'N2', 'N3', 'N4'];

// Mapping between short dashboard IDs and canonical hardware IDs
const NODE_ID_MAP = {
  'NODE_01': { shortId: 'N1', canonicalId: 'NODE_01', zone: 'Zone A', name: 'Sensor Node 1 (Stable Reference)' },
  'NODE_02': { shortId: 'N2', canonicalId: 'NODE_02', zone: 'Zone B', name: 'Sensor Node 2 (Transition Area)' },
  'NODE_03': { shortId: 'N3', canonicalId: 'NODE_03', zone: 'Zone C', name: 'Sensor Node 3 (Active Monitoring Area)' },
  'NODE_04': { shortId: 'N4', canonicalId: 'NODE_04', zone: 'Zone D', name: 'Sensor Node 4 (Expansion Node)' },
  'N1': { shortId: 'N1', canonicalId: 'NODE_01', zone: 'Zone A', name: 'Sensor Node 1 (Stable Reference)' },
  'N2': { shortId: 'N2', canonicalId: 'NODE_02', zone: 'Zone B', name: 'Sensor Node 2 (Transition Area)' },
  'N3': { shortId: 'N3', canonicalId: 'NODE_03', zone: 'Zone C', name: 'Sensor Node 3 (Active Monitoring Area)' },
  'N4': { shortId: 'N4', canonicalId: 'NODE_04', zone: 'Zone D', name: 'Sensor Node 4 (Expansion Node)' }
};

function normalizeNodeId(rawId) {
  if (!rawId || typeof rawId !== 'string') return null;
  const upper = rawId.trim().toUpperCase();
  return NODE_ID_MAP[upper] || null;
}

function isValidTimestamp(ts) {
  if (typeof ts === 'number') {
    return Number.isFinite(ts) && ts > 946684800000; // >= Year 2000 in ms
  }
  if (typeof ts === 'string') {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return false;
    const year = d.getUTCFullYear();
    if (year < 2000 || year > 2100) return false;
    return /^\d{4}-\d{2}-\d{2}/.test(ts.trim());
  }
  return false;
}

/**
 * Helper to pick the first defined property from body given an array of candidate names
 * @param {Object} body
 * @param {string[]} names
 * @returns {*} First defined value or undefined
 */
function pick(body, names) {
  if (!body) return undefined;
  for (const name of names) {
    if (body[name] !== undefined) {
      return body[name];
    }
  }
  return undefined;
}

/**
 * Validate incoming telemetry payload from either standard API or Node 3 gateway
 * @param {Object} body - Telemetry payload
 * @returns {{ isValid: boolean, error: string|null, normalized: Object|null }}
 */
function validateTelemetryPayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { isValid: false, error: 'Request body must be a valid JSON object.', normalized: null };
  }

  // 1. Validate node_id / nodeId
  const rawNodeId = body.node_id || body.nodeId;
  if (!rawNodeId || typeof rawNodeId !== 'string' || rawNodeId.trim() === '') {
    return { isValid: false, error: 'Field "node_id" is required and must be a non-empty string (e.g. "NODE_01").', normalized: null };
  }

  const nodeMeta = normalizeNodeId(rawNodeId);
  if (!nodeMeta) {
    return {
      isValid: false,
      error: `Invalid node_id "${rawNodeId}". Allowed prototype node IDs are: NODE_01, NODE_02, NODE_03, NODE_04 (or N1, N2, N3).`,
      normalized: null
    };
  }

  // 2. Extract and validate tilt fields (accepts tilt_x_deg/tilt_x/roll_deg/roll, tilt_y_deg/tilt_y/pitch_deg/pitch, tilt_angle/tilt)
  const rawTiltX = pick(body, ['tilt_x_deg', 'tilt_x', 'roll_deg', 'roll']);
  const rawTiltY = pick(body, ['tilt_y_deg', 'tilt_y', 'pitch_deg', 'pitch']);
  const rawTiltAngle = pick(body, ['tilt_angle', 'tilt']);

  let finalTiltX = null;
  let finalTiltY = null;
  let finalTiltAngle = null;

  // Validate tilt_x if provided
  if (rawTiltX !== undefined) {
    if (rawTiltX === null || typeof rawTiltX !== 'number' || !Number.isFinite(rawTiltX)) {
      return { isValid: false, error: 'Field "tilt_x_deg" (or "tilt_x") must be a finite number (degrees).', normalized: null };
    }
    finalTiltX = rawTiltX;
  }

  // Validate tilt_y if provided
  if (rawTiltY !== undefined) {
    if (rawTiltY === null || typeof rawTiltY !== 'number' || !Number.isFinite(rawTiltY)) {
      return { isValid: false, error: 'Field "tilt_y_deg" (or "tilt_y") must be a finite number (degrees).', normalized: null };
    }
    finalTiltY = rawTiltY;
  }

  // Validate tilt_angle / tilt if provided
  if (rawTiltAngle !== undefined) {
    if (rawTiltAngle === null || typeof rawTiltAngle !== 'number' || !Number.isFinite(rawTiltAngle)) {
      return { isValid: false, error: 'Field "tilt_angle" (or "tilt") must be a finite number (degrees).', normalized: null };
    }
    finalTiltAngle = rawTiltAngle;
  } else if (finalTiltX !== null && finalTiltY !== null) {
    // Derived overall tilt angle from vector components: sqrt(tilt_x^2 + tilt_y^2)
    finalTiltAngle = Math.sqrt(finalTiltX * finalTiltX + finalTiltY * finalTiltY);
  } else {
    return {
      isValid: false,
      error: 'Telemetry must include numeric tilt data (either "tilt_x_deg" & "tilt_y_deg", or "tilt_angle").',
      normalized: null
    };
  }

  // If tilt_x/tilt_y were omitted but tilt_angle was given, approximate vector decomposition
  if (finalTiltX === null && finalTiltAngle !== null) {
    finalTiltX = Number((finalTiltAngle * 0.707).toFixed(3));
  }
  if (finalTiltY === null && finalTiltAngle !== null) {
    finalTiltY = Number((finalTiltAngle * 0.707).toFixed(3));
  }

  // 3. Extract and validate temperature (accepts temperature_C or temperature)
  const rawTemp = body.temperature_C !== undefined ? body.temperature_C : body.temperature;
  let finalTemperature = 25.0; // Default ambient if omitted
  if (rawTemp !== undefined) {
    if (rawTemp === null || typeof rawTemp !== 'number' || !Number.isFinite(rawTemp)) {
      return { isValid: false, error: 'Field "temperature_C" (or "temperature") must be a finite number (°C).', normalized: null };
    }
    finalTemperature = rawTemp;
  }

  // 4. Validate displacement (mm) - Optional for MPU6050 hardware payload; validated if key is present
  const rawDisplacement = pick(body, ['displacement', 'displacement_mm']);
  let finalDisplacement = 0.0;
  if (rawDisplacement !== undefined) {
    if (rawDisplacement === null || typeof rawDisplacement !== 'number' || !Number.isFinite(rawDisplacement)) {
      return { isValid: false, error: 'Field "displacement" must be a finite number (mm).', normalized: null };
    }
    finalDisplacement = rawDisplacement;
  }

  // 5. Validate vibration (g) - Optional for basic tilt payload; validated if key is present
  const rawVibration = pick(body, ['vibration', 'vibration_g']);
  let finalVibration = 0.0;
  if (rawVibration !== undefined) {
    if (rawVibration === null || typeof rawVibration !== 'number' || !Number.isFinite(rawVibration)) {
      return { isValid: false, error: 'Field "vibration" must be a finite number (g).', normalized: null };
    }
    finalVibration = rawVibration;
  }

  // 6. Validate crackDetected (optional, boolean)
  if (body.crackDetected !== undefined && body.crackDetected !== null && typeof body.crackDetected !== 'boolean') {
    return { isValid: false, error: 'Field "crackDetected" must be a boolean (true/false) if provided.', normalized: null };
  }

  // 7. Validate timestamp (optional, ISO string or number)
  let finalTimestamp = new Date().toISOString();
  if (body.timestamp !== undefined && body.timestamp !== null) {
    if (!isValidTimestamp(body.timestamp)) {
      return { isValid: false, error: 'Field "timestamp" must be a valid ISO-8601 date string (e.g. "2026-08-28T10:30:00Z").', normalized: null };
    }
    finalTimestamp = new Date(body.timestamp).toISOString();
  }

  // 8. Extract mesh metadata (gateway_id, sequence, hop_count)
  const rawGatewayId = body.gateway_id || body.gatewayId || 'N3';
  const rawSequence = body.sequence !== undefined && Number.isInteger(Number(body.sequence)) ? Number(body.sequence) : null;
  const rawHopCount = body.hop_count !== undefined && Number.isInteger(Number(body.hop_count)) ? Number(body.hop_count) : 0;

  // 9. Extract multi-mine & extraction panel metadata (defaults to benchmark Moonidih P-4)
  const rawMineId = body.mine_id || body.mineId || 'MOONIDIH';
  const rawPanelId = body.panel_id || body.panelId || 'P-4';

  const motion = {};
  for (const key of ['accel_x', 'accel_y', 'accel_z', 'gyro_x', 'gyro_y', 'gyro_z']) {
    if (body[key] !== undefined && (typeof body[key] !== 'number' || !Number.isFinite(body[key]))) {
      return { isValid: false, error: `${key} must be a finite number`, normalized: null };
    }
    motion[key] = body[key] ?? null;
  }
  const normalized = {
    ...motion,
    nodeId: nodeMeta.shortId,
    node_id: nodeMeta.canonicalId,
    mine_id: String(rawMineId).trim().toUpperCase(),
    panel_id: String(rawPanelId).trim().toUpperCase(),
    zone: nodeMeta.zone,
    name: nodeMeta.name,
    gateway_id: String(rawGatewayId),
    sequence: rawSequence,
    hop_count: rawHopCount,
    tilt: Number(finalTiltAngle.toFixed(2)),
    tilt_angle: Number(finalTiltAngle.toFixed(3)),
    tilt_x: Number(finalTiltX.toFixed(3)),
    tilt_y: Number(finalTiltY.toFixed(3)),
    displacement: Number(finalDisplacement.toFixed(2)),
    vibration: Number(finalVibration.toFixed(3)),
    temperature: Number(finalTemperature.toFixed(1)),
    crackDetected: Boolean(body.crackDetected),
    timestamp: finalTimestamp
  };

  return { isValid: true, error: null, normalized };
}

module.exports = {
  validateTelemetryPayload,
  normalizeNodeId,
  isValidTimestamp,
  pick,
  ALLOWED_NODE_IDS,
  NODE_ID_MAP
};
