// A node enters this store only after an accepted telemetry upload.
// Never seed readings, online timestamps, risk states or alerts.
const initialSensors = [];
const sensors = [];
const alerts = [];
const N3_DEMO_STEPS = [];
module.exports = { initialSensors, sensors, alerts, N3_DEMO_STEPS };
