export const EXPECTED_NODES = ['N1', 'N2'];
export function nodeId(sensor) {
  return sensor.nodeId || sensor.node_id?.replace(/^NODE_0/, 'N');
}
export function hasReading(sensor) {
  return sensor?.source === 'telemetry' && Number.isFinite(sensor.tilt) && !!sensor.timestamp;
}
export function validSensors(sensors = []) {
  return sensors.filter(hasReading).map(sensor => ({ ...sensor, id: nodeId(sensor) }));
}
export function addPoint(history, sensor) {
  if (!hasReading(sensor) || sensor.online === false) return history;
  const id = nodeId(sensor);
  if (!EXPECTED_NODES.includes(id)) return history;
  const key = `${id}:${sensor.timestamp}:${sensor.sequence ?? ''}`;
  if (history.some(point => point.key === key)) return history;
  return [...history, { key, nodeId: id, timestamp: sensor.timestamp, tilt: sensor.tilt }].slice(-300);
}
export function formatReading(value, decimals = 2) {
  return Number.isFinite(value) ? value.toFixed(decimals) : 'Not reported';
}
