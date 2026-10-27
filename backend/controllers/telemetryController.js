/**
 * Telemetry, Risk & Sensor Controller
 * Handles REST requests for telemetry ingestion, sensor retrieval, alerts, persistent risk analysis, storage diagnostics, and demo simulations.
 */

const { validateTelemetryPayload } = require('../utils/validation');
const { 
  getAllSensors, 
  getSensorById, 
  updateTelemetry, 
  getAllAlerts, 
  acknowledgeAlert,
  resolveAlert,
  resetSensorState,
  N3_DEMO_STEPS 
} = require('../services/sensorService');
const dbService = require('../services/dbService');
const alertDispatchService = require('../services/alertDispatchService');
const auditService = require('../services/auditService');

/**
 * GET /api/health
 * Health check endpoint reporting service status, schema, and database connectivity
 */
function getHealth(req, res) {
  return res.status(200).json({
    status: 'ok',
    service: 'MineGuard Backend',
    version: '1.5.0-live-only',
    mode: 'live-only',
    demoEnabled: false,
    telemetrySchema: 'Canonical ESP32 Multi-Channel (node_id, timestamp, tilt_x, tilt_y, tilt_angle, temperature, vibration, displacement)',
    database: dbService.getHealth(),
    timestamp: new Date().toISOString()
  });
}

/**
 * GET /api/sensors
 * Return all registered prototype sensor nodes
 */
function getSensors(req, res) {
  const sensors = getAllSensors();
  return res.status(200).json({
    success: true,
    count: sensors.length,
    sensors
  });
}

/**
 * GET /api/sensors/:nodeId
 * Return a specific sensor by Node ID (e.g. NODE_01, NODE_02, N1, N2)
 */
function getSensor(req, res) {
  const { nodeId } = req.params;
  const sensor = getSensorById(nodeId);

  if (!sensor) {
    return res.status(404).json({
      success: false,
      error: `Sensor node "${nodeId}" not found. Supported prototype nodes: NODE_01, NODE_02, NODE_03, NODE_04 (or N1, N2, N3).`
    });
  }

  return res.status(200).json({
    success: true,
    sensor
  });
}

/**
 * POST /api/telemetry
 * Primary telemetry ingestion endpoint (from ESP32 hardware, mesh gateway, or simulation client)
 */
function postTelemetry(req, res) {
  const { isValid, error, normalized } = validateTelemetryPayload(req.body);
  if (!isValid) {
    return res.status(400).json({
      success: false,
      error
    });
  }

  try {
    const io = req.app.get('io');
    const result = updateTelemetry(normalized, io);

    return res.status(200).json({
      success: true,
      sensor: result.sensor,
      alert: result.alert
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Internal server error while processing telemetry.'
    });
  }
}

/**
 * GET /api/alerts
 * Return all active and recent alerts (merged from database and runtime store)
 */
async function getAlerts(req, res) {
  let alerts = getAllAlerts();

  if (dbService.enabled && dbService.isConnected) {
    try {
      const dbAlertsRes = await dbService.getAlertsHistory({ limit: 50 });
      if (dbAlertsRes?.alerts?.length > 0) {
        const memoryIds = new Set(alerts.map(a => a.id));
        const formattedDbAlerts = dbAlertsRes.alerts.map(row => ({
          id: row.id,
          nodeId: row.node_short_id || row.node_id,
          node_id: row.node_id,
          zone: row.zone,
          severity: row.severity,
          title: row.title,
          message: row.message,
          tilt: row.tilt_value != null ? parseFloat(row.tilt_value) : null,
          anomalyScore: row.anomaly_score,
          standard: row.statutory_standard,
          acknowledged: Boolean(row.acknowledged),
          acknowledgedAt: row.acknowledged_at,
          acknowledgedBy: row.acknowledged_by,
          resolved: Boolean(row.resolved),
          resolvedAt: row.resolved_at,
          resolvedBy: row.resolved_by,
          resolutionNotes: row.resolution_notes,
          queryStatus: row.query_status || (row.resolved ? 'RESOLVED' : (row.acknowledged ? 'ACKNOWLEDGED' : 'OPEN')),
          timestamp: row.created_at
        }));

        for (const dba of formattedDbAlerts) {
          if (!memoryIds.has(dba.id)) {
            alerts.push(dba);
          } else {
            const memAlert = alerts.find(a => a.id === dba.id);
            if (memAlert) {
              if (dba.acknowledged) memAlert.acknowledged = true;
              if (dba.acknowledgedAt) memAlert.acknowledgedAt = dba.acknowledgedAt;
              if (dba.acknowledgedBy) memAlert.acknowledgedBy = dba.acknowledgedBy;
              if (dba.resolved) memAlert.resolved = true;
              if (dba.resolvedAt) memAlert.resolvedAt = dba.resolvedAt;
              if (dba.resolvedBy) memAlert.resolvedBy = dba.resolvedBy;
              if (dba.resolutionNotes) memAlert.resolutionNotes = dba.resolutionNotes;
              if (dba.queryStatus) memAlert.queryStatus = dba.queryStatus;
            }
          }
        }
      }
    } catch (_err) {
      // Non-blocking fallback
    }
  }

  return res.status(200).json({
    success: true,
    count: alerts.filter(a => a.id !== 'ALT-INIT-001').length,
    alerts: alerts.filter(a => a.id !== 'ALT-INIT-001')
  });
}

