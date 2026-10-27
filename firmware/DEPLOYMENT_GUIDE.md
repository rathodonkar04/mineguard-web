# MineGuard Field Deployment & Mechanical Anchoring Guide
### Smart India Hackathon 2026 (Problem Statement 26025)
**Statutory Geotechnical Monitoring Protocol for Coal Mine Benches & Overburden**

---

## 1. Statutory Compliance Framework
In accordance with:
- **DGMS Circular No. 3 of 1998**: *Standard procedures for monitoring subsidence and strata movement in underground coal mines.*
- **Coal Mines Regulations (CMR) 2017 (Regulation 112 & 113)**: *Precautions against ground movement, slope stability, and protection of surface structures.*
- **ISO 19749**: *Underground mining geotechnical instrumentation standards.*

MineGuard sensor nodes are designed to serve as **autonomous continuous recording survey monuments**, replacing error-prone manual leveling surveys with sub-millimeter continuous tilt and displacement data.

---

## 2. Mine Site Layout & Transect Planning (Moonidih Colliery Benchmark)

Deploy nodes along a perpendicular transect across the underground extraction panel (Panel P-4):

```
Surface Topography:
========================================================================================
[Node 1: N1]             [Node 2: N2]             [Node 3: N3 Gateway]      [Node 4: N4]
Stable Reference        Transition / Flank        Extraction Active Center   Outer Perimeter
Zone A (X=0m)           Zone B (X=80m)            Zone C (X=160m)            Zone D (X=240m)
========================================================================================
  |                       |                         |                          |
  |                       |                         |                          |
  v                       v                         v                          v
Consolidated Strata     Inflexion Point Zone      Maximum Subsidence Trough  Limit of Draw (γ)
----------------------------------------------------------------------------------------
Underground Coal Seam (Depth H = 280m, Seam Thickness m = 2.4m, Longwall Face Advance ->)
```

---

## 3. Step-by-Step Monument Anchoring Procedure

### Step 1: Subsurface Borehole Drilling
1. Drill a vertical borehole of **38 mm to 50 mm diameter** to a depth of **1.2 to 1.5 meters** into the bench surface.
2. *Statutory Rationale*: Anchoring below the topsoil (0.5m) is mandatory to eliminate spurious readings caused by soil shrinkage, rainfall saturation, and agricultural root heave.

### Step 2: Grouting and Mechanical Stake Installation
1. Prepare a non-shrink, high-early-strength cementitious grout (Water/Cement ratio = 0.45).
2. Insert a **12 mm galvanized deformed rebar stake (length 1.5 m)** into the center of the borehole.
3. Pour grout to within 100 mm of the surface, vibrating gently to eliminate air voids.
4. Allow 24 hours for cure (compressive strength > 25 MPa).

### Step 3: Leveling Plate Attachment
1. Bolt a **150 x 150 mm stainless steel (Grade 304) mounting plate** to the top of the protruding rebar monument.
2. Adjust the three stainless leveling screws until the integrated bubble level indicates horizontal orientation within **±0.2°**.

### Step 4: Enclosure Weatherproofing & Desiccant Pack
1. Mount the IP67 ABS junction box to the leveling plate using stainless hardware.
2. Route the DS18B20 temperature probe down into the borehole through an IP68 nylon cable gland.
3. Insert a **10-gram sealed silica gel desiccant pack** inside the enclosure to absorb ambient humidity and prevent condensation during monsoon seasons.
4. Fasten the transparent enclosure lid with four stainless machine screws, ensuring uniform gasket compression.

### Step 5: Solar Panel Alignment
1. In the Northern Hemisphere (India), angle the monocrystalline solar panel facing **True South** at an inclination angle equal to the colliery latitude (**23.7° for Dhanbad / Moonidih**).
2. Ensure no tall vegetation, spoil piles, or overhead dragline cables cast shadows over the active panel surface.

---

## 4. Software Zero-Tare Datum Calibration

Before mining extraction begins beneath the sensor monument, lock the initial reference datum:

1. Connect the technician's rugged field laptop or tablet to the node's USB serial port (or via Bluetooth/Wi-Fi).
2. Issue the serial command:
   ```bash
   TARE_ZERO
   ```
3. The node will average 100 high-frequency accelerometer samples and store the zero-datum offsets in persistent non-volatile memory (NVS).
4. Verify on the MineGuard SCADA dashboard that the node's current tilt is displayed as **0.00° (Safe Baseline)**.

---

## 5. RF Mesh Line-of-Sight & Fresnel Zone Optimization

ESP-NOW uses the **2.437 GHz (Wi-Fi Channel 6)** frequency band:
- **Free Space Transmission Range**: Up to **450 meters** line-of-sight with +20 dBm output.
- **Fresnel Zone Radius**: Over a 200m hop distance, the 1st Fresnel zone clearance radius is:
  $$r = 8.65 \times \sqrt{\frac{D_{\text{km}}}{4 \times f_{\text{GHz}}}} = 8.65 \times \sqrt{\frac{0.2}{4 \times 2.437}} \approx \mathbf{1.24 \text{ meters}}$$
- **Rule of Thumb**: Elevate node antennas at least **1.5 meters above ground level** to clear spoil dump berms, grass, and ground clutter.
- **Multi-Hop Relay**: If an overburden spoil heap obstructs direct line-of-sight between Node 1 (Zone A) and Node 3 (Gateway), Node 2 (Zone B) automatically serves as a store-and-forward relay node (`hop_count = 1`).
