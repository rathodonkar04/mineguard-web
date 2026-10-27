#include "battery_monitor.h"

BatteryMonitor::BatteryMonitor() : _pin(35), _divider_ratio(2.0f) {}

void BatteryMonitor::begin(uint8_t adc_pin, float divider_ratio) {
    _pin = adc_pin;
    _divider_ratio = divider_ratio;
    
    // Set 12-bit resolution (0 - 4095)
    analogReadResolution(12);
    // 11dB attenuation supports full-scale input voltage up to ~3.3V
    analogSetAttenuation(ADC_11db);
    pinMode(_pin, INPUT);
}

uint8_t BatteryMonitor::calculatePercentage(uint16_t voltage_mv) {
    // 18650 Li-ion non-linear empirical discharge table
    if (voltage_mv >= 4200) return 100;
    if (voltage_mv <= 3000) return 0;

    if (voltage_mv > 4000) {
        // 4000 - 4200 mV: 85% - 100%
        return 85 + (uint8_t)((voltage_mv - 4000) * 15 / 200);
    } else if (voltage_mv > 3800) {
        // 3800 - 4000 mV: 60% - 85%
        return 60 + (uint8_t)((voltage_mv - 3800) * 25 / 200);
    } else if (voltage_mv > 3600) {
        // 3600 - 3800 mV: 35% - 60%
        return 35 + (uint8_t)((voltage_mv - 3600) * 25 / 200);
    } else if (voltage_mv > 3400) {
        // 3400 - 3600 mV: 15% - 35%
        return 15 + (uint8_t)((voltage_mv - 3400) * 20 / 200);
    } else {
        // 3000 - 3400 mV: 0% - 15%
        return (uint8_t)((voltage_mv - 3000) * 15 / 400);
    }
}

BatteryStatus BatteryMonitor::read() {
    // 32-sample oversampling to suppress high-frequency noise from RF transmissions
    uint32_t adc_sum = 0;
    const uint8_t SAMPLES = 32;

    for (uint8_t i = 0; i < SAMPLES; i++) {
        adc_sum += analogRead(_pin);
        delayMicroseconds(100);
    }

    float raw_avg = (float)adc_sum / (float)SAMPLES;

    // Convert ADC counts (0 - 4095) to pin voltage in mV (assuming 3300 mV full-scale)
    float pin_voltage_mv = (raw_avg / 4095.0f) * 3300.0f;

    // Multiply by resistor divider ratio (e.g. 2.0 for 100k/100k)
    uint16_t batt_mv = (uint16_t)(pin_voltage_mv * _divider_ratio);

    // Apply sane boundary clamping
    if (batt_mv > 4500) batt_mv = 4200; // Protection cap

    BatteryStatus status;
    status.voltage_mv = batt_mv;
    status.percentage = calculatePercentage(batt_mv);
    status.is_low = (batt_mv < 3300);
    status.is_critical = (batt_mv < 3100);

    return status;
}
