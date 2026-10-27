#ifndef DS18B20_DRIVER_H
#define DS18B20_DRIVER_H

#include <Arduino.h>

/**
 * MineGuard Lightweight DS18B20 1-Wire Digital Temperature Driver
 * 
 * Provides:
 * - Direct GPIO 1-Wire bitbang protocol (independent of external library dependencies)
 * - 12-bit conversion resolution (0.0625 °C precision, -55°C to +125°C)
 * - Dallas 8-bit CRC polynomial validation of the 9-byte scratchpad
 * - In-situ rock temperature acquisition for thermal expansion compensation
 * - Fault detection if sensor is detached or cable is severed
 */

#define DS18B20_CMD_CONVERT        0x44
#define DS18B20_CMD_WRITE_SCRATCH  0x4E
#define DS18B20_CMD_READ_SCRATCH   0xBE
#define DS18B20_CMD_SKIP_ROM       0xCC

class Ds18b20Driver {
public:
    Ds18b20Driver();
    
    // Initialize 1-Wire pin (e.g. GPIO 4)
    bool begin(uint8_t pin = 4);
    
    // Triggers conversion and reads temperature in °C
    bool readTemperature(float &temperature_c);
    
    // Asynchronous non-blocking start conversion (takes 750ms for 12-bit)
    bool requestConversion();
    
    // Fetches result after conversion delay
    bool getTemperature(float &temperature_c);

private:
    uint8_t _pin;
    
    bool oneWireReset();
    void oneWireWriteByte(uint8_t byte);
    uint8_t oneWireReadByte();
    void oneWireWriteBit(uint8_t bit);
    uint8_t oneWireReadBit();
    uint8_t calculateCrc8(const uint8_t *data, size_t length);
};

#endif // DS18B20_DRIVER_H
