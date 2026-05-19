export type ApiDeviceStatus = "active" | "inactive" | "blocked";
export type ApiDeviceType = "sensor" | "gateway";

export type ApiDevice = {
  id: number;
  device_id: string;
  device_name: string;
  device_type: ApiDeviceType;
  status: ApiDeviceStatus;
  location: string;
  last_seen: string | null;
  fail_count: number;
  created_by: number;
};

export type RegisterDeviceResponse = {
  id: number;
  device_id: string;
  device_name: string;
  device_type: ApiDeviceType;
  status: ApiDeviceStatus;
  location: string;
  secret_key: string;
};

export type DashboardStats = {
  total_gateway: number;
  total_sensor: number;
  gateway_online: number;
  sensor_online: number;
  total_data_points: number;
};
