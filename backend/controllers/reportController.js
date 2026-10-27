/**
 * MineGuard Statutory Compliance Report Controller
 * Smart India Hackathon 2026 (Problem Statement 26025)
 *
 * Implements statutory export endpoints for DGMS safety audits:
 * - Formats: CSV (RFC 4180) and JSON
 * - Report Types: 'alerts' (Alarm & Query Resolution), 'audit' (Immutable Event Log), 'forecast' (Knothe Forward Predictions), 'telemetry' (Sensor Readings)
 * - Automatic audit logging for every export attempt
 */

const auditService = require('../services/auditService');
const sensorService = require('../services/sensorService');
const alertDispatchService = require('../services/alertDispatchService');
const geotechnicalService = require('../services/geotechnicalService');

/**
 * Helper to escape string for CSV
 */
function escapeCsv(val) {
  if (val === null || val === undefined) return '""';
  const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
  return `"${str.replace(/"/g, '""')}"`;
}

/**
 * GET /api/reports/export
 * Query params: type (alerts|audit|forecast|telemetry), format (csv|json)
 */
async function exportComplianceReport(req, res) {
  try {
    const type = (req.query.type || 'alerts').toLowerCase();
    const format = (req.query.format || 'csv').toLowerCase();

    const timestamp = new Date().toISOString();
    const dateStamp = timestamp.replace(/[:.]/g, '-');

    let data = [];
    let csvHeader = '';
    let csvRows = [];
    let filename = `mineguard_${type}_report_${dateStamp}.${format}`;

    // 1. ALERTS COMPLIANCE EXPORT
    if (type === 'alerts') {
      const allAlerts = sensorService.getAllAlerts();
      data = allAlerts;

      csvHeader = [
        'Alert ID',
        'Node ID',
        'Severity',
        'Detection Timestamp',
        'Tilt (°)',
        'AI Anomaly Score',
        'Acknowledged',
        'Acknowledged By',
        'Acknowledged At',
        'Resolved',
        'Resolved By',
        'Resolved At',
        'Resolution Notes',
        'DGMS Query Status'
      ].join(',');

      csvRows = allAlerts.map(a => [
        escapeCsv(a.id),
        escapeCsv(a.nodeId),
        escapeCsv(a.severity),
        escapeCsv(a.timestamp),
        escapeCsv(a.value ?? a.tilt_value),
        escapeCsv(a.ai_anomaly_score),
        escapeCsv(a.acknowledged ? 'YES' : 'NO'),
        escapeCsv(a.acknowledgedBy || '—'),
        escapeCsv(a.acknowledgedAt || '—'),
        escapeCsv(a.resolved ? 'YES' : 'NO'),
        escapeCsv(a.resolvedBy || '—'),
        escapeCsv(a.resolvedAt || '—'),
        escapeCsv(a.resolutionNotes || '—'),
        escapeCsv(a.queryStatus || (a.resolved ? 'RESOLVED' : a.acknowledged ? 'ACKNOWLEDGED' : 'OPEN'))
      ].join(','));
    } 
    // 2. AUDIT TRAIL EXPORT
    else if (type === 'audit') {
      const logsResult = await auditService.getLogs({ limit: 200 });
      data = logsResult.logs || [];

      csvHeader = [
        'Audit Log ID',
        'Timestamp (UTC)',
        'Username',
        'Role',
        'Action Type',
        'Target Resource',
        'Details',
        'IP Address'
      ].join(',');

      csvRows = data.map(l => [
        escapeCsv(l.id),
        escapeCsv(l.timestamp),
        escapeCsv(l.username),
        escapeCsv(l.role),
        escapeCsv(l.action),
        escapeCsv(l.resource),
        escapeCsv(l.details),
        escapeCsv(l.ip)
      ].join(','));
    } 
    // 3. GEOTECHNICAL FORECAST EXPORT
    else if (type === 'forecast') {
      const forecast = geotechnicalService.generateForwardForecast(
        geotechnicalService.DEFAULT_MINE_PARAMETERS,
        { nodeId: 'N3', currentTiltDeg: 2.41, currentDispMm: 2.16 }
      );
      data = forecast;

      csvHeader = [
        'Forecast Model',
        'Milestone Time',
        'Milestone Hours',
        'Expected Subsidence (mm)',
        'P10 Lower Bound (mm)',
        'P90 Upper Bound (mm)',
        'Confidence Interval (mm)',
        'Predicted Surface Tilt (°)',
        'Predicted Horizontal Strain (mm/m)',
        'DGMS Safety Status'
      ].join(',');

      const milestoneList = Object.values(forecast.milestones || {});
      csvRows = milestoneList.map(m => [
        escapeCsv(forecast.modelMetadata?.modelName || 'Knothe Time-Function'),
        escapeCsv(m.label),
        escapeCsv(m.hours),
        escapeCsv(m.expectedSubsidenceMm),
        escapeCsv(m.p10LowerBoundMm),
        escapeCsv(m.p90UpperBoundMm),
        escapeCsv(m.confidenceIntervalMm),
        escapeCsv(m.predictedTiltDegrees),
        escapeCsv(m.predictedStrainMmPerM),
        escapeCsv(m.status)
      ].join(','));
    } 
    // 4. TELEMETRY READINGS EXPORT
    else {
      const sensors = sensorService.getAllSensors();
      data = sensors;

      csvHeader = [
        'Node ID',
        'Status',
        'Surface Tilt (°)',
        'Displacement (mm)',
        'Temperature (°C)',
        'Vibration (g)',
        'AI Anomaly Score',
        'Online Status',
        'Last Seen'
      ].join(',');

      csvRows = sensors.map(s => [
        escapeCsv(s.id || s.nodeId),
        escapeCsv(s.status),
        escapeCsv(s.tilt),
        escapeCsv(s.displacement),
        escapeCsv(s.temperature),
        escapeCsv(s.vibration),
        escapeCsv(s.anomalyScore || s.ai_anomaly_score),
        escapeCsv(s.online ? 'ONLINE' : 'OFFLINE'),
        escapeCsv(s.lastSeen || s.timestamp)
      ].join(','));
    }

    // Record audit event for the compliance report export
    auditService.recordLog({
      user: req.user || { username: 'auditor', role: 'regulator' },
      action: 'REPORT_EXPORT',
      resource: `EXPORT_${type.toUpperCase()}`,
      details: { reportType: type, format, recordCount: data.length },
      ip: req.ip || '127.0.0.1'
    }).catch(() => {});

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.status(200).json({
        success: true,
        reportType: type,
        exportedAt: timestamp,
        statutoryDirective: 'DGMS Circular No. 3 (1998) — Surface Subsidence Control Protocol',
        colliery: 'Moonidih Colliery • Panel P-4',
        recordCount: Array.isArray(data) ? data.length : 1,
        data
      });
    }

    // CSV Output with statutory disclaimer header
    const statutoryBanner = [
      '# MINEGUARD AUTONOMOUS SUBSIDENCE MONITORING PLATFORM',
      '# STATUTORY AUDIT & COMPLIANCE DATA EXPORT',
      `# Export Timestamp: ${timestamp}`,
      `# Colliery: Moonidih Colliery • Longwall Extraction Panel P-4 (XVI Seam)`,
      `# Statutory Regulatory Directive: DGMS Circular No. 3 of 1998`,
      `# Data Type: ${type.toUpperCase()}`,
      ''
    ].join('\n');

    const csvContent = `${statutoryBanner}\n${csvHeader}\n${csvRows.join('\n')}\n`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(csvContent);

  } catch (err) {
    return res.status(500).json({
      success: false,
      error: `Failed to generate compliance export: ${err.message}`
    });
  }
}

/**
 * GET /api/audit/logs
 * Retrieve audit log events with role checking
 */
async function getAuditLogs(req, res) {
  try {
    const { action, role, username, limit, offset } = req.query;
    const result = await auditService.getLogs({ action, role, username, limit, offset });
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

module.exports = {
  exportComplianceReport,
  getAuditLogs
};
