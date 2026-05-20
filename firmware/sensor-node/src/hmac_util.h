#pragma once
#include <Arduino.h>

/**
 * Tính HMAC-SHA256.
 *
 * @param key     Secret key (hex string 64 ký tự từ server)
 * @param message Nội dung cần ký (vd: "ESP32-SN-ABCD1234:1700000000")
 * @return        Hex string 64 ký tự lowercase
 *
 * Dùng mbedtls built-in của ESP32 Arduino framework – không cần lib ngoài.
 */
String computeHMAC(const String& key, const String& message);
