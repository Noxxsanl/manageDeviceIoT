#include "mqtt_client.h"
#include "config_gw.h"
#include "wifi_manager.h"
#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>

static WiFiClient   espClient;
static PubSubClient mqttClient(espClient);
static MessageCallback _userCallback = nullptr;

static void onMqttMessage(char* topic, byte* payload, unsigned int length) {
    if (!_userCallback) return;

    char buf[MQTT_BUFFER_SIZE];
    unsigned int copyLen = (length < sizeof(buf) - 1) ? length : sizeof(buf) - 1;
    memcpy(buf, payload, copyLen);
    buf[copyLen] = '\0';

    Serial.printf("[MQTT] Received on '%s' (%u bytes)\n", topic, length);
    _userCallback(topic, buf, copyLen);
}

static bool mqttConnect() {
    char clientId[48];
    snprintf(clientId, sizeof(clientId), "gw-%s", GW_DEVICE_ID);
    Serial.printf("[MQTT] Connecting as '%s'...", clientId);

    if (!mqttClient.connect(clientId)) {
        Serial.printf(" FAILED (rc=%d)\n", mqttClient.state());
        return false;
    }
    Serial.println(" OK");

    const char* subTopic = "local/sensors/+/data";
    if (mqttClient.subscribe(subTopic)) {
        Serial.printf("[MQTT] Subscribed to '%s'\n", subTopic);
    } else {
        Serial.printf("[MQTT] Subscribe FAILED for '%s'\n", subTopic);
    }
    return true;
}

void mqttClientSetup(MessageCallback cb) {
    _userCallback = cb;
    mqttClient.setServer(MQTT_HOST, MQTT_PORT);
    mqttClient.setBufferSize(MQTT_BUFFER_SIZE);
    mqttClient.setCallback(onMqttMessage);
    Serial.printf("[MQTT] Broker: %s:%d\n", MQTT_HOST, MQTT_PORT);
}

void mqttClientMaintain() {
    if (!wifiIsConnected()) return;

    if (mqttClient.connected()) {
        mqttClient.loop();
        return;
    }

    static unsigned long lastAttempt = 0;
    if (millis() - lastAttempt >= MQTT_RECONNECT_INTERVAL_MS) {
        lastAttempt = millis();
        mqttConnect();
    }
}

bool mqttClientIsConnected() {
    return mqttClient.connected();
}
