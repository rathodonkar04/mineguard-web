#ifndef MESH_PACKET_H
#define MESH_PACKET_H

#include <stdint.h>
#include <string.h>

/**
 * MineGuard ESP-NOW Mesh Packet Specification (SIH 2026 PS 26025)
 * Binary serialized telemetry payload transmitted over 2.4 GHz ESP-NOW wireless mesh.
 * 
 * Strict struct packing ensures identical byte alignment between sender and receiver.
 * Maximum ESP-NOW payload is 250 bytes; this compact struct is 44 bytes.
 */

#define MINEGUARD_MAGIC_BYTE_0 0x4D // 'M'
#define MINEGUARD_MAGIC_BYTE_1 0x47 // 'G'
#define MINEGUARD_PROTOCOL_VERSION 0x01

// Packet Status Flags (Bitmask)
#define FLAG_ALARM_CRITICAL  (1 << 0) // Bit 0: Tilt or vibration exceeded critical limit
#define FLAG_ALARM_WARNING   (1 << 1) // Bit 1: Tilt or vibration in warning threshold
#define FLAG_LOW_BATTERY     (1 << 2) // Bit 2: Battery voltage < 3.3V (<15%)
#define FLAG_CRACK_TRIGGER   (1 << 3) // Bit 3: Hardware crack switch or shock trip
#define FLAG_RELAY_HOPPED    (1 << 4) // Bit 4: Packet was relayed by an intermediate node
#define FLAG_SENSOR_FAULT    (1 << 5) // Bit 5: MPU6050 or DS18B20 I2C/1-Wire read failure

#pragma pack(push, 1)
struct MeshPacket {
    uint8_t  magic[2];         // 0x4D, 0x47 ('MG')
    uint8_t  version;          // Protocol version (0x01)
    uint8_t  status_flags;     // Bitmask of status & alarm conditions
    char     node_id[8];       // Node ID null-terminated string (e.g. "NODE_01")
    char     gateway_id[8];    // Target or current gateway ID (e.g. "N3")
    uint32_t sequence;         // Incrementing transmission sequence counter
    uint8_t  hop_count;        // Number of relay hops traversed (0 = direct, max 5)
    int8_t   rssi;             // Signal strength in dBm (-30 to -95 dBm)
    int16_t  tilt_x_centi_deg; // Tilt X in centi-degrees (e.g. 125 = 1.25°)
    int16_t  tilt_y_centi_deg; // Tilt Y in centi-degrees (e.g. -85 = -0.85°)
    int16_t  tilt_mag_centi_deg;// Total composite vector tilt angle: sqrt(x^2 + y^2)
    int16_t  temp_centi_c;     // Temperature in centi-Celsius (e.g. 2680 = 26.8°C)
    uint16_t vibration_milli_g;// Dynamic vibration peak in milli-g (e.g. 45 = 0.045g)
    uint16_t battery_mv;       // Battery voltage in millivolts (e.g. 3920 = 3.92V)
    uint16_t displacement_mm_x10; // Estimated cumulative displacement in 0.1 mm
    uint16_t crc16;            // CCITT CRC-16 checksum across previous bytes
};
#pragma pack(pop)

/**
 * Standard CRC-16 CCITT Calculation (Polynomial 0x1021, Initial 0xFFFF)
 */
inline uint16_t calculate_crc16(const uint8_t *data, size_t length) {
    uint16_t crc = 0xFFFF;
    for (size_t i = 0; i < length; i++) {
        crc ^= (uint16_t)data[i] << 8;
        for (uint8_t j = 0; j < 8; j++) {
            if (crc & 0x8000) {
                crc = (crc << 1) ^ 0x1021;
            } else {
                crc = crc << 1;
            }
        }
    }
    return crc;
}

/**
 * Validates a received mesh packet's magic header and CRC-16
 */
inline bool validate_packet(const MeshPacket *pkt) {
    if (pkt->magic[0] != MINEGUARD_MAGIC_BYTE_0 || pkt->magic[1] != MINEGUARD_MAGIC_BYTE_1) {
        return false;
    }
    if (pkt->version != MINEGUARD_PROTOCOL_VERSION) {
        return false;
    }
    size_t payload_len = sizeof(MeshPacket) - sizeof(uint16_t);
    uint16_t calculated = calculate_crc16((const uint8_t*)pkt, payload_len);
    return calculated == pkt->crc16;
}

/**
 * Finalizes packet preparation: calculates and stamps the CRC16 field
 */
inline void finalize_packet(MeshPacket *pkt) {
    pkt->magic[0] = MINEGUARD_MAGIC_BYTE_0;
    pkt->magic[1] = MINEGUARD_MAGIC_BYTE_1;
    pkt->version = MINEGUARD_PROTOCOL_VERSION;
    size_t payload_len = sizeof(MeshPacket) - sizeof(uint16_t);
    pkt->crc16 = calculate_crc16((const uint8_t*)pkt, payload_len);
}

#endif // MESH_PACKET_H
