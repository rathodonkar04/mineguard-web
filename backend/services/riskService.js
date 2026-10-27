/**
 * MineGuard Risk & Alert Processing Service
 * Smart India Hackathon 2026 (Problem Statement 26025)
 * 
 * ============================================================================
 * PROTOTYPE THRESHOLD & MULTI-SIGNAL RISK ARCHITECTURE:
 * ============================================================================
 * Evaluates geotechnical status combining physical sensor measurements and
 * AI statistical anomaly scores.
 * 
 * DISCLAIMER:
 * These thresholds (<1.00° Normal, 1.00°–2.00° Warning, >2.00° Critical) are
 * PROTOTYPE THRESHOLDS for student demonstration and are not statutory limits.
 * ============================================================================
 */

// Prototype Threshold Definitions
const THRESHOLDS = {
  tilt: {
    normalMax: 1.0,   // < 1.0° = Normal
    warningMax: 2.0,  // 1.0° to 2.0° = Warning
    criticalMin: 2.0  // > 2.0° = Critical
  }
};

/**
 * Calculate risk status and synthetic risk score (0-100)
 * @param {Object} sensorData - Current sensor reading
 * @returns {{ status: string, riskScore: number }}
 */
function calculateRisk(sensorData) {
  const tilt = typeof sensorData.tilt === 'number' ? sensorData.tilt : 0;
  const crack = Boolean(sensorData.crackDetected);
  const aiResult = sensorData.aiResult || null;

  let status = 'Normal';
  let riskScore = 15; // Baseline healthy score

  if (aiResult && aiResult.risk_level) {
    if (aiResult.risk_level === 'CRITICAL') {
      status = 'Critical';
      riskScore = Math.min(100, Math.round(70 + (tilt > 2.0 ? (tilt - 2.0) * 35 : 15)));
    } else if (aiResult.risk_level === 'WARNING') {
      status = 'Warning';
      riskScore = Math.round(40 + (tilt >= 1.0 ? (tilt - 1.0) * 29 : 10));
    } else if (aiResult.risk_level === 'CALIBRATING') {
      // If AI is calibrating, fall back gracefully to physical tilt thresholds
      if (tilt > THRESHOLDS.tilt.criticalMin || crack) {
        status = 'Critical';
        riskScore = Math.min(100, Math.round(70 + (tilt - 2.0) * 35));
      } else if (tilt >= THRESHOLDS.tilt.normalMax) {
        status = 'Warning';
        riskScore = Math.round(40 + (tilt - 1.0) * 29);
      } else {
        status = 'Normal';
        riskScore = Math.round(10 + tilt * 25);
      }
    } else {
      status = 'Normal';
      riskScore = Math.round(10 + tilt * 25);
    }
  } else {
    // Standard rule evaluation
    if (tilt > THRESHOLDS.tilt.criticalMin || crack) {
      status = 'Critical';
      riskScore = Math.min(100, Math.round(70 + (tilt - 2.0) * 35));
    } else if (tilt >= THRESHOLDS.tilt.normalMax) {
      status = 'Warning';
      riskScore = Math.round(40 + (tilt - 1.0) * 29);
    } else {
      status = 'Normal';
      riskScore = Math.round(10 + tilt * 25);
    }
  }

  return {
    status,
    riskScore
  };
}

/**
 * Evaluate whether an alert should be created for a sensor state
 * @param {Object} sensor - Updated sensor object
 * @returns {Object|null} Alert object or null if normal
 */
function evaluateAlert(sensor) {
  if (sensor.status === 'Critical') {
    const reasonMsg = sensor.risk_reason || `Abnormal tilt (${sensor.tilt.toFixed(2)}°) detected at Node ${sensor.nodeId} (${sensor.zone || 'Surface'}).`;
    return {
      id: `ALT-${sensor.nodeId}-${Date.now()}`,
      nodeId: sensor.nodeId,
      severity: 'Critical',
      type: 'Critical Subsidence Alarm',
      message: reasonMsg,
      value: sensor.tilt,
      ai_anomaly_score: sensor.ai_anomaly_score,
      timestamp: sensor.timestamp || new Date().toISOString(),
      acknowledged: false,
      isPrototype: true
    };
  } else if (sensor.status === 'Warning') {
    const reasonMsg = sensor.risk_reason || `Elevated surface inclination (${sensor.tilt.toFixed(2)}°) observed at Node ${sensor.nodeId}.`;
    return {
      id: `ALT-WARN-${sensor.nodeId}-${Date.now()}`,
      nodeId: sensor.nodeId,
      severity: 'Warning',
      type: 'Advisory Warning',
      message: reasonMsg,
      value: sensor.tilt,
      ai_anomaly_score: sensor.ai_anomaly_score,
      timestamp: sensor.timestamp || new Date().toISOString(),
      acknowledged: false,
      isPrototype: true
    };
  }
  return null;
}

module.exports = {
  calculateRisk,
  evaluateAlert,
  THRESHOLDS
};
