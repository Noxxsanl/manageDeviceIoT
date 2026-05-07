"use client";

import { useEffect, useMemo, useState } from "react";

function formatClock(date: Date) {
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export default function Topbar() {
  const [currentTime, setCurrentTime] = useState(() => formatClock(new Date()));

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCurrentTime(formatClock(new Date()));
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  const title = useMemo(() => "IoT Device Management", []);

  return (
    <header className="mb-8 flex flex-col gap-3 rounded-4xl border border-slate-200/80 bg-white/90 p-6 shadow-sm dark:border-slate-700/80 dark:bg-slate-900/90 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">Project</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">{title}</h1>
      </div>
      <div className="inline-flex items-center gap-3 rounded-3xl bg-slate-100 px-5 py-3 text-sm font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
        <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
        <span>{currentTime}</span>
      </div>
    </header>
  );
}
