#include <Arduino.h>
#include "config_gw.h"
#include "wifi_manager.h"
#include "ntp_sync.h"
#include "mqtt_client.h"
#include "forwarder.h"

// ─── MQTT message callback ─────────────────────────────────────────────────────

static void onSensorMessage(const char* topic, const char* payload, unsigned int length) {
    // Kiểm tra điều kiện tối thiểu trước khi xử lý
    if (!ntpIsSynced()) {
        Serial.println("[MAIN] Bỏ qua – NTP chưa đồng bộ (không thể xác thực timestamp)");
        return;
    }
    forwardSensorData(topic, payload, length);
}

// ─── SETUP ────────────────────────────────────────────────────────────────────

void setup() {
    Serial.begin(115200);
    delay(1000);

    Serial.println("\n╔══════════════════════════════════╗");
    Serial.println("║   IoT Gateway Node – Khởi động   ║");
    Serial.println("╚══════════════════════════════════╝");
    Serial.printf("  Gateway ID : %s\n", GW_DEVICE_ID);
    Serial.printf("  Backend URL: %s\n\n", BACKEND_URL);

    // LED forward thành công (GPIO 2 – onboard LED)
    pinMode(LED_FWD_PIN, OUTPUT);
    digitalWrite(LED_FWD_PIN, LOW);

    // 1. WiFi
    wifiSetup();

    // 2. NTP (cần WiFi)
    ntpSetup();

    // 3. MQTT – subscribe wildcard local/sensors/+/data
    mqttClientSetup(onSensorMessage);

    Serial.println("\n[MAIN] Setup hoàn tất – lắng nghe sensor data...\n");
}

// ─── LOOP ─────────────────────────────────────────────────────────────────────

void loop() {
    // Duy trì kết nối WiFi
    wifiMaintain();

    // Duy trì MQTT và xử lý message đến (không có delay – non-blocking)
    mqttClientMaintain();
}
