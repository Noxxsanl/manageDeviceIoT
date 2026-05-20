#pragma once
#include <Arduino.h>
#include "sensor_reader.h"

/**
 * Khởi tạo MQTT client – đặt server và buffer size.
 * Gọi 1 lần trong setup().
 */
void mqttSetup();

/**
 * Duy trì kết nối MQTT – gọi mỗi vòng loop().
 * Tự động reconnect nếu mất kết nối.
 */
void mqttMaintain();

/** Trả true nếu MQTT đang kết nối tới broker. */
bool mqttIsConnected();

/**
 * Build JSON payload, tính HMAC-SHA256 rồi publish lên topic:
 *   local/sensors/<DEVICE_ID>/data
 *
 * Payload format:
 * {
 *   "sensor_id":    "ESP32-SN-XXXXXXXX",
 *   "sn_timestamp": 1700000000,
 *   "sn_hmac":      "64-char-hex",
 *   "data": {
 *     "temperature": 28.5,
 *     "humidity":    65.2
 *   }
 * }
 *
 * @return true nếu publish thành công
 */
bool mqttPublishSensorData(const SensorData& data);
