/**
 * MineGuard Sensor Management Service
 * Manages sensor states, alerts, heartbeat monitoring, AI inference, persistent PostgreSQL/Supabase storage, and Socket.IO event broadcasting.
 */

const { sensors, alerts, initialSensors, N3_DEMO_STEPS } = require('../data/sensorState');
const { calculateRisk, evaluateAlert } = require('./riskService');
const { normalizeNodeId } = require('../utils/validation');
const aiService = require('./aiService');
const dbService = require('./dbService');
const alertDispatchService = require('./alertDispatchService');

// Configurable offline timeout (default: 30 seconds)
const SENSOR_TIMEOUT_MS = parseInt(process.env.SENSOR_TIMEOUT_MS, 10) || 30000;

// Track last persisted risk state per node for intelligent transition-based logging
const lastPersistedRisk = new Map();
const RISK_HEARTBEAT_INTERVAL_MS = 300000; // Persist at least once every 5 minutes during steady state

/**
 * Get all current sensor states
 */
function getAllSensors() {
  return sensors.map(s => ({ ...s }));
}

/**
 * Get single sensor by Node ID (supports 'N1' or 'NODE_01')
 */
function getSensorById(rawId) {
  if (!rawId || typeof rawId !== 'string') return null;
  const searchId = rawId.trim().toUpperCase();
  const sensor = sensors.find(s => 
    (s.nodeId && s.nodeId.toUpperCase() === searchId) || 
    (s.node_id && s.node_id.toUpperCase() === searchId)
  );
  return sensor ? { ...sensor } : null;
}

/**
 * Ingest and process incoming telemetry from an ESP32, Node 3 gateway, or simulation client
 * @param {Object} payload - Validated telemetry payload (or raw payload with node_id / nodeId)
 * @param {Object} io - Socket.IO server instance (optional)
 * @returns {{ sensor: Object, alert: Object|null, ai: Object }}
 */
