const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const { randomUUID, timingSafeEqual } = require('crypto');
const router = express.Router();
const directory = path.resolve(process.env.CAMERA_STORAGE_DIR || path.join(__dirname, '../storage/camera'));
const pattern = /^(\d+)_(-?\d+(?:\.\d+)?)_([a-f0-9-]+)\.jpg$/;
const retention = Math.max(5, Math.min(1000, Number(process.env.CAMERA_MAX_IMAGES) || 100));
let writes = Promise.resolve();
async function images() {
  await fs.mkdir(directory, { recursive: true });
  return (await fs.readdir(directory)).filter(name => pattern.test(name)).sort().reverse().map(name => {
    const [, time, angle] = name.match(pattern);
    return { id: name, angle: Number(angle), capturedAt: new Date(Number(time)).toISOString(), url: `/api/camera/images/${name}` };
  });
}
function authorizeUpload(req, res, next) {
  const expected = process.env.CAMERA_UPLOAD_TOKEN;
  if (!expected) return next(); // Existing camera firmware remains compatible by default.
  const actual = req.get('X-Camera-Token') || '';
  if (Buffer.byteLength(actual) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))) {
    return res.status(401).json({ success: false, error: 'Invalid camera token' });
  }
  next();
}
router.post(['/upload', '/api/camera/upload'], authorizeUpload, express.raw({ type: ['image/jpeg', 'application/octet-stream'], limit: '5mb' }), async (req, res, next) => {
  const angle = Number(req.query.angle ?? req.get('X-Camera-Angle') ?? 0);
  if (!Number.isFinite(angle) || angle < 0 || angle > 180) return res.status(400).json({ error: 'angle must be between 0 and 180' });
  const data = req.body;
  if (!Buffer.isBuffer(data)) return res.status(415).json({ error: 'Send raw JPEG bytes with Content-Type: image/jpeg (not multipart or JSON)' });
  if (data.length < 4 || data[0] !== 255 || data[1] !== 216 || data[data.length - 2] !== 255 || data[data.length - 1] !== 217) {
    return res.status(400).json({ error: 'Invalid JPEG signature' });
  }
  // Serialize retention and file commits to prevent concurrent upload races.
  const operation = writes.then(async () => {
    await fs.mkdir(directory, { recursive: true });
    const id = `${Date.now()}_${angle}_${randomUUID()}.jpg`;
    const target = path.join(directory, id);
    try {
      await fs.writeFile(target + '.tmp', data, { flag: 'wx' });
      await fs.rename(target + '.tmp', target);
    } finally { await fs.unlink(target + '.tmp').catch(() => {}); }
    const all = await images();
    for (const item of all.slice(retention)) await fs.unlink(path.join(directory, item.id));
    return all.find(item => item.id === id);
  });
  writes = operation.catch(() => {});
  try {
    const image = await operation;
    req.app.get('io')?.emit('cameraImage', image);
    res.status(201).json({ success: true, image });
  } catch (err) { next(err); }
});
router.get('/api/camera/images', async (req, res, next) => {
  try { res.set('Cache-Control', 'no-store').json({ success: true, images: await images() }); } catch (err) { next(err); }
});
router.get('/api/camera/images/:id', (req, res) => {
  if (!pattern.test(req.params.id)) return res.status(400).json({ error: 'Invalid image ID' });
  res.set('X-Content-Type-Options', 'nosniff');
  res.sendFile(path.join(directory, req.params.id), err => {
    if (err && !res.headersSent) res.status(err.statusCode || 500).json({ error: 'Image unavailable' });
  });
});
module.exports = router;
