import { useCallback, useEffect, useState } from 'react';
import { BACKEND_URL } from '../api/backendApi';

export default function CameraGallery() {
  const [images, setImages] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [angle, setAngle] = useState('all');
  const refresh = useCallback(async (signal) => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/camera/images`, { signal, cache: 'no-store' });
      if (!response.ok) throw new Error(`Camera service returned ${response.status}`);
      const data = await response.json();
      setImages(data.images); setError('');
    } catch (err) { if (err.name !== 'AbortError') setError('Camera service unavailable. Previously loaded images may be outdated.'); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    refresh(controller.signal);
    const timer = setInterval(() => refresh(controller.signal), 5000);
    return () => { clearInterval(timer); controller.abort(); };
  }, [refresh]);
  const filtered = images.filter(image => angle === 'all' || image.angle === Number(angle));
  return <section aria-label="Camera captures" className="bg-white border border-[#D8D8D5] p-4 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="font-bold uppercase text-sm">Gateway camera captures</h2><p className="text-xs text-[#666666]">Snapshots uploaded by ESP32-CAM • refreshes every 5 seconds</p></div>
      <div className="flex gap-2"><select aria-label="Capture angle" className="border p-2 text-xs" value={angle} onChange={e => setAngle(e.target.value)}>
        <option value="all">All angles</option>{[...new Set([0,45,90,135,180,...images.map(i=>i.angle)])].sort((a,b)=>a-b).map(a=><option key={a} value={a}>{a}°</option>)}
      </select><button className="border px-3 text-xs" onClick={() => refresh()}>Refresh</button></div>
    </div>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {loading ? <p role="status">Loading captures…</p> : filtered.length === 0 ? <p className="text-sm text-[#666666]">No captures received{angle !== 'all' ? ` at ${angle}°` : ''}. Images appear here after the camera uploads them.</p> :
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">{filtered.slice(0,30).map(item => <figure key={item.id} className="border border-[#D8D8D5]">
        <a href={`${BACKEND_URL}${item.url}`} target="_blank" rel="noreferrer"><img className="w-full aspect-video object-contain bg-[#222]" src={`${BACKEND_URL}${item.url}`} alt={`Mine camera capture at ${item.angle} degrees`} loading="lazy" /></a>
        <figcaption className="p-2 text-xs flex justify-between gap-2"><strong>{item.angle}°</strong><time dateTime={item.capturedAt}>{new Date(item.capturedAt).toLocaleString()}</time></figcaption>
      </figure>)}</div>}
    <p className="text-xs text-[#666666]">Times indicate server receipt. This gallery shows snapshots, not a live video stream.</p>
  </section>;
}
