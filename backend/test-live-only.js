const assert = require('node:assert/strict');
process.env.DB_ENABLED = 'false';
process.env.SENSOR_TIMEOUT_MS = '1';
const {server,io} = require('./server');
const {checkSensorHeartbeats, resetSensorState} = require('./services/sensorService');
server.listen(0,'127.0.0.1',async()=>{
  const base=`http://127.0.0.1:${server.address().port}`;
  const get=async route=>(await fetch(base+route)).json();
  try {
    assert.deepEqual((await get('/api/sensors')).sensors,[]);
    assert.deepEqual((await get('/api/alerts')).alerts,[]);
    assert.equal((await get('/health')).mode,'live-only');
    for(const route of ['/api/demo/simulate','/api/demo/reset']) assert.equal((await fetch(base+route,{method:'POST'})).status,410);
    const r=await fetch(base+'/api/readings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({node_id:'N1',gateway_id:'N3',sequence:1,roll:0,pitch:0})});
    assert.equal(r.status,200);
    const {sensor}=await r.json();
    assert.equal(sensor.tilt,0); // Actual zero must remain distinguishable from absence.
    assert.equal(sensor.source,'telemetry');
    for(const field of ['temperature','displacement','vibration','accel_x','gyro_z','crackDetected']) assert.equal(sensor[field],null,field);
    assert.equal((await get('/api/sensors')).sensors.length,1);
    assert.equal((await fetch(base+'/api/sensors/N3')).status,404);
    await new Promise(r=>setTimeout(r,5));checkSensorHeartbeats();
    const offline=(await get('/api/sensors')).sensors[0];
    assert.equal(offline.online,false);assert.equal(offline.tilt,0);
    resetSensorState();assert.deepEqual((await get('/api/sensors')).sensors,[]);
    console.log('PASS: startup empty, no sample alerts, demo endpoints disabled, zero retained, omitted fields null, N3 gateway not seeded, offline readings marked, reset empty');
  }catch(e){console.error(e);process.exitCode=1;}finally{io.close();server.close();setTimeout(()=>process.exit(process.exitCode||0),100);}
});
