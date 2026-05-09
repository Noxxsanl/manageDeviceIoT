"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAddDevice } from "@/contexts/AddDeviceContext";

const navItems = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Devices", href: "/devices" },
  { label: "Logs", href: "/logs" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { openModal } = useAddDevice();

  return (
    <aside className="hidden shrink-0 h-full w-64 overflow-auto border-r border-slate-900/10 bg-slate-950/95 px-5 py-6 shadow-lg shadow-slate-950/20 dark:border-slate-800/80 lg:flex lg:flex-col">
      <div className="mb-8 flex flex-col gap-2 rounded-3xl border border-slate-800/80 bg-slate-900/90 px-5 py-6 text-slate-300 shadow-sm">
        <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Welcome back</p>
        <p className="mt-2 text-lg font-semibold text-white">Administrator</p>
        <p className="mt-2 text-sm text-slate-400">Monitor devices, security events and activity across your fleet.</p>
      </div>

      <nav className="space-y-2">
        {navItems.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center justify-between rounded-3xl px-4 py-3 text-sm font-medium transition ${
                active
                  ? "bg-slate-100 text-slate-950 dark:bg-slate-800 dark:text-white"
                  : "text-slate-400 hover:bg-slate-900/80 hover:text-white"
              }`}
            >
              <span>{item.label}</span>
              {active ? <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" /> : null}
            </Link>
          );
        })}
      </nav>

      <div className="mt-8 rounded-3xl border border-slate-800/80 bg-slate-900/90 p-4 shadow-sm">
        <p className="text-sm uppercase tracking-[0.22em] text-slate-500">Quick action</p>
        <button onClick={openModal} className="mt-4 inline-flex w-full items-center justify-center rounded-3xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400">
          Add Device
        </button>
      </div>
    </aside>
  );
}
