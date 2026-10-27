/**
 * MineGuard Real-Time AI Inference & Risk Assessment Service
 * Smart India Hackathon 2026 (Problem Statement 26025)
 * 
 * ============================================================================
 * ARCHITECTURE & CAUSALITY CONSTRAINTS:
 * ============================================================================
 * 1. Node-Specific Baselines:
 *    - Loads calibrated baseline parameters per node (NODE_01, NODE_02, etc.).
 *    - Uncalibrated nodes are marked as "CALIBRATING".
 * 2. Causal Feature Engineering:
 *    - Strictly past-only ring buffers [t - 30s, t]. No future data leakage.
 *    - Computes all 16 canonical features matching training pipeline.
 *    - Initial 30s warm-up window returns "CALIBRATING".
 * 3. Isolation Forest Inference:
 *    - Exact feature ordering matching model_metadata.json.
 *    - Continuous score normalization: score in [0, 100].
 * 4. Transparent Multi-Signal Risk Assessment:
 *    - Combines physical thresholds, rate of change, and statistical anomaly score.
 *    - Labeled as Prototype Threshold.
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');

// 16 Canonical feature names in exact training order
const CANONICAL_FEATURES = [
  'z_tilt',
  'z_displacement',
  'z_vibration',
  'z_temperature',
  'tilt_rate',
  'displacement_rate',
  'displacement_acceleration',
  'vibration_rate',
  'tilt_mean_30s',
  'tilt_std_30s',
  'displacement_mean_30s',
  'vibration_mean_30s',
  'vibration_std_30s',
  'volatility_ratio',
  'delta_temperature',
  'detrended_tilt'
];

const EPSILON = 1e-6;
const BUFFER_MAX_LEN = 120; // 2 minutes history at 1 Hz

// In-memory per-node telemetry ring buffers
const nodeHistoryBuffers = new Map();

// In-memory node-specific baseline registry
const nodeBaselines = new Map();

// Cached Isolation Forest tree model
let cachedTreeModel = null;

/**
 * Load tree model and default baseline
 */
function initAiService() {
  try {
    const treesPath = path.join(__dirname, '../../ai/models/isolation_forest_trees.json');
    if (fs.existsSync(treesPath)) {
      cachedTreeModel = JSON.parse(fs.readFileSync(treesPath, 'utf8'));
    }

    const defaultBaselinePath = path.join(__dirname, '../../ai/models/baseline.json');
    if (fs.existsSync(defaultBaselinePath)) {
      const defaultBaseline = JSON.parse(fs.readFileSync(defaultBaselinePath, 'utf8'));
      // Register NODE_01 with calibrated demonstration baseline
      nodeBaselines.set('NODE_01', defaultBaseline);
      nodeBaselines.set('N1', defaultBaseline);
    }
  } catch (err) {
    console.error('[AI Service Init Warning]', err.message);
  }
}

initAiService();

/**
 * Register or update baseline for a specific node
 */
function setNodeBaseline(nodeId, baselinePayload) {
  if (!nodeId || !baselinePayload) return false;
  const canonicalId = nodeId.toUpperCase();
  nodeBaselines.set(canonicalId, baselinePayload);
  return true;
}

/**
 * Get baseline for a specific node
 */
function getNodeBaseline(nodeId) {
  if (!nodeId) return null;
  const canonicalId = nodeId.toUpperCase();
  return nodeBaselines.get(canonicalId) || null;
}

/**
 * Reset history buffer for a node or all nodes
 */
function resetNodeBuffers(nodeId = null) {
  if (nodeId) {
    nodeHistoryBuffers.delete(nodeId.toUpperCase());
  } else {
    nodeHistoryBuffers.clear();
  }
}

/**
 * Calculate Euler-Mascheroni average path length constant c(n)
 */
function c(n) {
  if (n <= 1) return 0;
  if (n === 2) return 1;
  const euler = 0.5772156649015329;
  return 2.0 * (Math.log(n - 1.0) + euler) - (2.0 * (n - 1.0) / n);
}

/**
 * Single tree traversal
 */
