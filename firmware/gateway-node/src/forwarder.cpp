#include "forwarder.h"
#include "config_gw.h"
#include "hmac_util.h"
#include "ntp_sync.h"
#include <Arduino.h>
#include <ArduinoJson.h>
#include <HTTPClient.h>

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Tìm secret_key của sensor trong danh sách KNOWN_SENSORS
static const char* findSensorSecret(const char* sensor_id) {
    for (int i = 0; i < KNOWN_SENSOR_COUNT; i++) {
        if (strcmp(KNOWN_SENSORS[i].device_id, sensor_id) == 0) {
            return KNOWN_SENSORS[i].secret_key;
        }
    }
    return nullptr;
}

// Xác thực HMAC của sensor: message = "sensor_id:sn_timestamp"
static bool verifySensorHMAC(const char* sensor_id,
                              unsigned long sn_timestamp,
                              const char* sn_hmac,
                              const char* secret_key) {
    String message = String(sensor_id) + ":" + String(sn_timestamp);
    String expected = computeHMAC(String(secret_key), message);

    // So sánh constant-time bằng cách XOR từng ký tự
    if (expected.length() != strlen(sn_hmac)) return false;
    uint8_t diff = 0;
    for (size_t i = 0; i < expected.length(); i++) {
        diff |= (uint8_t)(expected[i] ^ sn_hmac[i]);
    }
    return diff == 0;
}

// ─── Main forwarder ───────────────────────────────────────────────────────────

void forwardSensorData(const char* topic, const char* payload, unsigned int length) {
    // 1. Parse JSON từ Sensor
    StaticJsonDocument<512> sensorDoc;
    DeserializationError err = deserializeJson(sensorDoc, payload, length);
    if (err) {
        Serial.printf("[FWD] JSON parse error: %s\n", err.c_str());
        return;
    }

    const char* sensor_id    = sensorDoc["sensor_id"]    | "";
    unsigned long sn_timestamp = sensorDoc["sn_timestamp"] | 0UL;
    const char* sn_hmac      = sensorDoc["sn_hmac"]      | "";
    JsonObject  data          = sensorDoc["data"];

    if (strlen(sensor_id) == 0 || sn_timestamp == 0 || strlen(sn_hmac) == 0 || data.isNull()) {
        Serial.println("[FWD] Payload thiếu field bắt buộc – bỏ qua");
        return;
    }

    // 2. Kiểm tra sensor có trong danh sách cho phép không
    const char* sensorSecret = findSensorSecret(sensor_id);
    if (!sensorSecret) {
        Serial.printf("[FWD] REJECT – Sensor '%s' không có trong KNOWN_SENSORS\n", sensor_id);
        return;
    }

    // 3. Kiểm tra timestamp window: ±300 giây
    unsigned long now = getCurrentTimestamp();
    long timeDiff = (long)now - (long)sn_timestamp;
    if (timeDiff < -300 || timeDiff > 300) {
        Serial.printf("[FWD] REJECT – Sensor timestamp quá cũ/mới (diff=%lds)\n", timeDiff);
        return;
    }

    // 4. Xác thực Sensor HMAC
    if (!verifySensorHMAC(sensor_id, sn_timestamp, sn_hmac, sensorSecret)) {
        Serial.printf("[FWD] REJECT – Sensor HMAC không hợp lệ cho '%s'\n", sensor_id);
        return;
    }
    Serial.printf("[FWD] Sensor HMAC OK – '%s'\n", sensor_id);

    // 5. Tính Gateway HMAC: HMAC-SHA256(GW_SECRET, "gw_id:gw_timestamp")
    unsigned long gw_timestamp = getCurrentTimestamp();
    String gwMessage = String(GW_DEVICE_ID) + ":" + String(gw_timestamp);
    String gw_hmac   = computeHMAC(String(GW_SECRET_KEY), gwMessage);

    // 6. Build payload gửi lên Backend
    StaticJsonDocument<768> outDoc;
    outDoc["gateway_id"]   = GW_DEVICE_ID;
    outDoc["gw_timestamp"] = gw_timestamp;
    outDoc["gw_hmac"]      = gw_hmac;
    outDoc["sensor_id"]    = sensor_id;
    outDoc["sn_timestamp"] = sn_timestamp;
    outDoc["sn_hmac"]      = sn_hmac;

    // Copy data object từ sensor payload
    JsonObject outData = outDoc.createNestedObject("data");
    for (JsonPair kv : data) {
        outData[kv.key()] = kv.value();
    }

    char bodyBuf[768];
    size_t bodyLen = serializeJson(outDoc, bodyBuf, sizeof(bodyBuf));
    Serial.printf("[FWD] Payload (%d bytes): %s\n", (int)bodyLen, bodyBuf);

    // 7. HTTP POST lên Backend
    HTTPClient http;
    http.begin(BACKEND_URL);
    http.addHeader("Content-Type", "application/json");
    http.setTimeout(HTTP_TIMEOUT);

    int httpCode = http.POST(bodyBuf);

    if (httpCode > 0) {
        String response = http.getString();
        if (httpCode == 200) {
            Serial.printf("[FWD] Backend OK (200) – %s\n", response.c_str());
            // Nháy LED onboard khi forward thành công
            digitalWrite(LED_FWD_PIN, HIGH);
            delay(100);
            digitalWrite(LED_FWD_PIN, LOW);
        } else {
            Serial.printf("[FWD] Backend ERROR (%d) – %s\n", httpCode, response.c_str());
        }
    } else {
        Serial.printf("[FWD] HTTP request FAILED: %s\n", http.errorToString(httpCode).c_str());
    }

    http.end();
}
