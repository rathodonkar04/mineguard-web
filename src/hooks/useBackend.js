/**
 * useBackend — Custom React Hook
 * Manages the Socket.IO connection and REST data sync with the MineGuard backend.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { BACKEND_URL, fetchAllSensors, fetchAlerts, triggerSimulateStep, triggerResetDemo, acknowledgeAlertApi, resolveAlertApi } from '../api/backendApi';
import { SENSOR_NODES_BASELINE, N3_SIMULATION_STEPS } from '../data/sensors';

// --- Helpers ------------------------------------------------------------------

function mergeWithBaseline(backendSensor, baseline) {
  if (!backendSensor) return baseline;
  return {
    ...baseline,
    accel_x: backendSensor.accel_x ?? null,
    accel_y: backendSensor.accel_y ?? null,
    accel_z: backendSensor.accel_z ?? null,
    gyro_x: backendSensor.gyro_x ?? null,
    gyro_y: backendSensor.gyro_y ?? null,
    gyro_z: backendSensor.gyro_z ?? null,

    node_id: backendSensor.node_id ?? baseline.node_id,
    tilt: backendSensor.tilt ?? baseline.tilt,
    tilt_angle: backendSensor.tilt_angle ?? (backendSensor.tilt ?? baseline.tilt_angle),
    tilt_x: backendSensor.tilt_x ?? baseline.tilt_x,
    tilt_y: backendSensor.tilt_y ?? baseline.tilt_y,
    temperature: backendSensor.temperature ?? baseline.temperature,
    displacement: backendSensor.displacement ?? baseline.displacement,
    vibration: backendSensor.vibration ?? baseline.vibration,
    gateway_id: backendSensor.gateway_id ?? baseline.gateway_id,
    sequence: backendSensor.sequence ?? baseline.sequence,
    hop_count: backendSensor.hop_count ?? baseline.hop_count,
    aiScore: backendSensor.ai_anomaly_score ?? (backendSensor.riskScore ?? baseline.aiScore),
    ai_anomaly_score: backendSensor.ai_anomaly_score ?? (backendSensor.riskScore ?? baseline.aiScore),
    risk_level: backendSensor.risk_level ?? baseline.status,
    risk_reason: backendSensor.risk_reason ?? null,
    ai_status: backendSensor.ai_status ?? 'ACTIVE',
    ai_updated_at: backendSensor.ai_updated_at ?? null,
    features: backendSensor.features ?? null,
    crackDetected: backendSensor.crackDetected ?? false,
    status: backendSensor.status ?? baseline.status,
    online: backendSensor.online ?? baseline.online,
    lastSeen: backendSensor.lastSeen
      ? new Date(backendSensor.lastSeen).toLocaleTimeString('en-IN', { hour12: false })
      : baseline.lastSeen,
    timestamp: backendSensor.timestamp
      ? new Date(backendSensor.timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
      : baseline.timestamp,
    riskScore: backendSensor.riskScore
  };
}

function buildNodes(backendSensors) {
  if (!backendSensors || backendSensors.length === 0) return [...SENSOR_NODES_BASELINE];
  return SENSOR_NODES_BASELINE.map((baseline) => {
    const live = backendSensors.find(s => 
      (s.nodeId && s.nodeId.toUpperCase() === baseline.id.toUpperCase()) ||
      (s.node_id && s.node_id.toUpperCase() === baseline.node_id?.toUpperCase())
    );
    return mergeWithBaseline(live, baseline);
  });
}

function deriveRiskLevel(nodes) {
  if (nodes.some(n => n.status === 'Critical')) return 'Critical';
  if (nodes.some(n => n.status === 'Warning')) return 'Warning';
  return 'Normal';
}

function buildChartHistory(nodes) {
  const n3 = nodes.find(n => n.id === 'N3');
  if (!n3) return [];
  return [{
    time: 'Live',
    tilt: n3.tilt,
    displacement: n3.displacement,
    temperature: n3.temperature,
    warningLimit: 1.0,
    criticalLimit: 2.0,
    state: n3.status
  }];
}

// -----------------------------------------------------------------------------

export default function useBackend() {
  const [backendConnected, setBackendConnected] = useState(false);
  const [nodes, setNodes] = useState([...SENSOR_NODES_BASELINE]);
  const [alerts, setAlerts] = useState([]);
  const [chartHistory, setChartHistory] = useState(() => buildChartHistory(SENSOR_NODES_BASELINE));
  const [lastSyncTime, setLastSyncTime] = useState(new Date());

  // Simulation step tracking
  const [simStep, setSimStep] = useState(0);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isAlertAcknowledged, setIsAlertAcknowledged] = useState(false);

  const socketRef = useRef(null);
  const simTimerRef = useRef(null);
  const stateReceivedRef = useRef(false);

  // ---------- Parallel Initial Fetch from backend (non-blocking) -------------
  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        const [backendSensors, fetchedAlerts] = await Promise.all([
          fetchAllSensors(),
          fetchAlerts()
        ]);

        if (!mounted) return;

        if (backendSensors && !stateReceivedRef.current) {
          const merged = buildNodes(backendSensors);
          setNodes(merged);
          setChartHistory(buildChartHistory(merged));
          setLastSyncTime(new Date());
        }

        if (fetchedAlerts && fetchedAlerts.length > 0) {
          setAlerts(fetchedAlerts);
        }
      } catch (_err) {
        // Non-blocking fallback
      }
    }

    init();
    return () => { mounted = false; };
  }, []);

  // ---------- Socket.IO Connection (Singleton session) ----------------------
  useEffect(() => {
    const socket = io(BACKEND_URL, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      reconnectionDelay: 2000
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setBackendConnected(true);
    });

    socket.on('disconnect', () => {
      setBackendConnected(false);
    });

    socket.on('initialState', (data) => {
      if (data?.sensors) {
        stateReceivedRef.current = true;
        const merged = buildNodes(data.sensors);
        setNodes(merged);
        setChartHistory(buildChartHistory(merged));
        setLastSyncTime(new Date());
      }
    });

    socket.on('sensorUpdate', (updated) => {
      setLastSyncTime(new Date());
      setNodes(prev => {
        const newNodes = prev.map(n => {
          if (n.id === updated.nodeId || n.node_id === updated.node_id) {
            return mergeWithBaseline(updated, n);
          }
          return n;
        });

        // Append to chart history (for N3)
        if (updated.nodeId === 'N3' || updated.node_id === 'NODE_03') {
          setChartHistory(hist => {
            const point = {
              time: `T+${hist.length * 3}s`,
              tilt: updated.tilt,
              displacement: updated.displacement ?? 0,
              temperature: updated.temperature ?? 25.0,
              warningLimit: 1.0,
              criticalLimit: 2.0,
              state: updated.status
            };
            const next = [...hist, point];
            return next.length > 15 ? next.slice(next.length - 15) : next;
          });
        }

        return newNodes;
      });
    });

    socket.on('alertCreated', (alert) => {
      setAlerts(prev => {
        const alreadyExists = prev.some(a => a.id === alert.id);
        if (alreadyExists) return prev;
        return [alert, ...prev].slice(0, 25);
      });
      setIsAlertAcknowledged(false);
    });

    socket.on('alertAcknowledged', (alert) => {
      setAlerts(prev => prev.map(a => a.id === alert.id ? { ...a, acknowledged: true, ...alert } : a));
    });

    socket.on('alertResolved', (alert) => {
      setAlerts(prev => prev.map(a => a.id === alert.id ? { ...a, acknowledged: true, resolved: true, queryStatus: 'RESOLVED', ...alert } : a));
    });

    socket.on('sensorOffline', (event) => {
      setNodes(prev => prev.map(n => 
        (n.id === event.nodeId || n.node_id === event.node_id) ? { ...n, online: false } : n
      ));
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // ---------- Simulation Controls -------------------------------------------

  const handleStartSimulation = useCallback(() => {
    setIsSimulating(true);
    setIsAlertAcknowledged(false);
    triggerSimulateStep(simStep);
  }, [simStep]);

  const handlePauseSimulation = useCallback(() => {
    setIsSimulating(false);
  }, []);

  const handleResetSimulation = useCallback(async () => {
    setIsSimulating(false);
    setSimStep(0);
    setIsAlertAcknowledged(false);
    setChartHistory(() => buildChartHistory(SENSOR_NODES_BASELINE));
    await triggerResetDemo();
  }, []);

  // Advance simulation steps on a timer when running
  useEffect(() => {
    if (!isSimulating) {
      clearInterval(simTimerRef.current);
      return;
    }

    simTimerRef.current = setInterval(() => {
      setSimStep(prev => {
        const next = prev + 1;
        if (next >= N3_SIMULATION_STEPS.length) {
          setIsSimulating(false);
          return prev;
        }
        triggerSimulateStep(next);
        return next;
      });
    }, 2500);

    return () => clearInterval(simTimerRef.current);
  }, [isSimulating]);

  // ---------- Alert acknowledgement & Resolution ---------------------------

  const handleAcknowledgeAlert = useCallback(async (alertId, acknowledgedBy = '') => {
    setIsAlertAcknowledged(true);
    const now = new Date().toISOString();
    setAlerts(prev => prev.map(a => a.id === alertId ? {
      ...a,
      acknowledged: true,
      acknowledgedAt: now,
      acknowledgedBy: acknowledgedBy || 'Authorized Personnel',
      queryStatus: a.resolved ? 'RESOLVED' : 'ACKNOWLEDGED'
    } : a));
    return await acknowledgeAlertApi(alertId, acknowledgedBy);
  }, []);

  const handleResolveAlert = useCallback(async (alertId, resolutionNotes = '', resolvedBy = '') => {
    const now = new Date().toISOString();
    setAlerts(prev => prev.map(a => a.id === alertId ? {
      ...a,
      acknowledged: true,
      resolved: true,
      resolvedAt: now,
      resolvedBy: resolvedBy || 'Authorized Personnel',
      resolutionNotes: resolutionNotes || 'Geotechnical query resolved and verified safe.',
      queryStatus: 'RESOLVED'
    } : a));
    return await resolveAlertApi(alertId, resolutionNotes, resolvedBy);
  }, []);

  // Derived Values
  const n3Current = nodes.find(n => n.id === 'N3') || nodes[2] || nodes[0];
  const riskLevel = deriveRiskLevel(nodes);
  const hasCriticalAlert = riskLevel === 'Critical' || alerts.some(a => a.severity === 'Critical' && !a.acknowledged);
  const activeAlertCount = alerts.filter(a => !a.acknowledged).length;
  const currentStep = N3_SIMULATION_STEPS[simStep] || N3_SIMULATION_STEPS[0];

  return {
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
  };
}
