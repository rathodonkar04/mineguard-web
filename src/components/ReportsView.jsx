import React, { useState, useEffect, useCallback } from 'react';
import { fetchAuditLogsApi, downloadComplianceReport } from '../api/backendApi';
import AiExplanationPanel from './AiExplanationPanel';

/**
 * Format timestamp into readable localized Indian Standard Time (IST)
 */
function formatTime(isoString) {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  } catch (_e) {
    return isoString;
  }
}

/**
 * ReportsView Component - DGMS Statutory Compliance, Report Exports & Immutable Audit Ledger
 * Smart India Hackathon 2026 (Problem Statement 26025)
 */
export default function ReportsView({ 
  selectedNode = null, 
  riskLevel = 'Normal', 
  currentUser = null 
}) {
  const [activeSubTab, setActiveSubTab] = useState('EXPORTS'); // 'EXPORTS' | 'AUDIT_LOGS' | 'AI_EXPLAIN'
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [filterAction, setFilterAction] = useState('ALL');
  const [filterRole, setFilterRole] = useState('ALL');
  const [downloadingType, setDownloadingType] = useState(null);
  const [exportNotice, setExportNotice] = useState(null);

  // Load audit logs
  const loadLogs = useCallback(async () => {
    setAuditLoading(true);
    try {
      const res = await fetchAuditLogsApi({
        action: filterAction !== 'ALL' ? filterAction : undefined,
        role: filterRole !== 'ALL' ? filterRole : undefined,
        limit: 100
      });
      if (res && res.success && Array.isArray(res.logs)) {
        setAuditLogs(res.logs);
      }
    } catch (_err) {
      // Non-blocking
    } finally {
      setAuditLoading(false);
    }
  }, [filterAction, filterRole]);

  useEffect(() => {
    if (activeSubTab === 'AUDIT_LOGS') {
      loadLogs();
    }
  }, [activeSubTab, loadLogs]);

  // Handle report download
  const handleDownload = async (type, format) => {
    setDownloadingType(`${type}_${format}`);
    setExportNotice(null);
    try {
      const result = await downloadComplianceReport({ type, format });
      if (result.success) {
        setExportNotice({
          success: true,
          message: `Successfully generated statutory ${type.toUpperCase()} compliance export (${format.toUpperCase()}).`
        });
        if (activeSubTab === 'AUDIT_LOGS') {
          loadLogs();
        }
      } else {
        setExportNotice({
          success: false,
          message: result.error || `Failed to export ${type} report.`
        });
      }
    } catch (err) {
      setExportNotice({
        success: false,
        message: err.message || 'Export failed.'
      });
    } finally {
      setDownloadingType(null);
    }
  };

  return (
    <div className="space-y-4 font-sans select-none overflow-hidden">
      {/* Header Banner */}
      <div className="bg-[#FFFFFF] p-4 sm:p-5 border border-[#D8D8D5] flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 bg-[#3F7655]"></span>
            <span className="text-[11px] font-mono font-bold tracking-widest text-[#3F7655]">
              DGMS STATUTORY COMPLIANCE &amp; AUDIT DISPATCH
            </span>
          </div>
          <h1 className="text-sm sm:text-base font-bold uppercase tracking-wider text-[#222222]">
            Mine Safety Records, Audit Exports &amp; Regulatory Ledger
          </h1>
          <p className="text-xs text-[#666666] mt-0.5">
            Directorate General of Mines Safety (DGMS) Circular No. 3 (1998) • Moonidih Colliery Panel P-4
          </p>
        </div>

        {/* Stakeholder Identity Badge */}
        <div className="flex items-center gap-3">
          <div className="bg-[#F7F7F5] border border-[#D8D8D5] px-3 py-1.5 text-right">
            <span className="text-[9px] text-[#888888] uppercase block">Authenticated Role</span>
            <span className="font-mono font-bold text-xs uppercase text-[#222222]">
              {currentUser?.role || 'OPERATOR'} ({currentUser?.full_name || currentUser?.username || 'Guest'})
            </span>
          </div>
        </div>
      </div>

      {/* Primary Sub-Tab Switcher */}
      <div className="flex border-b border-[#D8D8D5] bg-[#FFFFFF] px-4 pt-2 gap-2 text-xs">
        <button
          type="button"
          onClick={() => setActiveSubTab('EXPORTS')}
          className={`pb-2.5 px-3 font-bold uppercase tracking-wider border-b-2 transition-colors flex items-center gap-2 ${
            activeSubTab === 'EXPORTS'
              ? 'border-[#3F4A42] text-[#222222]'
              : 'border-transparent text-[#666666] hover:text-[#222222]'
          }`}
        >
          <span>📥 Statutory Compliance Exports</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('AUDIT_LOGS')}
          className={`pb-2.5 px-3 font-bold uppercase tracking-wider border-b-2 transition-colors flex items-center gap-2 ${
            activeSubTab === 'AUDIT_LOGS'
              ? 'border-[#3F4A42] text-[#222222]'
              : 'border-transparent text-[#666666] hover:text-[#222222]'
          }`}
        >
          <span>🛡️ Immutable Audit Event Ledger</span>
          {auditLogs.length > 0 && (
            <span className="px-1.5 py-0.2 bg-[#F7F7F5] border border-[#D8D8D5] text-[10px] font-mono">
              {auditLogs.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('AI_EXPLAIN')}
          className={`pb-2.5 px-3 font-bold uppercase tracking-wider border-b-2 transition-colors flex items-center gap-2 ${
            activeSubTab === 'AI_EXPLAIN'
              ? 'border-[#3F4A42] text-[#222222]'
              : 'border-transparent text-[#666666] hover:text-[#222222]'
          }`}
        >
          <span>🔬 AI Feature Diagnostics &amp; Risk Weights</span>
        </button>
      </div>

      {/* Export Notification Banner */}
      {exportNotice && (
        <div className={`p-3 border text-xs flex items-center justify-between ${
          exportNotice.success
            ? 'bg-[#F0FDF4] border-[#BBF7D0] text-[#3F7655]'
            : 'bg-[#FDF2F2] border-[#F3C5C5] text-[#A84444]'
        }`}>
          <span>{exportNotice.message}</span>
          <button
            type="button"
            onClick={() => setExportNotice(null)}
            className="font-mono text-[11px] underline ml-2"
          >
            DISMISS
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-VIEW 1: STATUTORY EXPORT STATION */}
      {/* ========================================================================= */}
      {activeSubTab === 'EXPORTS' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          
          {/* Card 1: Alert Register & Resolution Records */}
          <div className="bg-[#FFFFFF] border border-[#D8D8D5] p-5 flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="px-2 py-0.5 bg-[#FDF2F2] text-[#A84444] border border-[#F3C5C5] font-mono text-[10px] font-bold">
                  INCIDENT LOG
                </span>
                <span className="text-[10px] text-[#888888] font-mono">DGMS CIR 3/1998</span>
              </div>
              <h2 className="text-sm font-bold uppercase tracking-wide text-[#222222]">
                Alarm &amp; Query Resolution Register
              </h2>
              <p className="text-xs text-[#666666] mt-1">
                Complete historical record of critical deformation triggers, operator acknowledgment timestamps, and mitigation notes.
              </p>
              <div className="mt-3 p-2.5 bg-[#F7F7F5] border border-[#EAEAE7] text-[11px] space-y-1 text-[#555555]">
                <div>• Format: RFC 4180 CSV / Structured JSON</div>
                <div>• Fields: Alert ID, Node ID, Severity, Tilt, Acknowledged By/At, Resolved By/At, Notes</div>
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t border-[#EAEAE7]">
              <button
                type="button"
                disabled={downloadingType === 'alerts_csv'}
                onClick={() => handleDownload('alerts', 'csv')}
                className="flex-1 px-3 py-2 bg-[#3F4A42] hover:bg-[#323B35] disabled:bg-[#888888] text-[#FFFFFF] text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
              >
                <span>{downloadingType === 'alerts_csv' ? 'EXPORTING...' : '📥 DOWNLOAD CSV'}</span>
              </button>
              <button
                type="button"
                disabled={downloadingType === 'alerts_json'}
                onClick={() => handleDownload('alerts', 'json')}
                className="px-3 py-2 bg-[#FFFFFF] hover:bg-[#F7F7F5] border border-[#D8D8D5] text-[#222222] text-xs font-bold transition-colors"
              >
                {downloadingType === 'alerts_json' ? 'EXPORTING...' : '📄 JSON'}
              </button>
            </div>
          </div>

          {/* Card 2: Immutable System Audit Ledger */}
          <div className="bg-[#FFFFFF] border border-[#D8D8D5] p-5 flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="px-2 py-0.5 bg-[#FEF9EE] text-[#A87925] border border-[#FDE6B0] font-mono text-[10px] font-bold">
                  GOVERNANCE
                </span>
                <span className="text-[10px] text-[#888888] font-mono">ISO 19749</span>
              </div>
              <h2 className="text-sm font-bold uppercase tracking-wide text-[#222222]">
                Immutable System Audit Trail
              </h2>
              <p className="text-xs text-[#666666] mt-1">
                Cryptographically sequenced ledger of all administrative logins, role changes, alert resolutions, and report downloads.
              </p>
              <div className="mt-3 p-2.5 bg-[#F7F7F5] border border-[#EAEAE7] text-[11px] space-y-1 text-[#555555]">
                <div>• Format: RFC 4180 CSV / Audit JSON</div>
                <div>• Fields: Log ID, Timestamp, Username, Role, Action Type, Target Resource, IP</div>
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t border-[#EAEAE7]">
              <button
                type="button"
                disabled={downloadingType === 'audit_csv'}
                onClick={() => handleDownload('audit', 'csv')}
                className="flex-1 px-3 py-2 bg-[#3F4A42] hover:bg-[#323B35] disabled:bg-[#888888] text-[#FFFFFF] text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
              >
                <span>{downloadingType === 'audit_csv' ? 'EXPORTING...' : '📥 DOWNLOAD CSV'}</span>
              </button>
              <button
                type="button"
                disabled={downloadingType === 'audit_json'}
                onClick={() => handleDownload('audit', 'json')}
                className="px-3 py-2 bg-[#FFFFFF] hover:bg-[#F7F7F5] border border-[#D8D8D5] text-[#222222] text-xs font-bold transition-colors"
              >
                {downloadingType === 'audit_json' ? 'EXPORTING...' : '📄 JSON'}
              </button>
            </div>
          </div>

          {/* Card 3: Geotechnical Knothe Forecast Profile */}
          <div className="bg-[#FFFFFF] border border-[#D8D8D5] p-5 flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="px-2 py-0.5 bg-[#EBF5FB] text-[#2980B9] border border-[#AED6F1] font-mono text-[10px] font-bold">
                  GEOTECHNICAL
                </span>
                <span className="text-[10px] text-[#888888] font-mono">KNOTHE MODEL</span>
              </div>
              <h2 className="text-sm font-bold uppercase tracking-wide text-[#222222]">
                Subsidence Prediction &amp; Transect Profiles
              </h2>
              <p className="text-xs text-[#666666] mt-1">
                Forward-looking strata deformation model, 24h &amp; 7d milestones, asymptotic S_max (1541.1 mm), and P10/P90 sensitivity bounds.
              </p>
              <div className="mt-3 p-2.5 bg-[#F7F7F5] border border-[#EAEAE7] text-[11px] space-y-1 text-[#555555]">
                <div>• Format: RFC 4180 CSV / Geotechnical JSON</div>
                <div>• Fields: Milestone, Expected Subsidence, P10/P90 Bounds, Surface Tilt, Strain</div>
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t border-[#EAEAE7]">
              <button
                type="button"
                disabled={downloadingType === 'forecast_csv'}
                onClick={() => handleDownload('forecast', 'csv')}
                className="flex-1 px-3 py-2 bg-[#3F4A42] hover:bg-[#323B35] disabled:bg-[#888888] text-[#FFFFFF] text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
              >
                <span>{downloadingType === 'forecast_csv' ? 'EXPORTING...' : '📥 DOWNLOAD CSV'}</span>
              </button>
              <button
                type="button"
                disabled={downloadingType === 'forecast_json'}
                onClick={() => handleDownload('forecast', 'json')}
                className="px-3 py-2 bg-[#FFFFFF] hover:bg-[#F7F7F5] border border-[#D8D8D5] text-[#222222] text-xs font-bold transition-colors"
              >
                {downloadingType === 'forecast_json' ? 'EXPORTING...' : '📄 JSON'}
              </button>
            </div>
          </div>

          {/* Card 4: Sensor Telemetry Time-Series */}
          <div className="bg-[#FFFFFF] border border-[#D8D8D5] p-5 flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="px-2 py-0.5 bg-[#F0FDF4] text-[#3F7655] border border-[#BBF7D0] font-mono text-[10px] font-bold">
                  TELEMETRY
                </span>
                <span className="text-[10px] text-[#888888] font-mono">1 HZ SENSOR GRID</span>
              </div>
              <h2 className="text-sm font-bold uppercase tracking-wide text-[#222222]">
                Surface Inclinometer Telemetry Stream
              </h2>
              <p className="text-xs text-[#666666] mt-1">
                Multi-channel sensor measurements from Nodes N1–N4 across Moonidih extraction panel P-4.
              </p>
              <div className="mt-3 p-2.5 bg-[#F7F7F5] border border-[#EAEAE7] text-[11px] space-y-1 text-[#555555]">
                <div>• Format: RFC 4180 CSV / High-Res JSON</div>
                <div>• Fields: Node ID, Tilt, Displacement, Temperature, Vibration, Anomaly Score</div>
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t border-[#EAEAE7]">
              <button
                type="button"
                disabled={downloadingType === 'telemetry_csv'}
                onClick={() => handleDownload('telemetry', 'csv')}
                className="flex-1 px-3 py-2 bg-[#3F4A42] hover:bg-[#323B35] disabled:bg-[#888888] text-[#FFFFFF] text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
              >
                <span>{downloadingType === 'telemetry_csv' ? 'EXPORTING...' : '📥 DOWNLOAD CSV'}</span>
              </button>
              <button
                type="button"
                disabled={downloadingType === 'telemetry_json'}
                onClick={() => handleDownload('telemetry', 'json')}
                className="px-3 py-2 bg-[#FFFFFF] hover:bg-[#F7F7F5] border border-[#D8D8D5] text-[#222222] text-xs font-bold transition-colors"
              >
                {downloadingType === 'telemetry_json' ? 'EXPORTING...' : '📄 JSON'}
              </button>
            </div>
          </div>

        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-VIEW 2: IMMUTABLE AUDIT EVENT LEDGER */}
      {/* ========================================================================= */}
      {activeSubTab === 'AUDIT_LOGS' && (
        <div className="bg-[#FFFFFF] border border-[#D8D8D5] p-4 sm:p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#EAEAE7]">
            <div>
              <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-[#222222]">
                Statutory Event &amp; Action Audit Trail
              </h2>
              <p className="text-[11px] text-[#666666]">
                Immutable server-side record of logins, alert acknowledgments, query resolutions, parameter simulations, and exports
              </p>
            </div>

            {/* Filter Controls */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <select
                value={filterAction}
                onChange={(e) => setFilterAction(e.target.value)}
                className="px-2 py-1 border border-[#D8D8D5] bg-[#FFFFFF] text-xs"
              >
                <option value="ALL">All Actions</option>
                <option value="USER_LOGIN">USER_LOGIN</option>
                <option value="USER_REGISTER">USER_REGISTER</option>
                <option value="ALERT_ACKNOWLEDGE">ALERT_ACKNOWLEDGE</option>
                <option value="ALERT_RESOLVE">ALERT_RESOLVE</option>
                <option value="DISPATCH_CONFIG_UPDATE">DISPATCH_CONFIG_UPDATE</option>
                <option value="TEST_DISPATCH_TRIGGER">TEST_DISPATCH_TRIGGER</option>
                <option value="FORECAST_SIMULATION">FORECAST_SIMULATION</option>
                <option value="REPORT_EXPORT">REPORT_EXPORT</option>
              </select>

              <select
                value={filterRole}
                onChange={(e) => setFilterRole(e.target.value)}
                className="px-2 py-1 border border-[#D8D8D5] bg-[#FFFFFF] text-xs"
              >
                <option value="ALL">All Stakeholders</option>
                <option value="admin">Administrator</option>
                <option value="operator">Safety Operator</option>
                <option value="planner">Geotechnical Planner</option>
                <option value="auditor">DGMS Auditor</option>
              </select>

              <button
                type="button"
                disabled={auditLoading}
                onClick={loadLogs}
                className="px-3 py-1 bg-[#3F4A42] hover:bg-[#323B35] disabled:bg-[#888888] text-[#FFFFFF] text-xs font-bold transition-colors"
              >
                {auditLoading ? 'REFRESHING...' : '🔄 REFRESH'}
              </button>
            </div>
          </div>

          {/* Audit Logs Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#F7F7F5] border-b border-[#D8D8D5] text-[10px] text-[#666666] uppercase">
                  <th className="p-2">Timestamp (IST)</th>
                  <th className="p-2">Log ID</th>
                  <th className="p-2">Actor (Role)</th>
                  <th className="p-2">Action</th>
                  <th className="p-2">Target Resource</th>
                  <th className="p-2">Details</th>
                  <th className="p-2">IP Address</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EAEAE7]">
                {auditLogs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-[#888888] italic">
                      No audit events recorded for current filter criteria.
                    </td>
                  </tr>
                ) : (
                  auditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-[#FAFAF9] transition-colors">
                      <td className="p-2 font-mono text-[11px] whitespace-nowrap">
                        {formatTime(log.timestamp)}
                      </td>
                      <td className="p-2 font-mono text-[10px] text-[#888888]">
                        {log.id}
                      </td>
                      <td className="p-2">
                        <div className="font-semibold text-[#222222]">{log.username}</div>
                        <span className={`inline-block px-1 py-0.2 text-[9px] uppercase font-mono font-bold border ${
                          log.role === 'admin'
                            ? 'bg-[#FDF2F2] border-[#F3C5C5] text-[#A84444]'
                            : log.role === 'operator'
                            ? 'bg-[#F0FDF4] border-[#BBF7D0] text-[#3F7655]'
                            : log.role === 'planner'
                            ? 'bg-[#EBF5FB] border-[#AED6F1] text-[#2980B9]'
                            : 'bg-[#FEF9EE] border-[#FDE6B0] text-[#A87925]'
                        }`}>
                          {log.role}
                        </span>
                      </td>
                      <td className="p-2 font-mono text-[11px] font-bold text-[#3F4A42]">
                        {log.action}
                      </td>
                      <td className="p-2 font-mono text-[11px] text-[#444444]">
                        {log.resource}
                      </td>
                      <td className="p-2 font-mono text-[10px] text-[#666666] max-w-[240px] truncate" title={JSON.stringify(log.details)}>
                        {typeof log.details === 'object' ? JSON.stringify(log.details) : String(log.details)}
                      </td>
                      <td className="p-2 font-mono text-[10px] text-[#888888]">
                        {log.ip}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-VIEW 3: AI EXPLANATION & FEATURE WEIGHTS */}
      {/* ========================================================================= */}
      {activeSubTab === 'AI_EXPLAIN' && (
        <AiExplanationPanel 
          selectedNode={selectedNode}
          riskLevel={riskLevel}
        />
      )}

      {/* Footer DGMS Circular */}
      <div className="p-3 bg-[#F7F7F5] border border-[#D8D8D5] text-[11px] text-[#666666] flex flex-wrap items-center justify-between gap-2">
        <div>Statutory Protocol: DGMS Circular No. 3 (1998) — Automated Record Retention &amp; Compliance Submission</div>
        <div>Standard: ISO 19749 Geotechnical Array • Cryptographic Audit Trail</div>
      </div>
    </div>
  );
}
