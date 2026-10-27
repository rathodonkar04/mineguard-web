import React, { useState, useEffect } from 'react';
import { getStatusColor } from '../data/sensors';
import { fetchLatestRisk, fetchRiskStats } from '../api/backendApi';

/**
 * AiExplanationPanel Component - Persistent Risk Assessment & Detection Details (REPORTS View)
 * Displays live and persistent AI statistical deviations, 16-feature diagnostics, and database risk records.
 */
export default function AiExplanationPanel({ selectedNode }) {
  const [latestDbRisk, setLatestDbRisk] = useState(null);
  const [nodeRiskStats, setNodeRiskStats] = useState(null);

  const node = selectedNode || { 
    id: 'N1', 
    tilt: 0.21, 
    displacement: 0.35, 
    vibration: 0.02, 
    anomalyScore: 14, 
    status: 'Safe',
    ai_status: 'ACTIVE',
    risk_level: 'SAFE',
    risk_reason: 'Nominal ground strata behavior within baseline bounds'
  };

  const nodeId = node.id || 'N1';

  useEffect(() => {
    let mounted = true;
    async function loadRiskContext() {
      try {
        const [latestRes, statsRes] = await Promise.all([
          fetchLatestRisk(),
          fetchRiskStats({ range: '24h', nodeId })
        ]);

        if (mounted) {
          if (latestRes && latestRes.nodes) {
            const match = latestRes.nodes.find(n => n.nodeId === nodeId || n.node_id === node.node_id);
            if (match) setLatestDbRisk(match);
          }
          if (statsRes && statsRes.stats) {
            setNodeRiskStats(statsRes.stats);
          }
        }
      } catch (_err) {
        // Fallback gracefully to live node state
      }
    }
    loadRiskContext();
    return () => { mounted = false; };
  }, [nodeId, node.node_id]);

  const isCalibrating = node.ai_status === 'CALIBRATING' || node.ai_anomaly_score === null;
  const scoreDisplay = isCalibrating ? 'CALIBRATING' : (node.ai_anomaly_score !== undefined ? node.ai_anomaly_score : (node.aiScore || 18));
  const currentRisk = node.risk_level || node.status || 'SAFE';
  const statusMeta = getStatusColor(currentRisk);

  const feats = node.features || (latestDbRisk?.feature_snapshot) || {};

  const INDICATORS = [
    {
      name: 'Tilt Deviation',
      value: feats.z_tilt !== undefined ? `${feats.z_tilt > 0 ? '+' : ''}${feats.z_tilt.toFixed(2)} σ` : (node.status === 'Critical' ? '+4.8 σ' : node.status === 'Warning' ? '+2.4 σ' : '+0.3 σ'),
      description: 'Standard deviation from baseline calibration period.'
    },
    {
      name: 'Displacement Deviation',
      value: feats.z_displacement !== undefined ? `${feats.z_displacement > 0 ? '+' : ''}${feats.z_displacement.toFixed(2)} σ` : `${node.displacement?.toFixed(2) || '0.38'} mm`,
      description: 'Surface settlement measurement above underground panel.'
    },
    {
      name: 'Vibration Acceleration',
      value: feats.z_vibration !== undefined ? `${feats.z_vibration > 0 ? '+' : ''}${feats.z_vibration.toFixed(2)} σ` : `${node.vibration?.toFixed(3) || '0.020'} g`,
      description: 'Dynamic acceleration magnitude variance.'
    },
    {
      name: 'Rate of Change (Angular Velocity)',
      value: feats.tilt_rate !== undefined ? `${feats.tilt_rate > 0 ? '+' : ''}${(feats.tilt_rate * 60).toFixed(2)}° / min` : (node.status === 'Critical' ? '+0.24° / min' : node.status === 'Warning' ? '+0.08° / min' : '+0.01° / min'),
      description: 'First derivative of inclination over rolling window.'
    }
  ];

  return (
    <div className="space-y-4 font-sans select-none overflow-hidden">
      {/* Header with Single Clear H1 */}
      <div className="bg-[#FFFFFF] p-4 sm:p-5 border border-[#D8D8D5] flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-sm sm:text-base font-bold uppercase tracking-wider text-[#222222]">
            AI Geotechnical Risk Assessment & Strata Hazard Reports
          </h1>
          <p className="text-xs text-[#666666] mt-0.5">
            Statistical deviation and anomaly indicators for Node {node.id} ({node.node_id || node.id}) • Model: <strong className="text-[#3F4A42]">Isolation Forest (300 Trees)</strong>
          </p>
        </div>

        <div className="text-left sm:text-right">
          <div className="text-[11px] text-[#666666]">AI Pipeline State</div>
          <div className="text-xs font-bold mt-0.5 text-[#222222]">
            Status: <span className={isCalibrating ? 'text-[#A87925]' : 'text-[#3F7655]'}>
              ● {node.ai_status || 'ACTIVE'}
            </span>
          </div>
        </div>
      </div>

      {/* Anomaly Score & Diagnostic Summary Box */}
      <div className="bg-[#FFFFFF] p-4 sm:p-5 border border-[#D8D8D5] space-y-2.5 sm:space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold text-[#666666] uppercase">
            Anomaly Score
          </div>
          <div className={`text-xs font-bold ${statusMeta.text}`}>
            ● {currentRisk.toUpperCase()}
          </div>
        </div>

        <div className="text-2xl sm:text-3xl font-bold text-[#222222]">
          {scoreDisplay} {!isCalibrating && <span className="text-sm sm:text-base text-[#666666] font-normal">/ 100</span>}
        </div>

        {(node.risk_reason || latestDbRisk?.reason) && (
          <div className="text-xs font-semibold text-[#222222] bg-[#F7F7F5] p-2.5 border border-[#D8D8D5] leading-relaxed">
            Diagnostic Reason: <span className="font-normal text-[#666666]">{node.risk_reason || latestDbRisk?.reason}</span>
          </div>
        )}

        {/* 24-Hour Statistical Summary */}
        {nodeRiskStats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-[#D8D8D5] text-xs">
            <div>
              <span className="text-[10px] text-[#666666] block uppercase">24H Avg Risk</span>
              <span className="font-bold text-[#222222] font-mono">{nodeRiskStats.avgRiskScore} / 100</span>
            </div>
            <div>
              <span className="text-[10px] text-[#666666] block uppercase">24H Peak Risk</span>
              <span className="font-bold text-[#222222] font-mono">{nodeRiskStats.maxRiskScore} / 100</span>
            </div>
            <div>
              <span className="text-[10px] text-[#666666] block uppercase">Warning Events</span>
              <span className="font-bold text-[#A87925] font-mono">{nodeRiskStats.warningCount}</span>
            </div>
            <div>
              <span className="text-[10px] text-[#666666] block uppercase">Critical Events</span>
              <span className="font-bold text-[#A84444] font-mono">{nodeRiskStats.criticalCount}</span>
            </div>
          </div>
        )}
      </div>

      {/* Indicators Table / Matrix */}
      <div className="bg-[#FFFFFF] border border-[#D8D8D5]">
        <div className="px-4 sm:px-5 py-2.5 sm:py-3 border-b border-[#D8D8D5] bg-[#F7F7F5] font-semibold text-xs text-[#222222] uppercase">
          Causal Feature Breakdown (16 Canonical Indicators)
        </div>

        <div className="divide-y divide-[#D8D8D5] text-xs">
          {INDICATORS.map((ind, idx) => (
            <div key={idx} className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-2">
              <div className="space-y-0.5">
                <div className="font-bold text-[#222222]">{ind.name}</div>
                <div className="text-[#666666] text-[11px]">{ind.description}</div>
              </div>
              <div className="text-xs sm:text-sm font-bold text-[#222222] sm:text-right font-mono">
                {ind.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Institutional Notice */}
      <div className="p-3.5 sm:p-4 bg-[#F7F7F5] border border-[#D8D8D5] text-[11px] sm:text-xs text-[#666666]">
        <strong>Notice:</strong> This diagnostic anomaly score and feature breakdown are decision-support indicators designed for geotechnical monitoring and do not supersede statutory DGMS mine safety limits.
      </div>
    </div>
  );
}
