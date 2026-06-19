"use client";

import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import Breadcrumb from "@/layout/_component/Breadcrumb";

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
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-[#E5EAF0] bg-white px-5">
      <Breadcrumb />
      <div ref={notifRef} className="relative">
        <button type="button" onClick={() => setNotifOpen((prev) => !prev)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50 hover:text-gray-700"
          aria-label="Notifications">
          <Bell size={15} />
        </button>
        {notifOpen && (
          <div className="absolute right-0 z-50 mt-1.5 w-64 rounded-lg border border-[#E5EAF0] bg-white p-3 shadow-md">
            <p className="text-sm font-semibold text-gray-900">Thông báo</p>
            <p className="mt-3 text-center text-sm text-gray-400">Không có thông báo.</p>
          </div>
        )}
      </div>
    </header>
  );
}
