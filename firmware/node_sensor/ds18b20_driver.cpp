#include "ds18b20_driver.h"

Ds18b20Driver::Ds18b20Driver() : _pin(4) {}

bool Ds18b20Driver::begin(uint8_t pin) {
    _pin = pin;
    pinMode(_pin, INPUT_PULLUP);
    return oneWireReset();
}

bool Ds18b20Driver::oneWireReset() {
    pinMode(_pin, OUTPUT);
    digitalWrite(_pin, LOW);
    delayMicroseconds(480); // Master Tx Reset pulse: min 480us

    pinMode(_pin, INPUT_PULLUP);
    delayMicroseconds(70);  // Master Rx wait: 15-60us

    uint8_t presence = digitalRead(_pin);
    delayMicroseconds(410); // Complete 480us time slot

    return (presence == 0); // Presence pulse is active LOW
}

void Ds18b20Driver::oneWireWriteBit(uint8_t bit) {
    if (bit) {
        // Write '1' bit
        pinMode(_pin, OUTPUT);
        digitalWrite(_pin, LOW);
        delayMicroseconds(6);
        pinMode(_pin, INPUT_PULLUP);
        delayMicroseconds(64);
    } else {
        // Write '0' bit
        pinMode(_pin, OUTPUT);
        digitalWrite(_pin, LOW);
        delayMicroseconds(60);
        pinMode(_pin, INPUT_PULLUP);
        delayMicroseconds(10);
    }
}

uint8_t Ds18b20Driver::oneWireReadBit() {
    pinMode(_pin, OUTPUT);
    digitalWrite(_pin, LOW);
    delayMicroseconds(3);

    pinMode(_pin, INPUT_PULLUP);
    delayMicroseconds(10);

    uint8_t bit = digitalRead(_pin);
    delayMicroseconds(53);
    return bit;
}

void Ds18b20Driver::oneWireWriteByte(uint8_t byte) {
    for (uint8_t i = 0; i < 8; i++) {
        oneWireWriteBit(byte & 0x01);
        byte >>= 1;
    }
}

uint8_t Ds18b20Driver::oneWireReadByte() {
    uint8_t byte = 0;
    for (uint8_t i = 0; i < 8; i++) {
        if (oneWireReadBit()) {
            byte |= (1 << i);
        }
    }
    return byte;
}

uint8_t Ds18b20Driver::calculateCrc8(const uint8_t *data, size_t length) {
    uint8_t crc = 0;
    for (size_t i = 0; i < length; i++) {
        uint8_t inbyte = data[i];
        for (uint8_t j = 0; j < 8; j++) {
            uint8_t mix = (crc ^ inbyte) & 0x01;
            crc >>= 1;
            if (mix) crc ^= 0x8C; // Dallas polynomial X^8 + X^5 + X^4 + 1
            inbyte >>= 1;
        }
    }
    return crc;
}

bool Ds18b20Driver::requestConversion() {
    if (!oneWireReset()) {
        return false;
    }
    oneWireWriteByte(DS18B20_CMD_SKIP_ROM);
    oneWireWriteByte(DS18B20_CMD_CONVERT);
    return true;
}

bool Ds18b20Driver::getTemperature(float &temperature_c) {
    if (!oneWireReset()) {
        return false;
    }

    oneWireWriteByte(DS18B20_CMD_SKIP_ROM);
    oneWireWriteByte(DS18B20_CMD_READ_SCRATCH);

    uint8_t scratchpad[9];
    for (uint8_t i = 0; i < 9; i++) {
        scratchpad[i] = oneWireReadByte();
    }

    // Verify 8-bit Dallas CRC
    if (calculateCrc8(scratchpad, 8) != scratchpad[8]) {
        Serial.println("[DS18B20] Scratchpad CRC mismatch!");
        return false;
    }

    // Combine Byte 0 (LSB) and Byte 1 (MSB)
    int16_t raw = (scratchpad[1] << 8) | scratchpad[0];

    // Convert raw 12-bit counts (0.0625°C per LSB)
    temperature_c = (float)raw * 0.0625f;

    // Reject uninitialized power-on reset value (85.0°C)
    if (fabsf(temperature_c - 85.0f) < 0.01f) {
        return false;
    }

    return true;
}

bool Ds18b20Driver::readTemperature(float &temperature_c) {
    if (!requestConversion()) {
        return false;
    }
    // 12-bit resolution requires max 750ms conversion time
    delay(750);
    return getTemperature(temperature_c);
}
