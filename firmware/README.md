# MineGuard Embedded Firmware & Edge Gateway Subsystem
### Smart India Hackathon 2026 (Problem Statement 26025)
**Autonomous ESP32 Wireless Mesh Inclinometer Network for Coal Mine Subsidence Early Warning**

---

## 1. Subsystem Architecture

The MineGuard edge subsystem consists of autonomous field inclinometer nodes and an edge gateway bridge deployed over coal mine extraction panels:

```
+-----------------------------------------------------------------------------------+
|                            MINE BENCH / OVERBURDEN                                |
|                                                                                   |
|  [Node 1: NODE_01]             [Node 2: NODE_02]             [Node 4: NODE_04]    |
|  - MPU-6050 Inclinometer       - Inflexion Relay             - Flank Perimeter    |
|  - DS18B20 Rock Temp           - ESP-NOW Mesh Node           - Solar Powered      |
|  - Deep Sleep Power Mgr        - 18650 Battery Monitor       - Ultra-Low Power    |
+-----------+----------------------------+-----------------------------+------------+
            | (2.4 GHz ESP-NOW)          | (2.4 GHz ESP-NOW)           | (2.4 GHz ESP-NOW)
            v                            v                             v
+-----------------------------------------------------------------------------------+
|  [Central Gateway Bridge: Node 3 / N3]                                            |
|  - ESP-NOW Mesh Sink & Packet De-duplicator                                       |
|  - 16-Bit CRC CCITT Checksum Validator                                            |
|  - Fixed-Point to Floating-Point Engineering Unit Transcoder                      |
|                                                                                   |
|  Stream 1: High-Speed USB Serial Bridge (115200 Baud, Newline-Delimited JSON)     |
|  Stream 2: Dual-Band WiFi Station HTTP POST (POST /api/readings)                  |
+----------------------------------------+------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
|  [MineGuard Surface SCADA Backend & Dashboard Server]                             |
|  - Node.js Express REST API (:5000) & Socket.IO Real-Time Broadcast               |
|  - Sub-millisecond Isolation Forest AI Anomaly Inference Engine                   |
|  - Knothe Time-Function Subsidence Forecasting & Predictive Curves                |
|  - React 19 Operator, Planner & DGMS Auditor SCADA Console (:5173)                |
+-----------------------------------------------------------------------------------+
```

---

## 2. Directory Structure

```
firmware/
├── README.md                      # Subsystem architecture and compile instructions
├── BOM.md                         # Low-cost Bill of Materials (< ₹2,500 statutory limit)
├── SCHEMATICS.md                  # Wiring schematics, circuit diagrams, and pinouts
├── DEPLOYMENT_GUIDE.md            # DGMS borehole anchoring and monument mounting protocol
├── platformio.ini                 # Unified PlatformIO compilation configuration
├── node_sensor/                   # Sensor node firmware (Field Inclinometer)
│   ├── node_sensor.ino            # Main Arduino sketch (Setup, measurements, sleep)
│   ├── config.h                   # Pinout, identity, statutory thresholds & sleep timers
│   ├── mesh_packet.h              # Binary packed struct with CCITT CRC-16
│   ├── mpu6050_driver.h / .cpp    # Register-level MPU-6050 I2C inclinometer driver (5Hz DLPF)
│   ├── ds18b20_driver.h / .cpp    # Lightweight 1-Wire temperature driver
│   ├── battery_monitor.h / .cpp   # 12-bit ADC voltage divider & fuel gauge calculation
│   └── power_manager.h / .cpp     # Deep sleep, RTC timer, and motion interrupt wakeup
├── gateway_bridge/                # Edge gateway firmware (Node 3 / Surface Station)
│   ├── gateway_bridge.ino         # ESP-NOW packet sink, CRC check, serial/HTTP forwarding
│   ├── config.h                   # Gateway configurations, baud rates, backend URLs
│   └── mesh_packet.h              # Matching binary packet struct definition
└── tools/                         # Simulation and bridging utilities
    ├── serial_forwarder.py        # Python USB COM port -> HTTP /api/readings bridge
    └── virtual_mesh_simulator.js  # Node.js 4-node simulated ESP-NOW mesh packet generator
```

---

## 3. Compilation & Flashing Instructions

### Option A: Using Arduino IDE
1. Open **Arduino IDE** (v2.0 or newer).
2. Install **ESP32 Board Package**:
   - Go to `File > Preferences > Additional Board Manager URLs` and add:
     `https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json`
   - Open `Tools > Board > Boards Manager`, search for `esp32` by Espressif, and click **Install**.
3. **Flashing a Sensor Node**:
   - Open `firmware/node_sensor/node_sensor.ino`.
   - Select Board: `ESP32 Dev Module`.
   - In `config.h`, set `MINEGUARD_NODE_ID` to `"NODE_01"`, `"NODE_02"`, or `"NODE_04"`.
   - Connect ESP32 via USB and click **Upload**.
4. **Flashing the Edge Gateway (Node 3)**:
   - Open `firmware/gateway_bridge/gateway_bridge.ino`.
   - Select Board: `ESP32 Dev Module`.
   - In `config.h`, set your colliery Wi-Fi SSID / Password and Surface Server IP.
   - Connect Gateway ESP32 via USB and click **Upload**.

### Option B: Using PlatformIO (VS Code / CLI)
1. Navigate to the `firmware` directory:
   ```bash
   cd firmware
   ```
2. Build and flash the Sensor Node:
   ```bash
   pio run -e node_sensor --target upload
   ```
3. Build and flash the Gateway Bridge:
   ```bash
   pio run -e gateway_bridge --target upload
   ```

---

## 4. Telemetry Payload Contract

The Gateway transcode process receives a 44-byte binary `MeshPacket` over ESP-NOW and formats it into the canonical MineGuard JSON payload for `POST /api/readings`:

```json
{
  "node_id": "NODE_01",
  "gateway_id": "N3",
  "sequence": 123,
  "hop_count": 1,
  "tilt_x_deg": 0.210,
  "tilt_y_deg": 0.130,
  "temperature_C": 27.1,
  "battery_v": 3.95,
  "vibration_g": 0.040,
  "displacement": 0.35,
  "status_flags": 0,
  "rssi": -65
}
```

This format is empirically validated by `backend/test-gateway-compatibility.js` and ingested directly into both in-memory SCADA buffers and PostgreSQL/Supabase tables.
