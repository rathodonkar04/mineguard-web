# MineGuard Production Deployment & Operations Guide
### Smart India Hackathon 2026 (Problem Statement 26025)
**Statutory Colliery Pithead & Central SCADA Server Deployment Manual**

---

## 1. Deployment Topology Overview

MineGuard supports two production architectures:
1. **Air-Gapped Colliery Pithead LAN**: Autonomous local server at the mine site (Moonidih Colliery) with local PostgreSQL, zero internet dependency, and direct USB serial / local Wi-Fi gateway ingestion.
2. **Central Cloud / Multi-Mine Headquarters**: Centralized deployment at Coal India subsidiary headquarters (BCCL Koyla Bhawan / ECL Sanctoria) aggregating telemetry across multiple collieries and extraction panels.

```
                           +-------------------------------------+
                           | 2.4 GHz ESP-NOW Sensor Mesh Nodes   |
                           | (Node 1, Node 2, Node 4 on Benches) |
                           +------------------+------------------+
                                              |
                                              v (ESP-NOW RF)
                           +-------------------------------------+
                           | Central Gateway Bridge (Node 3)     |
                           +------------------+------------------+
                                              |
                     +------------------------+------------------------+
                     | (High-Speed USB Serial)|                        | (Local Wi-Fi / LAN)
                     v                        v                        v
+-----------------------------------------------------------------------------------+
| Colliery Pithead Server Room (Air-Gapped Linux Host / Industrial Rugged PC)       |
|                                                                                   |
|  [Nginx Reverse Proxy & TLS Terminator (:80 / :443)]                              |
|           │                                                                       |
|           ├──> WebSocket Upgrade /socket.io/                                      |
|           └──> REST API & Static SCADA Bundle (:5000)                             |
|                                                                                   |
|  [MineGuard Node.js SCADA Application Container (:5000)]                          |
|           │                                                                       |
|           ├──> Real-time Socket.IO Ingestion Engine                               |
|           ├──> Isolation Forest AI Anomaly Inference (Sub-millisecond)            |
|           └──> Knothe Time-Function Geotechnical Forecasting Engine               |
|                                                                                   |
|  [Local PostgreSQL / TimescaleDB Container (:5432)]                               |
|           └──> sensor_telemetry, telemetry_minute, risk_analysis, audit_logs      |
+-----------------------------------------------------------------------------------+
```

---

## 2. Docker & Docker-Compose Deployment

### Prerequisites
- Docker Engine v24.0+ and Docker Compose v2.20+
- 4 GB RAM, 2 CPU Cores, 20 GB SSD storage minimum

### Rapid Start Command
```bash
# 1. Clone repository to pithead server
git clone https://github.com/mineguard-sih/mineguard.git /opt/mineguard
cd /opt/mineguard

# 2. Build and launch multi-container stack
docker compose up -d --build

# 3. Verify container health status
docker compose ps
curl -s http://localhost:5000/api/health | jq .
```

---

## 3. Systemd Service Unit (Direct Linux Bare-Metal)

For colliery Linux hosts running Ubuntu Server 22.04 / 24.04 LTS without Docker:

```ini
# File: /etc/systemd/system/mineguard.service
[Unit]
Description=MineGuard Real-Time Colliery Subsidence SCADA Service
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=mineguard
WorkingDirectory=/opt/mineguard/backend
Environment=NODE_ENV=production
Environment=PORT=5000
Environment=DB_ENABLED=true
Environment=DATABASE_URL=postgresql://mineguard_operator:Secret2026@localhost:5432/mineguard
Environment=JWT_SECRET=Colliery_Secure_Airgapped_Secret_2026
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=mineguard-scada

[Install]
WantedBy=multi-user.target
```

Enable and start the service:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now mineguard.service
sudo systemctl status mineguard.service
```

---

## 4. Nginx Reverse Proxy with WebSocket Support

```nginx
# File: /etc/nginx/sites-available/mineguard.conf
server {
    listen 80;
    server_name mineguard.colliery.internal 192.168.1.100;

    # Gzip Compression for Fast Remote Pithead Delivery
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Dedicated Socket.IO WebSocket Reverse Proxy
    location /socket.io/ {
        proxy_pass http://127.0.0.1:5000/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400s;
    }
}
```

---

## 5. Statutory Disaster Recovery & Automated Backups

To comply with DGMS regulations requiring 5-year preservation of subsidence records:

```bash
# Crontab schedule for daily midnight automated archive
# /etc/cron.d/mineguard-backup
0 0 * * * postgres pg_dump -U mineguard_operator -d mineguard | gzip > /var/backups/mineguard/subsidence_backup_$(date +\%F).sql.gz
```
