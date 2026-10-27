#include "power_manager.h"

PowerManager::PowerManager() {}

WakeupReason PowerManager::getWakeupReason() {
    esp_sleep_wakeup_cause_t cause = esp_sleep_get_wakeup_cause();
    switch (cause) {
        case ESP_SLEEP_WAKEUP_TIMER:
            return WAKEUP_TIMER;
        case ESP_SLEEP_WAKEUP_EXT0:
            return WAKEUP_MOTION_SHOCK;
        case ESP_SLEEP_WAKEUP_EXT1:
            return WAKEUP_CRACK_SWITCH;
        case ESP_SLEEP_WAKEUP_UNDEFINED:
        default:
            return WAKEUP_POWER_ON;
    }
}

void PowerManager::printWakeupDiagnostics() {
    WakeupReason reason = getWakeupReason();
    Serial.print("[POWER] Wakeup Source: ");
    switch (reason) {
        case WAKEUP_TIMER:
            Serial.println("RTC Periodic Wakeup Timer.");
            break;
        case WAKEUP_MOTION_SHOCK:
            Serial.println("CRITICAL: MPU-6050 Motion/Shock Interrupt (Ext0).");
            break;
        case WAKEUP_CRACK_SWITCH:
            Serial.println("CRITICAL: Mechanical Ground Crack Limit Switch (Ext1).");
            break;
        case WAKEUP_POWER_ON:
            Serial.println("Cold Boot / Fresh Power-On Reset.");
            break;
        default:
            Serial.println("Other Wakeup Cause.");
            break;
    }
}

void PowerManager::enterDeepSleep(uint32_t sleep_seconds, int8_t motion_int_pin) {
    Serial.printf("[POWER] Preparing Deep Sleep for %u seconds...\n", sleep_seconds);

    // 1. Enable RTC Timer Wakeup
    uint64_t sleep_microseconds = (uint64_t)sleep_seconds * 1000000ULL;
    esp_sleep_enable_timer_wakeup(sleep_microseconds);

    // 2. Enable External GPIO Interrupt Wakeup on MPU INT (Active LOW)
    if (motion_int_pin >= 0) {
        // MPU-6050 INT pin triggers LOW when motion threshold exceeded
        esp_sleep_enable_ext0_wakeup((gpio_num_t)motion_int_pin, 0);
    }

    Serial.println("[POWER] Entering ESP32 Deep Sleep now. (Power ~15 µA)");
    Serial.flush();
    esp_deep_sleep_start();
}
