import React, { useState } from 'react';
import GisMineMap from './GisMineMap';

/**
 * MinePanelMap Component - Unified Geospatial GIS & Engineering Schematic View
 * Smart India Hackathon 2026 (Problem Statement 26025)
 */
export default function MinePanelMap({ nodes, selectedNodeId, onSelectNode }) {
  const [mapMode, setMapMode] = useState('gis'); // 'gis' | 'schematic'

  const nodeDict = {
    N1: nodes.find(n => n.id === 'N1') || { id: 'N1', tilt: 0.21, status: 'Safe', zone: 'Zone A' },
    N2: nodes.find(n => n.id === 'N2') || { id: 'N2', tilt: 0.74, status: 'Warning', zone: 'Zone B' },
    N3: nodes.find(n => n.id === 'N3') || { id: 'N3', tilt: 0.30, status: 'Safe', zone: 'Zone C' },
    N4: nodes.find(n => n.id === 'N4') || { id: 'N4', tilt: 0.15, status: 'Safe', zone: 'Zone D' }
  };

  const getNodeColor = (status) => {
    const s = String(status || '').toLowerCase();
    if (s === 'critical') return '#A84444';
    if (s === 'warning') return '#A87925';
    return '#3F7655';
  };

  const getStatusText = (status) => {
    const s = String(status || '').toLowerCase();
    if (s === 'critical') return '● CRITICAL';
    if (s === 'warning') return '● WARNING';
    return '● SAFE';
  };

  return (
    <div className="bg-[#FFFFFF] border border-[#D8D8D5] flex flex-col select-none font-sans overflow-hidden">
      
      {/* Primary Representation Switcher Header */}
      <div className="px-3 sm:px-4 py-2 border-b border-[#D8D8D5] bg-[#F7F7F5] flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 bg-[#3F4A42]"></span>
          <span className="font-bold text-xs uppercase tracking-wider text-[#222222]">
            Strata Extraction Grid &amp; Surface Map
          </span>
          <span className="text-[10px] px-1.5 py-0.2 bg-[#EAEAE7] text-[#666666] border border-[#D8D8D5] font-mono hidden sm:inline">
            Panel P-4 Moonidih
          </span>
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center bg-[#FFFFFF] border border-[#D8D8D5] p-0.5">
          <button
            type="button"
            onClick={() => setMapMode('gis')}
            className={`px-3 py-1 text-[11px] font-bold uppercase transition-colors flex items-center gap-1.5 ${
              mapMode === 'gis'
                ? 'bg-[#3F4A42] text-[#FFFFFF]'
                : 'text-[#666666] hover:text-[#222222]'
            }`}
            aria-label="Switch to Interactive GIS Map"
          >
            <span>🗺️</span>
            <span>Interactive GIS Map</span>
          </button>
          
          <button
            type="button"
            onClick={() => setMapMode('schematic')}
            className={`px-3 py-1 text-[11px] font-bold uppercase transition-colors flex items-center gap-1.5 ${
              mapMode === 'schematic'
                ? 'bg-[#3F4A42] text-[#FFFFFF]'
                : 'text-[#666666] hover:text-[#222222]'
            }`}
            aria-label="Switch to Engineering Schematic"
          >
            <span>📐</span>
            <span>CAD Schematic</span>
          </button>
        </div>
      </div>

      {/* VIEW 1: INTERACTIVE GIS MAP (LEAFLET) */}
      {mapMode === 'gis' ? (
        <div className="h-[430px] w-full">
          <GisMineMap 
            nodes={nodes} 
            selectedNodeId={selectedNodeId} 
            onSelectNode={onSelectNode} 
          />
        </div>
      ) : (
        /* VIEW 2: CLASSIC SCADA ENGINEERING SCHEMATIC */
        <div className="flex flex-col">
          <div className="px-3.5 sm:px-5 py-2 border-b border-[#D8D8D5] bg-[#FFFFFF] flex items-center justify-between text-xs">
            <div>
              <h2 className="text-[11px] sm:text-xs font-bold tracking-wider text-[#222222] uppercase">
                PANEL EXTRACTION SCHEMATIC &amp; MESH NETWORK
              </h2>
              <p className="text-[10px] sm:text-[11px] text-[#666666]">
                Surface monitoring grid above Moonidih Colliery Panel P-4 extraction zone
              </p>
            </div>
            <div className="text-[10.5px] sm:text-[11px] text-[#666666] font-medium hidden sm:block">
              Mesh Protocol: <span className="text-[#222222] font-semibold">ESP-NOW 2.4 GHz</span>
            </div>
          </div>

          {/* SVG Engineering Schematic Canvas */}
          <div className="p-2 sm:p-4 md:p-6 bg-[#FFFFFF] flex-1 flex flex-col justify-center items-center">
            <svg
              viewBox="0 0 760 380"
              className="w-full h-auto max-h-[380px]"
              role="img"
              aria-label="Schematic diagram of Panel 4 extraction area showing sensor nodes N1, N2, N3, N4 connected via wireless ESP-NOW mesh"
            >
              <title>Panel 4 Surface Subsidence Monitoring Schematic</title>
              <desc>Visualizes sensor positions, zone boundaries, ESP-NOW wireless links, and goaf extraction area.</desc>

              {/* Main Extraction Panel Boundary */}
              <rect
                x="80"
                y="40"
                width="600"
                height="260"
                fill="#F7F7F5"
                stroke="#3F4A42"
                strokeWidth="1.5"
                strokeDasharray="4,4"
              />

              {/* Panel Label */}
              <text x="380" y="175" fill="#B0B0AC" fontSize="20" fontWeight="bold" letterSpacing="4" textAnchor="middle">
                PANEL 4 EXTRACTION AREA
              </text>
              <text x="380" y="195" fill="#B0B0AC" fontSize="11" textAnchor="middle">
                Depth: 180m • Longwall Goaf Zone • Moonidih Colliery
              </text>

              {/* Zone Dividers */}
              <line x1="380" y1="40" x2="380" y2="300" stroke="#D8D8D5" strokeWidth="1" strokeDasharray="3,3" />
              <line x1="80" y1="170" x2="680" y2="170" stroke="#D8D8D5" strokeWidth="1" strokeDasharray="3,3" />

              <text x="95" y="60" fill="#666666" fontSize="10" fontWeight="600">ZONE A (Reference)</text>
              <text x="395" y="60" fill="#666666" fontSize="10" fontWeight="600">ZONE B (Inflexion)</text>
              <text x="95" y="290" fill="#666666" fontSize="10" fontWeight="600">ZONE D (Flank)</text>
              <text x="395" y="290" fill="#666666" fontSize="10" fontWeight="600">ZONE C (Active Caving)</text>

              {/* MESH NETWORK CONNECTIONS */}
              {/* N1 to N2 */}
              <line x1="160" y1="90" x2="600" y2="90" stroke="#3F4A42" strokeWidth="1.5" />
              <text x="380" y="82" fill="#666666" fontSize="10" textAnchor="middle">ESP-NOW Link (Hop 1)</text>

              {/* N1 to N4 */}
              <line x1="160" y1="90" x2="160" y2="250" stroke="#3F4A42" strokeWidth="1.5" />

              {/* N4 to N3 */}
              <line x1="160" y1="250" x2="600" y2="250" stroke="#3F4A42" strokeWidth="1.5" />

              {/* N2 to N3 */}
              <line x1="600" y1="90" x2="600" y2="250" stroke="#3F4A42" strokeWidth="2" />
              <text x="615" y="170" fill="#666666" fontSize="10" transform="rotate(90, 615, 170)" textAnchor="middle">
                Relay to Gateway
              </text>

              {/* N3 to Gateway Bridge */}
              <line x1="600" y1="250" x2="600" y2="340" stroke="#3F4A42" strokeWidth="2" strokeDasharray="2,2" />
              <rect x="520" y="335" width="160" height="30" fill="#3F4A42" />
              <text x="600" y="354" fill="#FFFFFF" fontSize="10" fontWeight="bold" textAnchor="middle">
                GATEWAY NODE (ROOT)
              </text>

              {/* SENSOR NODES (N1, N2, N3, N4) */}
              
              {/* NODE 1 */}
              <g
                className="cursor-pointer"
                onClick={() => onSelectNode('N1')}
                role="button"
                aria-label={`Sensor Node N1, Tilt ${nodeDict.N1.tilt.toFixed(2)} degrees, Status ${nodeDict.N1.status}`}
                tabIndex={0}
              >
                <circle
                  cx="160"
                  cy="90"
                  r="22"
                  fill="#FFFFFF"
                  stroke={selectedNodeId === 'N1' ? '#222222' : '#D8D8D5'}
                  strokeWidth={selectedNodeId === 'N1' ? '2.5' : '1.5'}
                />
                <circle cx="160" cy="90" r="15" fill={getNodeColor(nodeDict.N1.status)} />
                <text x="160" y="94" fill="#FFFFFF" fontSize="10" fontWeight="bold" textAnchor="middle">
                  N1
                </text>
                <text x="160" y="125" fill="#222222" fontSize="11" fontWeight="bold" textAnchor="middle">
                  {nodeDict.N1.tilt.toFixed(2)}°
                </text>
                <text x="160" y="137" fill={getNodeColor(nodeDict.N1.status)} fontSize="9" fontWeight="600" textAnchor="middle">
                  {getStatusText(nodeDict.N1.status)}
                </text>
              </g>

              {/* NODE 2 */}
              <g
                className="cursor-pointer"
                onClick={() => onSelectNode('N2')}
                role="button"
                aria-label={`Sensor Node N2, Tilt ${nodeDict.N2.tilt.toFixed(2)} degrees, Status ${nodeDict.N2.status}`}
                tabIndex={0}
              >
                <circle
                  cx="600"
                  cy="90"
                  r="22"
                  fill="#FFFFFF"
                  stroke={selectedNodeId === 'N2' ? '#222222' : '#D8D8D5'}
                  strokeWidth={selectedNodeId === 'N2' ? '2.5' : '1.5'}
                />
                <circle cx="600" cy="90" r="15" fill={getNodeColor(nodeDict.N2.status)} />
                <text x="600" y="94" fill="#FFFFFF" fontSize="10" fontWeight="bold" textAnchor="middle">
                  N2
                </text>
                <text x="600" y="125" fill="#222222" fontSize="11" fontWeight="bold" textAnchor="middle">
                  {nodeDict.N2.tilt.toFixed(2)}°
                </text>
                <text x="600" y="137" fill={getNodeColor(nodeDict.N2.status)} fontSize="9" fontWeight="600" textAnchor="middle">
                  {getStatusText(nodeDict.N2.status)}
                </text>
              </g>

              {/* NODE 3 */}
              <g
                className="cursor-pointer"
                onClick={() => onSelectNode('N3')}
                role="button"
                aria-label={`Sensor Node N3, Tilt ${nodeDict.N3.tilt.toFixed(2)} degrees, Status ${nodeDict.N3.status}`}
                tabIndex={0}
              >
                <circle
                  cx="600"
                  cy="250"
                  r="24"
                  fill="#FFFFFF"
                  stroke={selectedNodeId === 'N3' ? '#222222' : '#3F4A42'}
                  strokeWidth={selectedNodeId === 'N3' ? '3' : '2'}
                />
                <circle cx="600" cy="250" r="16" fill={getNodeColor(nodeDict.N3.status)} />
                <text x="600" y="254" fill="#FFFFFF" fontSize="10" fontWeight="bold" textAnchor="middle">
                  N3
                </text>
                <text x="600" y="287" fill="#222222" fontSize="11" fontWeight="bold" textAnchor="middle">
                  {nodeDict.N3.tilt.toFixed(2)}°
                </text>
                <text x="600" y="299" fill={getNodeColor(nodeDict.N3.status)} fontSize="9" fontWeight="600" textAnchor="middle">
                  {getStatusText(nodeDict.N3.status)}
                </text>
              </g>

              {/* NODE 4 */}
              <g
                className="cursor-pointer"
                onClick={() => onSelectNode('N4')}
                role="button"
                aria-label={`Sensor Node N4, Tilt ${nodeDict.N4.tilt.toFixed(2)} degrees, Status ${nodeDict.N4.status}`}
                tabIndex={0}
              >
                <circle
                  cx="160"
                  cy="250"
                  r="22"
                  fill="#FFFFFF"
                  stroke={selectedNodeId === 'N4' ? '#222222' : '#D8D8D5'}
                  strokeWidth={selectedNodeId === 'N4' ? '2.5' : '1.5'}
                />
                <circle cx="160" cy="250" r="15" fill={getNodeColor(nodeDict.N4.status)} />
                <text x="160" y="254" fill="#FFFFFF" fontSize="10" fontWeight="bold" textAnchor="middle">
                  N4
                </text>
                <text x="160" y="285" fill="#222222" fontSize="11" fontWeight="bold" textAnchor="middle">
                  {nodeDict.N4.tilt.toFixed(2)}°
                </text>
                <text x="160" y="297" fill={getNodeColor(nodeDict.N4.status)} fontSize="9" fontWeight="600" textAnchor="middle">
                  {getStatusText(nodeDict.N4.status)}
                </text>
              </g>
            </svg>
          </div>

          {/* Footer Legend */}
          <div className="px-4 py-2 border-t border-[#D8D8D5] bg-[#F7F7F5] flex flex-wrap items-center justify-between text-[11px] text-[#666666]">
            <div className="flex items-center gap-3">
              <span className="font-semibold text-[#222222]">LEGEND:</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#3F7655]"></span> Safe (&lt;1.0°)</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#A87925]"></span> Warning (1.0–2.0°)</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#A84444]"></span> Critical (&gt;2.0°)</span>
            </div>
            <div>
              Selected: <strong className="text-[#222222]">Node {selectedNodeId}</strong>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
