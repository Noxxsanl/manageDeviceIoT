"use client";

import { useMemo, useState } from "react";
import type { Device } from "@/package/schema/device";
import DeviceRow from "@/components/compound/device/DeviceRow";

type DeviceTableProps = {
  devices: Device[];
};

export default function DeviceTable({ devices }: DeviceTableProps) {
  const [activeDevices, setActiveDevices] = useState<Device[]>(devices);
  const deviceCount = useMemo(() => activeDevices.length, [activeDevices]);

  const handleDelete = (id: string) => {
    setActiveDevices((current) => current.filter((device) => device.id !== id));
  };

  return (
    <div className="overflow-hidden rounded-4xl border border-slate-900/10 bg-slate-950/95 shadow-lg shadow-slate-950/20">
      <div className="flex items-center justify-between border-b border-slate-900/10 px-6 py-4 text-sm text-slate-400">
        <span>{deviceCount} devices deployed</span>
        <button className="rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400">
          Add Device
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full table-fixed text-left text-sm">
          <thead className="bg-slate-900/90 text-slate-400">
            <tr>
              <th className="px-4 py-4">Device ID</th>
              <th className="px-4 py-4">Status</th>
              <th className="px-4 py-4">Role</th>
              <th className="px-4 py-4">Token</th>
              <th className="px-4 py-4">Security Status</th>
              <th className="px-4 py-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {activeDevices.map((device) => (
              <DeviceRow key={device.id} device={device} onDelete={handleDelete} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
