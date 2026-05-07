export type Device = {
  id: string;
  deviceId: string;
  name: string;
  status: "online" | "offline";
  lastSeen: string;
  temperature: number;
  humidity: number;
};
