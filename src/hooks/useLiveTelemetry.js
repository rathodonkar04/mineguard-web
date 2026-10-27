import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { BACKEND_URL } from '../api/backendApi';
import { validSensors, addPoint, hasReading, nodeId } from '../utils/liveTelemetry';

export default function useLiveTelemetry() {
  const [sensors, setSensors] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [history, setHistory] = useState([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    let socketStateReceived = false;
    const socket = io(BACKEND_URL, { reconnection: true });
    const applySnapshot = data => {
      const rows = validSensors(data);
      setSensors(rows);
      setHistory(old => rows.reduce(addPoint, old));
    };
    const refreshAlerts = async () => {
      try {
        const response = await fetch(`${BACKEND_URL}/api/alerts`, { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('Alerts unavailable');
        const data = await response.json();
        if (!controller.signal.aborted) setAlerts((data.alerts || []).filter(a => a.id !== 'ALT-INIT-001'));
      } catch (err) { if (err.name !== 'AbortError') setError('Could not load alerts. Check the server connection.'); }
    };
    socket.on('connect', () => { setConnected(true); setError(''); refreshAlerts(); });
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', () => { setConnected(false); setError('Backend unavailable. Retrying connection…'); });
    socket.on('initialState', data => { socketStateReceived = true; applySnapshot(data.sensors || []); });
    socket.on('sensorUpdate', sensor => {
      socketStateReceived = true;
      if (!hasReading(sensor)) return;
      const item = { ...sensor, id: nodeId(sensor) };
      setSensors(old => [...old.filter(s => s.id !== item.id), item].sort((a,b) => a.id.localeCompare(b.id)));
      setHistory(old => addPoint(old, sensor));
    });
    socket.on('sensorOffline', item => setSensors(old => old.map(s => s.id === nodeId(item) ? { ...s, online: false } : s)));
    ['alertCreated', 'alertAcknowledged', 'alertResolved'].forEach(event => socket.on(event, refreshAlerts));
    (async () => {
      try {
        const response = await fetch(`${BACKEND_URL}/api/sensors`, { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('Readings unavailable');
        const data = await response.json();
        if (!controller.signal.aborted && !socketStateReceived) applySnapshot(data.sensors || []);
      } catch (err) { if (err.name !== 'AbortError') setError('Waiting for the backend connection…'); }
    })();
    return () => { controller.abort(); socket.disconnect(); };
  }, []);
  return { sensors, alerts, history, connected, error };
}
