#ifndef GATEWAY_CONFIG_H
#define GATEWAY_CONFIG_H

#include <stdint.h>

/**
 * MineGuard ESP32 Edge Gateway Bridge Configuration
 * Smart India Hackathon 2026 (Problem Statement 26025)
 * Moonidih Colliery Central Gateway (Node 3 / Surface Station)
 */

#define GATEWAY_NODE_ID          "N3"          // Root Gateway ID
#define ESPNOW_WIFI_CHANNEL      6             // 2437 MHz (standard industrial channel)
#define SERIAL_BAUD_RATE         115200        // High-speed USB serial bridge baud

// Gateway Forwarding Targets
#define ENABLE_SERIAL_FORWARD    true          // Stream newline-delimited JSON over USB
#define ENABLE_WIFI_REST_FORWARD true          // Direct HTTP POST to MineGuard backend

// Optional WiFi AP Credentials (for standalone field operation or mine LAN)
#define MINE_WIFI_SSID           "MineGuard_Field_AP"
#define MINE_WIFI_PASS           "MineGuard2026!"

// MineGuard Surface Backend Server URL
#define BACKEND_INGEST_URL       "http://192.168.1.100:5000/api/readings"
#define BACKEND_TIMEOUT_MS       3000

// Diagnostic Hardware Pins
#define PIN_LED_RX               2             // Blue LED: flashes on valid mesh packet receipt
#define PIN_LED_ERROR            13            // Red LED: flashes on CRC or sequence violation
#define PIN_LED_WIFI             4             // Green LED: solid when WiFi linked to backend

// Mesh Cache & Deduplication
#define MAX_TRACKED_NODES        16
#define DEDUPLICATION_WINDOW     32

#endif // GATEWAY_CONFIG_H
