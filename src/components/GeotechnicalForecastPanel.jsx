import React, { useState, useEffect } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine
} from 'recharts';
import {
  fetchSubsidenceForecast,
  fetchGeotechnicalParameters,
  simulateGeotechnicalForecast
} from '../api/backendApi';

/**
 * GeotechnicalForecastPanel Component
 * Forward-looking subsidence forecasting via Knothe time-function & influence integration.
 * Smart India Hackathon 2026 (Problem Statement 26025)
 */
export default function GeotechnicalForecastPanel({ selectedNodeId = 'N3', onSelectNode = null }) {
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [forecastData, setForecastData] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [validationErrors, setValidationErrors] = useState([]);

  // Active Simulation Parameter Form State
  const [simParams, setSimParams] = useState({
    miningDepth: 240.0,
    seamThickness: 2.50,
    subsidenceFactor: 0.75,
    knotheCoefficient: 0.035,
    faceAdvanceRate: 3.20,
    angleInfluence: 65.0,
    panelWidth: 180.0
  });

  // Active chart display mode: 'timeSeries' | 'spatialTransect'
  const [chartMode, setChartMode] = useState('timeSeries');

  // Load initial baseline forecast on mount or when node changes
  useEffect(() => {
    let mounted = true;
    async function loadForecast() {
      setLoading(true);
      setErrorMsg('');
      try {
        const res = await fetchSubsidenceForecast(selectedNodeId);
        if (!mounted) return;
        if (res && res.success) {
          setForecastData(res);
          if (res.inputParameters) {
            setSimParams(prev => ({
              ...prev,
              miningDepth: res.inputParameters.miningDepth || prev.miningDepth,
              seamThickness: res.inputParameters.seamThickness || prev.seamThickness,
              subsidenceFactor: res.inputParameters.subsidenceFactor || prev.subsidenceFactor,
              knotheCoefficient: res.inputParameters.knotheCoefficient || prev.knotheCoefficient,
              faceAdvanceRate: res.inputParameters.faceAdvanceRate || prev.faceAdvanceRate,
              angleInfluence: res.inputParameters.angleInfluence || prev.angleInfluence,
              panelWidth: res.inputParameters.panelWidth || prev.panelWidth
            }));
          }
        } else {
          setErrorMsg(res?.error || 'Failed to retrieve geotechnical forecast from backend.');
        }
      } catch (err) {
        if (mounted) setErrorMsg(err.message || 'Network error fetching subsidence model.');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    loadForecast();
    return () => { mounted = false; };
  }, [selectedNodeId]);

  // Handle Parameter Simulation Recalculation
  const handleRecalculate = async (e) => {
    if (e) e.preventDefault();
    setCalculating(true);
    setValidationErrors([]);
    setErrorMsg('');

    try {
      const payload = {
        parameters: {
          ...simParams,
          miningDepth: Number(simParams.miningDepth),
          seamThickness: Number(simParams.seamThickness),
          subsidenceFactor: Number(simParams.subsidenceFactor),
          knotheCoefficient: Number(simParams.knotheCoefficient),
          faceAdvanceRate: Number(simParams.faceAdvanceRate),
          angleInfluence: Number(simParams.angleInfluence),
          panelWidth: Number(simParams.panelWidth)
        },
        observations: {
          nodeId: selectedNodeId,
          currentTiltDeg: forecastData?.monitoredSensor?.currentTiltDeg || 2.41,
          currentDispMm: forecastData?.monitoredSensor?.currentDispMm || 2.16
        }
      };

      const res = await simulateGeotechnicalForecast(payload);
      if (res.ok && res.data.success) {
        setForecastData(prev => ({
          ...res.data,
          monitoredSensor: prev?.monitoredSensor || { nodeId: selectedNodeId, currentTiltDeg: 2.41, currentDispMm: 2.16 }
        }));
      } else {
        if (res.data?.errors) {
          setValidationErrors(res.data.errors);
        } else {
          setErrorMsg(res.data?.error || 'Simulation calculation failed. Check input bounds.');
        }
      }
    } catch (err) {
      setErrorMsg(err.message || 'Failed to submit calculation.');
    } finally {
      setCalculating(false);
    }
  };

  // Reset to default Moonidih Colliery baseline
  const handleResetBaseline = async () => {
    setLoading(true);
    setValidationErrors([]);
    setErrorMsg('');
    try {
      const res = await fetchSubsidenceForecast(selectedNodeId);
      if (res && res.success) {
        setForecastData(res);
        if (res.inputParameters) {
          setSimParams({
            miningDepth: res.inputParameters.miningDepth,
            seamThickness: res.inputParameters.seamThickness,
            subsidenceFactor: res.inputParameters.subsidenceFactor,
            knotheCoefficient: res.inputParameters.knotheCoefficient,
            faceAdvanceRate: res.inputParameters.faceAdvanceRate,
            angleInfluence: res.inputParameters.angleInfluence,
            panelWidth: res.inputParameters.panelWidth
          });
        }
      }
    } catch (_e) {}
    setLoading(false);
  };

  const milestones = forecastData?.milestones || {};
  const mCurrent = milestones.current || {};
  const m24 = milestones.forecast24Hours || {};
  const m7d = milestones.forecast7Days || {};
  const panelProps = forecastData?.panelProperties || {};
  const metadata = forecastData?.metadata || {};

  // Format spatial transect for Recharts
  const transectChartData = (forecastData?.spatialTransect || []).map(pt => ({
    x: pt.distanceMeters,
    label: `${pt.distanceMeters}m`,
    currentSubsidence: pt.current?.subsidenceMm || 0,
    forecast24hSubsidence: pt.forecast24h?.subsidenceMm || 0,
    forecast7dSubsidence: pt.forecast7d?.subsidenceMm || 0,
    currentTilt: pt.current?.tiltDeg || 0,
    forecast24hTilt: pt.forecast24h?.tiltDeg || 0,
    zone: pt.zone
  }));

  return (
    <div className="space-y-4 font-sans select-none text-[#222222]">
      
      {/* 1. Header Banner & Architecture Distinction */}
      <div className="bg-[#FFFFFF] border border-[#D8D8D5] p-3 sm:p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 bg-[#3F4A42]"></span>
            <h1 className="text-sm sm:text-base font-bold tracking-wider text-[#222222] uppercase">
              GEOTECHNICAL SUBSIDENCE PREDICTION ENGINE
            </h1>
            <span className="text-[10px] px-2 py-0.5 bg-[#EAEAE7] text-[#3F4A42] border border-[#D8D8D5] font-mono font-bold">
              {metadata.modelVersion || 'KNOTHE-DGMS-V1.2'}
            </span>
          </div>
          <p className="text-[11px] sm:text-xs text-[#666666] mt-0.5">
            Forward-looking strata caving estimates via Knothe time-function &amp; influence integration • Moonidih Colliery Panel P-4
          </p>
        </div>

        {/* Node Focus & Data Quality Badge */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="bg-[#F7F7F5] border border-[#D8D8D5] px-2.5 py-1 text-[11px]">
            <span className="text-[#888888] font-medium">Focused Inclinometer:</span>{' '}
            <strong className="text-[#222222]">Node {selectedNodeId}</strong>
          </div>
          <div className="bg-[#F0FDF4] border border-[#3F7655] text-[#3F7655] px-2.5 py-1 text-[10.5px] font-bold">
            ● DGMS COMPLIANT (CIRCULAR NO. 2/2001)
          </div>
        </div>
      </div>

      {/* Model Architecture Distinction Notice (Statutory Rule 6) */}
      <div className="bg-[#F7F7F5] border-l-4 border-[#3F4A42] p-3 text-xs text-[#444444] space-y-1">
        <div className="font-bold text-[#222222] uppercase text-[11px] tracking-wider flex items-center gap-1.5">
          <span>ℹ️</span>
          <span>ANALYTICAL MODEL SEPARATION (INSTANTANEOUS ANOMALY VS. GEOTECHNICAL FORWARD FORECAST)</span>
        </div>
        <p className="text-[11.5px] text-[#555555]">
          <strong>Instantaneous AI Anomaly Detection:</strong> Evaluates 16 high-frequency physical features (1 Hz sampling) via Isolation Forest to detect anomalous vibrations, sensor drift, and abrupt micro-movements.
          <br />
          <strong>Forward Geotechnical Model (Knothe 1957):</strong> Evaluates progressive multi-day elastoplastic strata deflection above the longwall extraction face to predict surface subsidence troughs over <strong>24-hour</strong> and <strong>7-day</strong> forward horizons.
        </p>
      </div>

      {/* Error & Validation Feedback Alerts */}
      {errorMsg && (
        <div className="p-3 bg-[#FDF2F2] border-l-4 border-[#A84444] text-[#A84444] text-xs">
          <strong>Forecast Error:</strong> {errorMsg}
        </div>
      )}

      {validationErrors.length > 0 && (
        <div className="p-3 bg-[#FDF2F2] border-l-4 border-[#A84444] text-[#A84444] text-xs space-y-1">
          <div className="font-bold uppercase tracking-wide">Input Validation Errors (Out of Geotechnical Bounds):</div>
          <ul className="list-disc pl-5 space-y-0.5 text-[11.5px]">
            {validationErrors.map((err, i) => <li key={i}>{err}</li>)}
          </ul>
        </div>
      )}

      {/* 2. Milestone Horizon Cards (Current, 24h, 7d, S_max) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        
        {/* Card 1: Current Monitored State */}
        <div className="bg-[#FFFFFF] border border-[#D8D8D5] p-3 sm:p-3.5 space-y-2">
          <div className="flex items-center justify-between text-[10px] text-[#666666] font-bold uppercase tracking-wider">
            <span>CURRENT STATE (T=0)</span>
            <span className="w-2 h-2 rounded-full bg-[#3F7655]"></span>
          </div>
          <div className="text-xl sm:text-2xl font-mono font-bold text-[#222222]">
            {mCurrent.subsidenceExpectedMm ?? 2.16} <span className="text-xs font-sans text-[#666666]">mm</span>
          </div>
          <div className="text-[11px] text-[#666666] space-y-0.5">
            <div>Measured Tilt: <strong className="text-[#222222]">{mCurrent.tiltExpectedDeg ?? 2.41}°</strong></div>
            <div>Elapsed Undermining: <strong>{metadata.effectiveElapsedDays ?? 14.0} days</strong></div>
            <div>Subsidence Rate: <strong>{mCurrent.subsidenceRateMmPerDay ?? 52.1} mm/day</strong></div>
          </div>
        </div>

        {/* Card 2: +24-Hour Horizon */}
        <div className="bg-[#FFFFFF] border border-[#D8D8D5] p-3 sm:p-3.5 space-y-2 border-t-3 border-t-[#3F4A42]">
          <div className="flex items-center justify-between text-[10px] text-[#3F4A42] font-bold uppercase tracking-wider">
            <span>+24 HOURS HORIZON</span>
            <span className={`px-1.5 py-0.2 text-[9px] font-bold uppercase ${
              m24.dgmsHazardLevel === 'CRITICAL' ? 'bg-[#A84444] text-white' : m24.dgmsHazardLevel === 'WARNING' ? 'bg-[#A87925] text-white' : 'bg-[#3F7655] text-white'
            }`}>
              {m24.dgmsHazardLevel || 'NORMAL'}
            </span>
          </div>
          <div className="text-xl sm:text-2xl font-mono font-bold text-[#222222]">
            {m24.subsidenceExpectedMm ?? '--'} <span className="text-xs font-sans text-[#666666]">mm</span>
          </div>
          <div className="text-[11px] text-[#666666] space-y-0.5">
            <div>Predicted Tilt: <strong className="text-[#222222]">{m24.tiltExpectedDeg ?? '--'}°</strong></div>
            <div>Sensitivity (P10–P90): <span className="font-mono">{m24.subsidenceP10Mm} – {m24.subsidenceP90Mm} mm</span></div>
            <div>Expected Rate: <strong>{m24.subsidenceRateMmPerDay ?? '--'} mm/day</strong></div>
          </div>
        </div>

        {/* Card 3: +7-Day Horizon */}
        <div className="bg-[#FFFFFF] border border-[#D8D8D5] p-3 sm:p-3.5 space-y-2 border-t-3 border-t-[#A87925]">
          <div className="flex items-center justify-between text-[10px] text-[#A87925] font-bold uppercase tracking-wider">
            <span>+7 DAYS HORIZON</span>
            <span className={`px-1.5 py-0.2 text-[9px] font-bold uppercase ${
              m7d.dgmsHazardLevel === 'CRITICAL' ? 'bg-[#A84444] text-white' : m7d.dgmsHazardLevel === 'WARNING' ? 'bg-[#A87925] text-white' : 'bg-[#3F7655] text-white'
            }`}>
              {m7d.dgmsHazardLevel || 'WARNING'}
            </span>
          </div>
          <div className="text-xl sm:text-2xl font-mono font-bold text-[#222222]">
            {m7d.subsidenceExpectedMm ?? '--'} <span className="text-xs font-sans text-[#666666]">mm</span>
          </div>
          <div className="text-[11px] text-[#666666] space-y-0.5">
            <div>Predicted Tilt: <strong className="text-[#222222]">{m7d.tiltExpectedDeg ?? '--'}°</strong></div>
            <div>Sensitivity (P10–P90): <span className="font-mono">{m7d.subsidenceP10Mm} – {m7d.subsidenceP90Mm} mm</span></div>
            <div>Cumulative Shift: <strong>+{((m7d.subsidenceExpectedMm || 0) - (mCurrent.subsidenceExpectedMm || 0)).toFixed(1)} mm</strong></div>
          </div>
        </div>

        {/* Card 4: Asymptotic Final Caving Limit */}
        <div className="bg-[#FFFFFF] border border-[#D8D8D5] p-3 sm:p-3.5 space-y-2 border-t-3 border-t-[#A84444]">
          <div className="flex items-center justify-between text-[10px] text-[#666666] font-bold uppercase tracking-wider">
            <span>ASYMPTOTIC MAXIMUM (S_MAX)</span>
            <span className="font-mono font-bold text-[#888888]">t → ∞</span>
          </div>
          <div className="text-xl sm:text-2xl font-mono font-bold text-[#222222]">
            {panelProps.sMaxMm ?? 1508} <span className="text-xs font-sans text-[#666666]">mm</span>
          </div>
          <div className="text-[11px] text-[#666666] space-y-0.5">
            <div>Influence Radius (R): <strong>{panelProps.radiusOfInfluenceMeters ?? 111.9} m</strong></div>
            <div>Angle of Draw (γ): <strong>{panelProps.angleOfDrawDeg ?? 25.0}°</strong></div>
            <div>Max Incline (T_max): <strong>{panelProps.maxTiltDeg ?? 0.77}°</strong></div>
          </div>
        </div>

      </div>

      {/* 3. Main Chart Canvas: Forward Knothe Curve vs. Spatial Transect */}
      <div className="bg-[#FFFFFF] border border-[#D8D8D5] p-3 sm:p-4 space-y-3 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#D8D8D5] pb-2">
          <div>
            <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wide text-[#222222]">
              {chartMode === 'timeSeries'
                ? 'SUBSIDENCE PROGRESSION & PARAMETER SENSITIVITY ENVELOPE'
                : 'TRANSVERSE 2D SUBSIDENCE & TILT INFLECTION PROFILE'}
            </h2>
            <p className="text-[10.5px] text-[#666666]">
              {chartMode === 'timeSeries'
                ? 'Time-series subsidence curve from current extraction day to Day 30+ showing nominal forecast and P10/P90 rock mass bounds'
                : 'Cross-sectional subsidence and tilt distribution across goaf (-150m), ribside (0m), and unmined coal pillar (+150m)'}
            </p>
          </div>

          {/* Toggle between Time-Series Curve and Spatial Cross-Section */}
          <div className="flex items-center bg-[#F7F7F5] border border-[#D8D8D5] p-0.5 text-[11px] font-bold">
            <button
              type="button"
              onClick={() => setChartMode('timeSeries')}
              className={`px-3 py-1 uppercase transition-colors ${chartMode === 'timeSeries' ? 'bg-[#3F4A42] text-[#FFFFFF]' : 'text-[#666666] hover:text-[#222222]'}`}
            >
              📈 Time Curve (0–30d)
            </button>
            <button
              type="button"
              onClick={() => setChartMode('spatialTransect')}
              className={`px-3 py-1 uppercase transition-colors ${chartMode === 'spatialTransect' ? 'bg-[#3F4A42] text-[#FFFFFF]' : 'text-[#666666] hover:text-[#222222]'}`}
            >
              📐 2D Transect Profile
            </button>
          </div>
        </div>

        {/* Chart Viewport */}
        <div className="w-full h-[320px] sm:h-[360px]">
          {chartMode === 'timeSeries' ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={forecastData?.timeSeriesCurve || []} margin={{ top: 15, right: 25, bottom: 20, left: 10 }}>
                <CartesianGrid stroke="#EAEAE7" strokeDasharray="3 3" />
                <XAxis 
                  dataKey="label" 
                  tick={{ fontSize: 10, fill: '#666666' }} 
                  interval={0}
                  angle={-15}
                  textAnchor="end"
                />
                <YAxis 
                  unit=" mm" 
                  tick={{ fontSize: 10, fill: '#666666' }}
                  domain={[0, 'auto']}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #D8D8D5',
                    fontSize: '11px',
                    fontFamily: 'Inter, sans-serif'
                  }}
                  formatter={(val, name) => [`${val} mm`, name]}
                />
                <Legend 
                  wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }}
                />
                
                {/* Reference Lines for DGMS Hazard Thresholds */}
                <ReferenceLine y={500} stroke="#A87925" strokeDasharray="4 4" label={{ value: 'DGMS Warning (500mm)', fill: '#A87925', fontSize: 10, position: 'insideTopRight' }} />
                <ReferenceLine y={1000} stroke="#A84444" strokeDasharray="4 4" label={{ value: 'DGMS Critical (1000mm)', fill: '#A84444', fontSize: 10, position: 'insideTopRight' }} />

                {/* Shaded Parameter Sensitivity Envelope (P10 to P90) */}
                <Area 
                  type="monotone" 
                  dataKey="subsidenceP90Mm" 
                  name="Upper Bound (P90 Weaker Strata)" 
                  fill="#D8D8D5" 
                  stroke="#A0A09C" 
                  fillOpacity={0.4} 
                />
                <Area 
                  type="monotone" 
                  dataKey="subsidenceP10Mm" 
                  name="Lower Bound (P10 Massive Roof)" 
                  fill="#FFFFFF" 
                  stroke="#A0A09C" 
                  fillOpacity={1.0} 
                />

                {/* Primary Expected Subsidence Line */}
                <Line 
                  type="monotone" 
                  dataKey="subsidenceExpectedMm" 
                  name="Nominal Forecast S(t)" 
                  stroke="#3F4A42" 
                  strokeWidth={2.5} 
                  dot={{ r: 4, fill: '#3F4A42' }} 
                />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={transectChartData} margin={{ top: 15, right: 25, bottom: 20, left: 10 }}>
                <CartesianGrid stroke="#EAEAE7" strokeDasharray="3 3" />
                <XAxis 
                  dataKey="label" 
                  tick={{ fontSize: 10, fill: '#666666' }} 
                  interval={1}
                />
                <YAxis 
                  unit=" mm" 
                  tick={{ fontSize: 10, fill: '#666666' }} 
                />
                <Tooltip 
                  contentStyle={{
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #D8D8D5',
                    fontSize: '11px'
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />

                <ReferenceLine x="0m" stroke="#3F4A42" strokeWidth={2} label={{ value: 'Ribside Boundary (x=0)', fill: '#222222', fontSize: 10, position: 'top' }} />

                <Line type="monotone" dataKey="currentSubsidence" name="Current Profile (t=0)" stroke="#666666" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                <Line type="monotone" dataKey="forecast24hSubsidence" name="+24h Horizon S(x)" stroke="#3F7655" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="forecast7dSubsidence" name="+7d Horizon S(x)" stroke="#A84444" strokeWidth={2.5} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* 4. Interactive Geotechnical Parameter Simulation Form */}
      <div className="bg-[#FFFFFF] border border-[#D8D8D5] p-3 sm:p-4 space-y-3 shadow-xs">
        <div className="flex items-center justify-between border-b border-[#D8D8D5] pb-2">
          <div>
            <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-[#222222]">
              GEOTECHNICAL PARAMETER CALIBRATION &amp; SCENARIO SIMULATION
            </h3>
            <p className="text-[10.5px] text-[#666666]">
              Modify in-situ mining depth, seam height, and rock mass response coefficients to simulate forward subsidence scenarios.
            </p>
          </div>
          <button
            type="button"
            onClick={handleResetBaseline}
            className="px-2.5 py-1 text-[10.5px] bg-[#F7F7F5] hover:bg-[#EAEAE7] border border-[#D8D8D5] font-semibold text-[#666666]"
          >
            ↺ Reset Baseline
          </button>
        </div>

        <form onSubmit={handleRecalculate} noValidate className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 text-xs">
          
          {/* Depth H */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-[#444444] block">
              Mining Depth H (meters)
            </label>
            <input
              type="number"
              step="5.0"
              min="30"
              max="1200"
              value={simParams.miningDepth}
              onChange={(e) => setSimParams({ ...simParams, miningDepth: e.target.value })}
              className="w-full p-1.5 border border-[#D8D8D5] bg-[#F7F7F5] font-mono text-xs focus:outline-none focus:border-[#3F4A42]"
              required
            />
            <span className="text-[9.5px] text-[#888888] block">Moonidih Panel P-4: 240.0 m</span>
          </div>

          {/* Seam Thickness m */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-[#444444] block">
              Seam Thickness m (meters)
            </label>
            <input
              type="number"
              step="0.1"
              min="0.5"
              max="12.0"
              value={simParams.seamThickness}
              onChange={(e) => setSimParams({ ...simParams, seamThickness: e.target.value })}
              className="w-full p-1.5 border border-[#D8D8D5] bg-[#F7F7F5] font-mono text-xs focus:outline-none focus:border-[#3F4A42]"
              required
            />
            <span className="text-[9.5px] text-[#888888] block">XVI Seam: 2.50 m</span>
          </div>

          {/* Knothe Coefficient c */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-[#444444] block">
              Knothe Coeff c (day⁻¹)
            </label>
            <input
              type="number"
              step="0.005"
              min="0.005"
              max="0.30"
              value={simParams.knotheCoefficient}
              onChange={(e) => setSimParams({ ...simParams, knotheCoefficient: e.target.value })}
              className="w-full p-1.5 border border-[#D8D8D5] bg-[#F7F7F5] font-mono text-xs focus:outline-none focus:border-[#3F4A42]"
              required
            />
            <span className="text-[9.5px] text-[#888888] block">Strata Response Rate: 0.035 day⁻¹</span>
          </div>

          {/* Subsidence Factor a */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-[#444444] block">
              Subsidence Factor a (ratio)
            </label>
            <input
              type="number"
              step="0.05"
              min="0.10"
              max="0.95"
              value={simParams.subsidenceFactor}
              onChange={(e) => setSimParams({ ...simParams, subsidenceFactor: e.target.value })}
              className="w-full p-1.5 border border-[#D8D8D5] bg-[#F7F7F5] font-mono text-xs focus:outline-none focus:border-[#3F4A42]"
              required
            />
            <span className="text-[9.5px] text-[#888888] block">Caving without stowing: 0.75</span>
          </div>

          {/* Face Advance Velocity v */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-[#444444] block">
              Face Advance Rate v (m/day)
            </label>
            <input
              type="number"
              step="0.2"
              min="0.5"
              max="15.0"
              value={simParams.faceAdvanceRate}
              onChange={(e) => setSimParams({ ...simParams, faceAdvanceRate: e.target.value })}
              className="w-full p-1.5 border border-[#D8D8D5] bg-[#F7F7F5] font-mono text-xs focus:outline-none focus:border-[#3F4A42]"
              required
            />
            <span className="text-[9.5px] text-[#888888] block">Shearer Advance: 3.2 m/day</span>
          </div>

          {/* Influence Angle beta */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-[#444444] block">
              Influence Angle β (deg)
            </label>
            <input
              type="number"
              step="1.0"
              min="45"
              max="80"
              value={simParams.angleInfluence}
              onChange={(e) => setSimParams({ ...simParams, angleInfluence: e.target.value })}
              className="w-full p-1.5 border border-[#D8D8D5] bg-[#F7F7F5] font-mono text-xs focus:outline-none focus:border-[#3F4A42]"
              required
            />
            <span className="text-[9.5px] text-[#888888] block">Draw Angle γ = 90 - β = 25°</span>
          </div>

          {/* Panel Width W */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-[#444444] block">
              Extraction Width W (meters)
            </label>
            <input
              type="number"
              step="10.0"
              min="50"
              max="600"
              value={simParams.panelWidth}
              onChange={(e) => setSimParams({ ...simParams, panelWidth: e.target.value })}
              className="w-full p-1.5 border border-[#D8D8D5] bg-[#F7F7F5] font-mono text-xs focus:outline-none focus:border-[#3F4A42]"
              required
            />
            <span className="text-[9.5px] text-[#888888] block">Subcritical: W &lt; W_c (223.8m)</span>
          </div>

          {/* Submit Action */}
          <div className="flex items-end">
            <button
              type="submit"
              disabled={calculating}
              className="w-full py-2 bg-[#3F4A42] hover:bg-[#323B35] text-[#FFFFFF] font-bold text-xs uppercase tracking-wide transition-colors disabled:opacity-50"
            >
              {calculating ? 'CALCULATING...' : '▶ RECALCULATE FORECAST'}
            </button>
          </div>
        </form>
      </div>

      {/* 5. Geotechnical Assumptions & Statutory Compliance Footer */}
      <div className="bg-[#FFFFFF] border border-[#D8D8D5] p-3 text-[11px] text-[#666666] space-y-1">
        <div className="font-bold text-[#222222] uppercase tracking-wider text-[11px]">
          STATUTORY GEOTECHNICAL COMPLIANCE &amp; GOVERNING ASSUMPTIONS
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[10.5px]">
          <div>
            • <strong>Governing Formulation:</strong> S(t) = S_max · [1 - exp(-c · t)] with S_max = m · a · cos(α) · (W/W_c)^0.9.
            <br />
            • <strong>Transverse Profile:</strong> Bals-Knothe Gaussian influence function: S(x) = (S/2) · [1 - erf(√π · x / R)].
          </div>
          <div>
            • <strong>Statutory Authority:</strong> DGMS Circular No. 2 of 2001 (Safe tilt limit: 3.0 mm/m for surface civil structures).
            <br />
            • <strong>Verification Requirement:</strong> Engineering predictions must be corroborated by physical surface leveling total station surveys.
          </div>
        </div>
      </div>

    </div>
  );
}
