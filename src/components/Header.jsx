import React, { useState, useEffect } from 'react';

/**
 * Header Component - Responsive Industrial SCADA Navigation Header
 */
export default function Header({ 
  backendConnected = false,
  activeSensorsCount = 4, 
  totalSensors = 4,
  isSimulating = false,
  simStep = 0,
  maxSteps = 8,
  lastSyncTime = new Date(),
  user = null,
  onLogout = null,
  onStartSimulation,
  onPauseSimulation,
  onResetSimulation,
  onToggleMobileMenu = null,
  isMobileMenuOpen = false,
  isSirenPlaying = false,
  isSirenMuted = false,
  onToggleSirenMute = null,
  activeMine = 'MOONIDIH',
  activePanel = 'P-4',
  onSelectMinePanel = null,
  isOnline = true
}) {
  const [, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formattedSync = lastSyncTime.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  const MINE_PANEL_OPTIONS = [
    { mineId: 'MOONIDIH', panelId: 'P-4', label: 'BCCL • Moonidih Colliery | Panel P-4 (Longwall, 280m)' },
    { mineId: 'MOONIDIH', panelId: 'P-5', label: 'BCCL • Moonidih Colliery | Panel P-5 (Development, 310m)' },
    { mineId: 'JHARIA', panelId: 'J-2', label: 'BCCL • Jharia Colliery | Panel J-2 (Bord & Pillar, 160m)' },
    { mineId: 'RANIGANJ', panelId: 'R-1', label: 'ECL • Raniganj Colliery | Panel R-1 (Continuous Miner, 220m)' },
    { mineId: 'PIPARWAR', panelId: 'PW-1', label: 'CCL • Piparwar Colliery | Panel PW-1 (Highwall Overburden, 195m)' }
  ];

  const currentSelectionKey = `${activeMine}_${activePanel}`;

  const handlePanelChange = (e) => {
    const [mId, pId] = e.target.value.split('_');
    if (onSelectMinePanel) {
      onSelectMinePanel(mId, pId);
    }
  };

  return (
    <header className="bg-[#FFFFFF] border-b border-[#D8D8D5] text-[#222222] px-3 sm:px-6 py-2 sm:py-3 select-none" role="banner">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2 sm:gap-3">
        
        {/* Row 1: Title, Mine Selector & Mobile Menu Button */}
        <div className="flex flex-wrap items-center justify-between w-full lg:w-auto gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm sm:text-base font-bold tracking-tight text-[#222222]">
                  MINEGUARD
                </span>
                <span className="px-1.5 py-0.2 bg-[#F7F7F5] border border-[#D8D8D5] text-[9.5px] font-mono font-bold text-[#3F4A42]">
                  PS 26025
                </span>
              </div>
              <p className="text-[10px] sm:text-xs text-[#666666] font-medium mt-0.5">
                Coal Mine Subsidence Monitoring & Strata Control SCADA
              </p>
            </div>

            {/* Industrial Mine & Extraction Panel Selector */}
            <div className="flex items-center bg-[#F7F7F5] border border-[#D8D8D5] px-2 py-0.5 text-xs">
              <span className="text-[9.5px] uppercase font-bold text-[#666666] mr-1.5 hidden sm:inline">
                COLLIERY:
              </span>
              <select
                value={currentSelectionKey}
                onChange={handlePanelChange}
                aria-label="Active colliery and extraction panel selector"
                className="bg-transparent font-semibold text-[11px] text-[#222222] focus:outline-hidden cursor-pointer"
              >
                {MINE_PANEL_OPTIONS.map((opt) => (
                  <option key={`${opt.mineId}_${opt.panelId}`} value={`${opt.mineId}_${opt.panelId}`}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Mobile Menu Button (Visible on screens < lg) */}
          <button
            onClick={onToggleMobileMenu}
            className="lg:hidden shrink-0 ml-2 flex items-center gap-1 px-2.5 py-1 bg-[#F7F7F5] hover:bg-[#EAEAE7] border border-[#D8D8D5] text-[11px] font-semibold text-[#222222] transition-colors"
            aria-label="Toggle Operations Menu"
          >
            <span aria-hidden="true">{isMobileMenuOpen ? '✕' : '☰'}</span>
            <span>{isMobileMenuOpen ? 'CLOSE' : 'MENU'}</span>
          </button>
        </div>

        {/* Row 2: Status & Demo Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between lg:justify-end gap-1.5 sm:gap-4 text-xs pt-1.5 lg:pt-0 border-t lg:border-t-0 border-[#D8D8D5]">
          
          {/* Status info & PWA Network Badge */}
          <div className="flex items-center gap-2 sm:gap-3 text-[#666666] text-[10px] sm:text-xs">
            <div>
              Status: <span className="font-semibold text-[#3F7655]">● LIVE ({activeSensorsCount}/{totalSensors})</span>
            </div>
            <span className="text-[#D8D8D5]" aria-hidden="true">|</span>
            <div>
              Network: {isOnline ? (
                <span className="font-semibold text-[#3F7655]">● SCADA LINK</span>
              ) : (
                <span className="font-semibold text-[#A87925] animate-pulse">● OFFLINE CACHE</span>
              )}
            </div>
            <span className="text-[#D8D8D5]" aria-hidden="true">|</span>
            <div>
              Sync: <span className="font-semibold text-[#222222]">{formattedSync}</span>
            </div>
          </div>

          {/* Demo Controls & Sign out */}
          <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto">
            <div className="flex items-center gap-1 sm:gap-1.5 bg-[#F7F7F5] p-0.5 sm:p-1 border border-[#D8D8D5]">
              <span className="text-[9.5px] sm:text-[11px] font-semibold text-[#666666] px-1">
                DEMO:
              </span>

              {!isSimulating ? (
                <button
                  onClick={onStartSimulation}
                  className="px-2 sm:px-2.5 py-0.5 sm:py-1 bg-[#3F4A42] hover:bg-[#323B35] text-[#FFFFFF] text-[9.5px] sm:text-[11px] font-semibold transition-colors"
                  aria-label="Start Simulation Sequence"
                >
                  START
                </button>
              ) : (
                <button
                  onClick={onPauseSimulation}
                  className="px-2 sm:px-2.5 py-0.5 sm:py-1 bg-[#A87925] hover:bg-[#8F661E] text-[#FFFFFF] text-[9.5px] sm:text-[11px] font-semibold transition-colors"
                  aria-label="Pause Simulation Sequence"
                >
                  PAUSE
                </button>
              )}

              <button
                onClick={onResetSimulation}
                className="px-2 sm:px-2.5 py-0.5 sm:py-1 bg-[#FFFFFF] hover:bg-[#F7F7F5] text-[#222222] border border-[#D8D8D5] text-[9.5px] sm:text-[11px] font-semibold transition-colors"
                aria-label="Reset Simulation Sequence"
              >
                RESET
              </button>

              <span className="text-[9.5px] sm:text-[11px] text-[#666666] px-1">
                {simStep + 1}/{maxSteps}
              </span>
            </div>

            {/* Audio Siren Status & Mute Control */}
            {onToggleSirenMute && (
              <div className="flex items-center gap-1 bg-[#F7F7F5] p-0.5 sm:p-1 border border-[#D8D8D5]">
                <button
                  type="button"
                  onClick={onToggleSirenMute}
                  aria-label={isSirenMuted ? 'Unmute evacuation siren' : 'Mute evacuation siren'}
                  className={`flex items-center gap-1 px-2 py-0.5 sm:py-1 text-[9.5px] sm:text-[11px] font-semibold transition-colors ${
                    isSirenPlaying 
                      ? 'bg-[#A84444] text-[#FFFFFF] animate-pulse' 
                      : isSirenMuted 
                      ? 'bg-[#FFFFFF] text-[#888888] border border-[#D8D8D5]' 
                      : 'bg-[#FFFFFF] text-[#3F7655] border border-[#D8D8D5]'
                  }`}
                  title={isSirenPlaying ? 'Siren Active - Click to Mute' : isSirenMuted ? 'Siren Muted - Click to Unmute' : 'Siren Armed - Click to Mute'}
                >
                  <span aria-hidden="true">{isSirenPlaying ? '🔊' : isSirenMuted ? '🔇' : '🔊'}</span>
                  <span>{isSirenPlaying ? 'SIREN ALARM' : isSirenMuted ? 'MUTED' : 'ARMED'}</span>
                  <span className="text-[9px] font-mono opacity-80 underline">[{isSirenMuted ? 'UNMUTE' : 'MUTE'}]</span>
                </button>
              </div>
            )}

            {user && (
              <div className="flex items-center gap-2 text-[10px] sm:text-[11px] pl-1 border-l border-[#D8D8D5]">
                <div className="flex items-center gap-1.5">
                  <span className={`px-2 py-0.5 font-mono font-bold text-[9.5px] uppercase border ${
                    user.role === 'admin' 
                      ? 'bg-[#FDF2F2] text-[#A84444] border-[#F3C5C5]'
                      : user.role === 'operator'
                      ? 'bg-[#F0FDF4] text-[#3F7655] border-[#BBF7D0]'
                      : user.role === 'planner'
                      ? 'bg-[#EFF6FF] text-[#1D4ED8] border-[#BFDBFE]'
                      : 'bg-[#FFFBEB] text-[#B45309] border-[#FDE68A]'
                  }`}>
                    {user.role === 'auditor' || user.role === 'regulator' ? 'AUDITOR' : user.role || 'OPERATOR'}
                  </span>
                  <span className="text-[#222222] font-semibold hidden md:inline truncate max-w-[140px]">
                    {user.full_name || user.username || user.name || 'Authorized User'}
                  </span>
                </div>
                {onLogout && (
                  <button
                    onClick={onLogout}
                    className="px-2 py-0.5 sm:py-1 bg-[#FFFFFF] hover:bg-[#FDF2F2] border border-[#D8D8D5] hover:border-[#F3C5C5] text-[#666666] hover:text-[#A84444] text-[10px] sm:text-[11px] font-semibold transition-colors"
                    aria-label="Logout user"
                  >
                    LOGOUT
                  </button>
                )}
              </div>
            )}
          </div>

        </div>

      </div>
    </header>
  );
}
