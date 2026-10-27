import React from 'react';
import { getStatusColor } from '../data/sensors';

/**
 * SelectedNodeTelemetry Component - Clean Engineering Telemetry Display
 */
export default function SelectedNodeTelemetry({ node }) {
  if (!node) return null;
  const statusMeta = getStatusColor(node.status);

  return (
    <div className="bg-[#FFFFFF] border border-[#D8D8D5] p-3.5 sm:p-5 font-sans select-none overflow-hidden">
      {/* Header */}
      <div className="border-b border-[#D8D8D5] pb-2.5 sm:pb-3 mb-3 sm:mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-[#666666]">
            SELECTED NODE TELEMETRY
          </div>
          <h2 className="text-sm sm:text-base font-bold text-[#222222] mt-0.5">
            NODE {node.id}
          </h2>
          <p className="text-[11px] sm:text-xs text-[#666666]">{node.location}</p>
        </div>

        <div className="text-right">
          <div className="text-[10px] sm:text-[11px] text-[#666666]">System Status</div>
          <div className={`text-xs sm:text-sm font-bold mt-0.5 ${statusMeta.text}`}>
            ● {statusMeta.label}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
        {['accel_x', 'accel_y', 'accel_z', 'gyro_x', 'gyro_y', 'gyro_z'].map(key => (
          <div key={key} className="border border-[#D8D8D5] p-2 text-xs">
            <span className="uppercase text-[#666666]">{key.replace('_', ' ')} </span>
            <strong>{Number.isFinite(node[key]) ? node[key].toFixed(4) : 'Not reported'}</strong>
          </div>
        ))}
      </div>
      <p className="text-xs text-[#666666] mb-3">Motion values use the units configured in your sensor firmware.</p>
      {/* Main Metric Blocks */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-4">
        {/* Tilt */}
        <div className="p-2.5 sm:p-3 bg-[#F7F7F5] border border-[#D8D8D5]">
          <div className="text-[10px] sm:text-[11px] font-semibold text-[#666666] uppercase">
            Tilt
          </div>
          <div className={`text-xl sm:text-2xl font-bold mt-0.5 sm:mt-1 ${statusMeta.text}`}>
            {node.tilt.toFixed(2)}°
          </div>
          <div className="text-[10px] sm:text-[10.5px] text-[#666666] mt-0.5 sm:mt-1 truncate">
            X: {node.tilt_x?.toFixed(2) || '0.00'}° | Y: {node.tilt_y?.toFixed(2) || '0.00'}°
          </div>
        </div>

        {/* Temperature */}
        <div className="p-2.5 sm:p-3 bg-[#F7F7F5] border border-[#D8D8D5]">
          <div className="text-[10px] sm:text-[11px] font-semibold text-[#666666] uppercase">
            Temperature
          </div>
          <div className="text-xl sm:text-2xl font-bold text-[#222222] mt-0.5 sm:mt-1">
            {node.temperature?.toFixed(1) || '26.8'} °C
          </div>
          <div className="text-[10px] sm:text-[10.5px] text-[#666666] mt-0.5 sm:mt-1">
            Internal Sensor
          </div>
        </div>

        {/* Displacement */}
        <div className="p-2.5 sm:p-3 bg-[#F7F7F5] border border-[#D8D8D5]">
          <div className="text-[10px] sm:text-[11px] font-semibold text-[#666666] uppercase">
            Displacement
          </div>
          <div className="text-xl sm:text-2xl font-bold text-[#222222] mt-0.5 sm:mt-1">
            {node.displacement?.toFixed(2) || '0.00'} mm
          </div>
          <div className="text-[10px] sm:text-[10.5px] text-[#666666] mt-0.5 sm:mt-1">
            Vertical Surface Shift
          </div>
        </div>

        {/* Last Update */}
        <div className="p-2.5 sm:p-3 bg-[#F7F7F5] border border-[#D8D8D5]">
          <div className="text-[10px] sm:text-[11px] font-semibold text-[#666666] uppercase">
            Last update
          </div>
          <div className="text-sm sm:text-base font-bold text-[#222222] mt-0.5 sm:mt-1">
            {node.lastSeen || '2 sec ago'}
          </div>
          <div className="text-[10px] sm:text-[10.5px] text-[#666666] mt-0.5 sm:mt-1 truncate">
            {node.gateway_id || 'N3'} ({node.hop_count !== undefined ? `${node.hop_count} hops` : '0 hops'})
          </div>
        </div>
      </div>
    </div>
  );
}
