#include "mpu6050_driver.h"
#include <math.h>

#define RAD_TO_DEG_CONST 57.295779513f

Mpu6050Driver::Mpu6050Driver() 
    : _addr(MPU6050_I2C_ADDR), _offset_x_deg(0.0f), _offset_y_deg(0.0f) {}

void Mpu6050Driver::writeRegister(uint8_t reg, uint8_t value) {
    Wire.beginTransmission(_addr);
    Wire.write(reg);
    Wire.write(value);
    Wire.endTransmission();
}

uint8_t Mpu6050Driver::readRegister(uint8_t reg) {
    Wire.beginTransmission(_addr);
    Wire.write(reg);
    Wire.endTransmission(false);
    Wire.requestFrom(_addr, (uint8_t)1);
    if (Wire.available()) {
        return Wire.read();
    }
    return 0;
}

bool Mpu6050Driver::begin(uint8_t sda_pin, uint8_t scl_pin, uint32_t i2c_speed) {
    Wire.begin(sda_pin, scl_pin);
    Wire.setClock(i2c_speed);
    delay(50);

    // Verify WHO_AM_I register (Expected: 0x68)
    uint8_t whoami = readRegister(MPU6050_REG_WHO_AM_I);
    if (whoami != 0x68 && whoami != 0x98) {
        // Some clones return 0x98 or 0x72
        Serial.printf("[MPU6050] Unexpected WHO_AM_I: 0x%02X\n", whoami);
    }

    // 1. Wake up from sleep (PWR_MGMT_1: select internal 8MHz or PLL with X gyro)
    writeRegister(MPU6050_REG_PWR_MGMT_1, 0x01); // Clock source = PLL with X-axis gyroscope reference
    delay(15);

    // 2. Set DLPF (Digital Low Pass Filter) to 5Hz (CONFIG = 0x06)
    // 5Hz DLPF suppresses industrial mine vehicle vibrations while measuring slow subsidence
    writeRegister(MPU6050_REG_CONFIG, 0x06);

    // 3. Set Sample Rate Divider: 1kHz / (1 + 9) = 100 Hz
    writeRegister(MPU6050_REG_SMPLRT_DIV, 0x09);

    // 4. Set Accelerometer full-scale range: ±2g (AFS_SEL = 0 -> 16,384 LSB/g)
    writeRegister(MPU6050_REG_ACCEL_CONFIG, 0x00);

    // 5. Set Gyroscope full-scale range: ±250 °/s (FS_SEL = 0)
    writeRegister(MPU6050_REG_GYRO_CONFIG, 0x00);

    Serial.println("[MPU6050] Initialized with ±2g range and 5Hz geotechnical DLPF.");
    return true;
}

bool Mpu6050Driver::readRawData(int16_t &ax, int16_t &ay, int16_t &az, int16_t &gx, int16_t &gy, int16_t &gz) {
    Wire.beginTransmission(_addr);
    Wire.write(MPU6050_REG_ACCEL_XOUT_H);
    if (Wire.endTransmission(false) != 0) {
        return false;
    }

    // Request 14 bytes: Accel X, Y, Z (6 bytes), Temp (2 bytes), Gyro X, Y, Z (6 bytes)
    if (Wire.requestFrom(_addr, (uint8_t)14) < 14) {
        return false;
    }

    ax = (int16_t)(Wire.read() << 8 | Wire.read());
    ay = (int16_t)(Wire.read() << 8 | Wire.read());
    az = (int16_t)(Wire.read() << 8 | Wire.read());
    Wire.read(); Wire.read(); // Skip internal MPU temperature
    gx = (int16_t)(Wire.read() << 8 | Wire.read());
    gy = (int16_t)(Wire.read() << 8 | Wire.read());
    gz = (int16_t)(Wire.read() << 8 | Wire.read());

    return true;
}

