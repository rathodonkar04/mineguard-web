#ifndef BATTERY_MONITOR_H
#define BATTERY_MONITOR_H

#include <Arduino.h>

/**
 * MineGuard Low-Power Battery Voltage & Fuel Gauge Driver
 * 
 * Provides:
 * - 12-bit ADC reading on GPIO 35 via 100k/100k voltage divider (2.0x scale)
 * - Multi-sample noise rejection (32-sample oversampling)
 * - Non-linear 18650 Li-ion / LiFePO4 discharge curve mapping
 * - Low-battery advisory and cut-off safety thresholds
 */

struct BatteryStatus {
    uint16_t voltage_mv;   // Measured battery potential in mV (e.g. 3920 mV = 3.92V)
    uint8_t  percentage;   // Estimated State-of-Charge (0 - 100%)
    bool     is_low;       // True if voltage < 3300 mV (<15%)
    bool     is_critical;  // True if voltage < 3100 mV (<5%, imminent shutdown)
};

class BatteryMonitor {
public:
    BatteryMonitor();
    
    // Initialize ADC with 11dB attenuation (0 - 3.3V range)
    void begin(uint8_t adc_pin = 35, float divider_ratio = 2.0f);
    
    // Sample battery and return structured status
    BatteryStatus read();

private:
    uint8_t _pin;
    float   _divider_ratio;
    
    uint8_t calculatePercentage(uint16_t voltage_mv);
};

#endif // BATTERY_MONITOR_H
