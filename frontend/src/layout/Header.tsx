"use client";

import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import Breadcrumb from "@/layout/_component/Breadcrumb";

export default function Header() {
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-800 bg-slate-950 px-6">
      <Breadcrumb />

      <div ref={notifRef} className="relative">
        <button
          type="button"
          onClick={() => setNotifOpen((prev) => !prev)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-700/80 bg-slate-900/90 text-slate-400 transition hover:bg-slate-800 hover:text-white"
          aria-label="Notifications"
        >
          <Bell size={16} />
        </button>

        {notifOpen && (
          <div className="absolute right-0 z-50 mt-2 w-72 rounded-2xl border border-slate-800 bg-slate-950 p-4 shadow-xl shadow-slate-950/40">
            <p className="text-sm font-semibold text-white">Notifications</p>
            <p className="mt-4 text-center text-sm text-slate-500">No notifications.</p>
          </div>
        )}
      </div>
    </header>
  );
}
