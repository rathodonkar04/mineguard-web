-- Optional raw motion fields from Node 3 gateway. Preserve firmware units.
ALTER TABLE sensor_telemetry ADD COLUMN IF NOT EXISTS accel_x DOUBLE PRECISION;
ALTER TABLE sensor_telemetry ADD COLUMN IF NOT EXISTS accel_y DOUBLE PRECISION;
ALTER TABLE sensor_telemetry ADD COLUMN IF NOT EXISTS accel_z DOUBLE PRECISION;
ALTER TABLE sensor_telemetry ADD COLUMN IF NOT EXISTS gyro_x DOUBLE PRECISION;
ALTER TABLE sensor_telemetry ADD COLUMN IF NOT EXISTS gyro_y DOUBLE PRECISION;
ALTER TABLE sensor_telemetry ADD COLUMN IF NOT EXISTS gyro_z DOUBLE PRECISION;

-- Unreported channels must remain NULL, not invented sensor measurements.
ALTER TABLE sensor_telemetry ALTER COLUMN tilt_x DROP NOT NULL;
ALTER TABLE sensor_telemetry ALTER COLUMN tilt_y DROP NOT NULL;
ALTER TABLE sensor_telemetry ALTER COLUMN temperature DROP NOT NULL;
ALTER TABLE sensor_telemetry ALTER COLUMN displacement DROP NOT NULL;
ALTER TABLE sensor_telemetry ALTER COLUMN vibration DROP NOT NULL;
ALTER TABLE sensor_telemetry ALTER COLUMN crack_detected DROP NOT NULL;
