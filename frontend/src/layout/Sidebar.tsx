"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Cpu, Shield, Users, Wifi, MoreVertical, LogOut } from "lucide-react";
import { useAuth } from "@/package/features/useAuth";
import ConfirmDialog from "@/components/primitives/ConfirmDialog";

const NAV_LINKS = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Thiết bị",  href: "/devices",   icon: Cpu },
  { label: "Audit Log", href: "/audit",      icon: Shield },
  { label: "Người dùng", href: "/users",     icon: Users },
];

const ROLE_LABELS: Record<string, string> = {
  admin:    "Quản trị viên",
  operator: "Vận hành",
  viewer:   "Xem",
};

export default function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const [menuOpen, setMenuOpen]     = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node))
        setMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <>
      <aside className="fixed left-0 top-0 z-30 flex h-screen w-60 flex-col border-r border-[#E5EAF0] bg-white">

        {/* Logo */}
        <div className="flex items-center gap-2.5 border-b border-[#E5EAF0] px-4 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">
            <Wifi size={16} />
          </div>
          <p className="text-sm font-semibold text-gray-900">IoT Manager</p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-3">
          <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-widest text-gray-400">
            Menu
          </p>
          <ul className="space-y-0.5">
            {NAV_LINKS.map(({ label, href, icon: Icon }) => {
              const isActive =
                pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
              return (
                <li key={href}>
                  <Link
                    href={href}
                    className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors
                      ${isActive
                        ? "bg-blue-50 text-blue-600"
                        : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
                      }`}
                  >
                    <Icon size={15} className={isActive ? "text-blue-600" : "text-gray-400"} />
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* User section */}
        <div className="border-t border-[#E5EAF0] p-3">
          <div ref={menuRef} className="relative">
            <div className="flex items-center gap-2.5 rounded-md bg-gray-50 px-3 py-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-blue-500 to-indigo-500 text-xs font-bold uppercase text-white">
                {user?.username?.[0] ?? "?"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                  {user?.role ? (ROLE_LABELS[user.role] ?? user.role) : "—"}
                </p>
                <p className="truncate text-sm font-medium text-gray-900">
                  {user?.username ?? "—"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMenuOpen((prev) => !prev)}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-400 transition hover:bg-gray-200 hover:text-gray-700"
                aria-label="More options"
              >
                <MoreVertical size={14} />
              </button>
            </div>

            {menuOpen && (
              <div className="absolute bottom-full left-0 right-0 mb-1.5 rounded-lg border border-[#E5EAF0] bg-white py-1 shadow-md">
                <Link href="/profile" onClick={() => setMenuOpen(false)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-50">
                  Profile
                </Link>
                <Link href="/settings" onClick={() => setMenuOpen(false)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-50">
                  Settings
                </Link>
                <div className="my-1 border-t border-[#E5EAF0]" />
                <button type="button"
                  onClick={() => { setMenuOpen(false); setConfirmOpen(true); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 transition hover:bg-red-50">
                  <LogOut size={13} />
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      <ConfirmDialog
        open={confirmOpen}
        title="Đăng xuất"
        description="Bạn có chắc muốn đăng xuất?"
        confirmLabel="Đăng xuất"
        cancelLabel="Huỷ"
        danger
        onConfirm={() => { setConfirmOpen(false); logout(); }}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