function evaluateTree(tree, x) {
  let node = 0;
  let depth = 0;
  while (tree.children_left[node] !== -1 && tree.children_right[node] !== -1) {
    const feat = tree.feature[node];
    const thresh = tree.threshold[node];
    if (x[feat] <= thresh) {
      node = tree.children_left[node];
    } else {
      node = tree.children_right[node];
    }
    depth++;
  }
  const nSamples = tree.n_node_samples[node];
  return depth + c(nSamples);
}

/**
 * Isolation Forest evaluation on 16-element feature vector
 */
function evaluateIsolationForest(xVector) {
  if (!cachedTreeModel) {
    return {
      rawDecision: 0.0,
      anomalyScore: 50,
      normalizedFloat: 50.0
    };
  }

  const cMax = c(cachedTreeModel.max_samples);
  let totalDepth = 0;
  for (let i = 0; i < cachedTreeModel.trees.length; i++) {
    totalDepth += evaluateTree(cachedTreeModel.trees[i], xVector);
  }
  const meanDepth = totalDepth / cachedTreeModel.trees.length;
  const rawScore = -Math.pow(2.0, - (meanDepth / cMax));
  const decisionFunction = rawScore - cachedTreeModel.offset;
  const tanhScaled = Math.tanh(decisionFunction / cachedTreeModel.scale_factor);
  const normalizedScore = Math.max(0.0, Math.min(100.0, 50.0 * (1.0 - tanhScaled)));

  return {
    rawDecision: Number(decisionFunction.toFixed(6)),
    anomalyScore: Math.round(normalizedScore),
    normalizedFloat: Number(normalizedScore.toFixed(2))
  };
}

/**
 * Sample mean and sample standard deviation over a buffer
 */
function computeStats(arr) {
  const n = arr.length;
  if (n === 0) return { mean: 0.0, std: 0.0 };
  const mean = arr.reduce((acc, v) => acc + v, 0) / n;
  if (n > 1) {
    const variance = arr.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / (n - 1);
    const std = Math.sqrt(Math.max(0.0, variance));
    return { mean, std };
  }
  return { mean, std: 0.0 };
}

/**
 * Process a single incoming telemetry record for a node
 * @param {Object} telemetry - Validated telemetry record
 * @returns {Object} AI inference result
 */
