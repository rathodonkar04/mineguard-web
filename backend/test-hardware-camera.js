const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
process.env.DB_ENABLED = 'false';
process.env.CAMERA_STORAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mineguard-camera-'));
process.env.CAMERA_MAX_IMAGES = '5';
const { server, io } = require('./server');
const { io: connect } = require('socket.io-client');
let assertions = 0;
function check(value, message) { assert.ok(value, message); assertions++; }
server.listen(0, '127.0.0.1', async () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  const socket = connect(base, { transports: ['websocket'] });
  const event = name => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${name} timeout`)), 5000);
    socket.once(name, data => { clearTimeout(timer); resolve(data); });
  });
  try {
    await event('connect');
    for (const route of ['/health', '/api/health']) check((await fetch(base + route)).ok, route);
    for (const node_id of ['N1', 'N2']) {
      const payload = { node_id, gateway_id: 'N3', sequence: 12, hop_count: 1, roll: 1.2, pitch: 2.3, accel_x: .1, accel_y: .2, accel_z: 1, gyro_x: 2, gyro_y: 3, gyro_z: 4, vibration: .05, temperature: 28 };
      const response = await fetch(base + '/api/readings', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      const data = await response.json();
      check(response.status === 200, `${node_id} accepted`);
      for (const field of ['accel_x','accel_y','accel_z','gyro_x','gyro_y','gyro_z']) check(data.sensor[field] === payload[field], `${field} preserved`);
      check(data.sensor.tilt_x === 1.2 && data.sensor.tilt_y === 2.3, 'roll/pitch mapped');
    }
    const invalid = await fetch(base + '/api/readings', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({node_id:'N1',roll:0,pitch:0,accel_x:'bad'}) });
    check(invalid.status === 400, 'invalid motion rejected');
    const jpeg = fs.readFileSync(path.join(__dirname, 'fixtures/camera.jpg'));
    const notification = event('cameraImage');
    const upload = await fetch(base + '/upload?angle=45', {method:'POST',headers:{'Content-Type':'image/jpeg'},body:jpeg});
    check(upload.status === 201, 'JPEG upload accepted');
    const image = (await upload.json()).image;
    check((await notification).id === image.id, 'camera Socket.IO event');
    check(Buffer.from(await (await fetch(base + image.url)).arrayBuffer()).equals(jpeg), 'download exact bytes');
    check((await (await fetch(base + '/api/camera/images')).json()).images[0].angle === 45, 'gallery metadata');
    check((await fetch(base+'/upload?angle=181',{method:'POST',headers:{'Content-Type':'image/jpeg'},body:jpeg})).status === 400, 'angle validation');
    check((await fetch(base+'/upload',{method:'POST',headers:{'Content-Type':'image/jpeg'},body:'not jpeg'})).status === 400, 'invalid file rejected');
    check((await fetch(base+'/upload',{method:'POST',headers:{'Content-Type':'text/plain'},body:'test'})).status === 415, 'unsupported format rejected');
    check((await fetch(base+'/upload',{method:'POST',headers:{'Content-Type':'image/jpeg'},body:Buffer.alloc(6*1024*1024)})).status === 413, 'size limit');
    process.env.CAMERA_UPLOAD_TOKEN = 'test-secret';
    check((await fetch(base+'/upload',{method:'POST',headers:{'Content-Type':'image/jpeg'},body:jpeg})).status === 401, 'optional token required');
    check((await fetch(base+'/upload',{method:'POST',headers:{'Content-Type':'image/jpeg','X-Camera-Token':'test-secret'},body:jpeg})).status === 201, 'token accepted');
    delete process.env.CAMERA_UPLOAD_TOKEN;
    await Promise.all(Array.from({length:8},(_,i)=>fetch(base+'/upload?angle='+i*20,{method:'POST',headers:{'Content-Type':'image/jpeg'},body:jpeg})));
    const list = (await (await fetch(base+'/api/camera/images')).json()).images;
    check(list.length === 5, 'concurrent uploads bounded by retention');
    check(fs.readdirSync(process.env.CAMERA_STORAGE_DIR).filter(n=>n.endsWith('.jpg')).length === 5,'retention removes files');
    check((await fetch(base+'/api/camera/images/bad.jpg')).status === 400, 'invalid ID');
    console.log(`PASS: ${assertions} hardware/camera assertions`);
  } catch (err) { console.error(err); process.exitCode = 1; }
  finally {
    socket.disconnect(); io.close(); server.close();
    fs.rmSync(process.env.CAMERA_STORAGE_DIR,{recursive:true,force:true});
    setTimeout(()=>process.exit(process.exitCode || 0),100);
  }
});
