# MineGuard Backend & Real Telemetry Ingestion Pipeline
### Smart India Hackathon 2026 (Problem Statement 26025)

"Development of an AI-enabled Low Cost Real Time Mine Subsidence Monitoring, Prediction and Early Warning System for Underground Coal Mines in India."

---

## 1. End-to-End Data Flow Architecture

```
+─────────────────────────────────────────────────────────────+
|            Physical ESP32 Sensor Nodes (Surface Grid)       |
|  - MPU6050 6-DOF IMU (tilt_x, tilt_y, tilt_angle)           |
|  - Vibration (accelerometer RMS index)                      |
|  - Temperature (internal/ambient °C)                        |
|  - Displacement (extensometer / ultrasonic gauge mm)        |
+─────────────────────────────────────────────────────────────+
                              │
                              ▼  (Node ID Tagging: NODE_01, NODE_02, NODE_03)
+─────────────────────────────────────────────────────────────+
|               ESP-NOW / 2.4 GHz Wireless Mesh               |
|  - Multi-hop node-to-node relay                              |
|  - Forwarding packets to root receiver node                 |
+─────────────────────────────────────────────────────────────+
                              │
                              ▼  (UART / Wi-Fi Gateway Bridge)
+─────────────────────────────────────────────────────────────+
|                 Edge Gateway / Receiver Node                |
|  - Constructs canonical JSON telemetry payload              |
|  - Sends HTTP POST /api/telemetry                           |
+─────────────────────────────────────────────────────────────+
                              │
                              ▼  (HTTP POST JSON on Port 5000)
+─────────────────────────────────────────────────────────────+
|                 Node.js + Express Backend                   |
|  - Validation: checks node_id, numeric finite ranges        |
|  - State Store: updates live sensor state in memory         |
|  - Risk Service: computes threshold status & alerts         |
|  - Socket.IO: broadcasts "sensorUpdate" & "alertCreated"    |
+─────────────────────────────────────────────────────────────+
                              │
                              ▼  (WebSocket + REST API)
+─────────────────────────────────────────────────────────────+
|                    React Vite Dashboard                     |
|  - Live multi-channel sensor cards (N1, N2, N3)             |
|  - Schematic Mine Panel Map                                 |
|  - Live Tilt Trend Graph & Real-Time Risk Indicator         |
+─────────────────────────────────────────────────────────────+
                              │
                              ▼  (Future Pipeline Stage)
+─────────────────────────────────────────────────────────────+
|                 AI / ML Anomaly Subsystem                   |
|  - Baseline Calibration (ai/models/baseline.json)           |
|  - Causal Feature Engineering (16 Features)                 |
|  - Isolation Forest Anomaly Detection Model                 |
+─────────────────────────────────────────────────────────────+
```

---

## 2. Canonical Telemetry JSON Schema

Every sensor reading sent by the ESP32 mesh gateway **MUST** adhere to this JSON structure:

```json
{
  "node_id": "NODE_01",
  "timestamp": "2026-08-28T10:30:00.000Z",
  "tilt_x": 0.21,
  "tilt_y": 0.13,
  "tilt_angle": 0.25,
  "temperature": 27.1,
  "vibration": 0.03,
  "displacement": 0.4
}
```

### Schema Specification & Units

| Field Name | Type | Required | Units / Range | Description |
|---|---|---|---|---|
| `node_id` | String | **YES** | `NODE_01`, `NODE_02`, `NODE_03`, `NODE_04` (or `N1`, `N2`, `N3`) | Unique identifier of the sensor node |
| `timestamp` | String | Optional | ISO-8601 UTC (e.g. `2026-08-28T10:30:00Z`) | Acquisition timestamp (defaults to server UTC if omitted) |
| `tilt_angle` | Float | **YES\*** | Degrees (°), $\ge 0.0^\circ$ | Total resultant inclination: $\sqrt{\text{tilt}_x^2 + \text{tilt}_y^2}$ |
| `tilt_x` | Float | Optional\* | Degrees (°) | MPU6050 X-axis surface inclination |
| `tilt_y` | Float | Optional\* | Degrees (°) | MPU6050 Y-axis surface inclination |
| `temperature`| Float | Optional | °C (e.g. `27.1`) | Ambient / MPU6050 temperature (defaults to 25.0°C) |
| `displacement`| Float | **YES** | Millimeters (mm), $\ge 0.0$ | Surface deformation / vertical displacement |
| `vibration` | Float | **YES** | Acceleration index ($g$), $\ge 0.0$ | Dynamic surface vibration index from accelerometer |
| `crackDetected`| Boolean | Optional | `true` / `false` | Micro-crack / acoustic emission trigger (default: `false`) |

