#!/usr/bin/env python3
"""
MineGuard AI Subsystem - Telemetry Visualization Script
Smart India Hackathon 2026 (Problem Statement 26025)

Generates publication-quality time-series visualization plots for:
1. Tilt Components & Resultant Angle (tilt_x, tilt_y, tilt_angle)
2. Surface Displacement (mm)
3. Strata Dynamic Vibration Index (g)
4. Enclosure / Ambient Temperature (°C)
5. Overlay of synthetic anomaly periods for ML baseline evaluation
"""

import os
import sys
import csv
import json
import math
from datetime import datetime

# Ensure UTF-8 output encoding on Windows consoles
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

def load_data(csv_path="ai/data/telemetry.csv", metadata_path="ai/data/anomaly_metadata.json", downsample_factor=60):
    """
    Loads telemetry CSV and downsamples for smooth plotting.
    """
    if not os.path.exists(csv_path):
        print(f"[ERROR] {csv_path} not found.")
        sys.exit(1)

    timestamps = []
    time_secs = []
    tilt_x = []
    tilt_y = []
    tilt_angle = []
    temperature = []
    displacement = []
    vibration = []

    with open(csv_path, mode="r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for idx, row in enumerate(reader):
            if idx % downsample_factor == 0:
                time_secs.append(idx)
                timestamps.append(row["timestamp"])
                tilt_x.append(float(row["tilt_x"]))
                tilt_y.append(float(row["tilt_y"]))
                tilt_angle.append(float(row["tilt_angle"]))
                temperature.append(float(row["temperature"]))
                displacement.append(float(row["displacement"]))
                vibration.append(float(row["vibration"]))

    anomaly_events = []
    if os.path.exists(metadata_path):
        try:
            with open(metadata_path, mode="r", encoding="utf-8") as f:
                meta = json.load(f)
                anomaly_events = meta.get("anomaly_events", [])
        except Exception:
            pass

    return {
        "time_secs": time_secs,
        "timestamps": timestamps,
        "tilt_x": tilt_x,
        "tilt_y": tilt_y,
        "tilt_angle": tilt_angle,
        "temperature": temperature,
        "displacement": displacement,
        "vibration": vibration,
        "anomaly_events": anomaly_events,
        "total_samples": idx + 1 if 'idx' in locals() else 0
    }

def generate_svg_plot(data, output_svg_path="ai/plots/telemetry_overview.svg"):
    """
    Generates a 4-panel SVG time-series overview plot.
    """
    os.makedirs(os.path.dirname(output_svg_path), exist_ok=True)
    
    width = 1200
    height = 950
    margin_left = 90
    margin_right = 50
    margin_top = 70
    plot_width = width - margin_left - margin_right

    panel_height = 160
    panel_gap = 40
    panels = [
        {"key": "tilt", "title": "Surface Tilt Angle & Axis Components (deg)", "unit": "deg"},
        {"key": "displacement", "title": "Surface Displacement (mm)", "unit": "mm"},
        {"key": "vibration", "title": "Strata Dynamic Vibration Index (g)", "unit": "g"},
        {"key": "temperature", "title": "Ambient / Enclosure Temperature (C)", "unit": "C"}
    ]

    max_t = max(data["time_secs"]) if data["time_secs"] else 86400
    hours_total = max_t / 3600.0

    svg = []
    svg.append(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" width="{width}" height="{height}" style="background:#090d16; font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, monospace;">')
    
    # Title & Subtitle
    svg.append(f'<text x="{margin_left}" y="32" fill="#f8fafc" font-size="18" font-weight="bold">MineGuard AI Subsystem — Synthetic Telemetry Multi-Track Overview</text>')
    svg.append(f'<text x="{margin_left}" y="52" fill="#94a3b8" font-size="12">Sampling: 1 Hz (1 reading/s) | Duration: {hours_total:.1f} Hours ({data["total_samples"]:,} samples) | Prototype MPU6050 IMU Geotechnical Model</text>')

    # Defs / Gradients
    svg.append('<defs>')
    svg.append('  <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1e293b" stroke-width="0.5" stroke-opacity="0.5"/></pattern>')
    svg.append('</defs>')

    for p_idx, p in enumerate(panels):
        top_y = margin_top + p_idx * (panel_height + panel_gap)
        bottom_y = top_y + panel_height

        # Panel Background
        svg.append(f'<rect x="{margin_left}" y="{top_y}" width="{plot_width}" height="{panel_height}" fill="#0f172a" stroke="#1e293b" stroke-width="1" rx="4"/>')
        svg.append(f'<rect x="{margin_left}" y="{top_y}" width="{plot_width}" height="{panel_height}" fill="url(#grid)" rx="4"/>')

        # Shaded Anomaly Event Windows
        for ev in data.get("anomaly_events", []):
            x1 = margin_left + (ev["start_time_sec"] / max_t) * plot_width
            x2 = margin_left + (ev["end_time_sec"] / max_t) * plot_width
            w = max(2, x2 - x1)
            fill_color = "#ef4444" if "SUBSIDENCE" in ev["event_id"] else ("#f59e0b" if "INFLEXION" in ev["event_id"] else "#3b82f6")
            svg.append(f'<rect x="{x1:.1f}" y="{top_y}" width="{w:.1f}" height="{panel_height}" fill="{fill_color}" fill-opacity="0.12" stroke="{fill_color}" stroke-opacity="0.3" stroke-dasharray="2,2"/>')
            if p_idx == 0:
                svg.append(f'<text x="{x1 + 4:.1f}" y="{top_y + 14}" fill="{fill_color}" font-size="9" font-weight="bold">{ev["type"]}</text>')

        # Determine scale for this panel
        if p["key"] == "tilt":
            val_min = 0.0
            val_max = max(max(data["tilt_angle"]), 3.2)
        elif p["key"] == "displacement":
            val_min = 0.0
            val_max = max(max(data["displacement"]), 3.0)
        elif p["key"] == "vibration":
            val_min = 0.0
            val_max = max(max(data["vibration"]), 0.25)
        elif p["key"] == "temperature":
            val_min = 20.0
            val_max = 38.0

        val_range = max_val_diff = val_max - val_min if val_max != val_min else 1.0

        def y_coord(val):
            norm = (val - val_min) / val_range
            return bottom_y - norm * (panel_height - 20) - 10

        # Draw Grid lines and Y-Ticks
        num_ticks = 4
        for t_idx in range(num_ticks + 1):
            tick_val = val_min + t_idx * (val_range / num_ticks)
            y_pos = y_coord(tick_val)
            svg.append(f'<line x1="{margin_left}" y1="{y_pos:.1f}" x2="{margin_left + plot_width}" y2="{y_pos:.1f}" stroke="#334155" stroke-width="0.5" stroke-dasharray="3,3"/>')
            svg.append(f'<text x="{margin_left - 8}" y="{y_pos + 4:.1f}" fill="#94a3b8" font-size="10" text-anchor="end" font-family="monospace">{tick_val:.2f} {p["unit"]}</text>')

        # Draw Title
        svg.append(f'<text x="{margin_left + 10}" y="{top_y + 20}" fill="#38bdf8" font-size="12" font-weight="bold">{p["title"]}</text>')

        # Draw Time-Series Polylines
        def build_polyline_pts(series):
            pts = []
            for t_sec, v in zip(data["time_secs"], series):
                x = margin_left + (t_sec / max_t) * plot_width
                y = y_coord(v)
                pts.append(f"{x:.1f},{y:.1f}")
            return " ".join(pts)

        if p["key"] == "tilt":
            pts_x = build_polyline_pts(data["tilt_x"])
            pts_y = build_polyline_pts(data["tilt_y"])
            pts_ang = build_polyline_pts(data["tilt_angle"])

            svg.append(f'<polyline points="{pts_x}" fill="none" stroke="#06b6d4" stroke-width="1.2" stroke-dasharray="3,2" opacity="0.8"/>')
            svg.append(f'<polyline points="{pts_y}" fill="none" stroke="#f59e0b" stroke-width="1.2" stroke-dasharray="3,2" opacity="0.8"/>')
            svg.append(f'<polyline points="{pts_ang}" fill="none" stroke="#f43f5e" stroke-width="2.2"/>')

            # Legend
            svg.append(f'<text x="{margin_left + plot_width - 250}" y="{top_y + 20}" fill="#f43f5e" font-size="11" font-weight="bold">- tilt_angle</text>')
            svg.append(f'<text x="{margin_left + plot_width - 160}" y="{top_y + 20}" fill="#06b6d4" font-size="11">-- tilt_x</text>')
            svg.append(f'<text x="{margin_left + plot_width - 90}" y="{top_y + 20}" fill="#f59e0b" font-size="11">-- tilt_y</text>')

        elif p["key"] == "displacement":
            pts = build_polyline_pts(data["displacement"])
            svg.append(f'<polyline points="{pts}" fill="none" stroke="#38bdf8" stroke-width="2.0"/>')

        elif p["key"] == "vibration":
            pts = build_polyline_pts(data["vibration"])
            svg.append(f'<polyline points="{pts}" fill="none" stroke="#a855f7" stroke-width="1.6"/>')

        elif p["key"] == "temperature":
            pts = build_polyline_pts(data["temperature"])
            svg.append(f'<polyline points="{pts}" fill="none" stroke="#eab308" stroke-width="1.8"/>')

    # Bottom X-Axis Time Ticks (Hours)
    axis_y = margin_top + 4 * panel_height + 3 * panel_gap + 15
    svg.append(f'<line x1="{margin_left}" y1="{axis_y}" x2="{margin_left + plot_width}" y2="{axis_y}" stroke="#64748b" stroke-width="1.5"/>')

    num_h_ticks = 12
    for h in range(num_h_ticks + 1):
        frac = h / num_h_ticks
        x_pos = margin_left + frac * plot_width
        hour_val = frac * hours_total
        time_str = f"T+{hour_val:.0f}h"
        svg.append(f'<line x1="{x_pos:.1f}" y1="{axis_y}" x2="{x_pos:.1f}" y2="{axis_y + 5}" stroke="#94a3b8" stroke-width="1"/>')
        svg.append(f'<text x="{x_pos:.1f}" y="{axis_y + 18}" fill="#cbd5e1" font-size="10" text-anchor="middle" font-family="monospace">{time_str}</text>')

    svg.append(f'<text x="{width/2}" y="{height - 15}" fill="#64748b" font-size="10" text-anchor="middle">Time Elapsed (Hours) | Sampling Rate: 1 Hz (Every 1 second) | MineGuard AI Subsystem (SIH 2026)</text>')
    svg.append('</svg>')

    with open(output_svg_path, mode="w", encoding="utf-8") as f:
        f.write("\n".join(svg))

    print(f" [OK] Multi-track SVG Plot generated: {output_svg_path}")

def generate_tilt_phase_plot(data, output_svg_path="ai/plots/tilt_analysis.svg"):
    """
    Generates a polar / 2D trajectory plot showing tilt_x vs tilt_y deformation path.
    """
    os.makedirs(os.path.dirname(output_svg_path), exist_ok=True)
    width = 800
    height = 800
    cx = 400
    cy = 420
    r_max = 300
    scale_deg = 3.0

    svg = []
    svg.append(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" width="{width}" height="{height}" style="background:#090d16; font-family: monospace;">')
    svg.append(f'<text x="40" y="40" fill="#f8fafc" font-size="16" font-weight="bold">MineGuard AI - 2D Surface Tilt Vector Trajectory (tilt_x vs tilt_y)</text>')
    svg.append(f'<text x="40" y="60" fill="#94a3b8" font-size="11">MPU6050 Accelerometer/Gyroscope Plane | Radial Circles at 0.5, 1.0, 1.5, 2.0, 2.5, 3.0 deg</text>')

    # Concentric circles
    for deg in [0.5, 1.0, 1.5, 2.0, 2.5, 3.0]:
        r = (deg / scale_deg) * r_max
        stroke_color = "#ef4444" if deg >= 2.0 else ("#f59e0b" if deg >= 1.0 else "#334155")
        dash = "none" if deg in [1.0, 2.0] else "3,3"
        svg.append(f'<circle cx="{cx}" cy="{cy}" r="{r:.1f}" fill="none" stroke="{stroke_color}" stroke-width="1" stroke-dasharray="{dash}" stroke-opacity="0.6"/>')
        svg.append(f'<text x="{cx + r + 3:.1f}" y="{cy - 3}" fill="{stroke_color}" font-size="9">{deg:.1f} deg</text>')

    # Axes
    svg.append(f'<line x1="{cx - r_max}" y1="{cy}" x2="{cx + r_max}" y2="{cy}" stroke="#475569" stroke-width="1"/>')
    svg.append(f'<line x1="{cx}" y1="{cy - r_max}" x2="{cx}" y2="{cy + r_max}" stroke="#475569" stroke-width="1"/>')
    svg.append(f'<text x="{cx + r_max + 10}" y="{cy + 4}" fill="#38bdf8" font-size="11" font-weight="bold">+tilt_x</text>')
    svg.append(f'<text x="{cx - r_max - 50}" y="{cy + 4}" fill="#38bdf8" font-size="11">-tilt_x</text>')
    svg.append(f'<text x="{cx - 20}" y="{cy - r_max - 10}" fill="#38bdf8" font-size="11" font-weight="bold">+tilt_y</text>')
    svg.append(f'<text x="{cx - 20}" y="{cy + r_max + 20}" fill="#38bdf8" font-size="11">-tilt_y</text>')

    # Trajectory points
    pts = []
    for tx, ty in zip(data["tilt_x"], data["tilt_y"]):
        px = cx + (tx / scale_deg) * r_max
        py = cy - (ty / scale_deg) * r_max
        pts.append(f"{px:.1f},{py:.1f}")

    svg.append(f'<polyline points="{" ".join(pts)}" fill="none" stroke="#f43f5e" stroke-width="1.8" stroke-opacity="0.85"/>')

    # Start point & End point
    if pts:
        start_p = pts[0].split(",")
        end_p = pts[-1].split(",")
        svg.append(f'<circle cx="{start_p[0]}" cy="{start_p[1]}" r="5" fill="#10b981" stroke="#ffffff" stroke-width="1.5"/>')
        svg.append(f'<text x="{float(start_p[0]) + 8}" y="{float(start_p[1]) + 4}" fill="#34d399" font-size="10" font-weight="bold">Start (t=0h)</text>')

        svg.append(f'<circle cx="{end_p[0]}" cy="{end_p[1]}" r="6" fill="#ef4444" stroke="#ffffff" stroke-width="1.5"/>')
        svg.append(f'<text x="{float(end_p[0]) + 8}" y="{float(end_p[1]) + 4}" fill="#f87171" font-size="10" font-weight="bold">Final Equilibrium</text>')

    svg.append('</svg>')

    with open(output_svg_path, mode="w", encoding="utf-8") as f:
        f.write("\n".join(svg))

    print(f" [OK] 2D Tilt Trajectory SVG Plot generated: {output_svg_path}")

def main():
    print("=================================================================")
    print(" MineGuard AI Subsystem - Generating Telemetry Visualizations")
    print("=================================================================\n")
    data = load_data()
    generate_svg_plot(data, "ai/plots/telemetry_overview.svg")
    generate_tilt_phase_plot(data, "ai/plots/tilt_analysis.svg")
    print("\n [OK] All visualization plots successfully generated in ai/plots/\n")

if __name__ == "__main__":
    main()
