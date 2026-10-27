#ifndef CONFIG_H
#define CONFIG_H

#include <stdint.h>

/**
 * MineGuard ESP32 Sensor Node Configuration
 * Smart India Hackathon 2026 (Problem Statement 26025)
 * Moonidih Colliery Benchmark (Panel P-4 Overburden Monitoring)
 */

// ==============================================================================
// 1. NODE IDENTITY & RF CHANNEL CONFIGURATION
// ==============================================================================
#ifndef MINEGUARD_NODE_ID
#define MINEGUARD_NODE_ID "NODE_01"   // Unique node name: NODE_01, NODE_02, NODE_04
#endif

#define MINEGUARD_GATEWAY_ID "N3"     // Default target gateway (Node 3)
#define ESPNOW_WIFI_CHANNEL 6         // 2437 MHz (standard industrial channel)
#define MAX_HOP_COUNT 5               // Maximum relay hops before dropping to avoid loops

// Gateway MAC Address for unicast ESP-NOW (All 0xFF = broadcast to nearby relays)
// Evaluators can replace this with specific gateway MAC or use broadcast fallback:
const uint8_t GATEWAY_MAC[6] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};

// ==============================================================================
// 2. HARDWARE PIN DEFINITIONS (ESP32-WROOM-32D)
// ==============================================================================
// I2C Bus for MPU-6050 Inclinometer & Accelerometer
#define PIN_I2C_SDA 21
#define PIN_I2C_SCL 22
#define PIN_MPU_INT 19                // Hardware interrupt pin for motion/shock wakeup

// 1-Wire Digital Bus for DS18B20 Temperature Sensor
#define PIN_ONEWIRE_BUS 4             // Requires 4.7k ohm pullup to 3.3V

// Battery ADC Voltage Divider (100k / 100k divider from battery to GND)
#define PIN_BATTERY_ADC 35            // Input-only ADC1 pin (doesn't conflict with Wi-Fi)

// Optional Crack / Ground Displacement Limit Switch (Mechanical Tripwire)
#define PIN_CRACK_SWITCH 18           // Active LOW with internal pull-up

// Status & Activity LEDs
#define PIN_LED_STATUS 2              // Built-in blue LED for heartbeat / transmission
#define PIN_LED_ALERT 13              // Red LED for localized warning strobe

// ==============================================================================
// 3. STATUTORY GEOTECHNICAL THRESHOLDS (DGMS CIRCULAR NO. 3 / 1998)
// ==============================================================================
#define THRESHOLD_TILT_SAFE_DEG     1.0f  // < 1.0°: Safe baseline
#define THRESHOLD_TILT_WARN_DEG     2.0f  // 1.0° - 2.0°: Advisory warning state
#define THRESHOLD_VIB_CRIT_G        0.15f // > 0.15g: Dynamic blast or rock rupture shock
#define THRESHOLD_TEMP_MAX_C        55.0f // Seam spontaneous combustion warning

// ==============================================================================
// 4. POWER MANAGEMENT & DEEP SLEEP INTERVALS
// ==============================================================================
// Adaptive sleep timing:
// In SAFE state: 30-second deep sleep saves battery (average power < 0.2 mW)
// In WARNING/CRITICAL state: 2-second fast rate captures rapid subsidence acceleration
#define SLEEP_INTERVAL_NORMAL_SEC   30
#define SLEEP_INTERVAL_ALERT_SEC    2

// Battery Voltage Calibration (100k / 100k divider = 2.0x multiplier)
#define ADC_VOLTAGE_DIVIDER_RATIO   2.0f
#define BATTERY_MIN_MV              3000  // 3.0V = 0% capacity cutoff
#define BATTERY_MAX_MV              4200  // 4.2V = 100% capacity (Li-ion/LiFePO4)

#endif // CONFIG_H
