#!/usr/bin/env python3
"""
MineGuard Serial Edge Gateway Bridge
Smart India Hackathon 2026 (Problem Statement 26025)

Reads streaming newline-delimited JSON telemetry from the ESP32 Node 3 Gateway over USB COM port
and asynchronously forwards payloads to the MineGuard backend REST API (POST /api/readings).

Usage:
    python serial_forwarder.py --port COM3 --baud 115200 --url http://localhost:5000/api/readings
    python serial_forwarder.py --mock --url http://localhost:5000/api/readings
"""

import sys
import time
import json
import argparse
import urllib.request
import urllib.error

def forward_payload(url, payload_dict):
    """Sends JSON payload via HTTP POST using standard library urllib."""
    try:
        data_bytes = json.dumps(payload_dict).encode('utf-8')
        req = urllib.request.Request(
            url,
            data=data_bytes,
            headers={'Content-Type': 'application/json'}
        )
        with urllib.request.urlopen(req, timeout=3) as response:
            res_body = response.read().decode('utf-8')
            return response.status, res_body
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode('utf-8')
    except Exception as e:
        return 0, str(e)

def run_mock_mode(url, interval=2.0):
    """Simulates streaming serial gateway packets from the 4 Moonidih nodes."""
    print(f"\n[MINEGUARD GATEWAY BRIDGE] Running in MOCK SERIAL MODE -> {url}")
    print("Press Ctrl+C to stop.\n")
    
    nodes = [
        {"id": "NODE_01", "name": "Node 1 (Stable)", "x": 0.17, "y": 0.12, "temp": 26.2, "hops": 1, "batt": 4.12},
        {"id": "NODE_02", "name": "Node 2 (Inflexion)", "x": 0.58, "y": 0.46, "temp": 27.5, "hops": 0, "batt": 3.98},
        {"id": "NODE_03", "name": "Node 3 (Gateway)", "x": 0.23, "y": 0.19, "temp": 26.8, "hops": 0, "batt": 3.91},
        {"id": "NODE_04", "name": "Node 4 (Flank)", "x": 0.11, "y": 0.10, "temp": 25.9, "hops": 2, "batt": 4.18}
    ]
    
    seq = 1000
    try:
        while True:
            for n in nodes:
                seq += 1
                payload = {
                    "node_id": n["id"],
                    "gateway_id": "N3",
                    "sequence": seq,
                    "hop_count": n["hops"],
                    "tilt_x_deg": n["x"],
                    "tilt_y_deg": n["y"],
                    "temperature_C": n["temp"],
                    "battery_v": n["batt"],
                    "vibration_g": 0.02
                }
                
                print(f"[SERIAL RX] {json.dumps(payload)}")
                status, res = forward_payload(url, payload)
                if status == 200:
                    print(f"  -> FORWARDED TO BACKEND (HTTP 200 OK)")
                else:
                    print(f"  -> FORWARD FAILED (Status: {status}): {res}")
                time.sleep(interval / len(nodes))
    except KeyboardInterrupt:
        print("\n[GATEWAY BRIDGE] Stopped.")

def run_serial_mode(port, baud, url):
    """Connects to real hardware COM port using pySerial if installed."""
    try:
        import serial
    except ImportError:
        print("ERROR: 'pyserial' is not installed. Install it with: pip install pyserial")
        print("Or run in simulation mode with: python serial_forwarder.py --mock")
        sys.exit(1)

    print(f"\n[MINEGUARD GATEWAY BRIDGE] Opening {port} at {baud} baud -> {url}...")
    try:
        ser = serial.Serial(port, baud, timeout=1)
        print("[GATEWAY BRIDGE] Connected to ESP32 Gateway! Streaming packets...\n")
        
        while True:
            line = ser.readline().decode('utf-8', errors='ignore').strip()
            if not line:
                continue
            
            # Check if line is valid JSON
            if line.startswith("{") and line.endswith("}"):
                try:
                    payload = json.loads(line)
                    print(f"[SERIAL RX] Node: {payload.get('node_id')} | Seq: {payload.get('sequence')} | Tilt: ({payload.get('tilt_x_deg')}°, {payload.get('tilt_y_deg')}°)")
                    status, res = forward_payload(url, payload)
                    if status == 200:
                        print(f"  -> Forwarded to {url} (200 OK)")
                    else:
                        print(f"  -> Ingestion warning: {status} - {res}")
                except json.JSONDecodeError:
                    print(f"[RAW LOG] {line}")
            else:
                print(f"[DIAG] {line}")
                
    except Exception as e:
        print(f"Serial Error: {e}")

def main():
    parser = argparse.ArgumentParser(description="MineGuard ESP32 USB Serial Gateway Bridge")
    parser.add_argument("--port", default="COM3", help="Serial port name (e.g. COM3 or /dev/ttyUSB0)")
    parser.add_argument("--baud", type=int, default=115200, help="Baud rate (default: 115200)")
    parser.add_argument("--url", default="http://localhost:5000/api/readings", help="Backend ingest URL")
    parser.add_argument("--mock", action="store_true", help="Run simulated hardware stream")
    parser.add_argument("--interval", type=float, default=2.0, help="Interval between telemetry bursts in mock mode")

    args = parser.parse_args()

    if args.mock:
        run_mock_mode(args.url, args.interval)
    else:
        run_serial_mode(args.port, args.baud, args.url)

if __name__ == "__main__":
    main()
