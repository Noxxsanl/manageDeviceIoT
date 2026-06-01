#include "ntp_sync.h"
#include <Arduino.h>
#include <time.h>

static bool _synced = false;

void ntpSetup() {
    configTime(7 * 3600, 0, "pool.ntp.org", "time.nist.gov");  // UTC+7

    Serial.print("[NTP] Syncing");
    struct tm timeinfo;
    int retries = 0;
    while (!getLocalTime(&timeinfo) && retries < 20) {
        Serial.print(".");
        delay(500);
        retries++;
    }

    if (getLocalTime(&timeinfo)) {
        _synced = true;
        char buf[32];
        strftime(buf, sizeof(buf), "%Y-%m-%d %H:%M:%S", &timeinfo);
        Serial.printf("\n[NTP] OK – %s (UTC+7)\n", buf);
    } else {
        Serial.println("\n[NTP] FAILED – timestamps will be inaccurate");
    }
}

unsigned long getCurrentTimestamp() {
    time_t now;
    time(&now);
    return (unsigned long)now;
}

bool ntpIsSynced() {
    return _synced;
}
