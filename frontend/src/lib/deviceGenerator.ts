export interface DeviceCredentials {
  deviceId: string;
  secretKey: string;
}

export function generateDeviceCredentials(type: 'sensor' | 'gateway'): DeviceCredentials {
  // Generate 8 uppercase hex characters
  const randomHex = () => Math.random().toString(16).toUpperCase().slice(2, 10);

  const prefix = type === 'gateway' ? 'ESP32-GW-' : 'ESP32-SN-';
  const deviceId = prefix + randomHex();

  // Generate 64 hex characters for secret key
  const secretKey = Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');

  return {
    deviceId,
    secretKey,
  };
}