function updateTelemetry(payload, io = null) {
  const rawId = payload.node_id || payload.nodeId;
  const nodeMeta = normalizeNodeId(rawId);
  const targetShortId = nodeMeta ? nodeMeta.shortId : (payload.nodeId || rawId);
  const targetCanonicalId = nodeMeta ? nodeMeta.canonicalId : (payload.node_id || rawId);

  let targetIndex = sensors.findIndex(s => 
    (s.nodeId && s.nodeId.toUpperCase() === targetShortId.toUpperCase()) ||
    (s.node_id && s.node_id.toUpperCase() === targetCanonicalId.toUpperCase())
  );

  // If node is not currently in runtime array, register it dynamically
  if (targetIndex === -1) {
    if (nodeMeta) {
      sensors.push({
        nodeId: targetShortId,
        node_id: targetCanonicalId,
        name: nodeMeta.name,
        zone: nodeMeta.zone,
        gateway_id: payload.gateway_id || 'N3',
        sequence: payload.sequence || null,
        hop_count: payload.hop_count || 0,
        tilt: 0.0,
        tilt_angle: 0.0,
        tilt_x: 0.0,
        tilt_y: 0.0,
        temperature: 25.0,
        displacement: 0.0,
        vibration: 0.0,
        crackDetected: false,
        status: 'Normal',
        riskScore: 10,
        ai_anomaly_score: null,
        risk_level: 'CALIBRATING',
        risk_reason: 'Initializing node state',
        ai_status: 'CALIBRATING',
        online: true,
        lastSeen: new Date().toISOString(),
        timestamp: new Date().toISOString()
      });
      targetIndex = sensors.length - 1;
    } else {
      throw new Error(`Node ${rawId} not found in registered sensors.`);
    }
  }

  const currentSensor = sensors[targetIndex];
  const nowIso = payload.timestamp || new Date().toISOString();
  const nowMs = Date.now();

  // Compute tilt values (deriving resultant angle from vector components if tilt_angle is not explicit)
  let tiltX = payload.tilt_x !== undefined ? payload.tilt_x : (payload.tilt_x_deg !== undefined ? payload.tilt_x_deg : (currentSensor.tilt_x || 0.0));
  let tiltY = payload.tilt_y !== undefined ? payload.tilt_y : (payload.tilt_y_deg !== undefined ? payload.tilt_y_deg : (currentSensor.tilt_y || 0.0));
  
  let tiltAngle;
  if (payload.tilt_angle !== undefined) {
    tiltAngle = payload.tilt_angle;
  } else if (payload.tilt !== undefined) {
    tiltAngle = payload.tilt;
  } else if (payload.tilt_x !== undefined || payload.tilt_x_deg !== undefined || payload.tilt_y !== undefined || payload.tilt_y_deg !== undefined) {
    tiltAngle = Math.sqrt(tiltX * tiltX + tiltY * tiltY);
  } else {
    tiltAngle = currentSensor.tilt || 0.0;
  }

  let disp = payload.displacement !== undefined ? payload.displacement : (currentSensor.displacement || 0.0);
  let vib = payload.vibration !== undefined ? payload.vibration : (currentSensor.vibration || 0.0);
  let temp = payload.temperature !== undefined ? payload.temperature : (payload.temperature_C !== undefined ? payload.temperature_C : (currentSensor.temperature || 25.0));
  let crack = payload.crackDetected !== undefined ? payload.crackDetected : currentSensor.crackDetected;

  // 1. Process Live AI Inference & Feature Engineering Pipeline (1 Hz continuous)
  const aiResult = aiService.processTelemetry({
    node_id: targetCanonicalId,
    tilt_angle: tiltAngle,
    tilt_x: tiltX,
    tilt_y: tiltY,
    displacement: disp,
    vibration: vib,
    temperature: temp,
    timestamp: nowIso
  });

  // 2. Calculate composite risk status (1 Hz continuous)
  const { status, riskScore } = calculateRisk({
    tilt: tiltAngle,
    displacement: disp,
    crackDetected: crack,
    aiResult
  });

  // 3. Update sensor state (sub-millisecond in-memory cache)
  sensors[targetIndex] = {
    ...currentSensor,
    accel_x: payload.accel_x ?? null,
    accel_y: payload.accel_y ?? null,
    accel_z: payload.accel_z ?? null,
    gyro_x: payload.gyro_x ?? null,
    gyro_y: payload.gyro_y ?? null,
    gyro_z: payload.gyro_z ?? null,

    nodeId: currentSensor.nodeId || targetShortId,
    node_id: currentSensor.node_id || targetCanonicalId,
    mine_id: payload.mine_id || currentSensor.mine_id || 'MOONIDIH',
    panel_id: payload.panel_id || currentSensor.panel_id || 'P-4',
    gateway_id: payload.gateway_id || currentSensor.gateway_id || 'N3',
    sequence: payload.sequence !== undefined ? payload.sequence : currentSensor.sequence,
    hop_count: payload.hop_count !== undefined ? payload.hop_count : (currentSensor.hop_count || 0),
    tilt: Number(tiltAngle.toFixed(2)),
    tilt_angle: Number(tiltAngle.toFixed(3)),
    tilt_x: Number(tiltX.toFixed(3)),
    tilt_y: Number(tiltY.toFixed(3)),
    displacement: Number(disp.toFixed(2)),
    vibration: Number(vib.toFixed(3)),
    temperature: Number(temp.toFixed(1)),
    crackDetected: Boolean(crack),
    status,
    riskScore,
    ai_anomaly_score: aiResult.ai_anomaly_score,
    risk_level: aiResult.risk_level,
    risk_reason: aiResult.risk_reason,
    ai_status: aiResult.ai_status,
    ai_updated_at: aiResult.ai_updated_at,
    features: aiResult.features,
    online: true,
    lastSeen: nowIso,
    timestamp: nowIso
  };

  // Internal model defaults must not masquerade as device measurements.
  for (const [field, present] of Object.entries(payload.reported_fields || {})) {
    if (!present) sensors[targetIndex][field] = null;
  }
  sensors[targetIndex].source = 'telemetry';
  sensors[targetIndex].receivedAt = new Date().toISOString();
  const updatedSensor = { ...sensors[targetIndex] };

  // 4. Evaluate alert creation
  const newAlert = evaluateAlert(updatedSensor);
  if (newAlert) {
    newAlert.mine_id = updatedSensor.mine_id;
    newAlert.panel_id = updatedSensor.panel_id;
    const recentDuplicate = alerts.find(
      a => a.nodeId === newAlert.nodeId && a.severity === newAlert.severity && !a.acknowledged
    );
    if (!recentDuplicate) {
      alerts.unshift(newAlert);
      if (alerts.length > 50) alerts.pop();
      // Persist new alert to PostgreSQL/Supabase
      dbService.persistAlert(newAlert).catch(() => {});
      // Autonomous External Notification & Escalation Dispatch (Email/SMS/Siren)
      alertDispatchService.processAlertDispatch(newAlert, io).catch((err) => {
        console.error('[Alert Dispatch Error]', err.message);
      });
    }
  }

  // 5. Emit Socket.IO Events (Immediate live broadcast)
  if (io) {
    io.emit('sensorUpdate', updatedSensor);
    if (newAlert) {
      io.emit('alertCreated', newAlert);
    }
  }

  // 6. Intelligent Asynchronous Telemetry & Risk Event Persistence
  (async () => {
    try {
      // 6a. Always persist raw 1 Hz telemetry sample (retained in rolling 6-hour high-res buffer)
      const telemetryId = await dbService.persistTelemetry(updatedSensor);

      // 6b. Determine if full risk analysis record should be persisted
      const lastState = lastPersistedRisk.get(targetCanonicalId);
      const isLevelTransition = !lastState || lastState.risk_level !== updatedSensor.risk_level;
      const isStatusTransition = !lastState || lastState.status !== updatedSensor.status;
      const isMajorAnomaly = (updatedSensor.ai_anomaly_score || 0) >= 50;
      const isSignificantScoreShift = lastState ? Math.abs((lastState.riskScore || 0) - updatedSensor.riskScore) >= 10 : true;
      const isAlertGenerated = Boolean(newAlert);
      const isHeartbeatDue = !lastState || (nowMs - lastState.timeMs) >= RISK_HEARTBEAT_INTERVAL_MS;

      const shouldPersistRisk = isLevelTransition || isStatusTransition || isMajorAnomaly || isSignificantScoreShift || isAlertGenerated || isHeartbeatDue;

      if (shouldPersistRisk) {
        lastPersistedRisk.set(targetCanonicalId, {
          risk_level: updatedSensor.risk_level,
          status: updatedSensor.status,
          anomaly_score: updatedSensor.ai_anomaly_score,
          riskScore: updatedSensor.riskScore,
          timeMs: nowMs
        });

        await dbService.persistRiskAnalysis({
          node_id: updatedSensor.node_id,
          node_short_id: updatedSensor.nodeId,
          telemetry_id: telemetryId,
          timestamp: updatedSensor.timestamp,
          anomaly_score: updatedSensor.ai_anomaly_score,
          raw_decision_function: aiResult.raw_decision_function,
          risk_score: updatedSensor.riskScore,
          risk_level: updatedSensor.risk_level,
          status: updatedSensor.status,
          reason: updatedSensor.risk_reason,
          tilt_angle: updatedSensor.tilt_angle,
          tilt_rate: updatedSensor.features?.tilt_rate || 0.0,
          displacement: updatedSensor.displacement,
          displacement_rate: updatedSensor.features?.displacement_rate || 0.0,
          vibration: updatedSensor.vibration,
          temperature: updatedSensor.temperature,
          model_version: '1.0.0-isolation-forest-300trees',
          features: updatedSensor.features
        });
      }
    } catch (err) {
      // Non-blocking error handling
    }
  })();

  return {
    sensor: updatedSensor,
    alert: newAlert,
    ai: aiResult
  };
}

