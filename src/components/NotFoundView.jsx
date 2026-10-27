import React from 'react';

/**
 * NotFoundView Component - Industrial 404 SCADA Fallback View
 */
export default function NotFoundView({ onNavigate }) {
  return (
    <div className="space-y-4 font-sans select-none overflow-hidden">
      {/* 404 Industrial Hero Card */}
      <div className="bg-[#FFFFFF] border border-[#D8D8D5] p-6 sm:p-10 text-center space-y-4 max-w-3xl mx-auto my-6">
        
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#A84444]/10 border border-[#A84444] text-[#A84444] text-xs font-bold tracking-wider">
          <span className="inline-block w-2 h-2 rounded-full bg-[#A84444] animate-ping"></span>
          ROUTING FAULT: TRANSECT CODE 404
        </div>

        {/* Clear Single H1 */}
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#222222]">
          Geotechnical Telemetry Endpoint Not Found
        </h1>

        <p className="text-xs sm:text-sm text-[#666666] max-w-xl mx-auto leading-relaxed">
          The requested surface coordinates, monitoring view, or API transect does not correspond to an active sensor node in Moonidih Colliery Panel P-4.
        </p>

        {/* Technical Diagnostics Box */}
        <div className="bg-[#F7F7F5] border border-[#D8D8D5] p-4 text-left font-mono text-xs text-[#666666] space-y-1.5 max-w-lg mx-auto">
          <div className="text-[#222222] font-bold border-b border-[#D8D8D5] pb-1">
            DIAGNOSTIC TELEMETRY LOG:
          </div>
          <div>STATUS: <span className="text-[#A84444] font-semibold">404 UNMAPPED_ROUTE</span></div>
          <div>TIMESTAMP: <span>{new Date().toISOString()}</span></div>
          <div>ACTIVE NODES: <span>4 Deployed (N1, N2, N3, N4)</span></div>
          <div>GATEWAY ADAPTER: <span>Node 3 (Root ESP-NOW Bridge)</span></div>
        </div>

        {/* Fast Navigation Recovery Actions */}
        <div className="pt-4 flex flex-wrap justify-center items-center gap-3">
          <button
            onClick={() => onNavigate('dashboard')}
            className="px-4 py-2.5 bg-[#3F4A42] hover:bg-[#323B35] text-[#FFFFFF] text-xs font-bold tracking-wide transition-colors"
          >
            RETURN TO LIVE MONITOR
          </button>

          <button
            onClick={() => onNavigate('nodes')}
            className="px-4 py-2.5 bg-[#FFFFFF] hover:bg-[#F7F7F5] border border-[#D8D8D5] text-[#222222] text-xs font-semibold transition-colors"
          >
            SENSOR NODE GRID
          </button>

          <button
            onClick={() => onNavigate('alerts')}
            className="px-4 py-2.5 bg-[#FFFFFF] hover:bg-[#F7F7F5] border border-[#D8D8D5] text-[#222222] text-xs font-semibold transition-colors"
          >
            ALERT REGISTER
          </button>
        </div>

      </div>

      {/* Network Reference Footer */}
      <div className="text-center text-[11px] text-[#666666]">
        MineGuard Subsidence Monitoring System • Directorate General of Mines Safety (DGMS)
      </div>
    </div>
  );
}
