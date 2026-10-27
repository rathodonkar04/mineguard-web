import React from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine
} from 'recharts';
import { N3_SIMULATION_STEPS } from '../data/sensors';

function CustomChartTooltip({ active, payload, label }) {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-[#FFFFFF] text-[#222222] p-2.5 sm:p-3 border border-[#D8D8D5] shadow-xs text-[11px] sm:text-xs font-sans">
        <div className="text-[#666666] font-semibold mb-1 pb-1 border-b border-[#D8D8D5]">
          Time: {label}
        </div>
        <div className="space-y-0.5 sm:space-y-1">
          <div className="flex justify-between gap-4">
            <span className="text-[#666666]">Node N3 Tilt:</span>
            <span className="font-bold text-[#222222]">{data.tilt?.toFixed(2)}°</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-[#666666]">Displacement:</span>
            <span>{data.displacement?.toFixed(2)} mm</span>
          </div>
          <div className="flex justify-between gap-4 pt-1 border-t border-[#D8D8D5]">
            <span className="text-[#666666]">Status:</span>
            <span className={`font-bold ${
              data.tilt > 2.0 ? 'text-[#A84444]' : data.tilt >= 1.0 ? 'text-[#A87925]' : 'text-[#3F7655]'
            }`}>
              {data.tilt > 2.0 ? '● CRITICAL' : data.tilt >= 1.0 ? '● WARNING' : '● SAFE'}
            </span>
          </div>
        </div>
      </div>
    );
  }
  return null;
}

/**
 * TiltChart Component - Industrial Time-Series Inclinometer Chart
 */
export default function TiltChart({ chartData = [], currentN3Tilt = 0.3 }) {
  const latestTilt = (typeof currentN3Tilt === 'number' ? currentN3Tilt : 0.3).toFixed(2);
  const data = chartData && chartData.length > 0 ? chartData : N3_SIMULATION_STEPS.map(s => ({
    time: s.time,
    tilt: s.tilt,
    displacement: s.displacement,
    warningLimit: 1.0,
    criticalLimit: 2.0,
    state: s.tilt > 2.0 ? "Critical" : s.tilt >= 1.0 ? "Warning" : "Safe"
  }));

  return (
    <div className="bg-[#FFFFFF] border border-[#D8D8D5] flex flex-col justify-between font-sans select-none overflow-hidden">
      {/* Header */}
      <div className="px-4 sm:px-5 py-2.5 sm:py-3 border-b border-[#D8D8D5] bg-[#F7F7F5] flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-xs font-bold tracking-wider text-[#222222] uppercase">
            HISTORICAL TILT TREND (NODE N3)
          </h3>
          <p className="text-[11px] text-[#666666]">
            Surface inclination time-series over extraction progression
          </p>
        </div>

        {/* Legend */}
        <div className="flex items-center flex-wrap gap-2.5 sm:gap-4 text-[10px] sm:text-xs font-medium text-[#666666]">
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-2.5 sm:w-3 bg-[#A87925]" /> Warn (1.00°)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-2.5 sm:w-3 bg-[#A84444]" /> Crit (2.00°)
          </span>
          <span className="font-semibold text-[#222222]">
            Current: {latestTilt}°
          </span>
        </div>
      </div>

      {/* Chart Canvas */}
      <div className="p-2.5 sm:p-5">
        <div className="h-56 sm:h-64 sm:h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 15, right: 15, left: -25, bottom: 0 }}>
              <CartesianGrid strokeDasharray="2 2" stroke="#E5E5E2" vertical={false} />
              
              <XAxis 
                dataKey="time" 
                stroke="#666666" 
                tick={{ fontSize: 10, fill: '#666666' }} 
                tickLine={false}
              />
              
              <YAxis 
                stroke="#666666" 
                tick={{ fontSize: 10, fill: '#666666' }} 
                tickLine={false}
                domain={[0, 3.0]}
                unit="°"
              />

              <Tooltip content={<CustomChartTooltip />} />

              <ReferenceLine 
                y={1.0} 
                stroke="#A87925" 
                strokeDasharray="4 4" 
                strokeWidth={1.2}
                label={{ value: '1.0°', position: 'insideTopRight', fill: '#A87925', fontSize: 10, fontWeight: 600 }} 
              />

              <ReferenceLine 
                y={2.0} 
                stroke="#A84444" 
                strokeDasharray="4 4" 
                strokeWidth={1.2}
                label={{ value: '2.0°', position: 'insideTopRight', fill: '#A84444', fontSize: 10, fontWeight: 700 }} 
              />

              <Line 
                type="monotone" 
                dataKey="tilt" 
                stroke="#3F4A42" 
                strokeWidth={2} 
                dot={{ r: 2.5, fill: '#3F4A42' }}
                activeDot={{ r: 4, fill: '#3F4A42' }}
                name="Tilt (°)"
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