/**
 * Check sensor heartbeats and flag offline nodes
 * @param {Object} io - Socket.IO server instance
 */
function checkSensorHeartbeats(io = null) {
  const now = Date.now();

  sensors.forEach((sensor, idx) => {
    const lastSeenTime = new Date(sensor.lastSeen || 0).getTime();
    const isTimedOut = (now - lastSeenTime) > SENSOR_TIMEOUT_MS;

    if (isTimedOut && sensor.online) {
      sensors[idx].online = false;
      
      const offlineEvent = {
        nodeId: sensor.nodeId,
        node_id: sensor.node_id,
        message: `Node ${sensor.nodeId} (${sensor.node_id || sensor.nodeId}) is offline (No telemetry received in ${SENSOR_TIMEOUT_MS / 1000}s).`,
        timestamp: new Date().toISOString()
      };

      if (io) {
        io.emit('sensorOffline', offlineEvent);
        io.emit('sensorUpdate', { ...sensors[idx] });
      }
    }
  });
}

/**
 * Get all alerts
 */
function getAllAlerts() {
  return alerts.map(a => ({ ...a }));
}

/**
 * Acknowledge an alert by ID
 */
function acknowledgeAlert(alertId, acknowledgedBy = 'Authorized Personnel') {
  let target = alerts.find(a => a.id === alertId);
  const now = new Date().toISOString();

  if (!target) {
    target = {
      id: alertId,
      acknowledged: true,
      acknowledgedAt: now,
      acknowledgedBy,
      queryStatus: 'ACKNOWLEDGED'
    };
    alerts.unshift(target);
  } else {
    target.acknowledged = true;
    target.acknowledgedAt = now;
    target.acknowledgedBy = acknowledgedBy;
    target.queryStatus = target.resolved ? 'RESOLVED' : 'ACKNOWLEDGED';
  }

  dbService.persistAlert(target).catch(() => {});
  return { ...target };
}

