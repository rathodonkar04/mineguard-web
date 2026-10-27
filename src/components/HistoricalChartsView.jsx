import React, { useState, useEffect } from 'react';
import TiltChart from './TiltChart';
import { N3_SIMULATION_STEPS } from '../data/sensors';
import { fetchTelemetryHistory, fetchRiskHistory, fetchHistoryStats, fetchRiskStats } from '../api/backendApi';

/**
 * HistoricalChartsView Component - Geotechnical Time-Series, Persistent Risk Analytics & Scalable Aggregations
 * Queries persistent PostgreSQL historical telemetry and 1-minute aggregates across 1h, 6h, 24h, 7d ranges.
 */
export default function HistoricalChartsView({ 
  chartHistory = [], 
  currentN3Tilt = 0.3, 
  simStep = 0, 
  onSetSimStep 
}) {
  const [selectedRange, setSelectedRange] = useState('24h');
  const [selectedNode, setSelectedNode] = useState('all');
  const [chartMetric, setChartMetric] = useState('tilt'); // 'tilt' | 'risk'
  const [historyData, setHistoryData] = useState([]);
  const [historyStats, setHistoryStats] = useState(null);
  const [riskStats, setRiskStats] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [dataSource, setDataSource] = useState('live');

  const ranges = [
    { id: '1h', label: '1H (1s RAW)' },
    { id: '6h', label: '6H (1s RAW)' },
    { id: '24h', label: '24H (1-MIN AGG)' },
    { id: '7d', label: '7D (1-MIN AGG)' }
  ];

  const nodeOptions = [
    { id: 'all', label: 'ALL NODES' },
    { id: 'N1', label: 'NODE N1' },
    { id: 'N2', label: 'NODE N2' },
    { id: 'N3', label: 'NODE N3' }
  ];

  const resolutionBadge = selectedRange === '1h' ? '1H — High Resolution (1s raw)'
    : selectedRange === '6h' ? '6H — High Resolution (1s raw)'
    : selectedRange === '24h' ? '24H — 1-Minute Aggregation'
    : '7D — 1-Minute Aggregation';

  useEffect(() => {
    let mounted = true;

    async function loadHistory() {
      setIsLoading(true);
      try {
        const [histRes, riskHistRes, statsRes, rStatsRes] = await Promise.all([
          fetchTelemetryHistory({ range: selectedRange, nodeId: selectedNode }),
          fetchRiskHistory({ range: selectedRange, nodeId: selectedNode }),
          fetchHistoryStats({ range: selectedRange, nodeId: selectedNode }),
          fetchRiskStats({ range: selectedRange, nodeId: selectedNode })
        ]);

        if (mounted) {
          const primaryData = chartMetric === 'risk' && riskHistRes?.data?.length > 0 
            ? riskHistRes.data 
            : histRes?.data;

          if (primaryData && primaryData.length > 0) {
            const formatted = primaryData.map((pt, idx) => {
              const d = pt.time ? new Date(pt.time) : new Date();
              const timeLabel = selectedRange === '7d'
                ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) + ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })
                : d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

              return {
                time: timeLabel || `T+${idx}`,
                tilt: typeof pt.tilt === 'number' ? pt.tilt : Number(pt.tilt || 0),
                riskScore: typeof pt.risk_score === 'number' ? pt.risk_score : 15,
                anomalyScore: typeof pt.anomaly_score === 'number' ? pt.anomaly_score : (typeof pt.ai_anomaly_score === 'number' ? pt.ai_anomaly_score : 0),
                displacement: typeof pt.displacement === 'number' ? pt.displacement : Number(pt.displacement || 0),
                temperature: typeof pt.temperature === 'number' ? pt.temperature : Number(pt.temperature || 25),
                vibration: typeof pt.vibration === 'number' ? pt.vibration : Number(pt.vibration || 0),
                warningLimit: chartMetric === 'risk' ? 40 : 1.0,
                criticalLimit: chartMetric === 'risk' ? 70 : 2.0,
                state: pt.status || (pt.risk_level === 'CRITICAL' ? 'Critical' : pt.risk_level === 'WARNING' ? 'Warning' : 'Normal')
              };
            });

            setHistoryData(formatted);
            setDataSource(
              histRes.source === 'postgresql_minute_aggregates' ? 'Database (1-Min Aggregates)' :
              histRes.source === 'postgresql_raw' || histRes.source === 'postgresql' ? 'Database (1s Raw Telemetry)' :
              'In-Memory Stream'
            );
          } else {
            setHistoryData(chartHistory);
            setDataSource('Live Telemetry Stream');
          }

          if (statsRes && statsRes.stats) {
            setHistoryStats(statsRes.stats);
          }
          if (rStatsRes && rStatsRes.stats) {
            setRiskStats(rStatsRes.stats);
          }
        }
      } catch (_err) {
        if (mounted) {
          setHistoryData(chartHistory);
          setDataSource('Live Telemetry Stream');
        }
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    loadHistory();
    return () => { mounted = false; };
  }, [selectedRange, selectedNode, chartMetric, chartHistory]);

  const activeChartData = historyData.length > 0 ? historyData : chartHistory;

  return (
    <div className="space-y-4 font-sans select-none overflow-hidden">
      {/* 1. Header with Controls and Single Clear H1 */}
      <div className="bg-[#FFFFFF] p-4 sm:p-5 border border-[#D8D8D5] flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-sm sm:text-base font-bold uppercase tracking-wider text-[#222222]">
              Historical Telemetry & Inclinometer Analytics
            </h1>
            <span className="text-[10px] font-mono font-semibold bg-[#F0F0EE] px-2 py-0.5 border border-[#D8D8D5] text-[#3F4A42]">
              {resolutionBadge}
            </span>
            {isLoading && (
              <span className="text-[10px] font-mono text-[#666666] animate-pulse">
                [FETCHING...]
              </span>
            )}
          </div>
          <p className="text-xs text-[#666666] mt-0.5">
            Querying persistent telemetry & AI risk records • Storage Engine: <strong className="text-[#3F4A42]">{dataSource}</strong>
          </p>
        </div>

        {/* Range, Node & Metric Filter Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Metric Selector (Tilt vs Risk) */}
          <div className="flex items-center border border-[#D8D8D5] bg-[#F7F7F5] p-0.5 text-xs">
            <button
              onClick={() => setChartMetric('tilt')}
              aria-label="View Inclinometer Tilt Data"
              className={`px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                chartMetric === 'tilt'
                  ? 'bg-[#3F4A42] text-[#FFFFFF]'
                  : 'text-[#666666] hover:text-[#222222]'
              }`}
            >
              TILT (°)
            </button>
            <button
              onClick={() => setChartMetric('risk')}
              aria-label="View Risk Index Data"
              className={`px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                chartMetric === 'risk'
                  ? 'bg-[#3F4A42] text-[#FFFFFF]'
                  : 'text-[#666666] hover:text-[#222222]'
              }`}
            >
              RISK (0-100)
            </button>
          </div>

          {/* Node Filter */}
          <div className="flex items-center border border-[#D8D8D5] bg-[#F7F7F5] p-0.5 text-xs">
            {nodeOptions.map(opt => (
              <button
                key={opt.id}
                onClick={() => setSelectedNode(opt.id)}
                aria-label={`Filter by ${opt.label}`}
                className={`px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                  selectedNode === opt.id
                    ? 'bg-[#3F4A42] text-[#FFFFFF]'
                    : 'text-[#666666] hover:text-[#222222]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Range Filter */}
          <div className="flex items-center border border-[#D8D8D5] bg-[#F7F7F5] p-0.5 text-xs">
            {ranges.map(r => (
              <button
                key={r.id}
                onClick={() => setSelectedRange(r.id)}
                aria-label={`Select range ${r.label}`}
                className={`px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                  selectedRange === r.id
                    ? 'bg-[#3F4A42] text-[#FFFFFF]'
                    : 'text-[#666666] hover:text-[#222222]'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 2. Statistical Summary Cards */}
      {historyStats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-[#FFFFFF] border border-[#D8D8D5] p-3">
            <span className="text-[10px] text-[#666666] font-semibold uppercase block">Tilt Range (Min / Max)</span>
            <span className="text-sm sm:text-base font-bold text-[#222222] font-mono mt-0.5 block">
              {historyStats.minTilt?.toFixed(2)}° <span className="text-[#666666] font-normal">to</span> {historyStats.maxTilt?.toFixed(2)}°
            </span>
          </div>

          <div className="bg-[#FFFFFF] border border-[#D8D8D5] p-3">
            <span className="text-[10px] text-[#666666] font-semibold uppercase block">Risk Score (Avg / Peak)</span>
            <span className="text-sm sm:text-base font-bold text-[#222222] font-mono mt-0.5 block">
              {riskStats ? `${riskStats.avgRiskScore || 12} / ${riskStats.maxRiskScore || 15}` : `${historyStats.avgTilt?.toFixed(2)}° avg`}
            </span>
          </div>

          <div className="bg-[#FFFFFF] border border-[#D8D8D5] p-3">
            <span className="text-[10px] text-[#666666] font-semibold uppercase block">AI Anomalies Detected</span>
            <span className={`text-sm sm:text-base font-bold font-mono mt-0.5 block ${
              historyStats.anomalyCount > 0 ? 'text-[#A87925]' : 'text-[#3F7655]'
            }`}>
              {historyStats.anomalyCount} samples
            </span>
          </div>

          <div className="bg-[#FFFFFF] border border-[#D8D8D5] p-3">
            <span className="text-[10px] text-[#666666] font-semibold uppercase block">Statutory Alarms</span>
            <span className={`text-sm sm:text-base font-bold font-mono mt-0.5 block ${
              historyStats.totalAlerts > 0 ? 'text-[#A84444]' : 'text-[#222222]'
            }`}>
              {historyStats.totalAlerts} alarms
            </span>
          </div>
        </div>
      )}

      {/* 3. Main Historical Chart */}
      <TiltChart 
        chartData={activeChartData}
        currentN3Tilt={currentN3Tilt}
      />

      {/* 4. Step Progression Reference Table */}
      <div className="bg-[#FFFFFF] border border-[#D8D8D5]">
        <div className="px-4 sm:px-5 py-3 border-b border-[#D8D8D5] bg-[#F7F7F5] font-semibold text-xs text-[#222222] flex items-center justify-between">
          <span className="uppercase">Progression Sequence Demo Reference</span>
          <span className="text-[#666666] text-[11px] font-normal">Controlled SIH benchmark stages</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[580px] text-left text-xs border-collapse">
            <thead>
              <tr className="bg-[#F7F7F5] text-[#666666] border-b border-[#D8D8D5] text-[11px] font-semibold">
                <th className="py-2.5 px-3.5 sm:px-4">Step</th>
                <th className="py-2.5 px-3.5 sm:px-4">Interval</th>
                <th className="py-2.5 px-3.5 sm:px-4 text-right">Tilt (°)</th>
                <th className="py-2.5 px-3.5 sm:px-4 text-right">Displacement</th>
                <th className="py-2.5 px-3.5 sm:px-4">Description</th>
                <th className="py-2.5 px-3.5 sm:px-4 text-center">Status</th>
                <th className="py-2.5 px-3.5 sm:px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#D8D8D5]">
              {N3_SIMULATION_STEPS.map((s, idx) => (
                <tr 
                  key={idx}
                  className={`transition-colors ${simStep === idx ? 'bg-[#F7F7F5] font-semibold' : 'hover:bg-[#F7F7F5]/50'}`}
                >
                  <td className="py-2.5 px-3.5 sm:px-4 font-bold text-[#222222]">Step {s.step + 1}</td>
                  <td className="py-2.5 px-3.5 sm:px-4 text-[#666666]">{s.time}</td>
                  <td className="py-2.5 px-3.5 sm:px-4 text-right font-bold text-[#222222]">{s.tilt.toFixed(2)}°</td>
                  <td className="py-2.5 px-3.5 sm:px-4 text-right text-[#666666]">{s.displacement.toFixed(2)} mm</td>
                  <td className="py-2.5 px-3.5 sm:px-4 text-[#222222]">{s.description}</td>
                  <td className="py-2.5 px-3.5 sm:px-4 text-center">
                    <span className={`font-bold text-[11px] ${
                      s.status === 'Critical' ? 'text-[#A84444]' : s.status === 'Warning' ? 'text-[#A87925]' : 'text-[#3F7655]'
                    }`}>
                      ● {s.status.toUpperCase()}
                    </span>
                  </td>
                  <td className="py-2.5 px-3.5 sm:px-4 text-right">
                    <button
                      onClick={() => onSetSimStep && onSetSimStep(idx)}
                      aria-label={`Set simulation to Step ${s.step + 1}`}
                      className="px-2 py-1 bg-[#FFFFFF] border border-[#D8D8D5] text-[#222222] hover:bg-[#F7F7F5] text-[11px] font-medium transition-colors"
                    >
                      Set Step
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
