-- Optional raw motion fields from Node 3 gateway. Preserve firmware units.
ALTER TABLE sensor_telemetry ADD COLUMN IF NOT EXISTS accel_x DOUBLE PRECISION;
ALTER TABLE sensor_telemetry ADD COLUMN IF NOT EXISTS accel_y DOUBLE PRECISION;
ALTER TABLE sensor_telemetry ADD COLUMN IF NOT EXISTS accel_z DOUBLE PRECISION;
ALTER TABLE sensor_telemetry ADD COLUMN IF NOT EXISTS gyro_x DOUBLE PRECISION;
ALTER TABLE sensor_telemetry ADD COLUMN IF NOT EXISTS gyro_y DOUBLE PRECISION;
ALTER TABLE sensor_telemetry ADD COLUMN IF NOT EXISTS gyro_z DOUBLE PRECISION;
