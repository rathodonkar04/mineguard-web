/**
 * MineGuard ESP32 Edge Gateway Bridge
 * Smart India Hackathon 2026 (Problem Statement 26025)
 * Moonidih Colliery Central Gateway (Node 3 / Surface Station)
 * 
 * Features:
 * - 2.4 GHz ESP-NOW Mesh Packet Listener (Promiscuous & Unicast)
 * - CRC-16 CCITT Verification & Corruption Rejection
 * - Sequence Monotonicity & Deduplication Tracking
 * - Dual Stream Forwarding:
 *   1. High-speed USB Serial Bridge (115200 baud, newline-delimited JSON)
 *   2. Optional WiFi Station HTTP POST -> Surface Server (POST /api/readings)
 * - Interactive Serial Diagnostic Console (STATUS, DUMP, PING, TEST)
 */

#include <Arduino.h>
#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>
#include <HTTPClient.h>

#include "config.h"
#include "mesh_packet.h"

// Gateway Performance & Reliability Counters
struct GatewayStats {
    uint32_t packets_received;
    uint32_t packets_valid;
    uint32_t packets_forwarded;
    uint32_t crc_errors;
    uint32_t duplicate_drops;
    uint32_t http_successes;
    uint32_t http_failures;
    uint32_t uptime_sec;
};

// Node Sequence Tracking for Deduplication
struct NodeTracker {
    char node_id[8];
    uint32_t last_sequence;
    uint32_t last_seen_ms;
    int16_t last_rssi;
};

static GatewayStats stats = {0};
static NodeTracker node_table[MAX_TRACKED_NODES];
static uint8_t tracked_node_count = 0;

// Circular Buffer for Outbound REST Queue (Non-blocking gateway flow)
#define PACKET_QUEUE_SIZE 16
static MeshPacket packet_queue[PACKET_QUEUE_SIZE];
static volatile uint8_t queue_head = 0;
static volatile uint8_t queue_tail = 0;

bool enqueue_packet(const MeshPacket *pkt) {
    uint8_t next_head = (queue_head + 1) % PACKET_QUEUE_SIZE;
    if (next_head == queue_tail) {
        return false; // Queue full
    }
    memcpy(&packet_queue[queue_head], pkt, sizeof(MeshPacket));
    queue_head = next_head;
    return true;
}

bool dequeue_packet(MeshPacket *pkt) {
    if (queue_head == queue_tail) {
        return false; // Queue empty
    }
    memcpy(pkt, &packet_queue[queue_tail], sizeof(MeshPacket));
    queue_tail = (queue_tail + 1) % PACKET_QUEUE_SIZE;
    return true;
}

// Convert MeshPacket to Canonical MineGuard JSON
String formatJsonPayload(const MeshPacket *pkt) {
    float tilt_x = (float)pkt->tilt_x_centi_deg / 100.0f;
    float tilt_y = (float)pkt->tilt_y_centi_deg / 100.0f;
    float temp_c = (float)pkt->temp_centi_c / 100.0f;
    float vib_g = (float)pkt->vibration_milli_g / 1000.0f;
    float batt_v = (float)pkt->battery_mv / 1000.0f;
    float disp_mm = (float)pkt->displacement_mm_x10 / 10.0f;

    String json = "{";
    json += "\"node_id\":\"" + String(pkt->node_id) + "\",";
    json += "\"gateway_id\":\"" + String(GATEWAY_NODE_ID) + "\",";
    json += "\"sequence\":" + String(pkt->sequence) + ",";
    json += "\"hop_count\":" + String(pkt->hop_count) + ",";
    json += "\"tilt_x_deg\":" + String(tilt_x, 3) + ",";
    json += "\"tilt_y_deg\":" + String(tilt_y, 3) + ",";
    json += "\"temperature_C\":" + String(temp_c, 1) + ",";
    json += "\"battery_v\":" + String(batt_v, 2) + ",";
    json += "\"vibration_g\":" + String(vib_g, 3) + ",";
    json += "\"displacement\":" + String(disp_mm, 2) + ",";
    json += "\"status_flags\":" + String(pkt->status_flags) + ",";
    json += "\"rssi\":" + String(pkt->rssi);
    json += "}";
    return json;
}