bool Mpu6050Driver::readTelemetry(MpuTelemetry &telemetry) {
    int16_t raw_ax, raw_ay, raw_az, raw_gx, raw_gy, raw_gz;
    if (!readRawData(raw_ax, raw_ay, raw_az, raw_gx, raw_gy, raw_gz)) {
        return false;
    }

    // Convert raw 16-bit counts to g-units (16,384 LSB = 1.0g at ±2g range)
    float ax = (float)raw_ax / 16384.0f;
    float ay = (float)raw_ay / 16384.0f;
    float az = (float)raw_az / 16384.0f;

    telemetry.raw_accel_x = ax;
    telemetry.raw_accel_y = ay;
    telemetry.raw_accel_z = az;

    // Standard geotechnical Euler tilt equations using atan2:
    // Pitch (Tilt X): Rotation around X-axis
    // Roll (Tilt Y): Rotation around Y-axis
    float tilt_x = atan2(ay, sqrtf(ax * ax + az * az)) * RAD_TO_DEG_CONST;
    float tilt_y = atan2(-ax, sqrtf(ay * ay + az * az)) * RAD_TO_DEG_CONST;

    // Apply zero-datum offset compensation
    tilt_x -= _offset_x_deg;
    tilt_y -= _offset_y_deg;

    telemetry.tilt_x_deg = tilt_x;
    telemetry.tilt_y_deg = tilt_y;
    telemetry.tilt_mag_deg = sqrtf(tilt_x * tilt_x + tilt_y * tilt_y);

    // Compute dynamic vibration excess g-force: |Total Magnitude - Gravity (1.0g)|
    float total_g = sqrtf(ax * ax + ay * ay + az * az);
    telemetry.vibration_g = fabsf(total_g - 1.0f);

    telemetry.motion_detected = false;
    return true;
}

void Mpu6050Driver::calibrateTare(uint16_t samples) {
    if (samples == 0) samples = 50;
    float sum_x = 0.0f;
    float sum_y = 0.0f;
    uint16_t valid = 0;

    for (uint16_t i = 0; i < samples; i++) {
        MpuTelemetry t;
        if (readTelemetry(t)) {
            sum_x += (t.tilt_x_deg + _offset_x_deg);
            sum_y += (t.tilt_y_deg + _offset_y_deg);
            valid++;
        }
        delay(10);
    }

    if (valid > 0) {
        _offset_x_deg = sum_x / (float)valid;
        _offset_y_deg = sum_y / (float)valid;
        Serial.printf("[MPU6050] Tare Zero Calibration Complete: Offset X=%.3f°, Y=%.3f°\n", _offset_x_deg, _offset_y_deg);
    }
}

void Mpu6050Driver::enableMotionWakeup(uint8_t threshold_lsb, uint8_t duration_ms) {
    // 1. Configure INT pin: Active LOW, push-pull, 50us pulse, latch until clear
    writeRegister(MPU6050_REG_INT_PIN_CFG, 0x90);

    // 2. Set motion detection threshold: 1 LSB = 32mg (e.g. 20 * 32mg = 640mg)
    writeRegister(MPU6050_REG_MOT_THR, threshold_lsb);

    // 3. Set motion duration: 1 LSB = 1ms (e.g. 40ms continuous acceleration)
    writeRegister(MPU6050_REG_MOT_DUR, duration_ms);

    // 4. Enable Motion interrupt
    writeRegister(MPU6050_REG_INT_ENABLE, 0x40);

    Serial.println("[MPU6050] Motion wakeup interrupt enabled on INT pin.");
}

void Mpu6050Driver::sleep() {
    // Put MPU-6050 into low-power sleep mode (PWR_MGMT_1 bit 6 = 1)
    uint8_t pwr = readRegister(MPU6050_REG_PWR_MGMT_1);
    writeRegister(MPU6050_REG_PWR_MGMT_1, pwr | 0x40);
}

void Mpu6050Driver::wake() {
    // Clear sleep bit
    uint8_t pwr = readRegister(MPU6050_REG_PWR_MGMT_1);
    writeRegister(MPU6050_REG_PWR_MGMT_1, pwr & ~0x40);
    delay(10);
}
