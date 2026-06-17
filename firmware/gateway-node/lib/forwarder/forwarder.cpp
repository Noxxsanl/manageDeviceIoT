#include "forwarder.h"
#include "config_gw.h"
#include "hmac_util.h"
#include "ntp_sync.h"
#include "sensor_registry.h"
#include "mqtt_client.h"
#include <Arduino.h>
#include <ArduinoJson.h>
#include <WiFi.h>
#include <string.h>

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

    // 2. Tra cứu secret từ registry động; lazy-refresh nếu không tìm thấy
    const char* sensorSecret = registryFindSecret(sensor_id);
    if (!sensorSecret && registryNeedsRefresh()) {
        Serial.printf("[FWD] Unknown sensor '%s', refreshing registry...\n", sensor_id);
        fetchSensorList();
        sensorSecret = registryFindSecret(sensor_id);
    }
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

    // 6. Build forwarded payload – sensor fields nested under sensor_payload
    StaticJsonDocument<768> outDoc;
    outDoc["gateway_id"]   = GW_DEVICE_ID;
    outDoc["gateway_ip"]   = WiFi.localIP().toString();
    outDoc["gw_timestamp"] = gw_timestamp;
    outDoc["gw_hmac"]      = gw_hmac;

    JsonObject sensorPayload = outDoc.createNestedObject("sensor_payload");
    sensorPayload["sensor_id"]    = sensor_id;
    sensorPayload["sn_timestamp"] = sn_timestamp;
    sensorPayload["sn_hmac"]      = sn_hmac;
    if (sensor_ip[0]) sensorPayload["sensor_ip"] = sensor_ip;
    JsonObject outData = sensorPayload.createNestedObject("data");
    for (JsonPair kv : data) outData[kv.key()] = kv.value();

    char bodyBuf[MQTT_BUFFER_SIZE];
    size_t bodyLen = serializeJson(outDoc, bodyBuf, sizeof(bodyBuf));
    Serial.printf("[FWD] Publishing %d bytes to MQTT\n", (int)bodyLen);

    // 7. MQTT publish to backend topic: gateway/<GW_DEVICE_ID>/data
    if (!mqttClientIsConnected()) {
        Serial.println("[FWD] MQTT not connected – dropped");
        return false;
    }

    bool success = mqttClientPublish(GATEWAY_DATA_TOPIC, bodyBuf, (unsigned int)bodyLen);
    if (success) {
        Serial.println("[FWD] MQTT publish OK");
    } else {
        Serial.println("[FWD] MQTT publish FAILED");
    }
    return success;
}
