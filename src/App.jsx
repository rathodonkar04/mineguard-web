import { lazy, Suspense, useEffect, useState } from 'react';
import { Activity, Bell, Camera, Radio, LogOut, Settings } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts';
import LoginPage from './components/LoginPage';
import CameraGallery from './components/CameraGallery';
import useLiveTelemetry from './hooks/useLiveTelemetry';
import { EXPECTED_NODES, formatReading } from './utils/liveTelemetry';
import { getMeApi, getSavedUser, setSavedUser, setAuthToken, logoutApi, acknowledgeAlertApi, resolveAlertApi } from './api/backendApi';
const SettingsView = lazy(() => import('./components/SettingsView'));
const box = 'bg-white border border-[#D8D8D5] p-4 sm:p-5';
const stamp = value => value ? new Date(value).toLocaleString() : 'Not received';

export function LiveConsole({ user, onLogout }) {
  const { sensors, alerts, history, connected, error } = useLiveTelemetry();
  const [tab, setTab] = useState('monitor');
  const [selected, setSelected] = useState('N1');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(null);
  const node = sensors.find(s => s.id === selected);
  const current = sensors.filter(s => s.online && connected);
  const activeAlerts = alerts.filter(a => !a.resolved);
  const gateway = sensors.filter(s => s.gateway_id === 'N3').sort((a,b) => Date.parse(b.receivedAt || b.timestamp) - Date.parse(a.receivedAt || a.timestamp))[0];
  const chart = history.filter(p => p.nodeId === selected).map(p => ({ ...p, time: new Date(p.timestamp).toLocaleTimeString() }));
  const status = !connected ? 'Backend disconnected' : !sensors.length ? 'Waiting for readings' : !current.length ? 'No current readings' : current.some(s => s.status === 'Critical') ? 'Critical' : current.some(s => s.status === 'Warning') ? 'Warning' : 'Normal';
  async function handleAlert(alert, resolve) {
    let notes = '';
    if (resolve) { notes = window.prompt('Resolution notes:'); if (!notes?.trim()) return; }
    setBusy(alert.id); setActionError('');
    const result = resolve ? await resolveAlertApi(alert.id, notes, user.full_name || user.username) : await acknowledgeAlertApi(alert.id, user.full_name || user.username);
    if (!result) setActionError('Could not save the alert update. Please retry.');
    setBusy(null);
  }
  return <div className="min-h-screen bg-[#F7F7F5] text-[#222] font-sans">
    <header className="bg-[#26382D] text-white px-4 sm:px-8 py-4 flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3"><Activity size={28}/><div><h1 className="font-bold tracking-wider text-lg">MINEGUARD</h1><p className="text-xs text-[#c1cec4]">Live sensor monitoring</p></div></div>
      <div className="flex items-center gap-4 text-xs"><span role="status">{connected ? '● Backend connected' : '○ Backend disconnected'}</span><span>{user.full_name || user.username}</span><button onClick={onLogout} className="flex gap-1 items-center" aria-label="Sign out"><LogOut size={16}/> Sign out</button></div>
    </header>
    <nav className="bg-white border-b border-[#D8D8D5] px-4 sm:px-8 flex flex-wrap gap-1" aria-label="Main navigation">
      {[['monitor','Monitor',Activity],['alerts','Alerts',Bell],['camera','Camera',Camera],['settings','Settings',Settings]].map(([id,label,Icon]) => <button key={id} onClick={()=>setTab(id)} aria-current={tab === id ? 'page' : undefined} className={`px-4 py-4 text-sm flex gap-2 items-center border-b-2 ${tab===id ? 'border-[#3F7655] text-[#3F7655] font-bold' : 'border-transparent'}`}><Icon size={16}/>{label}{id==='alerts' && activeAlerts.length > 0 ? ` (${activeAlerts.length})` : ''}</button>)}
    </nav>
    <main className="max-w-7xl mx-auto p-4 sm:p-8 space-y-5">
      {error && <p role="alert" className="border border-amber-300 bg-amber-50 p-3 text-sm">{error}</p>}
      {tab === 'monitor' && <>
        <div><h2 className="text-xl font-bold">Hardware readings</h2><p className="text-sm text-[#666] mt-1">N1 and N2 sensors · N3 gateway · Only received measurements are displayed</p></div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className={box}><p className="text-xs uppercase text-[#666]">Reporting sensors</p><strong className="text-2xl">{current.length}</strong><p className="text-xs mt-1">{sensors.length ? 'Last received values remain visible when offline' : 'Waiting for the first device upload'}</p></div>
          <div className={box}><p className="text-xs uppercase text-[#666]">Current status</p><strong className="text-lg">{status}</strong><p className="text-xs mt-1">No readings means no status assessment</p></div>
          <div className={box}><p className="text-xs uppercase text-[#666] flex gap-2"><Radio size={14}/> Gateway N3</p><strong className="text-lg">{gateway ? (connected && gateway.online ? 'Forwarding readings' : 'Last upload received') : 'Waiting for uploads'}</strong><p className="text-xs mt-1">{stamp(gateway?.receivedAt || gateway?.timestamp)}</p></div>
        </div>
        {!sensors.length && <section className={`${box} text-center py-10`}><Radio className="mx-auto mb-3 text-[#3F7655]" size={32}/><h3 className="font-bold">Waiting for readings</h3><p className="text-sm text-[#666] mt-2">Turn on N1/N2 and the N3 gateway. Readings will appear after a successful upload.</p></section>}
        <section className={box}>
          <h3 className="font-bold mb-4">Sensor overview</h3>
          <div className="overflow-x-auto"><table className="w-full text-sm text-left"><thead className="text-xs text-[#666] uppercase"><tr>{['Node','Connection','Tilt (°)','Temperature (°C)','Vibration','Last received','Sequence'].map(h=><th className="p-2 border-b" key={h}>{h}</th>)}</tr></thead><tbody>
            {[...new Set([...EXPECTED_NODES,...sensors.map(s=>s.id)])].map(id=>{const s=sensors.find(n=>n.id===id);return <tr key={id}><td className="p-3 border-b font-bold"><button onClick={()=>setSelected(id)} className="underline">{id}</button></td><td className="p-3 border-b">{!s ? 'Waiting' : connected && s.online ? 'Online' : 'Offline · last known'}</td><td className="p-3 border-b">{formatReading(s?.tilt)}</td><td className="p-3 border-b">{formatReading(s?.temperature,1)}</td><td className="p-3 border-b">{formatReading(s?.vibration,3)}</td><td className="p-3 border-b text-xs">{stamp(s?.receivedAt || s?.timestamp)}</td><td className="p-3 border-b">{s?.sequence ?? 'Not reported'}</td></tr>})}
          </tbody></table></div>
        </section>
        <section className={box}>
          <div className="flex justify-between items-center gap-3 mb-4"><h3 className="font-bold">Received tilt · {selected}</h3><select aria-label="Chart sensor" value={selected} onChange={e=>setSelected(e.target.value)} className="border p-2 text-sm">{EXPECTED_NODES.map(id=><option key={id}>{id}</option>)}</select></div>
          {chart.length ? <div className="h-64"><ResponsiveContainer width="100%" height="100%"><LineChart data={chart}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="time" tick={{fontSize:11}}/><YAxis unit="°" tick={{fontSize:11}}/><Tooltip labelFormatter={(_,payload)=>stamp(payload?.[0]?.payload?.timestamp)}/><Line type="linear" dataKey="tilt" name={`${selected} tilt`} stroke="#3F7655" dot={chart.length<30} isAnimationActive={false}/></LineChart></ResponsiveContainer></div> : <p className="text-sm text-[#666] py-12 text-center">Waiting for {selected} readings. No chart points have been generated.</p>}
          <p className="text-xs text-[#666] mt-3">Recent readings received in this browser session. Times come from received telemetry.</p>
        </section>
        <section className={box}><h3 className="font-bold mb-4">{selected} measurement details</h3><div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{[['tilt_x','Tilt X (°)'],['tilt_y','Tilt Y (°)'],['displacement','Displacement (mm)'],['vibration','Vibration'],['accel_x','Acceleration X'],['accel_y','Acceleration Y'],['accel_z','Acceleration Z'],['gyro_x','Gyroscope X'],['gyro_y','Gyroscope Y'],['gyro_z','Gyroscope Z']].map(([key,label])=><div key={key} className="border p-3"><p className="text-xs text-[#666]">{label}</p><strong className="text-sm">{formatReading(node?.[key],3)}</strong></div>)}</div><p className="text-xs text-[#666] mt-3">Acceleration and gyroscope units match the sensor firmware. Missing measurements are not replaced with zero.</p></section>
        <CameraGallery/>
      </>}
      {tab === 'camera' && <CameraGallery/>}
      {tab === 'alerts' && <section className={box}><h2 className="font-bold text-lg mb-4">Received alerts</h2>{actionError && <p role="alert" className="text-red-700">{actionError}</p>}{!alerts.length ? <p>No alerts received. No sample alerts are generated.</p> : <div className="space-y-3">{alerts.map(a=><article key={a.id} className="border p-4"><div className="flex justify-between gap-3"><strong>{a.nodeId} · {a.severity}</strong><span className="text-xs">{stamp(a.timestamp)}</span></div><p className="text-sm mt-2">{a.message || a.title}</p><p className="text-xs my-2">{a.resolved ? 'Resolved' : a.acknowledged ? 'Acknowledged' : 'Open'}</p>{!a.resolved && <div className="flex gap-2">{!a.acknowledged && <button disabled={busy===a.id} className="border px-3 py-2 text-xs" onClick={()=>handleAlert(a,false)}>Acknowledge</button>}<button disabled={busy===a.id} className="border px-3 py-2 text-xs" onClick={()=>handleAlert(a,true)}>Resolve</button></div>}</article>)}</div>}</section>}
      {tab === 'settings' && <Suspense fallback={<p>Loading settings…</p>}><SettingsView currentUser={user}/></Suspense>}
      <footer className="text-xs text-[#666] border-t pt-4">MineGuard · Live-only mode · Gateway connectivity is inferred from forwarded readings.</footer>
    </main>
  </div>;
}
export default function App() {
  const [user,setUser] = useState(null);
  const [checking,setChecking] = useState(true);
  useEffect(()=>{ let active=true; getMeApi().then(result=>{if(active){setUser(result.user || null);setChecking(false);}});return()=>{active=false;};},[]);
  if(checking) return <div className="p-8" role="status">Checking session…</div>;
  if(!user) return <LoginPage onLogin={(account,token)=>{if(token)setAuthToken(token);setSavedUser(account);setUser(account || getSavedUser());}}/>;
  return <LiveConsole user={user} onLogout={async()=>{await logoutApi();setUser(null);}}/>;
}
