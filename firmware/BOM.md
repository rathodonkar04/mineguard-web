# MineGuard Hardware Bill of Materials (BOM)
### Smart India Hackathon 2026 (Problem Statement 26025)
**Autonomous Geotechnical Subsidence & Inclinometer Mesh Node**

---

## 1. Statutory Cost Constraint Compliance
- **Target Threshold**: Under **₹2,500 / $30** per node (as specified in SIH Problem Statement 26025).
- **MineGuard Actual Unit Cost**: **₹1,265 (~$15.24 USD)** per autonomous solar-harvested node.
- **Cost Margin**: **49.4% below statutory maximum**, enabling dense grid deployment (e.g. 10–20 nodes above extraction panels) without exceeding colliery safety budgets.

---

## 2. Component Itemization & Pricing Matrix

| Item # | Component Description | Primary Function | Model / Spec | Qty | Unit Cost (INR) | Unit Cost (USD) | Sourcing Links / Vendors |
|:---:|:---|:---|:---|:---:|:---:|:---:|:---|
| **1** | **ESP32-WROOM-32D Development Board** | 240MHz Dual-Core MCU, 2.4GHz ESP-NOW Mesh Transceiver, RTC Deep Sleep | 38-Pin ESP32-WROOM-32D | 1 | ₹310 | $3.73 | [Robu.in](https://robu.in), [ElectronicsComp](https://electronicscomp.com), [Mouser](https://mouser.com) |
| **2** | **MPU-6050 6-Axis IMU Module** | 3-Axis Inclinometer (16,384 LSB/g) + 3-Axis Gyro + Motion INT | GY-521 (InvenSense MPU-6050) | 1 | ₹135 | $1.63 | [Robu.in](https://robu.in), [Robocraze](https://robocraze.com), [LCSC](https://lcsc.com) |
| **3** | **DS18B20 Waterproof Probe** | Subsurface Rock Temperature for Thermal Expansion Correction (-55°C to +125°C) | 1-Meter Stainless Steel Tube, 1-Wire Digital | 1 | ₹125 | $1.51 | [Robu.in](https://robu.in), [ElectronicsComp](https://electronicscomp.com) |
| **4** | **18650 LiFePO4 / Li-ion Cell** | High-temperature resilient energy storage for mine benches (-10°C to +60°C) | 3.7V 2600mAh Grade-A Rechargeable Cell | 1 | ₹195 | $2.35 | [Robu.in](https://robu.in), [Evelta](https://evelta.com) |
| **5** | **Solar Energy Harvesting Panel** | Autonomous daytime battery charging | 5V 1.2W Monocrystalline Epoxy Solar Panel (110x60mm) | 1 | ₹165 | $1.99 | [Robu.in](https://robu.in), [ElectronicsComp](https://electronicscomp.com) |
| **6** | **TP4056 + DW01A Battery BMS** | Constant-current / constant-voltage charging with over-discharge protection | TP4056 1A Li-ion Charger with Type-C & Protection | 1 | ₹38 | $0.46 | [Robu.in](https://robu.in), [Robocraze](https://robocraze.com) |
| **7** | **IP67 Weatherproof Enclosure** | Coal dust sealing, water ingress protection, UV-stabilized ABS | 100 x 68 x 50 mm Transparent Lid ABS Box | 1 | ₹175 | $2.11 | [Robu.in](https://robu.in), [Indiamart](https://indiamart.com) |
| **8** | **Borehole Survey Monument Stake** | Mechanical coupling to bedrock / bench substrate | 12mm Galvanized Rebar Stake & Mounting Bracket (300mm) | 1 | ₹85 | $1.02 | Local Fabrication / Hardware Supplier |
| **9** | **Passive Electronics & Connectors** | Voltage divider (100kΩ 1%), pullups (4.7kΩ), 100nF decoupling capacitors, JST-PH plugs | 0.25W 1% Metal Film Resistors, X7R MLCC | 1 Set | ₹22 | $0.27 | [ElectronicsComp](https://electronicscomp.com), [LCSC](https://lcsc.com) |
| **10** | **Mechanical Crack Limit Switch** | Auxiliary physical fault wire tripwire | Sealed Roller Lever Microswitch (IP65) | 1 | ₹15 | $0.18 | [Robu.in](https://robu.in) |
| **TOTAL** | **Complete Autonomous MineGuard Node** | **All Inclinometer, Environmental, Mesh, Solar & Enclosure Hardware** | **Unit Assembly** | **1** | **₹1,265** | **$15.24** | **Statutory Limit: ₹2,500 ($30.00)** |

---

## 3. Power Budget & Battery Autonomy Calculation

### Current Consumption Profile (3.7V Nominal Rail)
- **Active Transmission Phase**:
  - Duration: $85 \text{ ms}$
  - Peak Current (ESP-NOW RF Tx @ +20 dBm): $140 \text{ mA}$
  - Energy per transmission: $140 \text{ mA} \times 0.085 \text{ s} = 11.9 \text{ mA}\cdot\text{s}$
- **Deep Sleep Phase** (Normal 30-Second Baseline):
  - Duration: $29.915 \text{ s}$
  - Deep Sleep Current (RTC timer + MPU-6050 INT enabled): $0.025 \text{ mA}$ ($25 \text{ \mu A}$)
  - Energy per sleep window: $0.025 \text{ mA} \times 29.915 \text{ s} = 0.748 \text{ mA}\cdot\text{s}$
- **Average Current Draw**:
  $$I_{\text{avg}} = \frac{11.9 \text{ mA}\cdot\text{s} + 0.748 \text{ mA}\cdot\text{s}}{30 \text{ s}} \approx 0.421 \text{ mA}$$

### Operating Autonomy Without Any Sunlight
- **Battery Usable Capacity**: $2600 \text{ mAh} \times 80\% \text{ DoD} = 2080 \text{ mAh}$
- **Continuous Runtime in Total Darkness / Monsoon Fog**:
  $$\text{Runtime} = \frac{2080 \text{ mAh}}{0.421 \text{ mA}} \approx 4,940 \text{ hours} \approx \mathbf{205.8 \text{ days}}$$
- **Solar Replenishment**:
  - The 5V 1.2W panel provides $\sim 240 \text{ mA}$ in standard daylight.
  - Less than **12 minutes of direct daylight per day** is required to keep the battery perpetually at 100% state of charge.

---

## 4. Colliery Deployment Cost Comparison

| Deployment Architecture | Equipment Cost / Node | Labor & Wiring Cost | Installation Time | Total 10-Node Grid Cost |
|:---|:---:|:---:|:---:|:---:|
| **Traditional Cabled Inclinometers** | ₹45,000 | ₹85,000 (Trenching & armored cabling) | 3 Weeks | ₹1,300,000 ($15,660) |
| **Commercial Satellite InSAR Only** | ₹120,000/pass | ₹0 (Remote) | 12–24 Days Latency | ₹240,000/month (Ongoing) |
| **MineGuard Autonomous Mesh (SIH 2026)** | **₹1,265** | **₹3,000 (Local borehole stake coupling)** | **2 Hours** | **₹42,650 ($513) Total** |

MineGuard reduces capital deployment costs by **96.7%** compared to traditional wired systems while delivering sub-second real-time early warning.
