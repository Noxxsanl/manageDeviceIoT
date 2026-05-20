#include "mqtt_client.h"
#include "config_gw.h"
#include <WiFi.h>
#include <PubSubClient.h>

static WiFiClient   espClient;
static PubSubClient mqttClient(espClient);
static MessageCallback _userCallback = nullptr;

// ─── Internal MQTT callback ────────────────────────────────────────────────────

static void onMqttMessage(char* topic, byte* payload, unsigned int length) {
    if (_userCallback) {
        // Null-terminate payload trước khi truyền vào callback
        char buf[MQTT_BUFFER_SIZE];
        unsigned int copyLen = (length < sizeof(buf) - 1) ? length : sizeof(buf) - 1;
        memcpy(buf, payload, copyLen);
        buf[copyLen] = '\0';

        Serial.printf("[MQTT] Received on '%s' (%u bytes)\n", topic, length);
        _userCallback(topic, buf, copyLen);
    }
}

// ─── Internal connect ─────────────────────────────────────────────────────────

static bool mqttConnect() {
    // Client ID duy nhất: "gw-ESP32-GW-XXXXXXXX"
    String clientId = "gw-" + String(GW_DEVICE_ID);
    Serial.printf("[MQTT] Connecting as '%s'...", clientId.c_str());

    if (!mqttClient.connect(clientId.c_str())) {
        Serial.printf(" FAILED (rc=%d)\n", mqttClient.state());
        return false;
    }

    Serial.println(" OK");

    // Subscribe wildcard: nhận dữ liệu từ tất cả sensor
    const char* topic = "local/sensors/+/data";
    if (mqttClient.subscribe(topic)) {
        Serial.printf("[MQTT] Subscribed to '%s'\n", topic);
    } else {
        Serial.printf("[MQTT] Subscribe FAILED for '%s'\n", topic);
    }

    return true;
}

// ─── Public API ───────────────────────────────────────────────────────────────

void mqttClientSetup(MessageCallback cb) {
    _userCallback = cb;
    mqttClient.setServer(MQTT_HOST, MQTT_PORT);
    mqttClient.setBufferSize(MQTT_BUFFER_SIZE);
    mqttClient.setCallback(onMqttMessage);
    Serial.printf("[MQTT] Broker: %s:%d\n", MQTT_HOST, MQTT_PORT);
}

void mqttClientMaintain() {
    if (mqttClient.connected()) {
        mqttClient.loop();
        return;
    }

    static unsigned long lastAttempt = 0;
    if (millis() - lastAttempt >= 5000) {
        lastAttempt = millis();
        mqttConnect();
    }
}

bool mqttClientIsConnected() {
    return mqttClient.connected();
}
