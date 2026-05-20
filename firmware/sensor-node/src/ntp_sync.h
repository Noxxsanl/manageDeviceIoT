#pragma once
#include <Arduino.h>

/**
 * Đồng bộ thời gian từ NTP server (UTC+7 – Việt Nam).
 * Gọi 1 lần trong setup() SAU KHI WiFi đã kết nối.
 */
void ntpSetup();

/**
 * Trả Unix timestamp hiện tại (giây).
 * Dùng cho HMAC message: "device_id:timestamp"
 */
unsigned long getCurrentTimestamp();

/** Trả true nếu NTP đã sync thành công ít nhất 1 lần. */
bool ntpIsSynced();
