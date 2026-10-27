/**
 * MineGuard - Sensor Telemetry Data Model & Industrial SCADA Theme Configuration
 * Smart India Hackathon 2026 (Problem Statement 26025)
 * 
 * Engineering monitoring parameters:
 * - Surface inclination / tilt (X, Y, Resultant °)
 * - Surface vertical displacement (mm)
 * - Strata vibration index (g)
 * - Temperature (°C)
 * - ESP-NOW mesh network topology (N1 -> N2 -> N3 Gateway)
 */

export const INDUSTRIAL_THEME = {
  bg: '#F7F7F5',
  surface: '#FFFFFF',
  text: '#222222',
  secondaryText: '#666666',
  border: '#D8D8D5',
  primary: '#3F4A42',
  safe: '#3F7655',
  warning: '#A87925',
  critical: '#A84444'
};

export const THRESHOLDS = {
  tilt: {
    normalMax: 1.0,   // Tilt < 1.0° = Safe
    warningMax: 2.0,  // 1.0° to 2.0° = Warning
    criticalMin: 2.0  // > 2.0° = Critical
  },
  displacement: {
    normalMax: 0.5,   // < 0.5 mm
    warningMax: 1.5,  // 0.5 to 1.5 mm
    criticalMin: 1.5  // > 1.5 mm
  },
  vibration: {
    normalMax: 0.03,  // < 0.03 g
    warningMax: 0.08, // 0.03 to 0.08 g
    criticalMin: 0.08 // > 0.08 g
  }
};

/**
 * Step-by-step N3 Demonstration Progression Sequence
 */
export const N3_SIMULATION_STEPS = [
  { step: 0, time: "00:00", tilt: 0.30, displacement: 0.40, vibration: 0.02, temperature: 26.5, status: "Safe", description: "Baseline Normal State", anomalyScore: 12 },
  { step: 1, time: "00:03", tilt: 0.40, displacement: 0.55, vibration: 0.03, temperature: 26.8, status: "Safe", description: "Minor Strata Inflexion", anomalyScore: 19 },
  { step: 2, time: "00:06", tilt: 0.50, displacement: 0.72, vibration: 0.03, temperature: 27.1, status: "Safe", description: "Steady Surface Compression", anomalyScore: 28 },
  { step: 3, time: "00:09", tilt: 0.70, displacement: 0.95, vibration: 0.04, temperature: 27.4, status: "Safe", description: "Approaching Warning Boundary", anomalyScore: 36 },
  { step: 4, time: "00:12", tilt: 1.00, displacement: 1.25, vibration: 0.06, temperature: 27.9, status: "Warning", description: "Warning Threshold Reached (1.00°)", anomalyScore: 54 },
  { step: 5, time: "00:15", tilt: 1.50, displacement: 1.60, vibration: 0.09, temperature: 28.5, status: "Warning", description: "Elevated Zone C Deformation", anomalyScore: 71 },
  { step: 6, time: "00:18", tilt: 2.10, displacement: 1.95, vibration: 0.13, temperature: 29.2, status: "Critical", description: "Critical Threshold Breached (2.10°)", anomalyScore: 89 },
  { step: 7, time: "00:21", tilt: 2.40, displacement: 2.16, vibration: 0.15, temperature: 29.8, status: "Critical", description: "Peak Critical Subsidence Tilt", anomalyScore: 96 }
];

/**
 * Baseline Sensor Node States (4 Nodes)
 */
export const SENSOR_NODES_BASELINE = [
  {
    id: "N1",
    node_id: "NODE_01",
    name: "Node 1",
    location: "Zone A — Stable Reference",
    zone: "Zone A",
    role: "Reference Inclinometer",
    tilt: 0.21,
    tilt_angle: 0.21,
    tilt_x: 0.17,
    tilt_y: 0.12,
    displacement: 0.35,
    vibration: 0.02,
    temperature: 26.2,
    status: "Safe",
    online: true,
    battery: 98,
    signalDbm: -68,
    gateway_id: "N3",
    hop_count: 1,
    sequence: 1204,
    anomalyScore: 14,
    lastSeen: "2s ago",
    timestamp: "2026-08-28 18:15:20"
  },
  {
    id: "N2",
    node_id: "NODE_02",
    name: "Node 2",
    location: "Zone B — Transition Area",
    zone: "Zone B",
    role: "Inflexion Node & Relay",
    tilt: 0.74,
    tilt_angle: 0.74,
    tilt_x: 0.58,
    tilt_y: 0.46,
    displacement: 0.82,
    vibration: 0.04,
    temperature: 27.5,
    status: "Warning",
    online: true,
    battery: 94,
    signalDbm: -72,
    gateway_id: "N3",
    hop_count: 0,
    sequence: 1205,
    anomalyScore: 48,
    lastSeen: "2s ago",
    timestamp: "2026-08-28 18:15:18"
  },
  {
    id: "N3",
    node_id: "NODE_03",
    name: "Node 3",
    location: "Zone C — Active Monitoring Area",
    zone: "Zone C",
    role: "Extraction Zone & Gateway",
    tilt: 0.30,
    tilt_angle: 0.30,
    tilt_x: 0.23,
    tilt_y: 0.19,
    displacement: 0.40,
    vibration: 0.02,
    temperature: 26.8,
    status: "Safe",
    online: true,
    battery: 91,
    signalDbm: -77,
    gateway_id: "Direct (Root)",
    hop_count: 0,
    sequence: 1206,
    anomalyScore: 18,
    lastSeen: "1s ago",
    timestamp: "2026-08-28 18:15:22"
  },
  {
    id: "N4",
    node_id: "NODE_04",
    name: "Node 4",
    location: "Zone D — Flank Area",
    zone: "Zone D",
    role: "Perimeter Node",
    tilt: 0.15,
    tilt_angle: 0.15,
    tilt_x: 0.11,
    tilt_y: 0.10,
    displacement: 0.20,
    vibration: 0.01,
    temperature: 25.9,
    status: "Safe",
    online: true,
    battery: 99,
    signalDbm: -65,
    gateway_id: "N3",
    hop_count: 2,
    sequence: 1198,
    anomalyScore: 9,
    lastSeen: "3s ago",
    timestamp: "2026-08-28 18:15:25"
  }
];

export const SYSTEM_STATS = {
  totalSensors: 4,
  activeSensors: 4,
  panelId: "Panel 4 — Demo Area",
  gatewayNode: "Node N3",
  networkMode: "ESP-NOW 2.4 GHz Mesh"
};

/**
 * Strict Industrial Geotechnical Status Color Helper
 * Formats status strictly as:
 * ● SAFE (color #3F7655)
 * ● WARNING (color #A87925)
 * ● CRITICAL (color #A84444)
 */
export function getStatusColor(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'critical' || s === 'danger' || s === 'alarm') {
    return {
      label: 'CRITICAL',
      text: 'text-[#A84444]',
      border: 'border-[#A84444]',
      bg: 'bg-[#A84444]/10',
      dot: '#A84444',
      hex: '#A84444'
    };
  }
  if (s === 'warning' || s === 'caution') {
    return {
      label: 'WARNING',
      text: 'text-[#A87925]',
      border: 'border-[#A87925]',
      bg: 'bg-[#A87925]/10',
      dot: '#A87925',
      hex: '#A87925'
    };
  }
  return {
    label: 'SAFE',
    text: 'text-[#3F7655]',
    border: 'border-[#3F7655]',
    bg: 'bg-[#3F7655]/10',
    dot: '#3F7655',
    hex: '#3F7655'
  };
}