function processTelemetry(telemetry) {
  const rawNodeId = telemetry.node_id || telemetry.nodeId || 'NODE_01';
  const canonicalId = rawNodeId.toUpperCase();
  const now = new Date().toISOString();

  // 1. Check Node-Specific Baseline
  const baseline = getNodeBaseline(canonicalId);
  if (!baseline) {
    return {
      node_id: canonicalId,
      ai_anomaly_score: null,
      raw_decision_function: null,
      risk_level: 'CALIBRATING',
      risk_reason: `Node ${canonicalId} has no calibrated baseline. Marked as CALIBRATING.`,
      ai_status: 'CALIBRATING',
      ai_updated_at: now,
      is_calibrated: false,
      features: null
    };
  }

  // 2. Maintain Causal Ring Buffer
  if (!nodeHistoryBuffers.has(canonicalId)) {
    nodeHistoryBuffers.set(canonicalId, {
      tiltHistory: [],
      dispHistory: [],
      vibHistory: [],
      tempHistory: [],
      dispRateHistory: []
    });
  }

  const buf = nodeHistoryBuffers.get(canonicalId);

  const tiltAngle = typeof telemetry.tilt_angle === 'number' ? telemetry.tilt_angle : (telemetry.tilt || 0.0);
  const disp = typeof telemetry.displacement === 'number' ? telemetry.displacement : 0.0;
  const vib = typeof telemetry.vibration === 'number' ? telemetry.vibration : 0.0;
  const temp = typeof telemetry.temperature === 'number' ? telemetry.temperature : 25.0;

  buf.tiltHistory.push(tiltAngle);
  buf.dispHistory.push(disp);
  buf.vibHistory.push(vib);
  buf.tempHistory.push(temp);

  const tSec = buf.tiltHistory.length - 1;

  // Compute 5-second finite differences
  let tiltRate = null;
  let dispRate = null;
  let vibRate = null;
  const diffInterval = 5;

  if (tSec >= diffInterval) {
    tiltRate = (buf.tiltHistory[tSec] - buf.tiltHistory[tSec - diffInterval]) / diffInterval;
    dispRate = (buf.dispHistory[tSec] - buf.dispHistory[tSec - diffInterval]) / diffInterval;
    vibRate = (buf.vibHistory[tSec] - buf.vibHistory[tSec - diffInterval]) / diffInterval;
  }
  buf.dispRateHistory.push(dispRate);

  let dispAccel = null;
  if (tSec >= 2 * diffInterval && buf.dispRateHistory[tSec - diffInterval] !== null) {
    dispAccel = (buf.dispRateHistory[tSec] - buf.dispRateHistory[tSec - diffInterval]) / diffInterval;
  }

  // Trim buffer if too long
  if (buf.tiltHistory.length > BUFFER_MAX_LEN) {
    buf.tiltHistory.shift();
    buf.dispHistory.shift();
    buf.vibHistory.shift();
    buf.tempHistory.shift();
    buf.dispRateHistory.shift();
  }

  // 3. Check Causal Warm-up Window (Need at least 30 samples for 30s rolling statistics)
  const currentHistoryCount = buf.tiltHistory.length;
  if (currentHistoryCount < 30) {
    return {
      node_id: canonicalId,
      ai_anomaly_score: null,
      raw_decision_function: null,
      risk_level: 'CALIBRATING',
      risk_reason: `Causal rolling buffer warming up (${currentHistoryCount}/30 samples).`,
      ai_status: 'CALIBRATING',
      ai_updated_at: now,
      is_calibrated: true,
      history_samples: currentHistoryCount,
      features: null
    };
  }

  // 4. Extract 16 Features matching training pipeline
  const stats = baseline.statistics;
  const thermal = baseline.thermal_coupling || {};
  const alphaThermal = (thermal.is_statistically_meaningful && thermal.alpha_thermal) ? thermal.alpha_thermal : 0.0;

  const muTilt = stats.tilt_angle.mean;
  const sigmaTilt = stats.tilt_angle.safe_std || Math.max(stats.tilt_angle.std, EPSILON);

  const muDisp = stats.displacement.mean;
  const sigmaDisp = stats.displacement.safe_std || Math.max(stats.displacement.std, EPSILON);

  const muVib = stats.vibration.mean;
  const sigmaVib = stats.vibration.safe_std || Math.max(stats.vibration.std, EPSILON);

  const muTemp = stats.temperature.mean;
  const sigmaTemp = stats.temperature.safe_std || Math.max(stats.temperature.std, EPSILON);

  // Baseline Z-Scores
  const z_tilt = (tiltAngle - muTilt) / sigmaTilt;
  const z_displacement = (disp - muDisp) / sigmaDisp;
  const z_vibration = (vib - muVib) / sigmaVib;
  const z_temperature = (temp - muTemp) / sigmaTemp;

  // Thermal Features
  const delta_temperature = temp - muTemp;
  const detrended_tilt = tiltAngle - (alphaThermal * delta_temperature);

  // Rolling 30s Statistics
  const winLen = 30;
  const endIdx = buf.tiltHistory.length;
  const startIdx = endIdx - winLen;

  const tiltWin = buf.tiltHistory.slice(startIdx, endIdx);
  const dispWin = buf.dispHistory.slice(startIdx, endIdx);
  const vibWin = buf.vibHistory.slice(startIdx, endIdx);

  const { mean: tilt_mean_30s, std: tilt_std_30s } = computeStats(tiltWin);
  const { mean: displacement_mean_30s } = computeStats(dispWin);
  const { mean: vibration_mean_30s, std: vibration_std_30s } = computeStats(vibWin);

  const volatility_ratio = vibration_std_30s / sigmaVib;

  const featureDict = {
    z_tilt: Number(z_tilt.toFixed(4)),
    z_displacement: Number(z_displacement.toFixed(4)),
    z_vibration: Number(z_vibration.toFixed(4)),
    z_temperature: Number(z_temperature.toFixed(4)),
    tilt_rate: Number((tiltRate || 0.0).toFixed(6)),
    displacement_rate: Number((dispRate || 0.0).toFixed(6)),
    displacement_acceleration: Number((dispAccel || 0.0).toFixed(6)),
    vibration_rate: Number((vibRate || 0.0).toFixed(6)),
    tilt_mean_30s: Number(tilt_mean_30s.toFixed(4)),
    tilt_std_30s: Number(tilt_std_30s.toFixed(5)),
    displacement_mean_30s: Number(displacement_mean_30s.toFixed(4)),
    vibration_mean_30s: Number(vibration_mean_30s.toFixed(5)),
    vibration_std_30s: Number(vibration_std_30s.toFixed(6)),
    volatility_ratio: Number(volatility_ratio.toFixed(4)),
    delta_temperature: Number(delta_temperature.toFixed(4)),
    detrended_tilt: Number(detrended_tilt.toFixed(4))
  };

  // 5. Construct Vector in Exact Feature Ordering
  const xVector = CANONICAL_FEATURES.map(f => featureDict[f]);

  // 6. Evaluate Isolation Forest
  const ifResult = evaluateIsolationForest(xVector);
  const anomalyScore = ifResult.anomalyScore;

  // 7. Multi-Signal Transparent Risk Classification
  // Prototype Threshold Rules (Clearly labeled as prototype values):
  // - Critical: tilt > 2.00° OR disp > 1.50 mm OR (anomalyScore >= 85 AND tiltRate > 0.05)
  // - Warning: tilt >= 1.00° OR disp >= 0.50 mm OR (anomalyScore >= 50 AND tiltRate > 0.01)
  // - Safe: otherwise
  let riskLevel = 'SAFE';
  let riskReason = 'Nominal ground strata behavior within baseline bounds';

  if (tiltAngle > 2.00) {
    riskLevel = 'CRITICAL';
    riskReason = `Critical surface tilt (${tiltAngle.toFixed(2)}°) exceeds statutory limit (2.00°).`;
  } else if (disp > 1.50) {
    riskLevel = 'CRITICAL';
    riskReason = `Critical surface displacement (${disp.toFixed(2)} mm) exceeds limit (1.50 mm).`;
  } else if (anomalyScore >= 85 && Math.abs(tiltRate || 0) > 0.05) {
    riskLevel = 'CRITICAL';
    riskReason = `Severe dynamic deformation rate (${(tiltRate || 0).toFixed(3)}°/s, Anomaly: ${anomalyScore}/100).`;
  } else if (tiltAngle >= 1.00) {
    riskLevel = 'WARNING';
    riskReason = `Elevated surface tilt (${tiltAngle.toFixed(2)}°) in advisory warning range (1.00°–2.00°).`;
  } else if (disp >= 0.50) {
    riskLevel = 'WARNING';
    riskReason = `Moderate displacement (${disp.toFixed(2)} mm) above baseline.`;
  } else if (anomalyScore >= 50 && Math.abs(tiltRate || 0) > 0.005) {
    riskLevel = 'WARNING';
    riskReason = `Statistical anomaly detected (Score: ${anomalyScore}/100) with surface rate of change.`;
  } else {
    riskLevel = 'SAFE';
    riskReason = 'Nominal ground strata behavior within baseline bounds';
  }

  return {
    node_id: canonicalId,
    ai_anomaly_score: anomalyScore,
    raw_decision_function: ifResult.rawDecision,
    risk_level: riskLevel,
    risk_reason: riskReason,
    ai_status: 'ACTIVE',
    ai_updated_at: now,
    is_calibrated: true,
    features: featureDict,
    disclaimer: 'Prototype diagnostic indicator. NOT a probability of mine failure.'
  };
}

module.exports = {
  processTelemetry,
  setNodeBaseline,
  getNodeBaseline,
  resetNodeBuffers,
  evaluateIsolationForest,
  CANONICAL_FEATURES
};
