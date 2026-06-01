#pragma once

// Validate sensor payload, sign with gateway HMAC, POST to backend.
// Returns true on HTTP 200.
bool forwardSensorData(const char* topic, const char* payload, unsigned int length);
