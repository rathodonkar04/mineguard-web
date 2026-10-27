# MineGuard — Real-Time Mine Subsidence Monitoring System
### Smart India Hackathon 2026 (Problem Statement 26025)

An IoT and Geotechnical monitoring prototype for real-time surface deformation, tilt, and subsidence monitoring above underground coal mining panels.

---

## System Architecture

```
ESP32 Sensor Nodes (Surface Grid N1, N2, N3)
       │
       │  (HTTP POST / Wi-Fi Telemetry)
       ▼
Node.js + Express Backend (:5000)
       │
       ├── REST API (/api/telemetry, /api/sensors, /api/alerts)
       ├── In-Memory State Store (N1, N2, N3)
       ├── Risk Calculation & Early Warning Service
       └── Socket.IO Broadcast (sensorUpdate, alertCreated)
       │
       │  (WebSocket + HTTP REST)
       ▼
React Frontend Dashboard (:5173)
       │
       ├── Live Sensor Status (Zone A, Zone B, Zone C)
       ├── Schematic Mine Panel Map
       ├── Real-Time Tilt Progression Graph
       └── Early Warning Alerts
```

---

## Quick Start

### 1. Start Backend Server
```bash
cd backend
npm install
npm start
# Backend running on http://localhost:5000
```

### 2. Start Frontend Dashboard
```bash
npm install
npm run dev
# Frontend running on http://localhost:5173
```

