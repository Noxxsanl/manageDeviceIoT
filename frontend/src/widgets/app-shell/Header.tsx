"use client";

import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import Breadcrumb from "@/widgets/app-shell/Breadcrumb";

export default function Header() {
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node))
        setNotifOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header className="flex h-20 shrink-0 items-center justify-between border-b border-[#E5EAF0] bg-[#F8F9FB] px-6">
      <Breadcrumb />
      <div ref={notifRef} className="relative">
        <button
          type="button"
          onClick={() => setNotifOpen((prev) => !prev)}
          className="inline-flex h-10 w-10 items-center justify-center rounded border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50 hover:text-gray-700"
          aria-label="Notifications"
        >
          <Bell size={18} />
        </button>
        {notifOpen && (
          <div className="absolute right-0 z-50 mt-1.5 w-64 rounded border border-[#E5EAF0] bg-white p-4 shadow-md">
            <p className="text-base font-semibold text-gray-900">Thông báo</p>
            <p className="mt-2.5 text-center text-sm text-gray-400">Không có thông báo.</p>
          </div>
        )}
      </div>
    </header>
  );
}
