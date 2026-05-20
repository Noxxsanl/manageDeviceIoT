#pragma once

// Xử lý message từ MQTT: xác thực Sensor HMAC, tính GW HMAC, POST lên Backend
void forwardSensorData(const char* topic, const char* payload, unsigned int length);
