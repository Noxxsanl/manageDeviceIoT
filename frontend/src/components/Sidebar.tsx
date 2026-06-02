"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Cpu, Shield, Users, Wifi, MoreVertical, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

const NAV_LINKS = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Thiết bị", href: "/devices", icon: Cpu },
  { label: "Audit Log", href: "/audit", icon: Shield },
  { label: "Người dùng", href: "/users", icon: Users },
];

const ROLE_LABELS: Record<string, string> = {
  admin: "Quản trị viên",
  operator: "Vận hành",
  viewer: "Xem",
};

export default function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleLogoutConfirm() {
    setConfirmOpen(false);
    logout();
  }

  return (
    <>
      <aside className="fixed left-0 top-0 z-30 flex h-screen w-60 flex-col border-r border-slate-800 bg-slate-950">
        {/* Logo */}
        <div className="flex items-center gap-3 border-b border-slate-800 px-5 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500 text-white shadow-lg shadow-sky-950/40">
            <Wifi size={18} />
          </div>
          <p className="text-sm font-semibold text-white">IoT Manager</p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-widest text-slate-600">
            Menu
          </p>
          <ul className="space-y-1">
            {NAV_LINKS.map(({ label, href, icon: Icon }) => {
              const isActive =
                pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
              return (
                <li key={href}>
                  <Link
                    href={href}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-sky-500/15 text-sky-400"
                        : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-100"
                    }`}
                  >
                    <Icon
                      size={16}
                      className={isActive ? "text-sky-400" : "text-slate-500"}
                    />
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* User section */}
        <div className="border-t border-slate-800 p-4">
          <div ref={menuRef} className="relative">
            <div className="flex items-center gap-3 rounded-xl bg-slate-900 px-3 py-2.5">
              {/* Avatar */}
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-sky-500 to-indigo-500 text-sm font-bold uppercase text-white">
                {user?.username?.[0] ?? "?"}
              </div>

              {/* Info */}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                  {user?.role ? (ROLE_LABELS[user.role] ?? user.role) : "—"}
                </p>
                <p className="truncate text-sm font-medium text-slate-200">
                  {user?.username ?? "—"}
                </p>
              </div>

              {/* Kebab menu button */}
              <button
                type="button"
                onClick={() => setMenuOpen((prev) => !prev)}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-800 hover:text-slate-300"
                aria-label="More options"
              >
                <MoreVertical size={15} />
              </button>
            </div>

            {/* Dropdown menu */}
            {menuOpen && (
              <div className="absolute bottom-full left-0 right-0 mb-2 rounded-xl border border-slate-800 bg-slate-900 py-1 shadow-xl shadow-slate-950/40">
                <Link
                  href="/profile"
                  onClick={() => setMenuOpen(false)}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-slate-300 transition hover:bg-slate-800 hover:text-white"
                >
                  Profile
                </Link>
                <Link
                  href="/settings"
                  onClick={() => setMenuOpen(false)}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-slate-300 transition hover:bg-slate-800 hover:text-white"
                >
                  Settings
                </Link>
                <div className="my-1 border-t border-slate-800" />
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setConfirmOpen(true);
                  }}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-rose-400 transition hover:bg-rose-500/10"
                >
                  <LogOut size={14} />
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
        onConfirm={handleLogoutConfirm}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