// Forward JSON to Surface Server via HTTP POST
bool sendHttpPost(const String &jsonPayload) {
    if (WiFi.status() != WL_CONNECTED) {
        return false;
    }

    HTTPClient http;
    http.begin(BACKEND_INGEST_URL);
    http.setTimeout(BACKEND_TIMEOUT_MS);
    http.addHeader("Content-Type", "application/json");

    int httpCode = http.POST(jsonPayload);
    bool success = (httpCode >= 200 && httpCode < 300);

    if (success) {
        stats.http_successes++;
    } else {
        stats.http_failures++;
        Serial.printf("[GATEWAY-HTTP] Failed (Code: %d)\n", httpCode);
    }

    http.end();
    return success;
}

// ESP-NOW Receive Callback
void onDataRecv(const uint8_t *mac, const uint8_t *data, int len) {
    stats.packets_received++;

    // 1. Validate payload length
    if (len != sizeof(MeshPacket)) {
        stats.crc_errors++;
        digitalWrite(PIN_LED_ERROR, HIGH);
        delayMicroseconds(500);
        digitalWrite(PIN_LED_ERROR, LOW);
        return;
    }

    const MeshPacket *pkt = (const MeshPacket*)data;

    // 2. Validate Magic Bytes and CRC-16 Checksum
    if (!validate_packet(pkt)) {
        stats.crc_errors++;
        Serial.printf("[GATEWAY-CRC-FAIL] Dropping corrupted packet from %s (CRC: 0x%04X)\n", 
                      pkt->node_id, pkt->crc16);
        digitalWrite(PIN_LED_ERROR, HIGH);
        delayMicroseconds(500);
        digitalWrite(PIN_LED_ERROR, LOW);
        return;
    }

    // 3. Deduplication and Monotonic Sequence Check
    bool is_duplicate = false;
    int tracked_idx = -1;

    for (int i = 0; i < tracked_node_count; i++) {
        if (strncmp(node_table[i].node_id, pkt->node_id, sizeof(pkt->node_id)) == 0) {
            tracked_idx = i;
            if (pkt->sequence <= node_table[i].last_sequence && (node_table[i].last_sequence - pkt->sequence < 1000)) {
                is_duplicate = true;
            }
            break;
        }
    }

    if (is_duplicate) {
        stats.duplicate_drops++;
        return; // Drop duplicate transmission
    }

    // Update Node Tracking Table
    if (tracked_idx >= 0) {
        node_table[tracked_idx].last_sequence = pkt->sequence;
        node_table[tracked_idx].last_seen_ms = millis();
        node_table[tracked_idx].last_rssi = pkt->rssi;
    } else if (tracked_node_count < MAX_TRACKED_NODES) {
        strncpy(node_table[tracked_node_count].node_id, pkt->node_id, sizeof(node_table[0].node_id));
        node_table[tracked_node_count].last_sequence = pkt->sequence;
        node_table[tracked_node_count].last_seen_ms = millis();
        node_table[tracked_node_count].last_rssi = pkt->rssi;
        tracked_node_count++;
    }

    stats.packets_valid++;

    // Visual RX flash
    digitalWrite(PIN_LED_RX, HIGH);

    // 4. Stream 1: Forward over high-speed USB Serial Bridge
    String jsonString = formatJsonPayload(pkt);
    if (ENABLE_SERIAL_FORWARD) {
        Serial.println(jsonString);
    }

    // 5. Stream 2: Enqueue for WiFi HTTP REST Forwarder
    if (ENABLE_WIFI_REST_FORWARD) {
        enqueue_packet(pkt);
    }

    stats.packets_forwarded++;
    digitalWrite(PIN_LED_RX, LOW);
}

