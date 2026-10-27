#ifndef POWER_MANAGER_H
#define POWER_MANAGER_H

#include <Arduino.h>
#include <esp_sleep.h>

/**
 * MineGuard ESP32 Power & Deep Sleep Manager
 * 
 * Provides:
 * - Ultra-low power Deep Sleep (~15 µA current consumption)
 * - Dual wakeup sources:
 *   1. Hardware RTC Timer (periodic periodic geotechnical polling)
 *   2. Ext0 GPIO Interrupt on MPU-6050 INT pin (instant shock/rupture alert)
 * - Wakeup cause diagnostics
 * - Dynamic adaptive rate scaling based on geotechnical hazard level
 */

enum WakeupReason {
    WAKEUP_TIMER,
    WAKEUP_MOTION_SHOCK,
    WAKEUP_CRACK_SWITCH,
    WAKEUP_POWER_ON,
    WAKEUP_OTHER
};

class PowerManager {
public:
    PowerManager();
    
    // Inspects RTC registers to determine why ESP32 booted
    WakeupReason getWakeupReason();
    
    // Configures motion and timer wakeup triggers, then enters Deep Sleep
    void enterDeepSleep(uint32_t sleep_seconds, int8_t motion_int_pin = -1);

    // Prints human-readable boot diagnostics
    void printWakeupDiagnostics();
};

#endif // POWER_MANAGER_H