/**
 * POST /api/alerts/:alertId/acknowledge
 * Acknowledge an alert by ID
 */
function postAcknowledgeAlert(req, res) {
  const { alertId } = req.params;
  const operatorName = req.body?.acknowledgedBy || req.user?.full_name || req.user?.username || 'Authorized Personnel';
  const acknowledged = acknowledgeAlert(alertId, operatorName);

  if (!acknowledged) {
    return res.status(404).json({
      success: false,
      error: `Alert with ID "${alertId}" not found.`
    });
  }

  const io = req.app.get('io');
  if (io) {
    io.emit('alertAcknowledged', acknowledged);
  }

  // Record statutory audit event
  auditService.recordLog({
    user: req.user,
    action: 'ALERT_ACKNOWLEDGE',
    resource: alertId,
    details: { operatorName, severity: acknowledged.severity, nodeId: acknowledged.nodeId },
    ip: req.ip || req.headers['x-forwarded-for'] || '127.0.0.1'
  }).catch(() => {});

  return res.status(200).json({
    success: true,
    message: 'Alert successfully acknowledged and registered in database.',
    alert: acknowledged
  });
}

/**
 * POST /api/alerts/:alertId/resolve
 * Resolve a hazard alert/query with notes, status, and resolution timestamp
 */
function postResolveAlert(req, res) {
  const { alertId } = req.params;
  const resolvedBy = req.body?.resolvedBy || req.user?.full_name || req.user?.username || 'Authorized Personnel';
  const resolutionNotes = req.body?.resolutionNotes || req.body?.notes || 'Geotechnical anomaly reviewed and cleared.';

  const resolved = resolveAlert(alertId, resolvedBy, resolutionNotes);

  if (!resolved) {
    return res.status(404).json({
      success: false,
      error: `Alert with ID "${alertId}" not found.`
    });
  }

  const io = req.app.get('io');
  if (io) {
    io.emit('alertResolved', resolved);
  }

  // Record statutory audit event
  auditService.recordLog({
    user: req.user,
    action: 'ALERT_RESOLVE',
    resource: alertId,
    details: { resolvedBy, resolutionNotes, nodeId: resolved.nodeId },
    ip: req.ip || req.headers['x-forwarded-for'] || '127.0.0.1'
  }).catch(() => {});

  return res.status(200).json({
    success: true,
    message: 'Alert query marked as resolved and stored in database.',
    alert: resolved
  });
}

/**
 * GET /api/history
 * Query historical telemetry time-series points (1h, 6h, 24h, 7d)
 */
async function getTelemetryHistory(req, res) {
  try {
    const { range = '24h', nodeId = 'all', limit = 1000, downsample = 'true' } = req.query;
    const history = await dbService.getTelemetryHistory({
      range,
      nodeId,
      limit: Math.min(parseInt(limit, 10) || 1000, 3000),
      downsample: downsample !== 'false'
    });
    return res.status(200).json(history);
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to query telemetry history.'
    });
  }
}

/**
 * GET /api/history/stats
 * Query aggregate telemetry statistics
 */
async function getTelemetryStats(req, res) {
  try {
    const { range = '24h', nodeId = 'all' } = req.query;
    const stats = await dbService.getTelemetryStats({ range, nodeId });
    return res.status(200).json(stats);
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to query telemetry statistics.'
    });
  }
}

