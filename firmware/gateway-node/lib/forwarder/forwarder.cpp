#include "forwarder.h"
#include "config_gw.h"
#include "hmac_util.h"
#include "ntp_sync.h"
#include <Arduino.h>
#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <WiFi.h>
#include <string.h>

static const char* findSensorSecret(const char* sensor_id) {
    for (int i = 0; i < KNOWN_SENSOR_COUNT; i++) {
        if (strcmp(KNOWN_SENSORS[i].device_id, sensor_id) == 0)
            return KNOWN_SENSORS[i].secret_key;
    }
    return nullptr;
}

// Constant-time compare – prevents timing attacks on HMAC verification
static bool safeEq64(const char* a, const char* b) {
    uint8_t diff = 0;
    for (int i = 0; i < 64; i++) diff |= (uint8_t)(a[i] ^ b[i]);
    return diff == 0;
}

static bool verifySensorHMAC(const char* sensor_id, unsigned long sn_timestamp,
                              const char* sn_hmac, const char* secret) {
    if (strlen(sn_hmac) != 64) return false;
    char msg[96];
    snprintf(msg, sizeof(msg), "%s:%lu", sensor_id, sn_timestamp);
    char expected[65];
    if (!computeHMAC(secret, msg, expected)) return false;
    return safeEq64(expected, sn_hmac);
}

bool forwardSensorData(const char* topic, const char* payload, unsigned int length) {
    // 1. Parse sensor JSON
    StaticJsonDocument<512> sensorDoc;
    DeserializationError err = deserializeJson(sensorDoc, payload, length);
    if (err) {
        Serial.printf("[FWD] JSON parse error on '%s': %s\n", topic, err.c_str());
        return false;
    }

    const char*   sensor_id    = sensorDoc["sensor_id"]    | "";
    unsigned long sn_timestamp = sensorDoc["sn_timestamp"] | 0UL;
    const char*   sn_hmac      = sensorDoc["sn_hmac"]      | "";
    const char*   sensor_ip    = sensorDoc["sensor_ip"]    | "";
    JsonObject    data         = sensorDoc["data"];

    if (!sensor_id[0] || !sn_timestamp || !sn_hmac[0] || data.isNull()) {
        Serial.println("[FWD] Missing required field – dropped");
        return false;
    }

    // 2. Whitelist check
    const char* sensorSecret = findSensorSecret(sensor_id);
    if (!sensorSecret) {
        Serial.printf("[FWD] REJECT – unknown sensor '%s'\n", sensor_id);
        return false;
    }

    // 3. Timestamp window ±TIMESTAMP_WINDOW_SEC
    unsigned long now = getCurrentTimestamp();
    long timeDiff = (long)now - (long)sn_timestamp;
    if (timeDiff < -TIMESTAMP_WINDOW_SEC || timeDiff > TIMESTAMP_WINDOW_SEC) {
        Serial.printf("[FWD] REJECT – timestamp out of window (diff=%lds)\n", timeDiff);
        return false;
    }

    // 4. Verify sensor HMAC
    if (!verifySensorHMAC(sensor_id, sn_timestamp, sn_hmac, sensorSecret)) {
        Serial.printf("[FWD] REJECT – invalid HMAC for '%s'\n", sensor_id);
        return false;
    }
    Serial.printf("[FWD] Sensor HMAC OK – '%s'\n", sensor_id);

    // 5. Sign with gateway HMAC: HMAC-SHA256(GW_SECRET_KEY, "gw_id:gw_timestamp")
    unsigned long gw_timestamp = getCurrentTimestamp();
    char gwMsg[96];
    snprintf(gwMsg, sizeof(gwMsg), "%s:%lu", GW_DEVICE_ID, gw_timestamp);
    char gw_hmac[65];
    if (!computeHMAC(GW_SECRET_KEY, gwMsg, gw_hmac)) {
        Serial.println("[FWD] Gateway HMAC computation failed");
        return false;
    }

    // 6. Build forwarded payload
    StaticJsonDocument<768> outDoc;
    outDoc["gateway_id"]   = GW_DEVICE_ID;
    outDoc["gateway_ip"]   = WiFi.localIP().toString();
    outDoc["gw_timestamp"] = gw_timestamp;
    outDoc["gw_hmac"]      = gw_hmac;
    outDoc["sensor_id"]    = sensor_id;
    outDoc["sn_timestamp"] = sn_timestamp;
    outDoc["sn_hmac"]      = sn_hmac;
    if (sensor_ip[0]) outDoc["sensor_ip"] = sensor_ip;
    JsonObject outData = outDoc.createNestedObject("data");
    for (JsonPair kv : data) outData[kv.key()] = kv.value();

    char bodyBuf[768];
    size_t bodyLen = serializeJson(outDoc, bodyBuf, sizeof(bodyBuf));
    Serial.printf("[FWD] Posting %d bytes to backend\n", (int)bodyLen);

    // 7. HTTP POST to backend
    HTTPClient http;
    http.begin(BACKEND_URL);
    http.addHeader("Content-Type", "application/json");
    http.setTimeout(HTTP_TIMEOUT);
    int httpCode = http.POST(bodyBuf);

    bool success = false;
    if (httpCode > 0) {
        String response = http.getString();
        if (httpCode == 200) {
            Serial.println("[FWD] Backend OK (200)");
            success = true;
        } else {
            Serial.printf("[FWD] Backend ERROR (%d) – %s\n", httpCode, response.c_str());
        }
    } else {
        Serial.printf("[FWD] HTTP FAILED: %s\n", http.errorToString(httpCode).c_str());
    }
    http.end();
    return success;
}