*\*Note on Tilt*: The backend accepts `tilt_angle` directly, OR derives it automatically from `tilt_x` and `tilt_y` via $\sqrt{\text{tilt}_x^2 + \text{tilt}_y^2}$.

---

## 3. Node ID Conventions & Zone Mapping

| Canonical Node ID | Short Dashboard ID | Physical Location / Mine Zone | Primary Monitoring Role |
|---|---|---|---|
| `NODE_01` | `N1` | **Zone A** (Stable Surface) | Baseline undisturbed reference node |
| `NODE_02` | `N2` | **Zone B** (Transition Area) | Inflexion zone / early shear detection |
| `NODE_03` | `N3` | **Zone C** (Active Panel) | Core panel caving & subsidence monitoring |
| `NODE_04` | `N4` | **Zone D** (Expansion Grid) | Peripheral strata monitoring |

---

## 4. Ingestion API Endpoint Details

- **Method**: `POST`
- **Path**: `/api/telemetry`
- **URL**: `http://<SERVER_IP>:5000/api/telemetry`
- **Headers**: `Content-Type: application/json`

### Success Response (`200 OK`)
```json
{
  "success": true,
  "sensor": {
    "nodeId": "N1",
    "node_id": "NODE_01",
    "zone": "Zone A",
    "name": "Sensor Node 1 (Stable Reference)",
    "tilt": 0.25,
    "tilt_angle": 0.25,
    "tilt_x": 0.21,
    "tilt_y": 0.13,
    "displacement": 0.4,
    "vibration": 0.03,
    "temperature": 27.1,
    "crackDetected": false,
    "status": "Normal",
    "riskScore": 16,
    "online": true,
    "lastSeen": "2026-08-28T10:30:00.000Z",
    "timestamp": "2026-08-28T10:30:00.000Z"
  },
  "alert": null
}
```

### Malformed Error Response (`400 Bad Request`)
If any required field is missing or non-numeric:
```json
{
  "success": false,
  "error": "Field \"displacement\" is required and must be a finite number (mm)."
}
```

---

## 5. Hardware Team Implementation Guide (ESP32)

### Example `curl` Ingestion Test
```bash
curl -X POST http://localhost:5000/api/telemetry \
  -H "Content-Type: application/json" \
  -d '{
    "node_id": "NODE_01",
    "tilt_x": 0.21,
    "tilt_y": 0.13,
    "tilt_angle": 0.25,
    "temperature": 27.1,
    "vibration": 0.03,
    "displacement": 0.4
  }'
```

### Example Arduino / ESP32 C++ Snippet
```cpp
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

const char* serverUrl = "http://192.168.1.100:5000/api/telemetry";

void sendTelemetry(const char* nodeId, float tiltX, float tiltY, float tiltAngle, float temp, float vib, float disp) {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(serverUrl);
    http.addHeader("Content-Type", "application/json");

    StaticJsonDocument<256> doc;
    doc["node_id"] = nodeId;
    doc["tilt_x"] = tiltX;
    doc["tilt_y"] = tiltY;
    doc["tilt_angle"] = tiltAngle;
    doc["temperature"] = temp;
    doc["vibration"] = vib;
    doc["displacement"] = disp;

    String requestBody;
    serializeJson(doc, requestBody);

    int httpResponseCode = http.POST(requestBody);
    if (httpResponseCode > 0) {
      Serial.printf("[HTTP] Telemetry POST Success: %d\n", httpResponseCode);
    } else {
      Serial.printf("[HTTP] Error sending POST: %s\n", http.errorToString(httpResponseCode).c_str());
    }
    http.end();
  }
}
```

---

## 6. What the Hardware Team Needs to Implement Next

1. **Node Identification in Firmware**:
   - Hardcode or configure a unique `NODE_01` / `NODE_02` ID string in the firmware of each ESP32 board.
2. **Mesh Header Forwarding**:
   - Ensure mesh relay packets preserve the originating `node_id` as they hop to the root receiver.
3. **Gateway HTTP Client**:
   - Have the gateway or root ESP32 node format the canonical JSON payload and perform `POST /api/telemetry` over Wi-Fi/Ethernet.
4. **Sampling Rate**:
   - Transmit telemetry at **1 reading / second (1 Hz)** or **1 reading / 5 seconds** during quiescent baseline periods.

---

## 7. Verification Test Suites

```bash
# Run standard backend API test suite (21 tests)
node backend/test-backend.js

# Run real ESP32 telemetry ingestion test suite (26 tests)
node backend/test-telemetry-ingestion.js
```