/**
 * GET /api/history/risk
 * Query historical AI anomaly & risk analysis progression over time
 */
async function getRiskHistory(req, res) {
  try {
    const { range = '24h', nodeId = 'all', riskLevel = 'all', limit = 500, downsample = 'true' } = req.query;
    const history = await dbService.getRiskHistory({
      range,
      nodeId,
      riskLevel,
      limit: Math.min(parseInt(limit, 10) || 500, 2000),
      downsample: downsample !== 'false'
    });
    return res.status(200).json(history);
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to query risk history.'
    });
  }
}

/**
 * GET /api/history/risk/latest
 * Query latest persistent risk analysis for all registered nodes
 */
async function getLatestRisk(req, res) {
  try {
    const latest = await dbService.getLatestRiskPerNode();
    return res.status(200).json(latest);
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to query latest risk assessments.'
    });
  }
}

/**
 * GET /api/history/risk/stats
 * Query aggregate risk statistics
 */
async function getRiskStats(req, res) {
  try {
    const { range = '24h', nodeId = 'all' } = req.query;
    const stats = await dbService.getRiskStats({ range, nodeId });
    return res.status(200).json(stats);
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to query risk statistics.'
    });
  }
}

/**
 * GET /api/history/risk/:riskId
 * Query full diagnostic details & 16-feature snapshot for a specific historical risk event
 */
async function getRiskDetail(req, res) {
  try {
    const { riskId } = req.params;
    const detail = await dbService.getRiskDetailById(riskId);
    if (!detail) {
      return res.status(404).json({
        success: false,
        error: `Risk analysis record with ID ${riskId} not found.`
      });
    }
    return res.status(200).json({
      success: true,
      risk: detail
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to query risk detail.'
    });
  }
}

/**
 * GET /api/history/storage
 * Query database storage diagnostics & multi-node scaling estimates
 */
async function getStorageEstimates(req, res) {
  try {
    const diagnostics = await dbService.getStorageEstimates();
    return res.status(200).json(diagnostics);
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to retrieve storage estimates.'
    });
  }
}

/**
 * POST /api/history/aggregate
 * Trigger 1-minute aggregation manually
 */
async function postRunAggregation(req, res) {
  try {
    const { lookbackMinutes = 120 } = req.body || {};
    const result = await dbService.runAggregation(lookbackMinutes);
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to run aggregation.'
    });
  }
}

/**
 * POST /api/history/prune
 * Trigger retention cleanup manually
 */
async function postRunPruning(req, res) {
  try {
    const { rawRetentionHours, aggregateRetentionDays, riskRetentionDays } = req.body || {};
    const result = await dbService.runPruning({ rawRetentionHours, aggregateRetentionDays, riskRetentionDays });
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to run pruning.'
    });
  }
}

/**
 * GET /api/history/alerts
 * Query persistent historical alerts
 */
async function getAlertsHistory(req, res) {
  try {
    const { range = '7d', severity = 'all', limit = 100 } = req.query;
    const alertsData = await dbService.getAlertsHistory({
      range,
      severity,
      limit: parseInt(limit, 10) || 100
    });
    return res.status(200).json(alertsData);
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to query alert history.'
    });
  }
}

/**
 * POST /api/demo/simulate
 * Run synthetic demonstration progression for N3
 */
