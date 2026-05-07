import type { Notification } from "@/types/notification";

export const notifications: Notification[] = [
  {
    id: "note-001",
    title: "Device Offline Alert",
    description: "Warehouse Sensor has disconnected from East Gate.",
    time: "2m ago",
    type: "offline",
    isNew: true,
  },
  {
    id: "note-002",
    title: "Security Breach Detected",
    description: "Parking Gate Beacon flagged an attack scenario.",
    time: "5m ago",
    type: "attack",
    isNew: true,
  },
  {
    id: "note-003",
    title: "New Device Registered",
    description: "Energy Control Unit was added to your fleet.",
    time: "12m ago",
    type: "registration",
    isNew: false,
  },
];
