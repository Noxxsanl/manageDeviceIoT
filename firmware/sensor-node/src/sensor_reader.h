#pragma once
#include <Arduino.h>

/** Kết quả đọc từ DHT22. */
struct SensorData {
    float temperature;  // °C
    float humidity;     // %
    bool  valid;        // false nếu đọc thất bại
};

/**
 * Khởi tạo DHT22 trên DHT_PIN (GPIO 4).
 * Gọi 1 lần trong setup().
 * Phần cứng: thêm điện trở pull-up 10kΩ từ DATA lên 3.3V.
 */
void sensorSetup();

/**
 * Đọc nhiệt độ và độ ẩm từ DHT22.
 * Nếu cảm biến trả NaN → valid = false.
 */
SensorData readSensor();