/**
 * Resolve an alert / hazard query by ID with resolution timestamp and notes
 */
function resolveAlert(alertId, resolvedBy = 'Authorized Personnel', resolutionNotes = '') {
  let target = alerts.find(a => a.id === alertId);
  const now = new Date().toISOString();

  if (!target) {
    target = {
      id: alertId,
      acknowledged: true,
      acknowledgedAt: now,
      acknowledgedBy: resolvedBy,
      resolved: true,
      resolvedAt: now,
      resolvedBy,
      resolutionNotes: resolutionNotes || 'Geotechnical anomaly inspected and verified safe.',
      queryStatus: 'RESOLVED'
    };
    alerts.unshift(target);
  } else {
    target.acknowledged = true;
    if (!target.acknowledgedAt) target.acknowledgedAt = now;
    if (!target.acknowledgedBy) target.acknowledgedBy = resolvedBy;
    target.resolved = true;
    target.resolvedAt = now;
    target.resolvedBy = resolvedBy;
    target.resolutionNotes = resolutionNotes || 'Geotechnical anomaly inspected and verified safe.';
    target.queryStatus = 'RESOLVED';
  }

  dbService.persistAlert(target).catch(() => {});
  return { ...target };
}

/**
 * Reset all sensors back to initial state
 */
function resetSensorState() {
  sensors.length = 0;
  sensors.push(...JSON.parse(JSON.stringify(initialSensors)));
  aiService.resetNodeBuffers();
  lastPersistedRisk.clear();
  return getAllSensors();
}

module.exports = {
  getAllSensors,
  getSensorById,
  updateTelemetry,
  checkSensorHeartbeats,
  getAllAlerts,
  acknowledgeAlert,
  resolveAlert,
  resetSensorState,
  N3_DEMO_STEPS,
  SENSOR_TIMEOUT_MS
};
