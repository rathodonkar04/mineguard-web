/**
 * MineGuard In-Memory Sensor State Store
 * Smart India Hackathon 2026 (Problem Statement 26025)
 * 
 * ============================================================================
 * ARCHITECTURE & REAL TELEMETRY SUPPORT:
 * ============================================================================
 * Holds live sensor state for prototype nodes (NODE_01, NODE_02, NODE_03, NODE_04).
 * Dual-indexed by canonical hardware ID (e.g. NODE_01) and React dashboard ID (N1).
 * 
 * Channels available:
 * - tilt_x, tilt_y, tilt_angle / tilt (degrees, MPU6050)
 * - displacement (mm)
 * - vibration (g)
 * - temperature (°C)
 * - crackDetected (boolean, optional)
 * - status (Normal | Warning | Critical)
 * - riskScore (0-100)
 * - online (boolean heartbeat)
 * ============================================================================
 */

// Initial in-memory state for prototype nodes
const initialSensors = [
  {
    nodeId: 'N1',
    node_id: 'NODE_01',
    zone: 'Zone A',
    name: 'Sensor Node 1 (Stable Reference)',
    tilt: 0.21,              // Surface inclination in degrees (°)
    tilt_angle: 0.21,
    tilt_x: 0.15,
    tilt_y: 0.10,
    temperature: 26.5,       // Ambient temperature (°C)
    displacement: 0.35,      // Surface displacement in millimeters (mm)
    vibration: 0.02,         // Dynamic acceleration / vibration index (g)
    crackDetected: false,    // Micro-crack / acoustic deformation trigger
    status: 'Normal',        // Normal (<1°) | Warning (1°-2°) | Critical (>2°)
    online: true,
    lastSeen: new Date().toISOString(),
    timestamp: new Date().toISOString()
  },
  {
    nodeId: 'N2',
    node_id: 'NODE_02',
    zone: 'Zone B',
    name: 'Sensor Node 2 (Transition Area)',
    tilt: 0.74,              // Surface inclination in degrees (°)
    tilt_angle: 0.74,
    tilt_x: 0.52,
    tilt_y: 0.38,
    temperature: 27.0,       // Ambient temperature (°C)
    displacement: 0.82,      // Surface displacement in millimeters (mm)
    vibration: 0.04,         // Dynamic acceleration / vibration index (g)
    crackDetected: false,    // Micro-crack / acoustic deformation trigger
    status: 'Warning',       // Normal (<1°) | Warning (1°-2°) | Critical (>2°)
    online: true,
    lastSeen: new Date().toISOString(),
    timestamp: new Date().toISOString()
  },
  {
    nodeId: 'N3',
    node_id: 'NODE_03',
    zone: 'Zone C',
    name: 'Sensor Node 3 (Active Monitoring Area)',
    tilt: 2.41,              // Surface inclination in degrees (°)
    tilt_angle: 2.41,
    tilt_x: 1.70,
    tilt_y: 1.20,
    temperature: 28.2,       // Ambient temperature (°C)
    displacement: 2.16,      // Surface displacement in millimeters (mm)
    vibration: 0.15,         // Dynamic acceleration / vibration index (g)
    crackDetected: false,    // Micro-crack / acoustic deformation trigger
    status: 'Critical',      // Normal (<1°) | Warning (1°-2°) | Critical (>2°)
    online: true,
    lastSeen: new Date().toISOString(),
    timestamp: new Date().toISOString()
  }
];

// In-memory store containers
let sensors = JSON.parse(JSON.stringify(initialSensors));
let alerts = [
  {
    id: 'ALT-INIT-001',
    nodeId: 'N3',
    node_id: 'NODE_03',
    severity: 'Critical',
    type: 'Abnormal Tilt',
    message: 'Abnormal tilt detected at Node N3 (NODE_03).',
    value: 2.41,
    timestamp: new Date().toISOString(),
    acknowledged: false,
    isPrototype: true
  }
];

// Simulation step definitions for N3 demonstration progression
const N3_DEMO_STEPS = [
  { step: 0, tilt: 0.30, displacement: 0.40, vibration: 0.02, temperature: 26.5, description: 'Baseline Normal' },
  { step: 1, tilt: 0.40, displacement: 0.55, vibration: 0.03, temperature: 26.8, description: 'Minor Movement' },
  { step: 2, tilt: 0.50, displacement: 0.72, vibration: 0.03, temperature: 27.0, description: 'Gradual Tilt' },
  { step: 3, tilt: 0.70, displacement: 0.95, vibration: 0.04, temperature: 27.3, description: 'Approaching Warning' },
  { step: 4, tilt: 1.00, displacement: 1.25, vibration: 0.06, temperature: 27.6, description: 'Warning Threshold (1.0°)' },
  { step: 5, tilt: 1.50, displacement: 1.60, vibration: 0.09, temperature: 28.0, description: 'Elevated Tilt in Zone C' },
  { step: 6, tilt: 2.10, displacement: 1.95, vibration: 0.13, temperature: 28.5, description: 'Critical Threshold (2.1°)' },
  { step: 7, tilt: 2.40, displacement: 2.16, vibration: 0.15, temperature: 28.8, description: 'Peak Critical Tilt' }
];

module.exports = {
  sensors,
  alerts,
  initialSensors,
  N3_DEMO_STEPS
};
