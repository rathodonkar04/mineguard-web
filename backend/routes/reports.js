const express = require('express');
const router = express.Router();
const { exportComplianceReport, getAuditLogs } = require('../controllers/reportController');
const { requireAuth, requireRole, optionalAuth } = require('../middlewares/authMiddleware');

// Statutory Report Export (Supports CSV & JSON downloads)
// Accessible by operators, planners, auditors, regulators, and administrators
router.get('/export', optionalAuth, exportComplianceReport);

// Immutable Audit Logs (Restricted to auditors, regulators, and administrators)
router.get('/audit', requireAuth, requireRole(['admin', 'regulator', 'auditor']), getAuditLogs);
router.get('/audit/logs', requireAuth, requireRole(['admin', 'regulator', 'auditor']), getAuditLogs);

module.exports = router;
