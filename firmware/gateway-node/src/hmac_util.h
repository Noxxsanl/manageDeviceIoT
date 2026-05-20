#pragma once
#include <Arduino.h>

// Tính HMAC-SHA256(key, message), trả về hex string 64 ký tự
String computeHMAC(const String& key, const String& message);