function postSimulateDemo(req, res) {
  const io = req.app.get('io');
  const { step, autoRun = false, intervalMs = 1500 } = req.body || {};

  if (step !== undefined && typeof step === 'number') {
    const stepData = N3_DEMO_STEPS[Math.min(Math.max(0, step), N3_DEMO_STEPS.length - 1)];
    const result = updateTelemetry({
      node_id: 'NODE_03',
      nodeId: 'N3',
      tilt: stepData.tilt,
      tilt_angle: stepData.tilt,
      displacement: stepData.displacement,
      vibration: stepData.vibration,
      temperature: stepData.temperature || 28.0,
      crackDetected: stepData.tilt > 2.0
    }, io);

    return res.status(200).json({
      success: true,
      mode: 'DEMO SIMULATION — SYNTHETIC DATA',
      currentStep: stepData,
      sensor: result.sensor
    });
  }

  if (autoRun) {
    let currentStepIdx = 0;
    const simInterval = setInterval(() => {
      if (currentStepIdx >= N3_DEMO_STEPS.length) {
        clearInterval(simInterval);
        return;
      }

      const stepData = N3_DEMO_STEPS[currentStepIdx];
      updateTelemetry({
        node_id: 'NODE_03',
        nodeId: 'N3',
        tilt: stepData.tilt,
        tilt_angle: stepData.tilt,
        displacement: stepData.displacement,
        vibration: stepData.vibration,
        temperature: stepData.temperature || 28.0,
        crackDetected: stepData.tilt > 2.0
      }, io);

      currentStepIdx++;
    }, intervalMs);

    return res.status(200).json({
      success: true,
      mode: 'DEMO SIMULATION — SYNTHETIC DATA',
      message: `Started auto-run progression across ${N3_DEMO_STEPS.length} steps (${intervalMs}ms intervals).`,
      steps: N3_DEMO_STEPS
    });
  }

  return res.status(200).json({
    success: true,
    mode: 'DEMO SIMULATION — SYNTHETIC DATA',
    message: 'Simulation endpoint ready. Provide { "step": 0..7 } or { "autoRun": true }.',
    availableSteps: N3_DEMO_STEPS
  });
}

/**
 * POST /api/demo/reset
 * Reset all nodes to initial demonstration baseline
 */
function postResetDemo(req, res) {
  const io = req.app.get('io');
  const sensors = resetSensorState();

  if (io) {
    sensors.forEach(s => io.emit('sensorUpdate', s));
  }

  return res.status(200).json({
    success: true,
    mode: 'DEMO SIMULATION — SYNTHETIC DATA',
    message: 'All sensor nodes reset to baseline demonstration state.',
    sensors
  });
}

/**
 * GET /api/alerts/dispatches
 * Retrieve dispatch history audit logs
 */
function getAlertDispatches(req, res) {
  try {
    const dispatches = alertDispatchService.getDispatchHistory(req.query);
    return res.status(200).json({
      success: true,
      total: dispatches.length,
      dispatches
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to retrieve alert dispatches.'
    });
  }
}

/**
 * GET /api/alerts/dispatch-config
 * Retrieve notification channels and dispatch settings
 */
function getDispatchConfig(req, res) {
  try {
    const dispatchConfig = alertDispatchService.getDispatchConfig();
    return res.status(200).json({
      success: true,
      config: dispatchConfig
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to retrieve dispatch configuration.'
    });
  }
}

/**
 * POST /api/alerts/dispatch-config
 * Update notification dispatch configuration
 */
function postUpdateDispatchConfig(req, res) {
  try {
    const updated = alertDispatchService.updateDispatchConfig(req.body);

    auditService.recordLog({
      user: req.user,
      action: 'DISPATCH_CONFIG_UPDATE',
      resource: 'ALERT_DISPATCH_CONFIG',
      details: req.body,
      ip: req.ip || req.headers['x-forwarded-for'] || '127.0.0.1'
    }).catch(() => {});

    return res.status(200).json({
      success: true,
      config: updated
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to update dispatch configuration.'
    });
  }
}

/**
 * POST /api/alerts/test-dispatch
 * Send an isolated test notification to verify delivery channels
 */
async function postTestDispatch(req, res) {
  try {
    const { channel = 'email', recipient = null } = req.body || {};
    const result = await alertDispatchService.sendTestNotification(channel, recipient);

    auditService.recordLog({
      user: req.user,
      action: 'TEST_DISPATCH_TRIGGER',
      resource: channel.toUpperCase(),
      details: { channel, recipient: result.recipient, status: result.status },
      ip: req.ip || req.headers['x-forwarded-for'] || '127.0.0.1'
    }).catch(() => {});

    return res.status(200).json({
      success: true,
      result
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to send test dispatch.'
    });
  }
}

module.exports = {
  getHealth,
  getSensors,
  getSensor,
  postTelemetry,
  getAlerts,
  postAcknowledgeAlert,
  postResolveAlert,
  getTelemetryHistory,
  getTelemetryStats,
  getRiskHistory,
  getLatestRisk,
  getRiskStats,
  getRiskDetail,
  getStorageEstimates,
  postRunAggregation,
  postRunPruning,
  getAlertsHistory,
  postSimulateDemo,
  postResetDemo,
  getAlertDispatches,
  getDispatchConfig,
  postUpdateDispatchConfig,
  postTestDispatch
};
