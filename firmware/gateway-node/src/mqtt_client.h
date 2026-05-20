#pragma once

// Callback được gọi khi có message từ sensor
// topic: "local/sensors/ESP32-SN-XXXXXXXX/data"
// payload: JSON string từ sensor
typedef void (*MessageCallback)(const char* topic, const char* payload, unsigned int length);

void mqttClientSetup(MessageCallback cb);
void mqttClientMaintain();
bool mqttClientIsConnected();
