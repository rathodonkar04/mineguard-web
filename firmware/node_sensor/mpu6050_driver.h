#ifndef MPU6050_DRIVER_H
#define MPU6050_DRIVER_H

#include <Arduino.h>
#include <Wire.h>

/**
 * MineGuard Modular MPU6050 Inclinometer & Vibration Driver
 * 
 * Provides:
 * - Direct register-level I2C communication (no heavy external library dependencies)
 * - 5Hz Digital Low-Pass Filter (DLPF) to suppress mine equipment vibration
 * - ±2g full scale range for maximum resolution: 16,384 LSB/g (0.000061g)
 * - Pitch/Roll Euler tilt angle calculation with trigonometric atan2
 * - Dynamic vibration peak and root-mean-square (RMS) acceleration
 * - Motion interrupt generator on INT pin (GPIO 19) for zero-power deep sleep wakeup
 */

#define MPU6050_I2C_ADDR         0x68
#define MPU6050_REG_SMPLRT_DIV   0x19
#define MPU6050_REG_CONFIG       0x1A
#define MPU6050_REG_GYRO_CONFIG  0x1B
#define MPU6050_REG_ACCEL_CONFIG 0x1C
#define MPU6050_REG_INT_PIN_CFG  0x37
#define MPU6050_REG_INT_ENABLE   0x38
#define MPU6050_REG_ACCEL_XOUT_H 0x3B
#define MPU6050_REG_PWR_MGMT_1   0x6B
#define MPU6050_REG_WHO_AM_I     0x75
#define MPU6050_REG_MOT_THR      0x1F
#define MPU6050_REG_MOT_DUR      0x20

struct MpuTelemetry {
    float tilt_x_deg;      // Pitch angle (-90.0° to +90.0°)
    float tilt_y_deg;      // Roll angle (-90.0° to +90.0°)
    float tilt_mag_deg;    // Total composite tilt vector magnitude: sqrt(x^2 + y^2)
    float vibration_g;     // Peak dynamic excess g-force: |accel_norm - 1.0g|
    float raw_accel_x;     // Normalized g (-2.0 to +2.0)
    float raw_accel_y;
    float raw_accel_z;
    bool  motion_detected; // True if motion interrupt fired
};

class Mpu6050Driver {
public:
    Mpu6050Driver();
    
    // Initialize I2C bus and configure MPU6050 registers
    bool begin(uint8_t sda_pin = 21, uint8_t scl_pin = 22, uint32_t i2c_speed = 400000);
    
    // Read calibrated telemetry
    bool readTelemetry(MpuTelemetry &telemetry);
    
    // Zero-tare calibration: records current mounting orientation as 0.00° reference
    void calibrateTare(uint16_t samples = 100);
    
    // Configure hardware motion interrupt for low-power deep sleep wake-up
    void enableMotionWakeup(uint8_t threshold_lsb = 20, uint8_t duration_ms = 40);
    
    // Put MPU6050 into ultra-low power sleep mode (5 µA)
    void sleep();
    
    // Wake MPU6050 up from sleep
    void wake();

private:
    uint8_t _addr;
    float _offset_x_deg;
    float _offset_y_deg;
    
    void writeRegister(uint8_t reg, uint8_t value);
    uint8_t readRegister(uint8_t reg);
    bool readRawData(int16_t &ax, int16_t &ay, int16_t &az, int16_t &gx, int16_t &gy, int16_t &gz);
};

#endif // MPU6050_DRIVER_H
