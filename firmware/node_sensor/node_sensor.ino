/**
 * MineGuard ESP32 Inclinometer & Environmental Sensor Node
 * Smart India Hackathon 2026 (Problem Statement 26025)
 * Moonidih Colliery Overburden Subsidence Monitoring
 * 
 * Features:
 * - High-precision MPU-6050 inclinometer with 5Hz geotechnical DLPF
 * - DS18B20 1-Wire temperature acquisition for thermal expansion compensation
 * - 18650 LiFePO4 / Li-ion fuel gauge monitoring via ADC voltage divider
 * - ESP-NOW 2.4 GHz wireless mesh packet transmission with CRC-16 validation
 * - Dynamic adaptive rate scaling: 30s deep sleep during normal baseline,
 *   accelerating to 2s high-frequency capture during warning/critical displacement.
 * - Hardware interrupt wakeup on MPU-6050 motion trigger or crack tripwire.
 */

#include <Arduino.h>
#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>

#include "config.h"
#include "mesh_packet.h"
#include "mpu6050_driver.h"
#include "ds18b20_driver.h"
#include "battery_monitor.h"
#include "power_manager.h"

// Persistent RTC memory: retains transmission sequence across Deep Sleep cycles
RTC_DATA_ATTR uint32_t rtc_sequence = 0;
RTC_DATA_ATTR uint32_t rtc_boot_count = 0;
RTC_DATA_ATTR float rtc_last_tilt_mag = 0.0f;

// Driver instances
Mpu6050Driver mpu;
Ds18b20Driver ds18b20;
BatteryMonitor battery;
PowerManager power;

// ESP-NOW transmission status tracking
volatile bool send_completed = false;
volatile bool send_success = false;

void onDataSent(const uint8_t *mac_addr, esp_now_send_status_t status) {
    send_completed = true;
    send_success = (status == ESP_NOW_SEND_SUCCESS);
}

