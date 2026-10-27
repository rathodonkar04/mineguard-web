import React from 'react';
import { getStatusColor } from '../data/sensors';

/**
 * SensorDataTable Component - Engineering Telemetry Table
 * Responsive: Horizontal scroll container with protected column widths
 */
export default function SensorDataTable({ nodes, selectedNodeId, onSelectNode }) {
  return (
    <div className="bg-[#FFFFFF] border border-[#D8D8D5] select-none font-sans overflow-hidden">
      {/* Table Header */}
      <div className="px-4 sm:px-5 py-3 border-b border-[#D8D8D5] bg-[#F7F7F5] flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-xs font-bold tracking-wider text-[#222222] uppercase">
            SENSOR NODE TELEMETRY TABLE
          </h3>
          <p className="text-[11px] text-[#666666]">
            Real-time geotechnical acquisitions across all active surface transect points
          </p>
        </div>
        <div className="text-[11px] sm:text-xs text-[#666666]">
          Array: <span className="font-semibold text-[#222222]">{nodes.length} Active Nodes</span>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-left text-xs border-collapse">
          <thead>
            <tr className="bg-[#F7F7F5] text-[#666666] border-b border-[#D8D8D5] text-[11px] font-semibold">
              <th className="py-2.5 px-3.5 sm:px-4 font-semibold">Node</th>
              <th className="py-2.5 px-3.5 sm:px-4 font-semibold">Zone</th>
              <th className="py-2.5 px-3.5 sm:px-4 text-right font-semibold">Tilt</th>
              <th className="py-2.5 px-3.5 sm:px-4 text-right font-semibold">Temperature</th>
              <th className="py-2.5 px-3.5 sm:px-4 text-right font-semibold">Displacement</th>
              <th className="py-2.5 px-3.5 sm:px-4 text-center font-semibold">Hops</th>
              <th className="py-2.5 px-3.5 sm:px-4 text-right font-semibold">Last Update</th>
              <th className="py-2.5 px-3.5 sm:px-4 text-center font-semibold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#D8D8D5]">
            {nodes.map((node) => {
              const statusMeta = getStatusColor(node.status);
              const isSelected = selectedNodeId === node.id;

              return (
                <tr
                  key={node.id}
                  onClick={() => onSelectNode(node.id)}
                  className={`cursor-pointer transition-colors ${
                    isSelected ? 'bg-[#F7F7F5] font-semibold text-[#222222]' : 'hover:bg-[#F7F7F5]/50 text-[#222222]'
                  }`}
                >
                  {/* Node */}
                  <td className="py-2.5 sm:py-3 px-3.5 sm:px-4 font-bold text-[#222222]">
                    {node.name} ({node.node_id || node.id})
                  </td>

                  {/* Zone */}
                  <td className="py-2.5 sm:py-3 px-3.5 sm:px-4 text-[#666666]">
                    {node.location}
                  </td>

                  {/* Tilt */}
                  <td className="py-2.5 sm:py-3 px-3.5 sm:px-4 text-right font-bold text-[#222222]">
                    {node.tilt.toFixed(2)}°
                  </td>

                  {/* Temperature */}
                  <td className="py-2.5 sm:py-3 px-3.5 sm:px-4 text-right text-[#222222]">
                    {node.temperature?.toFixed(1) || '26.8'} °C
                  </td>

                  {/* Displacement */}
                  <td className="py-2.5 sm:py-3 px-3.5 sm:px-4 text-right text-[#222222]">
                    {node.displacement?.toFixed(2) || '0.00'} mm
                  </td>

                  {/* Hop Count */}
                  <td className="py-2.5 sm:py-3 px-3.5 sm:px-4 text-center text-[#666666]">
                    {node.hop_count !== undefined ? `${node.hop_count}` : '0'}
                  </td>

                  {/* Last Update */}
                  <td className="py-2.5 sm:py-3 px-3.5 sm:px-4 text-right text-[#666666]">
                    {node.lastSeen || '2 sec ago'}
                  </td>

                  {/* Status */}
                  <td className="py-2.5 sm:py-3 px-3.5 sm:px-4 text-center">
                    <span className={`inline-block font-bold text-[11px] ${statusMeta.text}`}>
                      ● {statusMeta.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
