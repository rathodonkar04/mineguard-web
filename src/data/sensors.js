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
export const N3_SIMULATION_STEPS = []; // No seeded telemetry in live-only mode.

/**
 * Baseline Sensor Node States (4 Nodes)
 */
export const SENSOR_NODES_BASELINE = []; // No seeded telemetry in live-only mode.

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