void setup() {
    Serial.begin(SERIAL_BAUD_RATE);
    delay(100);

    Serial.println("\n========================================================");
    Serial.println("  MineGuard ESP32 Edge Gateway Bridge (Node 3)");
    Serial.println("  Smart India Hackathon 2026 (Problem Statement 26025)");
    Serial.println("========================================================");

    pinMode(PIN_LED_RX, OUTPUT);
    pinMode(PIN_LED_ERROR, OUTPUT);
    pinMode(PIN_LED_WIFI, OUTPUT);
    digitalWrite(PIN_LED_RX, LOW);
    digitalWrite(PIN_LED_ERROR, LOW);
    digitalWrite(PIN_LED_WIFI, LOW);

    // Initialize WiFi in Dual Station Mode
    WiFi.mode(WIFI_STA);
    esp_wifi_set_channel(ESPNOW_WIFI_CHANNEL, WIFI_SECOND_CHAN_NONE);

    // Attempt optional WiFi connection if configured
    if (ENABLE_WIFI_REST_FORWARD && strlen(MINE_WIFI_SSID) > 0) {
        Serial.printf("[WIFI] Connecting to '%s'...\n", MINE_WIFI_SSID);
        WiFi.begin(MINE_WIFI_SSID, MINE_WIFI_PASS);
    }

    // Initialize ESP-NOW
    if (esp_now_init() != ESP_OK) {
        Serial.println("[ESPNOW] Init failed on Gateway!");
    } else {
        esp_now_register_recv_cb(onDataRecv);
        Serial.printf("[ESPNOW] Receiver active on 2.4 GHz Channel %d.\n", ESPNOW_WIFI_CHANNEL);
    }

    Serial.println("[GATEWAY] Ready. Listening for ESP-NOW MeshPackets...\n");
}

void loop() {
    // 1. Maintain WiFi Status LED
    if (WiFi.status() == WL_CONNECTED) {
        digitalWrite(PIN_LED_WIFI, HIGH);
    } else {
        digitalWrite(PIN_LED_WIFI, LOW);
    }

    // 2. Process Outbound REST Queue
    MeshPacket queued_pkt;
    if (dequeue_packet(&queued_pkt)) {
        if (WiFi.status() == WL_CONNECTED) {
            String json = formatJsonPayload(&queued_pkt);
            sendHttpPost(json);
        }
    }

    // 3. Handle Interactive Serial Commands from USB
    if (Serial.available()) {
        String cmd = Serial.readStringUntil('\n');
        cmd.trim();
        cmd.toUpperCase();

        if (cmd == "STATUS") {
            Serial.println("\n--- GATEWAY STATUS ---");
            Serial.printf("Packets RX: %u | Valid: %u | Forwarded: %u\n", 
                          stats.packets_received, stats.packets_valid, stats.packets_forwarded);
            Serial.printf("CRC Errors: %u | Duplicate Drops: %u\n", 
                          stats.crc_errors, stats.duplicate_drops);
            Serial.printf("HTTP Posts: %u Success / %u Failed\n", 
                          stats.http_successes, stats.http_failures);
            Serial.printf("Active Mesh Nodes (%d):\n", tracked_node_count);
            for (int i = 0; i < tracked_node_count; i++) {
                Serial.printf("  - %s: Seq %u, RSSI %d dBm, Age %u ms\n",
                              node_table[i].node_id, node_table[i].last_sequence,
                              node_table[i].last_rssi, (uint32_t)(millis() - node_table[i].last_seen_ms));
            }
            Serial.println("----------------------\n");
        } else if (cmd == "TEST") {
            // Self-test injection of a mock MeshPacket
            MeshPacket testPkt;
            memset(&testPkt, 0, sizeof(MeshPacket));
            strncpy(testPkt.node_id, "NODE_01", sizeof(testPkt.node_id) - 1);
            strncpy(testPkt.gateway_id, "N3", sizeof(testPkt.gateway_id) - 1);
            testPkt.sequence = 999;
            testPkt.hop_count = 1;
            testPkt.tilt_x_centi_deg = 21;  // 0.21°
            testPkt.tilt_y_centi_deg = 13;  // 0.13°
            testPkt.tilt_mag_centi_deg = 25;// 0.25°
            testPkt.temp_centi_c = 2710;    // 27.1°C
            testPkt.vibration_milli_g = 40; // 0.040g
            testPkt.battery_mv = 3950;      // 3.95V
            testPkt.displacement_mm_x10 = 35; // 3.5mm
            finalize_packet(&testPkt);

            onDataRecv(NULL, (const uint8_t*)&testPkt, sizeof(MeshPacket));
        } else if (cmd == "HELP") {
            Serial.println("Supported Gateway Commands: STATUS, TEST, HELP");
        }
    }

    delay(10);
}