void setup() {
    Serial.begin(115200);
    delay(100);
    rtc_boot_count++;
    rtc_sequence++;

    Serial.println("\n========================================================");
    Serial.println("  MineGuard ESP32 Geotechnical Inclinometer Node");
    Serial.printf("  Node ID: %s | Boot #%u | Sequence: %u\n", 
                  MINEGUARD_NODE_ID, rtc_boot_count, rtc_sequence);
    Serial.println("========================================================");

    // Initialize diagnostic LEDs
    pinMode(PIN_LED_STATUS, OUTPUT);
    pinMode(PIN_LED_ALERT, OUTPUT);
    digitalWrite(PIN_LED_STATUS, HIGH); // Turn on during measurement phase
    digitalWrite(PIN_LED_ALERT, LOW);

    // Initialize physical crack / tripwire switch (Active LOW)
    pinMode(PIN_CRACK_SWITCH, INPUT_PULLUP);

    // Diagnostic boot reason check
    power.printWakeupDiagnostics();

    // 1. Initialize Sensors
    battery.begin(PIN_BATTERY_ADC, ADC_VOLTAGE_DIVIDER_RATIO);
    bool mpu_ok = mpu.begin(PIN_I2C_SDA, PIN_I2C_SCL);
    bool ds_ok = ds18b20.begin(PIN_ONEWIRE_BUS);

    // 2. Sample Battery
    BatteryStatus batt_stat = battery.read();
    Serial.printf("[BATT] Potential: %u mV | SoC: %u%% | Low: %s\n", 
                  batt_stat.voltage_mv, batt_stat.percentage, batt_stat.is_low ? "YES" : "NO");

    // 3. Sample Inclinometer & Vibration
    MpuTelemetry mpu_data;
    if (mpu_ok) {
        if (!mpu.readTelemetry(mpu_data)) {
            Serial.println("[MPU] Telemetry read failed; using fallback safe datum.");
            mpu_data.tilt_x_deg = 0.0f;
            mpu_data.tilt_y_deg = 0.0f;
            mpu_data.tilt_mag_deg = 0.0f;
            mpu_data.vibration_g = 0.01f;
        }
    } else {
        Serial.println("[MPU] Hardware initialization failed!");
        mpu_data.tilt_x_deg = 0.0f;
        mpu_data.tilt_y_deg = 0.0f;
        mpu_data.tilt_mag_deg = 0.0f;
        mpu_data.vibration_g = 0.01f;
    }

    Serial.printf("[INCLINOMETER] Pitch X: %.3f° | Roll Y: %.3f° | Magnitude: %.3f° | Vibration: %.3f g\n",
                  mpu_data.tilt_x_deg, mpu_data.tilt_y_deg, mpu_data.tilt_mag_deg, mpu_data.vibration_g);

    // 4. Sample Temperature
    float temp_c = 25.0f;
    if (ds_ok) {
        if (!ds18b20.readTemperature(temp_c)) {
            Serial.println("[DS18B20] Read failed; defaulting to 25.0 °C");
            temp_c = 25.0f;
        }
    }
    Serial.printf("[TEMPERATURE] In-situ Rock Temp: %.2f °C\n", temp_c);

    // 5. Check Mechanical Crack Tripwire
    bool crack_tripped = (digitalRead(PIN_CRACK_SWITCH) == LOW);
    if (crack_tripped) {
        Serial.println("[ALERT] Mechanical crack switch tripped!");
        digitalWrite(PIN_LED_ALERT, HIGH);
    }

    // 6. Evaluate Statutory Geotechnical Hazard Level
    uint8_t flags = 0;
    bool is_critical = false;
    bool is_warning = false;

    if (mpu_data.tilt_mag_deg >= THRESHOLD_TILT_WARN_DEG || crack_tripped || mpu_data.vibration_g >= THRESHOLD_VIB_CRIT_G) {
        flags |= FLAG_ALARM_CRITICAL;
        is_critical = true;
        digitalWrite(PIN_LED_ALERT, HIGH);
        Serial.println("[STATUS] >>> CRITICAL GEOTECHNICAL HAZARD DETECTED <<<");
    } else if (mpu_data.tilt_mag_deg >= THRESHOLD_TILT_SAFE_DEG) {
        flags |= FLAG_ALARM_WARNING;
        is_warning = true;
        Serial.println("[STATUS] >>> ADVISORY WARNING THRESHOLD EXCEEDED <<<");
    } else {
        Serial.println("[STATUS] Node parameters nominal (Safe Baseline).");
    }

    if (batt_stat.is_low) flags |= FLAG_LOW_BATTERY;
    if (crack_tripped) flags |= FLAG_CRACK_TRIGGER;
    if (!mpu_ok || !ds_ok) flags |= FLAG_SENSOR_FAULT;

    // 7. Assemble Binary ESP-NOW Mesh Packet
    MeshPacket pkt;
    memset(&pkt, 0, sizeof(MeshPacket));
    pkt.status_flags = flags;
    strncpy(pkt.node_id, MINEGUARD_NODE_ID, sizeof(pkt.node_id) - 1);
    strncpy(pkt.gateway_id, MINEGUARD_GATEWAY_ID, sizeof(pkt.gateway_id) - 1);
    pkt.sequence = rtc_sequence;
    pkt.hop_count = 0;
    pkt.rssi = -65; // Estimated nominal RSSI

    // Convert floating point to integer fixed-point for compact, deterministic transmission
    pkt.tilt_x_deg = (int16_t)(mpu_data.tilt_x_deg * 100.0f);
    pkt.tilt_y_deg = (int16_t)(mpu_data.tilt_y_deg * 100.0f);
    pkt.tilt_mag_deg = (int16_t)(mpu_data.tilt_mag_deg * 100.0f);
    pkt.temp_centi_c = (int16_t)(temp_c * 100.0f);
    pkt.vibration_milli_g = (uint16_t)(mpu_data.vibration_g * 1000.0f);
    pkt.battery_mv = batt_stat.voltage_mv;
    pkt.displacement_mm_x10 = (uint16_t)(mpu_data.tilt_mag_deg * 25.0f); // Approximate subsidence displacement

    // Stamp CRC-16 checksum
    finalize_packet(&pkt);

    // 8. Initialize Wi-Fi in Station Mode & Setup ESP-NOW
    WiFi.mode(WIFI_STA);
    esp_wifi_set_channel(ESPNOW_WIFI_CHANNEL, WIFI_SECOND_CHAN_NONE);
    WiFi.disconnect();

    if (esp_now_init() != ESP_OK) {
        Serial.println("[ESPNOW] Initialization failed!");
    } else {
        esp_now_register_send_cb(onDataSent);

        // Register Peer (Gateway MAC or Broadcast)
        esp_now_peer_info_t peerInfo;
        memset(&peerInfo, 0, sizeof(peerInfo));
        memcpy(peerInfo.peer_addr, GATEWAY_MAC, 6);
        peerInfo.channel = ESPNOW_WIFI_CHANNEL;
        peerInfo.encrypt = false;

        if (esp_now_add_peer(&peerInfo) == ESP_OK) {
            send_completed = false;
            esp_err_t send_result = esp_now_send(GATEWAY_MAC, (uint8_t*)&pkt, sizeof(MeshPacket));
            
            if (send_result == ESP_OK) {
                // Wait briefly for confirmation callback
                uint32_t start_wait = millis();
                while (!send_completed && (millis() - start_wait < 150)) {
                    delay(5);
                }
                Serial.printf("[ESPNOW] Packet #%u sent (%d bytes, CRC16: 0x%04X) -> %s\n",
                              pkt.sequence, (int)sizeof(MeshPacket), pkt.crc16,
                              send_success ? "ACK RECEIVED" : "BROADCAST FIRED");
            } else {
                Serial.printf("[ESPNOW] Transmission error: %d\n", send_result);
            }
        }
    }

    digitalWrite(PIN_LED_STATUS, LOW);

    // 9. Adaptive Sleep Duration Scaling
    uint32_t sleep_sec = SLEEP_INTERVAL_NORMAL_SEC;
    if (is_critical || is_warning) {
        sleep_sec = SLEEP_INTERVAL_ALERT_SEC; // Rapid 2-second rate during active movement
        Serial.printf("[POWER] Hazard active: Scaling sleep down to %u seconds.\n", sleep_sec);
    } else {
        Serial.printf("[POWER] Nominal baseline: Entering standard %u second deep sleep.\n", sleep_sec);
    }

    // Configure MPU motion interrupt to wake node immediately if rock movement occurs
    if (mpu_ok) {
        mpu.enableMotionWakeup(15, 30); // ~480mg dynamic shock trigger
    }

    // Enter deep sleep
    power.enterDeepSleep(sleep_sec, PIN_MPU_INT);
}

void loop() {
    // Loop is not executed during Deep Sleep operation;
    // ESP32 resets and starts from setup() upon each timer or interrupt wakeup.
}
