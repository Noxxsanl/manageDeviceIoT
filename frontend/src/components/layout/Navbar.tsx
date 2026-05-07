"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { notifications } from "@/mock/notifications";
import ThemeToggle from "@/components/layout/ThemeToggle";

function subscribeToClock(callback: () => void) {
  const timer = window.setInterval(callback, 1000);
  return () => window.clearInterval(timer);
}

function getClockSnapshot() {
  return new Date().toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const formattedTime = useSyncExternalStore(subscribeToClock, getClockSnapshot, () => "00:00:00");

  const badgeCount = useMemo(() => notifications.filter((item) => item.isNew).length, []);

  return (
    <header className="fixed left-0 top-0 z-40 flex h-20 w-full items-center justify-between border-b border-slate-900/10 bg-slate-950/95 px-5 shadow-sm backdrop-blur-xl dark:border-slate-800/70 dark:bg-slate-950/95">
      <div className="flex items-center gap-3">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-3xl bg-gradient-to-br from-sky-500 to-indigo-500 text-white shadow-lg shadow-slate-950/10">
          <span className="text-lg font-semibold">A</span>
        </div>
        <div>
          <p className="text-sm uppercase tracking-[0.24em] text-slate-400">IoT Manager Admin</p>
          <h1 className="text-lg font-semibold text-white">Admin Panel</h1>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            className="relative inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-700/80 bg-slate-900/90 text-slate-200 shadow-sm transition hover:bg-slate-800"
            aria-label="Notifications"
          >
            <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-rose-500 px-1.5 text-[0.65rem] font-semibold text-white">
              {badgeCount}
            </span>
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
              <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {open ? (
            <div className="absolute right-0 z-50 mt-3 w-[320px] rounded-3xl border border-slate-800/80 bg-slate-950 p-4 shadow-xl shadow-slate-950/30">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-white">Notifications</p>
                <span className="text-xs uppercase tracking-[0.2em] text-slate-500">{badgeCount} new</span>
              </div>
              <div className="space-y-3">
                {notifications.map((item) => (
                  <div key={item.id} className="rounded-3xl border border-slate-800/80 bg-slate-900/90 p-3">
                    <p className="text-sm font-semibold text-white">{item.title}</p>
                    <p className="mt-1 text-sm text-slate-400">{item.description}</p>
                    <p className="mt-2 text-xs uppercase tracking-[0.2em] text-slate-500">{item.time}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
        <ThemeToggle />
        <div className="inline-flex h-11 w-11 items-center justify-center rounded-3xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-sm font-semibold text-white shadow-lg shadow-slate-950/20">
          AD
        </div>
        <div className="rounded-3xl border border-slate-700/80 bg-slate-900/90 px-4 py-2 text-sm text-slate-300 shadow-sm">
          {formattedTime}
        </div>
      </div>
    </header>
  );
}
