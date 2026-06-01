#include <Arduino.h>
#include "config_gw.h"
#include "wifi_manager.h"
#include "ntp_sync.h"
#include "mqtt_client.h"
#include "forwarder.h"

static unsigned long _fwdLedOffAt = 0;

static void onSensorMessage(const char* topic, const char* payload, unsigned int length) {
    if (!ntpIsSynced()) {
        Serial.println("[MAIN] Drop – NTP not synced, cannot validate timestamp");
        return;
    }

    if (forwardSensorData(topic, payload, length)) {
        digitalWrite(LED_FWD_PIN, HIGH);
        _fwdLedOffAt = millis() + 100;
    }
}

void setup() {
    Serial.begin(115200);
    delay(1000);

    Serial.println("\n╔══════════════════════════════════╗");
    Serial.println("║   IoT Gateway Node – Starting    ║");
    Serial.println("╚══════════════════════════════════╝");
    Serial.printf("  Gateway ID : %s\n", GW_DEVICE_ID);
    Serial.printf("  Backend URL: %s\n\n", BACKEND_URL);

    pinMode(LED_FWD_PIN, OUTPUT);
    digitalWrite(LED_FWD_PIN, LOW);

    wifiSetup();
    ntpSetup();
    mqttClientSetup(onSensorMessage);

    Serial.println("\n[MAIN] Ready – listening for sensor data...\n");
}

void loop() {
    if (_fwdLedOffAt && millis() >= _fwdLedOffAt) {
        digitalWrite(LED_FWD_PIN, LOW);
        _fwdLedOffAt = 0;
    }
    wifiMaintain();
    mqttClientMaintain();
}
