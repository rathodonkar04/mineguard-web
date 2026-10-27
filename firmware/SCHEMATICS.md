# MineGuard Hardware Schematics & Wiring Guide
### Smart India Hackathon 2026 (Problem Statement 26025)
**ESP32 Geotechnical Inclinometer & Multi-Channel Telemetry Node**

---

## 1. ESP32 Pin Assignment Matrix

| ESP32 Pin | Function | Peripheral / Module | External Circuitry | Description |
|:---:|:---:|:---:|:---:|:---|
| **GPIO 21** | I2C SDA | MPU-6050 (Pin SDA) | On-module 4.7kΩ pull-up to 3.3V | I2C Data bus (400 kHz Fast-Mode) |
| **GPIO 22** | I2C SCL | MPU-6050 (Pin SCL) | On-module 4.7kΩ pull-up to 3.3V | I2C Clock bus |
| **GPIO 19** | EXT0 Interrupt | MPU-6050 (Pin INT) | Internal pull-up | Hardware motion/shock interrupt for instant deep sleep wake |
| **GPIO 4** | 1-Wire Bus | DS18B20 (Pin DATA) | 4.7kΩ pull-up resistor to 3.3V | Subsurface rock temperature digital bus |
| **GPIO 35** | Analog Input (ADC1) | Battery Fuel Gauge | 100kΩ / 100kΩ 1% Voltage Divider | Battery potential sensing (0–4.2V mapped to 0–2.1V on ADC) |
| **GPIO 18** | Digital Input | Mechanical Crack Switch | Internal pull-up (active LOW) | Physical tripwire switch detecting surface fissures |
| **GPIO 2** | Digital Output | Built-in Blue LED | Direct | System active / transmission strobe indicator |
| **GPIO 13** | Digital Output | High-Intensity Red LED | 220Ω current limiting resistor | Visual warning strobe during warning/critical displacement |
| **3V3** | Power Output | MPU-6050, DS18B20 | 100nF MLCC + 10µF Tantalum filter | Regulated 3.3V logic rail from ESP32 on-board LDO |
| **GND** | Common Ground | All modules & battery | Common ground plane | Star grounding to reduce ADC analog noise |
| **VIN / 5V** | Power Input | TP4056 OUT+ | Direct from BMS | Regulated battery supply into ESP32 LDO |

---

## 2. Complete System Circuit Schematic

```
                                +---------------------------+
                                |  5V 1.2W Solar Panel      |
                                |  (Bench Direct Radiation) |
                                +-------------+-------------+
                                              |
                                              v (5V - 6V DC)
                                +-------------+-------------+
                                |  TP4056 + DW01A BMS       |
                                |  IN+                   IN-|
                                |  BAT+                 BAT-| <---> [18650 3.7V 2600mAh Cell]
                                |  OUT+                 OUT-|
                                +------+--------------+-----+
                                       |              |
                                  +----+              +----+
                                  |                        |
                           V_BATT (3.0V - 4.2V)           GND (Common Ground)
                                  |                        |
         +------------------------+                        |
         |                        |                        |
         | (To ESP32 5V/VIN pin)  |                        |
         v                        |                        |
    +---------+                   |                        |
    | ESP32   |                   |                        |
    | 3.3V LDO|                   |                        |
    +----+----+                   |                        |
         |                        |                        |
     3.3V Rail                    |                        |
         |                        |                        |
         +--------+               |                        |
         |        |               |                        |
         |   [100k Resistor] <----+                        |
         |        |                                        |
         |        +------> GPIO 35 (ADC Battery Sense)     |
         |        |                                        |
         |   [100k Resistor]                               |
         |        |                                        |
         |        +----------------------------------------+
         |        |
         |   [100nF Cap] (Noise Filter)
         |        |
         |        +----------------------------------------+
         |                                                 |
         |                                                 |
         +-----------------------+                         |
         |                       |                         |
         | MPU-6050 (GY-521)     |                         |
         | - VCC  <--- 3.3V      |                         |
         | - GND  -----------------------------------------+
         | - SDA  <-------------> GPIO 21 (I2C SDA)        |
         | - SCL  <-------------> GPIO 22 (I2C SCL)        |
         | - INT  --------------> GPIO 19 (Ext0 Wakeup)    |
         |                       |                         |
         +-----------------------+                         |
         |                                                 |
         +-----------------------+                         |
         | DS18B20 Temp Probe    |                         |
         | - VCC (Red)   < 3.3V  |                         |
         | - GND (Black) ----------------------------------+
         | - DATA (Yellow)       |                         |
         |     |                 |                         |
         |   [4.7k Pullup]       |                         |
         |     |                 |                         |
         |     +-----------------> GPIO 4 (1-Wire Data)    |
         |                       |                         |
         +-----------------------+                         |
         |                                                 |
         | Crack Tripwire Switch |                         |
         | - Terminal 1 ---------> GPIO 18 (Input Pullup)  |
         | - Terminal 2 -----------------------------------+
         |                                                 |
         +-------------------------------------------------+
```

---

## 3. Battery Voltage Divider Calculations

The ESP32 ADC has an input voltage range of 0V to 3.3V (with 11dB attenuation). Because an 18650 Li-ion battery charges up to 4.20V, a precision voltage divider with 1% metal film resistors is employed:

$$V_{\text{pin}} = V_{\text{battery}} \times \frac{R_2}{R_1 + R_2}$$

Using $R_1 = 100\text{ k}\Omega$ and $R_2 = 100\text{ k}\Omega$:
$$\text{Divider Ratio} = \frac{100\text{ k}\Omega}{100\text{ k}\Omega + 100\text{ k}\Omega} = 0.500$$

- When $V_{\text{battery}} = 4.20\text{ V}$ (Full Charge): $V_{\text{pin}} = 2.10\text{ V}$ (Safe for ESP32 ADC)
- When $V_{\text{battery}} = 3.00\text{ V}$ (Depleted): $V_{\text{pin}} = 1.50\text{ V}$
- A **100nF ceramic capacitor** in parallel with $R_2$ shunts high-frequency ADC switching noise, preventing erratic battery percentage jumps during Wi-Fi transmission bursts.

---

## 4. RF Transmission Decoupling Best Practices

ESP-NOW transmits at up to **+20 dBm (100 mW RF output)**, causing brief current spikes of up to **240 mA** lasting $20\text{ \mu s}$. 
To prevent MCU brownout resets on remote mine benches:
1. Place a **10 µF tantalum or electrolytic capacitor** across `3V3` and `GND` adjacent to the ESP32 module.
2. Place a **100 nF X7R ceramic capacitor** directly across `VCC` and `GND` on the MPU-6050 breakout board.
3. Keep I2C trace lengths under **15 cm** between ESP32 and MPU-6050.
