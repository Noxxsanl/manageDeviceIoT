"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Device } from "@/package/schema/device";
import DeviceStatusBadge from "@/components/compound/device/DeviceStatusBadge";

type DeviceRowProps = {
  device: Device;
  onDelete: (id: string) => void;
};

export default function DeviceRow({ device, onDelete }: DeviceRowProps) {
  const [showToken, setShowToken] = useState(false);
  const securityClass = useMemo(
    () =>
      device.securityStatus === "Normal"
        ? "bg-emerald-500/10 text-emerald-300"
        : "bg-rose-500/10 text-rose-300",
    [device.securityStatus],
  );

  return (
    <tr className="border-b border-slate-900/10 hover:bg-slate-900/80">
      <td className="px-4 py-4 text-sm text-slate-200">
        <Link href={`/devices/${device.id}`} className="font-medium text-white hover:text-emerald-300">
          {device.deviceId}
        </Link>
      </td>
      <td className="px-4 py-4 text-sm text-slate-300">
        <DeviceStatusBadge status={device.status} />
      </td>
      <td className="px-4 py-4 text-sm text-slate-300">{device.role}</td>
      <td className="px-4 py-4 text-sm text-slate-300">
        <div className="inline-flex items-center gap-2 rounded-2xl bg-slate-900/80 px-3 py-2 text-xs text-slate-300">
          <span>{showToken ? device.token : "••••••••••••••••"}</span>
          <button
            type="button"
            onClick={() => setShowToken((value) => !value)}
            className="rounded-full bg-slate-800 px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-slate-300 transition hover:bg-slate-700"
          >
            {showToken ? "Hide" : "Show"}
          </button>
        </div>
      </td>
      <td className="px-4 py-4 text-sm text-slate-300">
        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${securityClass}`}>
          {device.securityStatus}
        </span>
      </td>
      <td className="px-4 py-4 text-sm text-slate-300">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowToken(true)}
            className="rounded-2xl bg-slate-800 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-200 transition hover:bg-slate-700"
          >
            Show
          </button>
          <button
            type="button"
            onClick={() => setShowToken(false)}
            className="rounded-2xl bg-slate-800 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-200 transition hover:bg-slate-700"
          >
            Hide
          </button>
          <button
            type="button"
            onClick={() => onDelete(device.id)}
            className="rounded-2xl bg-rose-500 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-950 transition hover:bg-rose-400"
          >
            Delete
          </button>
        </div>
      </td>
    </tr>
  );
}
