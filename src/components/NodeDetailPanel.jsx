import React from 'react';
import SelectedNodeTelemetry from './SelectedNodeTelemetry';
import SensorDataTable from './SensorDataTable';

/**
 * NodeDetailPanel Component - Dedicated Nodes View
 */
export default function NodeDetailPanel({ node, onSelectAnotherNode, allNodes }) {
  if (!node) return null;

  return (
    <div className="space-y-4 font-sans select-none overflow-hidden">
      {/* View Header with Single Clear H1 */}
      <div className="bg-[#FFFFFF] p-4 sm:p-5 border border-[#D8D8D5] flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-sm sm:text-base font-bold uppercase tracking-wider text-[#222222]">
            Sensor Node Telemetry & Hardware Diagnostics
          </h1>
          <p className="text-xs text-[#666666] mt-0.5">
            Individual sensor node state, multi-axis inclinometer vectors, and RF link statistics
          </p>
        </div>

        {/* Node Switcher */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-xs">
          <span className="text-[#666666] font-medium mr-1">Select Node:</span>
          {allNodes.map(n => (
            <button
              key={n.id}
              onClick={() => onSelectAnotherNode(n.id)}
              aria-label={`Select sensor node ${n.id}`}
              className={`px-2.5 sm:px-3 py-1 text-xs font-semibold border transition-colors ${
                n.id === node.id 
                  ? 'bg-[#3F4A42] text-[#FFFFFF] border-[#3F4A42]' 
                  : 'bg-[#FFFFFF] text-[#222222] border-[#D8D8D5] hover:bg-[#F7F7F5]'
              }`}
            >
              {n.id}
            </button>
          ))}
        </div>
      </div>

      {/* Selected Node Details Box */}
      <SelectedNodeTelemetry node={node} />

      {/* Array Table */}
      <SensorDataTable 
        nodes={allNodes}
        selectedNodeId={node.id}
        onSelectNode={onSelectAnotherNode}
      />
    </div>
  );
}
