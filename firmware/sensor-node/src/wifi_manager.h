#pragma once
#include <Arduino.h>

/**
 * Khởi tạo WiFi: kết nối và bật LED_WIFI_PIN khi thành công.
 * Gọi 1 lần trong setup().
 */
void wifiSetup();

/**
 * Duy trì kết nối WiFi – gọi mỗi vòng loop().
 * Tự động reconnect nếu bị ngắt.
 */
void wifiMaintain();

/** Trả true nếu WiFi đang kết nối. */
bool wifiIsConnected();
