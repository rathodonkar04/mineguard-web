import React, { useState, useEffect, useCallback } from 'react';
import { 
  fetchAlertDispatches, 
  fetchDispatchConfig, 
  triggerTestDispatch 
} from '../api/backendApi';
import { sirenManager } from '../utils/sirenAudio';

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
 * AlertCenterView Component - Industrial Alarm Center, Statutory Query Resolution,
 * and Automated Multi-Channel Alert Delivery & Escalation Engine.
 * Smart India Hackathon 2026 (Problem Statement 26025)
 */
export default function AlertCenterView({ 
  alerts = [], 
  nodes = [], 
  currentUser = null,
  isSirenPlaying = false,
  isSirenMuted = false,
  onToggleSirenMute = null,
  onAcknowledgeAlert, 
  onResolveAlert, 
  onSelectNode 
}) {
  // Navigation sub-tab: 'ALERTS' (Alarm & Query Register) | 'DISPATCH' (Automated Delivery & Escalation)
  const [activeSubTab, setActiveSubTab] = useState('ALERTS');
  const [filter, setFilter] = useState('ALL'); // 'ALL' | 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED'
  const [activeResolveAlertId, setActiveResolveAlertId] = useState(null);
  const [resolutionInput, setResolutionInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Phase 3: Automated Dispatch State
  const [dispatchLogs, setDispatchLogs] = useState([]);
  const [dispatchConfig, setDispatchConfig] = useState(null);
  const [dispatchLoading, setDispatchLoading] = useState(false);
  const [dispatchFilter, setDispatchFilter] = useState('ALL'); // 'ALL' | 'EMAIL' | 'SMS'
  const [testResult, setTestResult] = useState(null);
  const [testingChannel, setTestingChannel] = useState(null);
  const [isAcousticTesting, setIsAcousticTesting] = useState(false);

  const n2Node = nodes.find(n => n.id === 'N2');
  const n3Node = nodes.find(n => n.id === 'N3');

  // Find backend alert state if already persisted
  const backendN3Alert = alerts.find(a => a.id === 'ALT-N3-CRIT' || (a.nodeId === 'N3' && a.severity === 'Critical'));
  const backendN2Alert = alerts.find(a => a.id === 'ALT-N2-WARN' || (a.nodeId === 'N2' && a.severity === 'Warning'));

  const rawAlertItems = [
    ...(n3Node && n3Node.status === 'Critical' ? [{
      id: backendN3Alert?.id || 'ALT-N3-CRIT',
      nodeId: 'N3',
      zone: 'Zone C',
      type: 'CRITICAL DEFORMATION',
      severity: 'Critical',
      color: '#A84444',
      details: `Tilt escalated to ${n3Node.tilt.toFixed(2)}° (Breached limit 2.00°)`,
      anomalyScore: n3Node.anomalyScore || 96,
      primaryIndicator: 'Increasing surface tilt & high angular velocity',
      timestamp: backendN3Alert?.timestamp || n3Node.timestamp || new Date().toISOString(),
      acknowledged: Boolean(backendN3Alert?.acknowledged),
      acknowledgedAt: backendN3Alert?.acknowledgedAt || null,
      acknowledgedBy: backendN3Alert?.acknowledgedBy || null,
      resolved: Boolean(backendN3Alert?.resolved),
      resolvedAt: backendN3Alert?.resolvedAt || null,
      resolvedBy: backendN3Alert?.resolvedBy || null,
      resolutionNotes: backendN3Alert?.resolutionNotes || '',
      queryStatus: backendN3Alert?.queryStatus || (backendN3Alert?.resolved ? 'RESOLVED' : (backendN3Alert?.acknowledged ? 'ACKNOWLEDGED' : 'OPEN'))
    }] : []),
    ...(n2Node && n2Node.status === 'Warning' ? [{
      id: backendN2Alert?.id || 'ALT-N2-WARN',
      nodeId: 'N2',
      zone: 'Zone B',
      type: 'MODERATE DEFORMATION',
      severity: 'Warning',
      color: '#A87925',
      details: `Tilt increased from 0.42° to ${n2Node.tilt.toFixed(2)}°`,
      anomalyScore: n2Node.anomalyScore || 72,
      primaryIndicator: 'Increasing surface tilt',
      timestamp: backendN2Alert?.timestamp || n2Node.timestamp || new Date().toISOString(),
      acknowledged: Boolean(backendN2Alert?.acknowledged),
      acknowledgedAt: backendN2Alert?.acknowledgedAt || null,
      acknowledgedBy: backendN2Alert?.acknowledgedBy || null,
      resolved: Boolean(backendN2Alert?.resolved),
      resolvedAt: backendN2Alert?.resolvedAt || null,
      resolvedBy: backendN2Alert?.resolvedBy || null,
      resolutionNotes: backendN2Alert?.resolutionNotes || '',
      queryStatus: backendN2Alert?.queryStatus || (backendN2Alert?.resolved ? 'RESOLVED' : (backendN2Alert?.acknowledged ? 'ACKNOWLEDGED' : 'OPEN'))
    }] : []),
    ...alerts.filter(a => a.id !== 'ALT-N3-CRIT' && a.id !== 'ALT-N2-WARN').map(a => ({
      id: a.id,
      nodeId: a.nodeId || 'N3',
      zone: a.zone || 'Zone C',
      type: a.severity === 'Critical' ? 'CRITICAL DEFORMATION' : 'MODERATE DEFORMATION',
      severity: a.severity || 'Warning',
      color: a.severity === 'Critical' ? '#A84444' : '#A87925',
      details: a.message || a.title || 'Geotechnical anomaly detected',
      anomalyScore: a.anomalyScore || 85,
      primaryIndicator: 'Surface angular change',
      timestamp: a.timestamp || a.created_at || new Date().toISOString(),
      acknowledged: Boolean(a.acknowledged),
      acknowledgedAt: a.acknowledgedAt || a.acknowledged_at || null,
      acknowledgedBy: a.acknowledgedBy || a.acknowledged_by || null,
      resolved: Boolean(a.resolved),
      resolvedAt: a.resolvedAt || a.resolved_at || null,
      resolvedBy: a.resolvedBy || a.resolved_by || null,
      resolutionNotes: a.resolutionNotes || a.resolution_notes || '',
      queryStatus: a.queryStatus || a.query_status || (a.resolved ? 'RESOLVED' : (a.acknowledged ? 'ACKNOWLEDGED' : 'OPEN'))
    }))
  ];

  // Deduplicate by ID
  const alertMap = new Map();
  for (const item of rawAlertItems) {
    if (!alertMap.has(item.id)) {
      alertMap.set(item.id, item);
    }
  }
  const allAlerts = Array.from(alertMap.values());

  // Filter items
  const filteredAlerts = allAlerts.filter(a => {
    if (filter === 'ALL') return true;
    if (filter === 'OPEN') return !a.acknowledged && !a.resolved;
    if (filter === 'ACKNOWLEDGED') return a.acknowledged && !a.resolved;
    if (filter === 'RESOLVED') return a.resolved;
    return true;
  });

  const countOpen = allAlerts.filter(a => !a.acknowledged && !a.resolved).length;
  const countAck = allAlerts.filter(a => a.acknowledged && !a.resolved).length;
  const countResolved = allAlerts.filter(a => a.resolved).length;

  // Load dispatch configuration & history
  const loadDispatchData = useCallback(async () => {
    setDispatchLoading(true);
    try {
      const [logsRes, cfgRes] = await Promise.all([
        fetchAlertDispatches({ limit: 50 }),
        fetchDispatchConfig()
      ]);
      const rawList = logsRes?.dispatches || logsRes?.logs || [];
      if (logsRes && logsRes.success && Array.isArray(rawList)) {
        setDispatchLogs(rawList);
      }
      if (cfgRes && cfgRes.success && cfgRes.config) {
        setDispatchConfig(cfgRes.config);
      }
    } catch (_err) {
      // Non-blocking
    } finally {
      setDispatchLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDispatchData();
  }, [loadDispatchData]);

  // Handle manual test dispatch trigger
  const handleTriggerTest = async (channel) => {
    setTestingChannel(channel);
    setTestResult(null);
    try {
      const response = await triggerTestDispatch({ channel });
      if (response && response.ok && response.data?.result) {
        setTestResult({
          success: true,
          channel,
          result: response.data.result,
          message: `Simulated ${channel} notification dispatched to ${response.data.result.recipient} in ${response.data.result.latencyMs}ms.`
        });
        loadDispatchData();
      } else {
        setTestResult({
          success: false,
          channel,
          message: response.data?.error || `Failed to dispatch test ${channel}.`
        });
      }
    } catch (err) {
      setTestResult({
        success: false,
        channel,
        message: err.message || 'Dispatch network error.'
      });
    } finally {
      setTestingChannel(null);
    }
  };

  // Acoustic test siren (3 seconds pulse)
  const handleAcousticSirenTest = () => {
    if (isAcousticTesting) return;
    setIsAcousticTesting(true);
    sirenManager.startSiren();
    setTimeout(() => {
      sirenManager.stopSiren();
      setIsAcousticTesting(false);
    }, 2800);
  };

  const handleOpenResolveModal = (alertId) => {
    setActiveResolveAlertId(alertId);
    setResolutionInput('Strata movement stabilized. Support chocks verified and transect cleared safe by safety shift officer.');
  };

  const handleConfirmResolve = async (alertId) => {
    if (!onResolveAlert) return;
    setIsSubmitting(true);
    try {
      await onResolveAlert(alertId, resolutionInput.trim());
      setActiveResolveAlertId(null);
      setResolutionInput('');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filtered dispatch logs
  const filteredDispatches = dispatchLogs.filter(d => {
    if (dispatchFilter === 'ALL') return true;
    return d.channel === dispatchFilter;
  });

  return (
    <div className="space-y-4 font-sans select-none overflow-hidden">
      {/* View Header with Statistics */}
      <div className="bg-[#FFFFFF] p-4 sm:p-5 border border-[#D8D8D5] flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 bg-[#A84444]"></span>
            <span className="text-[11px] font-mono font-bold tracking-widest text-[#A84444]">
              DGMS EARLY WARNING &amp; ESCALATION REGISTRY
            </span>
          </div>
          <h1 className="text-sm sm:text-base font-bold uppercase tracking-wider text-[#222222]">
            Subsidence Alarm, Dispatch &amp; Query Resolution Center
          </h1>
          <p className="text-xs text-[#666666] mt-0.5">
            Multi-channel notifications (SMTP Email, SMS), automated statutory escalation, and immutable resolution audit trails
          </p>
        </div>

        {/* Aggregate KPI counters */}
        <div className="flex items-center gap-2 sm:gap-4 text-xs">
          <div className="bg-[#F7F7F5] border border-[#D8D8D5] px-2.5 py-1 text-center">
            <span className="text-[10px] text-[#888888] uppercase block">Total Alarms</span>
            <strong className="text-[#222222] font-mono text-xs">{allAlerts.length}</strong>
          </div>
          <div className="bg-[#FDF2F2] border border-[#F3C5C5] px-2.5 py-1 text-center">
            <span className="text-[10px] text-[#A84444] uppercase block">Open</span>
            <strong className="text-[#A84444] font-mono text-xs">{countOpen}</strong>
          </div>
          <div className="bg-[#FEF9EE] border border-[#FDE6B0] px-2.5 py-1 text-center">
            <span className="text-[10px] text-[#A87925] uppercase block">Acknowledged</span>
            <strong className="text-[#A87925] font-mono text-xs">{countAck}</strong>
          </div>
          <div className="bg-[#F0FDF4] border border-[#BBF7D0] px-2.5 py-1 text-center">
            <span className="text-[10px] text-[#3F7655] uppercase block">Dispatches</span>
            <strong className="text-[#3F7655] font-mono text-xs">{dispatchLogs.length}</strong>
          </div>
        </div>
      </div>

      {/* Primary Sub-Tab Switcher */}
      <div className="flex border-b border-[#D8D8D5] bg-[#FFFFFF] px-4 pt-2 gap-2 text-xs">
        <button
          type="button"
          onClick={() => setActiveSubTab('ALERTS')}
          className={`pb-2.5 px-3 font-bold uppercase tracking-wider border-b-2 transition-colors flex items-center gap-2 ${
            activeSubTab === 'ALERTS'
              ? 'border-[#3F4A42] text-[#222222]'
              : 'border-transparent text-[#666666] hover:text-[#222222]'
          }`}
        >
          <span>📋 Alarm Register &amp; Resolutions</span>
          <span className="px-1.5 py-0.2 bg-[#F7F7F5] border border-[#D8D8D5] text-[10px] font-mono">
            {allAlerts.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('DISPATCH')}
          className={`pb-2.5 px-3 font-bold uppercase tracking-wider border-b-2 transition-colors flex items-center gap-2 ${
            activeSubTab === 'DISPATCH'
              ? 'border-[#3F4A42] text-[#222222]'
              : 'border-transparent text-[#666666] hover:text-[#222222]'
          }`}
        >
          <span>📡 Multi-Channel Dispatch &amp; Escalation Engine</span>
          <span className="px-1.5 py-0.2 bg-[#F0FDF4] border border-[#BBF7D0] text-[#3F7655] text-[10px] font-mono">
            {dispatchLogs.length} logged
          </span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* SUB-VIEW 1: ALARM & QUERY REGISTER (Standard SCADA View) */}
      {/* ========================================================================= */}
      {activeSubTab === 'ALERTS' && (
        <div className="space-y-4">
          {/* Filter Tabs */}
          <div className="flex border border-[#D8D8D5] bg-[#FFFFFF] p-1 gap-1 text-xs">
            <button
              onClick={() => setFilter('ALL')}
              className={`px-3 py-1.5 font-semibold transition-colors ${
                filter === 'ALL' ? 'bg-[#3F4A42] text-[#FFFFFF]' : 'text-[#666666] hover:bg-[#F7F7F5]'
              }`}
            >
              ALL ALARMS ({allAlerts.length})
            </button>
            <button
              onClick={() => setFilter('OPEN')}
              className={`px-3 py-1.5 font-semibold transition-colors ${
                filter === 'OPEN' ? 'bg-[#A84444] text-[#FFFFFF]' : 'text-[#666666] hover:bg-[#F7F7F5]'
              }`}
            >
              OPEN / UNRESOLVED ({countOpen})
            </button>
            <button
              onClick={() => setFilter('ACKNOWLEDGED')}
              className={`px-3 py-1.5 font-semibold transition-colors ${
                filter === 'ACKNOWLEDGED' ? 'bg-[#A87925] text-[#FFFFFF]' : 'text-[#666666] hover:bg-[#F7F7F5]'
              }`}
            >
              ACKNOWLEDGED ({countAck})
            </button>
            <button
              onClick={() => setFilter('RESOLVED')}
              className={`px-3 py-1.5 font-semibold transition-colors ${
                filter === 'RESOLVED' ? 'bg-[#3F7655] text-[#FFFFFF]' : 'text-[#666666] hover:bg-[#F7F7F5]'
              }`}
            >
              RESOLVED ({countResolved})
            </button>
          </div>

          {/* Alert Cards Register */}
          <div className="space-y-3">
            {filteredAlerts.length === 0 ? (
              <div className="bg-[#FFFFFF] border border-[#D8D8D5] p-8 text-center text-xs text-[#666666]">
                <span className="text-[#3F7655] font-bold text-sm block mb-1">● NO ALERTS IN CURRENT FILTER</span>
                All geotechnical telemetry records are nominal or have been resolved in the database.
              </div>
            ) : (
              filteredAlerts.map((alert) => (
                <div 
                  key={alert.id}
                  className={`bg-[#FFFFFF] border border-[#D8D8D5] p-4 sm:p-5 flex flex-col gap-3 transition-colors ${
                    alert.resolved ? 'opacity-85 bg-[#FAFAF9]' : ''
                  }`}
                  style={{ borderLeftWidth: '5px', borderLeftColor: alert.resolved ? '#3F7655' : alert.color }}
                >
                  {/* Row 1: Header Badges & Core Information */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#EAEAE7] pb-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span 
                        className="px-2 py-0.5 text-[10px] font-bold tracking-wide text-[#FFFFFF]"
                        style={{ backgroundColor: alert.resolved ? '#3F7655' : alert.color }}
                      >
                        {alert.type}
                      </span>

                      <span className="font-bold text-xs text-[#222222]">
                        Node {alert.nodeId} ({alert.zone})
                      </span>

                      <span className="text-[10px] font-mono px-1.5 py-0.5 bg-[#F7F7F5] border border-[#D8D8D5] text-[#666666]">
                        ID: {alert.id}
                      </span>

                      <span className="text-[11px] text-[#666666]">
                        • Anomaly: <strong>{alert.anomalyScore}/100</strong>
                      </span>
                    </div>

                    {/* Status Badges */}
                    <div className="flex items-center gap-2">
                      {alert.resolved ? (
                        <span className="px-2 py-0.5 bg-[#F0FDF4] border border-[#BBF7D0] text-[#3F7655] font-bold text-[10.5px] uppercase tracking-wider flex items-center gap-1">
                          <span>✓</span> RESOLVED
                        </span>
                      ) : alert.acknowledged ? (
                        <span className="px-2 py-0.5 bg-[#FEF9EE] border border-[#FDE6B0] text-[#A87925] font-bold text-[10.5px] uppercase tracking-wider">
                          ● UNDER INVESTIGATION
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 bg-[#FDF2F2] border border-[#F3C5C5] text-[#A84444] font-bold text-[10.5px] uppercase tracking-wider animate-pulse">
                          ▲ OPEN QUERY
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Row 2: Details & Measured Deviation */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div>
                      <div className="text-[11px] text-[#666666]">Observation / Anomaly Signature:</div>
                      <div className="font-semibold text-[#222222] mt-0.5">{alert.details}</div>
                      <div className="text-[11px] text-[#888888] mt-1">
                        Primary Indicator: <span className="text-[#444444]">{alert.primaryIndicator}</span>
                      </div>
                    </div>

                    <div className="bg-[#F7F7F5] p-2.5 border border-[#D8D8D5] text-[11px] space-y-1">
                      <div className="flex justify-between">
                        <span className="text-[#666666]">Trigger Detected:</span>
                        <span className="font-mono font-semibold">{formatTime(alert.timestamp)}</span>
                      </div>

                      {alert.acknowledged && (
                        <div className="flex justify-between text-[#A87925]">
                          <span>Acknowledged:</span>
                          <span className="font-mono">{formatTime(alert.acknowledgedAt)} by {alert.acknowledgedBy || 'Shift Operator'}</span>
                        </div>
                      )}

                      {alert.resolved && (
                        <div className="flex justify-between text-[#3F7655]">
                          <span>Resolved:</span>
                          <span className="font-mono">{formatTime(alert.resolvedAt)} by {alert.resolvedBy || 'DGMS Incharge'}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Row 3: Resolution Notes (if resolved) */}
                  {alert.resolved && alert.resolutionNotes && (
                    <div className="p-2.5 bg-[#F0FDF4] border-l-4 border-[#3F7655] text-xs text-[#222222]">
                      <div className="font-bold text-[10px] text-[#3F7655] uppercase tracking-wide">
                        Statutory Resolution Record:
                      </div>
                      <div className="mt-0.5 italic">{alert.resolutionNotes}</div>
                    </div>
                  )}

                  {/* Row 4: Action Controls */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#EAEAE7]">
                    <div className="flex items-center gap-2">
                      {onSelectNode && (
                        <button
                          type="button"
                          onClick={() => onSelectNode(alert.nodeId)}
                          className="px-2.5 py-1 bg-[#FFFFFF] hover:bg-[#F7F7F5] border border-[#D8D8D5] text-xs font-semibold text-[#222222] transition-colors"
                        >
                          Focus Node {alert.nodeId} on Map →
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Step 1: Acknowledge */}
                      {!alert.acknowledged && !alert.resolved && (
                        <button
                          type="button"
                          onClick={() => onAcknowledgeAlert && onAcknowledgeAlert(alert.id)}
                          className="px-3 py-1 bg-[#A87925] hover:bg-[#8F661E] text-[#FFFFFF] text-xs font-bold transition-colors"
                        >
                          ACKNOWLEDGE INCIDENT
                        </button>
                      )}

                      {/* Step 2: Resolve Query Modal Trigger */}
                      {alert.acknowledged && !alert.resolved && (
                        <button
                          type="button"
                          onClick={() => handleOpenResolveModal(alert.id)}
                          className="px-3.5 py-1 bg-[#3F7655] hover:bg-[#325E44] text-[#FFFFFF] text-xs font-bold transition-colors"
                        >
                          RESOLVE STRATA QUERY ✓
                        </button>
                      )}

                      {alert.resolved && (
                        <span className="text-xs text-[#3F7655] font-semibold">
                          Incident closed and verified in database audit trail.
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Inline Resolution Drawer/Modal */}
                  {activeResolveAlertId === alert.id && (
                    <div className="mt-2 p-3.5 bg-[#FEFDF8] border-2 border-[#3F7655] text-xs space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-[#3F7655] uppercase tracking-wide">
                          Resolve Strata Query for Alert {alert.id}
                        </span>
                        <button
                          type="button"
                          onClick={() => setActiveResolveAlertId(null)}
                          className="text-xs text-[#888888] hover:text-[#222222] font-mono"
                        >
                          ✕ CANCEL
                        </button>
                      </div>

                      <div>
                        <label htmlFor={`notes-${alert.id}`} className="block text-[11px] font-semibold text-[#222222] mb-1">
                          Resolution Notes &amp; Statutory Mitigation Summary:
                        </label>
                        <textarea
                          id={`notes-${alert.id}`}
                          rows={2}
                          value={resolutionInput}
                          onChange={(e) => setResolutionInput(e.target.value)}
                          className="w-full p-2 border border-[#D8D8D5] text-xs bg-[#FFFFFF] font-sans focus:outline-none focus:border-[#3F7655]"
                          placeholder="Detail inspection result, structural stabilization, or safe clearance confirmation..."
                          required
                        />
                      </div>

                      {/* Pre-fill Quick Resolution Actions */}
                      <div className="flex flex-wrap gap-1.5 text-[10px]">
                        <span className="text-[#888888] py-0.5">Quick fill:</span>
                        <button
                          type="button"
                          onClick={() => setResolutionInput('Hydraulic roof supports deployed. Inclination stabilized within DGMS limits.')}
                          className="px-2 py-0.5 bg-[#FFFFFF] hover:bg-[#EAEAE7] border border-[#D8D8D5] text-[#666666]"
                        >
                          Supports Deployed
                        </button>
                        <button
                          type="button"
                          onClick={() => setResolutionInput('Physical inspection conducted by Shift Incharge; transect confirmed safe for continued mining.')}
                          className="px-2 py-0.5 bg-[#FFFFFF] hover:bg-[#EAEAE7] border border-[#D8D8D5] text-[#666666]"
                        >
                          Shift Incharge Cleared
                        </button>
                        <button
                          type="button"
                          onClick={() => setResolutionInput('Sensor recalibrated and ground movement rate arrested below 0.05 deg/hr.')}
                          className="px-2 py-0.5 bg-[#FFFFFF] hover:bg-[#EAEAE7] border border-[#D8D8D5] text-[#666666]"
                        >
                          Movement Arrested
                        </button>
                      </div>

                      <div className="flex justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setActiveResolveAlertId(null)}
                          className="px-3 py-1.5 bg-[#FFFFFF] border border-[#D8D8D5] text-xs font-semibold text-[#666666]"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={isSubmitting || !resolutionInput.trim()}
                          onClick={() => handleConfirmResolve(alert.id)}
                          className="px-4 py-1.5 bg-[#3F7655] hover:bg-[#325E44] disabled:bg-[#888888] text-[#FFFFFF] text-xs font-bold transition-colors flex items-center gap-1.5"
                        >
                          {isSubmitting ? 'SAVING TO DATABASE...' : 'CONFIRM & PERSIST RESOLUTION'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-VIEW 2: AUTOMATED DISPATCH & ESCALATION ENGINE (Phase 3 View) */}
      {/* ========================================================================= */}
      {activeSubTab === 'DISPATCH' && (
        <div className="space-y-4">
          
          {/* Top Panel: Gateway Status & Web Audio Siren */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            
            {/* Card 1: Multi-Channel Delivery Channels */}
            <div className="bg-[#FFFFFF] border border-[#D8D8D5] p-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold text-[#666666] uppercase tracking-wider">
                    DELIVERY GATEWAYS
                  </span>
                  <span className="px-1.5 py-0.2 bg-[#F0FDF4] border border-[#BBF7D0] text-[#3F7655] font-mono text-[9px] font-bold">
                    ACTIVE (SIMULATION)
                  </span>
                </div>
                
                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between pb-1.5 border-b border-[#EAEAE7]">
                    <span className="text-[#666666]">Email Gateway:</span>
                    <span className="font-semibold text-[#222222]">Nodemailer SMTP (HTML + Text)</span>
                  </div>
                  <div className="flex items-center justify-between pb-1.5 border-b border-[#EAEAE7]">
                    <span className="text-[#666666]">SMS Cellular Gateway:</span>
                    <span className="font-semibold text-[#222222]">160-Char Telecom Standard</span>
                  </div>
                  <div className="flex items-center justify-between pb-1.5 border-b border-[#EAEAE7]">
                    <span className="text-[#666666]">Cooldown Deduplication:</span>
                    <span className="font-mono font-bold text-[#3F7655]">{dispatchConfig?.cooldownSeconds || 300}s Window</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#666666]">Operating Sandbox:</span>
                    <span className="font-mono text-[#A87925] font-bold">SAFE_SANDBOX_MODE</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons: Trigger Test Notifications */}
              <div className="mt-4 pt-3 border-t border-[#EAEAE7] flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={testingChannel !== null}
                  onClick={() => handleTriggerTest('EMAIL')}
                  className="flex-1 px-3 py-1.5 bg-[#3F4A42] hover:bg-[#323B35] disabled:bg-[#888888] text-[#FFFFFF] text-xs font-bold transition-colors"
                >
                  {testingChannel === 'EMAIL' ? 'DISPATCHING...' : '📨 TEST EMAIL DISPATCH'}
                </button>
                <button
                  type="button"
                  disabled={testingChannel !== null}
                  onClick={() => handleTriggerTest('SMS')}
                  className="flex-1 px-3 py-1.5 bg-[#3F4A42] hover:bg-[#323B35] disabled:bg-[#888888] text-[#FFFFFF] text-xs font-bold transition-colors"
                >
                  {testingChannel === 'SMS' ? 'DISPATCHING...' : '📱 TEST SMS DISPATCH'}
                </button>
              </div>
            </div>

            {/* Card 2: Web Audio Industrial Siren Station */}
            <div className="bg-[#FFFFFF] border border-[#D8D8D5] p-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold text-[#666666] uppercase tracking-wider">
                    ACOUSTIC SIREN STATION
                  </span>
                  <span className={`px-1.5 py-0.2 font-mono text-[9px] font-bold border ${
                    isSirenPlaying 
                      ? 'bg-[#FDF2F2] border-[#F3C5C5] text-[#A84444] animate-pulse'
                      : isSirenMuted
                      ? 'bg-[#F7F7F5] border-[#D8D8D5] text-[#888888]'
                      : 'bg-[#F0FDF4] border-[#BBF7D0] text-[#3F7655]'
                  }`}>
                    {isSirenPlaying ? 'SOUNDING ALARM' : isSirenMuted ? 'MUTED' : 'ARMED & STANDBY'}
                  </span>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between pb-1.5 border-b border-[#EAEAE7]">
                    <span className="text-[#666666]">Synthesizer Architecture:</span>
                    <span className="font-semibold text-[#222222]">Web Audio Dual Oscillator</span>
                  </div>
                  <div className="flex items-center justify-between pb-1.5 border-b border-[#EAEAE7]">
                    <span className="text-[#666666]">Tone Modulation:</span>
                    <span className="font-mono text-[#222222]">780 Hz ⇄ 960 Hz (400ms cycle)</span>
                  </div>
                  <div className="flex items-center justify-between pb-1.5 border-b border-[#EAEAE7]">
                    <span className="text-[#666666]">Max Acoustic Gain:</span>
                    <span className="font-mono text-[#222222]">0.12 Gain (Hearing Safe)</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#666666]">Air-Gapped Offline Ready:</span>
                    <span className="font-mono text-[#3F7655] font-bold">100% Native Browser Audio</span>
                  </div>
                </div>
              </div>

              {/* Siren Controls */}
              <div className="mt-4 pt-3 border-t border-[#EAEAE7] flex gap-2">
                {onToggleSirenMute && (
                  <button
                    type="button"
                    onClick={onToggleSirenMute}
                    className={`flex-1 px-3 py-1.5 text-xs font-bold transition-colors border ${
                      isSirenMuted
                        ? 'bg-[#FFFFFF] border-[#D8D8D5] text-[#3F7655] hover:bg-[#F0FDF4]'
                        : 'bg-[#A87925] border-[#A87925] text-[#FFFFFF] hover:bg-[#8F661E]'
                    }`}
                  >
                    {isSirenMuted ? '🔊 UNMUTE SIREN' : '🔇 MUTE SIREN'}
                  </button>
                )}
                <button
                  type="button"
                  disabled={isAcousticTesting}
                  onClick={handleAcousticSirenTest}
                  className="flex-1 px-3 py-1.5 bg-[#FFFFFF] hover:bg-[#F7F7F5] border border-[#D8D8D5] text-[#222222] text-xs font-bold transition-colors"
                >
                  {isAcousticTesting ? 'TESTING (3s)...' : '🔔 TEST 3s SOUND'}
                </button>
              </div>
            </div>

            {/* Card 3: Multi-Tier Statutory Escalation Matrix */}
            <div className="bg-[#FFFFFF] border border-[#D8D8D5] p-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold text-[#666666] uppercase tracking-wider">
                    STATUTORY ESCALATION TIERS
                  </span>
                  <span className="px-1.5 py-0.2 bg-[#F7F7F5] border border-[#D8D8D5] text-[#666666] font-mono text-[9px]">
                    DGMS RULE 1998
                  </span>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="p-1.5 bg-[#F7F7F5] border-l-2 border-[#A87925]">
                    <div className="flex justify-between font-bold text-[11px]">
                      <span className="text-[#A87925]">Tier 1: Shift Safety Officer</span>
                      <span className="text-[#666666] font-mono">0 min (Instant)</span>
                    </div>
                    <div className="text-[10px] text-[#666666] truncate">safety_officer@moonidih.cil.in • SMS</div>
                  </div>

                  <div className="p-1.5 bg-[#F7F7F5] border-l-2 border-[#A84444]">
                    <div className="flex justify-between font-bold text-[11px]">
                      <span className="text-[#A84444]">Tier 2: Colliery Agent &amp; Manager</span>
                      <span className="text-[#666666] font-mono">+10 min unacknowledged</span>
                    </div>
                    <div className="text-[10px] text-[#666666] truncate">mine_manager@moonidih.cil.in • SMS</div>
                  </div>

                  <div className="p-1.5 bg-[#F7F7F5] border-l-2 border-[#3F4A42]">
                    <div className="flex justify-between font-bold text-[11px]">
                      <span className="text-[#3F4A42]">Tier 3: DGMS Regional Directorate</span>
                      <span className="text-[#666666] font-mono">+30 min unacknowledged</span>
                    </div>
                    <div className="text-[10px] text-[#666666] truncate">dgms_auditor@dgms.gov.in • Static Archive</div>
                  </div>
                </div>
              </div>

              <div className="mt-3 pt-2 text-[10px] text-[#888888] flex justify-between items-center border-t border-[#EAEAE7]">
                <span>Escalation Interval: 600s</span>
                <span className="font-mono text-[#3F7655]">STATUS: ARMED</span>
              </div>
            </div>

          </div>

          {/* Test Dispatch Feedback Banner */}
          {testResult && (
            <div className={`p-3 border text-xs flex items-center justify-between ${
              testResult.success 
                ? 'bg-[#F0FDF4] border-[#BBF7D0] text-[#3F7655]'
                : 'bg-[#FDF2F2] border-[#F3C5C5] text-[#A84444]'
            }`}>
              <div className="flex items-center gap-2">
                <span className="font-bold font-mono">[{testResult.channel}]</span>
                <span>{testResult.message}</span>
              </div>
              <button 
                type="button" 
                onClick={() => setTestResult(null)}
                className="font-mono text-[11px] underline"
              >
                DISMISS
              </button>
            </div>
          )}

          {/* Bottom Panel: Dispatch History Audit Trail */}
          <div className="bg-[#FFFFFF] border border-[#D8D8D5] p-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3 pb-2 border-b border-[#EAEAE7]">
              <div>
                <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-[#222222]">
                  Automated Dispatch Audit Log History
                </h2>
                <p className="text-[11px] text-[#666666]">
                  Immutable ledger of all outbound alert dispatches, recipient acknowledgments, and delivery latencies
                </p>
              </div>

              <div className="flex items-center gap-2 text-xs">
                {/* Channel Filter Buttons */}
                <div className="flex border border-[#D8D8D5] p-0.5 bg-[#F7F7F5]">
                  <button
                    type="button"
                    onClick={() => setDispatchFilter('ALL')}
                    className={`px-2 py-0.5 text-[10.5px] font-semibold transition-colors ${
                      dispatchFilter === 'ALL' ? 'bg-[#3F4A42] text-[#FFFFFF]' : 'text-[#666666]'
                    }`}
                  >
                    ALL
                  </button>
                  <button
                    type="button"
                    onClick={() => setDispatchFilter('EMAIL')}
                    className={`px-2 py-0.5 text-[10.5px] font-semibold transition-colors ${
                      dispatchFilter === 'EMAIL' ? 'bg-[#3F4A42] text-[#FFFFFF]' : 'text-[#666666]'
                    }`}
                  >
                    EMAIL
                  </button>
                  <button
                    type="button"
                    onClick={() => setDispatchFilter('SMS')}
                    className={`px-2 py-0.5 text-[10.5px] font-semibold transition-colors ${
                      dispatchFilter === 'SMS' ? 'bg-[#3F4A42] text-[#FFFFFF]' : 'text-[#666666]'
                    }`}
                  >
                    SMS
                  </button>
                </div>

                <button
                  type="button"
                  disabled={dispatchLoading}
                  onClick={loadDispatchData}
                  className="px-2.5 py-1 bg-[#FFFFFF] hover:bg-[#F7F7F5] border border-[#D8D8D5] font-semibold text-xs text-[#222222] transition-colors"
                >
                  {dispatchLoading ? 'REFRESHING...' : '🔄 REFRESH'}
                </button>
              </div>
            </div>

            {/* Table of Dispatches */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[#F7F7F5] border-b border-[#D8D8D5] text-[10px] text-[#666666] uppercase">
                    <th className="p-2">Timestamp (IST)</th>
                    <th className="p-2">Dispatch ID</th>
                    <th className="p-2">Channel</th>
                    <th className="p-2">Node</th>
                    <th className="p-2">Recipient</th>
                    <th className="p-2">Status</th>
                    <th className="p-2">Latency</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EAEAE7]">
                  {filteredDispatches.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-[#888888] italic">
                        No automated dispatches recorded in memory buffer yet. Trigger a test dispatch or start a simulation to see entries.
                      </td>
                    </tr>
                  ) : (
                    filteredDispatches.map((log) => (
                      <tr key={log.id} className="hover:bg-[#FAFAF9] transition-colors">
                        <td className="p-2 font-mono text-[11px] whitespace-nowrap">
                          {formatTime(log.timestamp)}
                        </td>
                        <td className="p-2 font-mono text-[10px] text-[#888888]">
                          {log.id}
                        </td>
                        <td className="p-2">
                          <span className={`px-1.5 py-0.2 text-[9.5px] font-bold font-mono ${
                            log.channel === 'EMAIL'
                              ? 'bg-[#EBF5FB] text-[#2980B9] border border-[#AED6F1]'
                              : 'bg-[#FEF9EE] text-[#A87925] border border-[#FDE6B0]'
                          }`}>
                            {log.channel}
                          </span>
                        </td>
                        <td className="p-2 font-semibold">
                          Node {log.nodeId || 'N3'}
                        </td>
                        <td className="p-2 font-mono text-[11px] text-[#444444] truncate max-w-[220px]">
                          {log.recipient}
                        </td>
                        <td className="p-2">
                          {log.status === 'SIMULATED_SUCCESS' || log.status === 'SUCCESS' ? (
                            <span className="px-1.5 py-0.2 bg-[#F0FDF4] border border-[#BBF7D0] text-[#3F7655] font-bold text-[10px]">
                              ● {log.status}
                            </span>
                          ) : log.status === 'SUPPRESSED_COOLDOWN' ? (
                            <span className="px-1.5 py-0.2 bg-[#FEF9EE] border border-[#FDE6B0] text-[#A87925] font-bold text-[10px]">
                              ▲ COOLDOWN
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.2 bg-[#FDF2F2] border border-[#F3C5C5] text-[#A84444] font-bold text-[10px]">
                              ✕ {log.status}
                            </span>
                          )}
                        </td>
                        <td className="p-2 font-mono text-[11px] text-[#666666]">
                          {log.latencyMs !== undefined ? `${log.latencyMs} ms` : '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

          </div>

        </div>
      )}

      {/* DGMS Regulation Note */}
      <div className="p-3 bg-[#F7F7F5] border border-[#D8D8D5] text-[11px] text-[#666666] flex flex-wrap items-center justify-between gap-2">
        <div>Safety Directive: DGMS Circular No. 3 (1998) — Automated Multi-Tier Dispatch Protocol</div>
        <div>Standard: ISO 19749 Geotechnical Array • Web Audio API Industrial Siren • Supabase Audit Log</div>
      </div>
    </div>
  );
}
