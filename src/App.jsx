import CameraGallery from './components/CameraGallery';
import React, { useState, useEffect, Suspense, lazy, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import MinePanelMap from './components/MinePanelMap';
import SelectedNodeTelemetry from './components/SelectedNodeTelemetry';
import SensorDataTable from './components/SensorDataTable';
import AlertPanel from './components/AlertPanel';
import SeoHead from './components/SeoHead';
import Breadcrumbs from './components/Breadcrumbs';
import NotFoundView from './components/NotFoundView';
import useBackend from './hooks/useBackend';
import { getSavedUser, setSavedUser, setAuthToken, clearAuthSession, getMeApi, logoutApi } from './api/backendApi';

import { N3_SIMULATION_STEPS } from './data/sensors';
import { sirenManager } from './utils/sirenAudio';
import { cacheSensorsLocally, queueOfflineAction } from './utils/offlineStore';

// Lazy-loaded secondary views and heavy chart components
const TiltChart = lazy(() => import('./components/TiltChart'));
const NodeDetailPanel = lazy(() => import('./components/NodeDetailPanel'));
const MeshHealthView = lazy(() => import('./components/MeshHealthView'));
const AlertCenterView = lazy(() => import('./components/AlertCenterView'));
const AiExplanationPanel = lazy(() => import('./components/AiExplanationPanel'));
const GeotechnicalForecastPanel = lazy(() => import('./components/GeotechnicalForecastPanel'));
const HistoricalChartsView = lazy(() => import('./components/HistoricalChartsView'));
const ReportsView = lazy(() => import('./components/ReportsView'));
const SettingsView = lazy(() => import('./components/SettingsView'));
const LoginPage = lazy(() => import('./components/LoginPage'));

/**
 * Industrial SCADA Suspense Fallback
 */
function ViewLoadingFallback({ height = "h-64", label = "LOADING MODULE..." }) {
  return (
    <div className={`bg-[#FFFFFF] border border-[#D8D8D5] flex items-center justify-center ${height} text-xs text-[#666666] font-mono select-none`}>
      <span className="flex items-center gap-2">
        <span className="inline-block w-2 h-2 bg-[#3F4A42] animate-pulse"></span>
        {label}
      </span>
    </div>
  );
}

/**
 * Parse route from URL hash
 */
function getTabFromHash() {
  const hash = window.location.hash.replace(/^#\/?/, '').trim().toLowerCase();
  if (!hash || hash === '') return 'dashboard';
  const VALID_TABS = ['dashboard', 'nodes', 'alerts', 'forecast', 'history', 'network', 'reports', 'settings'];
  if (VALID_TABS.includes(hash)) return hash;
  return 'notfound';
}

/**
 * MineGuard — Industrial Geotechnical Mine Subsidence Monitoring Console
 * Smart India Hackathon 2026 (Problem Statement 26025)
 */
export default function App() {
  const [currentUser, setCurrentUser] = useState(() => getSavedUser());
  const [authChecking, setAuthChecking] = useState(true);

  const [activeTab, setActiveTab] = useState(() => getTabFromHash());
  const [selectedNodeId, setSelectedNodeId] = useState('N2');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Multi-Mine & Extraction Panel Active Context (Phase 6)
  const [activeMine, setActiveMine] = useState(() => {
    try { return localStorage.getItem('mineguard_active_mine') || 'MOONIDIH'; } catch (_e) { return 'MOONIDIH'; }
  });
  const [activePanel, setActivePanel] = useState(() => {
    try { return localStorage.getItem('mineguard_active_panel') || 'P-4'; } catch (_e) { return 'P-4'; }
  });

  // PWA Network Status (Online / Offline detection)
  const [isOnline, setIsOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleSelectMinePanel = (mineId, panelId) => {
    setActiveMine(mineId);
    setActivePanel(panelId);
    try {
      localStorage.setItem('mineguard_active_mine', mineId);
      localStorage.setItem('mineguard_active_panel', panelId);
    } catch (_e) {}
  };

  // Verify JWT session on initial load
  useEffect(() => {
    let mounted = true;
    async function checkSession() {
      try {
        const res = await getMeApi();
        if (!mounted) return;
        if (res.success && res.user) {
          setCurrentUser(res.user);
        } else {
          clearAuthSession();
          setCurrentUser(null);
        }
      } catch (_e) {
        if (mounted) {
          const saved = getSavedUser();
          if (!saved) setCurrentUser(null);
        }
      } finally {
        if (mounted) setAuthChecking(false);
      }
    }
    checkSession();
    return () => { mounted = false; };
  }, []);

  const handleLogin = (user, token) => {
    if (token) setAuthToken(token);
    if (user) setSavedUser(user);
    setCurrentUser(user);
  };

  const handleLogout = async () => {
    await logoutApi();
    clearAuthSession();
    setCurrentUser(null);
  };

  // Sync state with URL hash
  const handleTabChange = useCallback((newTab) => {
    setActiveTab(newTab);
    const hash = newTab === 'dashboard' ? '#/' : `#/${newTab}`;
    if (window.location.hash !== hash) {
      window.location.hash = hash;
    }
  }, []);

  useEffect(() => {
    const handleHashChange = () => {
      const tab = getTabFromHash();
      setActiveTab(tab);
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Live Backend state & Socket.IO telemetry
  const {
    backendConnected,
    nodes,
    alerts,
    chartHistory,
    simStep,
    isSimulating,
    isAlertAcknowledged,
    n3Current,
    riskLevel,
    hasCriticalAlert,
    activeAlertCount,
    currentStep,
    lastSyncTime,
    setSimStep,
    handleStartSimulation,
    handlePauseSimulation,
    handleResetSimulation,
    handleAcknowledgeAlert,
    handleResolveAlert
  } = useBackend();

  // Cache telemetry to IndexedDB for offline operation
  useEffect(() => {
    if (nodes && nodes.length > 0) {
      cacheSensorsLocally(nodes);
    }
  }, [nodes]);

  // Web Audio Industrial Siren State & Auto-Trigger
  const [isSirenPlaying, setIsSirenPlaying] = useState(() => sirenManager.isPlaying());
  const [isSirenMuted, setIsSirenMuted] = useState(() => sirenManager.isMuted());

  useEffect(() => {
    const unsubscribe = sirenManager.subscribe(({ playing, muted }) => {
      setIsSirenPlaying(playing);
      setIsSirenMuted(muted);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (hasCriticalAlert && !isSirenMuted) {
      sirenManager.startSiren();
    } else if (!hasCriticalAlert && isSirenPlaying) {
      sirenManager.stopSiren();
    }
  }, [hasCriticalAlert, isSirenMuted, isSirenPlaying]);

  const handleToggleSirenMute = useCallback(() => {
    sirenManager.toggleMute();
  }, []);

  const handleSelectNode = (nodeId) => setSelectedNodeId(nodeId);
  const selectedNode = nodes.find(n => n.id === selectedNodeId) || nodes[1] || nodes[0];

  const onlineCount = nodes.filter(n => n.online).length;
  const isCriticalPanel = riskLevel === 'Critical';
  const isWarningPanel = riskLevel === 'Warning';

  if (authChecking) {
    return (
      <ViewLoadingFallback height="h-screen" label="VERIFYING SECURITY CREDENTIALS..." />
    );
  }

  if (!currentUser) {
    return (
      <Suspense fallback={<ViewLoadingFallback height="h-screen" label="INITIALIZING CONSOLE..." />}>
        <SeoHead activeTab="settings" />
        <LoginPage onLogin={handleLogin} />
      </Suspense>
    );
  }

  return (
    <div className="flex min-h-screen bg-[#F7F7F5] text-[#222222] font-sans antialiased select-none">
      
      {/* Dynamic Reactive SEO Head Manager */}
      <SeoHead activeTab={activeTab} />

      {/* 1. Industrial Navigation (Desktop persistent sidebar + Mobile slide-over) */}
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={handleTabChange} 
        activeAlertCount={activeAlertCount}
        userRole={currentUser?.role}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto max-h-screen">
        {/* 2. Top Header with Colliery & Extraction Panel Selector */}
        <Header 
          backendConnected={backendConnected}
          activeSensorsCount={onlineCount}
          totalSensors={nodes.length}
          isSimulating={isSimulating}
          simStep={simStep}
          maxSteps={N3_SIMULATION_STEPS.length}
          lastSyncTime={lastSyncTime}
          user={currentUser}
          onLogout={handleLogout}
          onStartSimulation={handleStartSimulation}
          onPauseSimulation={handlePauseSimulation}
          onResetSimulation={handleResetSimulation}
          onToggleMobileMenu={() => setMobileMenuOpen(prev => !prev)}
          isMobileMenuOpen={mobileMenuOpen}
          isSirenPlaying={isSirenPlaying}
          isSirenMuted={isSirenMuted}
          onToggleSirenMute={handleToggleSirenMute}
          activeMine={activeMine}
          activePanel={activePanel}
          onSelectMinePanel={handleSelectMinePanel}
          isOnline={isOnline}
        />

        {/* Main Work Area */}
        <main className="flex-1 p-3 sm:p-5 lg:p-6 space-y-3 sm:space-y-4 max-w-[1700px] w-full mx-auto">
          
          {/* Breadcrumbs Navigation Bar */}
          <Breadcrumbs 
            activeTab={activeTab} 
            onNavigate={handleTabChange}
            customCrumb={activeTab === 'nodes' && selectedNode ? { label: `Node ${selectedNode.id} (${selectedNode.zone})`, path: `#/nodes` } : null}
          />

          {/* ========================================================================= */}
          {/* VIEW: MONITOR (Main Operations Dashboard) */}
          {/* ========================================================================= */}
          {activeTab === 'dashboard' && (
            <div className="space-y-3 sm:space-y-5">
              
              {/* Primary View Header with Single H1 */}
              <div className="bg-[#FFFFFF] border border-[#D8D8D5] p-3.5 sm:p-4 space-y-2 sm:space-y-0 sm:flex sm:items-center sm:justify-between text-xs">
                <div>
                  <h1 className="text-sm sm:text-base font-bold uppercase tracking-wider text-[#222222]">
                    Real-Time Mine Subsidence Monitoring Console
                  </h1>
                  <p className="text-[11px] text-[#666666] mt-0.5">
                    Moonidih Colliery • Longwall Extraction Panel P-4 • Surface Inclinometer Array
                  </p>
                </div>

                {/* Top Status Indicators */}
                <div className="grid grid-cols-3 gap-2 text-center sm:text-left sm:flex sm:items-center sm:gap-6 pt-2 sm:pt-0 border-t sm:border-t-0 border-[#D8D8D5]">
                  <div>
                    <span className="text-[#666666] uppercase text-[9px] sm:text-[10px] block">Sensors</span>
                    <span className="text-xs sm:text-sm font-bold text-[#222222]">{onlineCount} / {nodes.length} Live</span>
                  </div>

                  <div className="border-l border-[#D8D8D5] pl-2 sm:pl-4">
                    <span className="text-[#666666] uppercase text-[9px] sm:text-[10px] block">Alerts</span>
                    <span className={`text-xs sm:text-sm font-bold ${activeAlertCount > 0 ? 'text-[#A84444]' : 'text-[#222222]'}`}>
                      {activeAlertCount}
                    </span>
                  </div>

                  <div className="border-l border-[#D8D8D5] pl-2 sm:pl-4">
                    <span className="text-[#666666] uppercase text-[9px] sm:text-[10px] block">Strata State</span>
                    <span className={`text-xs sm:text-sm font-bold ${
                      isCriticalPanel ? 'text-[#A84444]' : isWarningPanel ? 'text-[#A87925]' : 'text-[#3F7655]'
                    }`}>
                      {isCriticalPanel ? '● CRITICAL' : isWarningPanel ? '● WARNING' : '● SAFE'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Progression Strip Notice */}
              <div className="bg-[#F7F7F5] border border-[#D8D8D5] px-3.5 py-2 text-xs text-[#666666] flex flex-wrap items-center justify-between gap-2">
                <div>
                  Progression Stage: <strong className="text-[#222222]">{currentStep.description}</strong>
                </div>
                <div>
                  Gateway Inclinometer N3: <strong className="text-[#222222] font-mono">{n3Current.tilt.toFixed(2)}°</strong> (Displacement: {n3Current.displacement?.toFixed(2) || '0.40'} mm)
                </div>
              </div>

              {/* Alert Notification if Active */}
              <AlertPanel 
                n3Node={n3Current}
                isAlertActive={hasCriticalAlert || alerts.some(a => a.severity === 'Critical' && !a.resolved)}
                isAcknowledged={isAlertAcknowledged || alerts.some(a => a.severity === 'Critical' && a.acknowledged && !a.resolved)}
                isResolved={alerts.some(a => a.severity === 'Critical' && a.resolved)}
                resolvedAt={alerts.find(a => a.severity === 'Critical' && a.resolved)?.resolvedAt}
                resolvedBy={alerts.find(a => a.severity === 'Critical' && a.resolved)?.resolvedBy}
                onAcknowledgeAlert={() => handleAcknowledgeAlert('ALT-N3-CRIT', currentUser?.full_name || currentUser?.username)}
                onResolveAlert={(notes) => handleResolveAlert('ALT-N3-CRIT', notes, currentUser?.full_name || currentUser?.username)}
                onFocusNode={handleSelectNode}
              />

              {/* Visual Center: LARGE MINE PANEL SCHEMATIC */}
              <section aria-label="Mine Panel Schematic Map">
                <MinePanelMap 
                  nodes={nodes} 
                  selectedNodeId={selectedNodeId} 
                  onSelectNode={handleSelectNode} 
                />
              </section>

              {/* Selected Node Telemetry Box */}
              <section aria-label="Selected Node Telemetry">
                <SelectedNodeTelemetry 
                  node={selectedNode} 
                />
              </section>

              {/* Large Historical Time-Series Chart (Lazy Loaded with Suspense) */}
              <section aria-label="Live Inclinometer Time-Series Chart">
                <Suspense fallback={<ViewLoadingFallback height="h-64 sm:h-72" label="INITIALIZING TIME-SERIES ENGINE..." />}>
                  <TiltChart 
                    chartData={chartHistory}
                    currentN3Tilt={n3Current.tilt}
                    isSimulating={isSimulating}
                  />
                </Suspense>
              </section>

              <CameraGallery />

              {/* Compact Engineering Telemetry Table */}
              <section aria-label="Sensor Node Telemetry Table">
                <SensorDataTable 
                  nodes={nodes} 
                  selectedNodeId={selectedNodeId} 
                  onSelectNode={handleSelectNode} 
                />
              </section>

            </div>
          )}

          {/* ========================================================================= */}
          {/* VIEW: NODES (Lazy Loaded) */}
          {/* ========================================================================= */}
          {activeTab === 'nodes' && (
            <Suspense fallback={<ViewLoadingFallback height="h-96" label="LOADING NODE TELEMETRY..." />}>
              <NodeDetailPanel 
                node={selectedNode}
                onSelectAnotherNode={handleSelectNode}
                allNodes={nodes}
              />
            </Suspense>
          )}

          {/* ========================================================================= */}
          {/* VIEW: ALERTS (Lazy Loaded) */}
          {/* ========================================================================= */}
          {activeTab === 'alerts' && (
            <Suspense fallback={<ViewLoadingFallback height="h-96" label="LOADING ALERT REGISTER..." />}>
              <AlertCenterView 
                alerts={alerts}
                nodes={nodes}
                currentUser={currentUser}
                isSirenPlaying={isSirenPlaying}
                isSirenMuted={isSirenMuted}
                onToggleSirenMute={handleToggleSirenMute}
                onAcknowledgeAlert={(alertId) => handleAcknowledgeAlert(alertId, currentUser?.full_name || currentUser?.username)}
                onResolveAlert={(alertId, notes) => handleResolveAlert(alertId, notes, currentUser?.full_name || currentUser?.username)}
                onSelectNode={(nodeId) => {
                  setSelectedNodeId(nodeId);
                  handleTabChange('dashboard');
                }}
              />
            </Suspense>
          )}

          {/* ========================================================================= */}
          {/* VIEW: FORECAST (Geotechnical Knothe Model) */}
          {/* ========================================================================= */}
          {activeTab === 'forecast' && (
            <Suspense fallback={<ViewLoadingFallback height="h-96" label="COMPUTING GEOTECHNICAL FORECAST..." />}>
              <GeotechnicalForecastPanel 
                selectedNodeId={selectedNodeId}
                onSelectNode={handleSelectNode}
              />
            </Suspense>
          )}

          {/* ========================================================================= */}
          {/* VIEW: HISTORY (Lazy Loaded) */}
          {/* ========================================================================= */}
          {activeTab === 'history' && (
            <Suspense fallback={<ViewLoadingFallback height="h-96" label="LOADING HISTORICAL PROGRESSION..." />}>
              <HistoricalChartsView 
                chartHistory={chartHistory}
                currentN3Tilt={n3Current.tilt}
                simStep={simStep}
                onSetSimStep={setSimStep}
              />
            </Suspense>
          )}

          {/* ========================================================================= */}
          {/* VIEW: NETWORK (Lazy Loaded) */}
          {/* ========================================================================= */}
          {activeTab === 'network' && (
            <Suspense fallback={<ViewLoadingFallback height="h-96" label="LOADING MESH DIAGNOSTICS..." />}>
              <MeshHealthView 
                nodes={nodes}
                onSelectNode={(nodeId) => {
                  setSelectedNodeId(nodeId);
                  handleTabChange('nodes');
                }}
              />
            </Suspense>
          )}

          {/* ========================================================================= */}
          {/* VIEW: REPORTS (Lazy Loaded) */}
          {/* ========================================================================= */}
          {activeTab === 'reports' && (
            <Suspense fallback={<ViewLoadingFallback height="h-96" label="LOADING COMPLIANCE & AUDIT STATION..." />}>
              <ReportsView 
                selectedNode={selectedNode}
                riskLevel={riskLevel}
                currentUser={currentUser}
              />
            </Suspense>
          )}

          {/* ========================================================================= */}
          {/* VIEW: SETTINGS (Lazy Loaded) */}
          {/* ========================================================================= */}
          {activeTab === 'settings' && (
            <Suspense fallback={<ViewLoadingFallback height="h-96" label="LOADING CONFIGURATION..." />}>
              <SettingsView currentUser={currentUser} />
            </Suspense>
          )}

          {/* ========================================================================= */}
          {/* VIEW: 404 NOT FOUND */}
          {/* ========================================================================= */}
          {activeTab === 'notfound' && (
            <NotFoundView onNavigate={handleTabChange} />
          )}

          {/* Simple Institutional Footer with Authority & Domain Notice */}
          <footer className="pt-4 pb-2 text-center text-[10px] sm:text-xs text-[#666666] border-t border-[#D8D8D5] space-y-1">
            <div>MineGuard Subsidence Monitoring System • Ministry of Coal • DGMS Compliant</div>
            <div className="text-[10px] text-[#888888]">
              Primary Domain: <span className="font-mono font-semibold">mineguard-monitoring.gov.in</span> • DGMS Safety Guidelines Compliant
            </div>
          </footer>

        </main>
      </div>
    </div>
  );
}
