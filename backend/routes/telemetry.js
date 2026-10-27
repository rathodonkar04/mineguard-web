const express = require('express');
const router = express.Router();

const {
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
} = require('../controllers/telemetryController');

// 1. Health & Status
router.get('/health', getHealth);

// 2. Sensor State Query Endpoints
router.get('/sensors', getSensors);
router.get('/sensors/:nodeId', getSensor);

// 3. Telemetry Ingestion Endpoints
// - Canonical MineGuard endpoint: POST /api/telemetry
// - Node 3 Hardware Gateway compatibility endpoint: POST /api/readings
router.post('/telemetry', postTelemetry);
router.post('/readings', postTelemetry);

const { requireAuth, optionalAuth, requireRole } = require('../middlewares/authMiddleware');

// 4. Alert Management, Escalation & Dispatch
router.get('/alerts', getAlerts);
router.get('/history/alerts', getAlertsHistory);
router.post('/alerts/:alertId/acknowledge', optionalAuth, postAcknowledgeAlert);
router.post('/alerts/:alertId/resolve', optionalAuth, postResolveAlert);
router.get('/alerts/dispatches', getAlertDispatches);
router.get('/alerts/dispatch-config', getDispatchConfig);
router.post('/alerts/dispatch-config', requireAuth, requireRole(['admin']), postUpdateDispatchConfig);
router.post('/alerts/test-dispatch', optionalAuth, postTestDispatch);

// 5. Persistent Historical Telemetry & Risk Analytics Queries
router.get('/history', getTelemetryHistory);
router.get('/history/stats', getTelemetryStats);
router.get('/history/risk', getRiskHistory);
router.get('/history/risk/latest', getLatestRisk);
router.get('/history/risk/stats', getRiskStats);
router.get('/history/risk/:riskId', getRiskDetail);

// 6. Retention, Aggregation & Storage Diagnostics
router.get('/history/storage', getStorageEstimates);
router.post('/history/aggregate', postRunAggregation);
router.post('/history/prune', postRunPruning);

// 7. Demonstration Simulation Controls
router.post('/demo/simulate', postSimulateDemo);
router.post('/demo/reset', postResetDemo);

module.exports = router;
