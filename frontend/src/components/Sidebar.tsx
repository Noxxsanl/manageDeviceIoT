"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Cpu,
  Shield,
  Users,
  LogOut,
  Wifi,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

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

  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col border-r border-slate-800 bg-slate-950">
      {/* Logo */}
      <div className="flex items-center gap-3 border-b border-slate-800 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500 text-sm font-bold text-white shadow-lg shadow-sky-950/40">
          <Wifi size={18} />
        </div>
        <div>
          <p className="text-sm font-semibold text-white">IoT Manager</p>
          <p className="text-xs text-slate-500">Control Panel</p>
        </div>
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

      {/* User info + logout */}
      <div className="border-t border-slate-800 p-4">
        <div className="mb-3 flex items-center gap-3 rounded-xl bg-slate-900 px-3 py-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-700 text-xs font-bold uppercase text-slate-300">
            {user?.username?.[0] ?? "?"}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-200">
              {user?.username ?? "—"}
            </p>
            <p className="text-xs text-slate-500">
              {user?.role ? (ROLE_LABELS[user.role] ?? user.role) : "—"}
            </p>
          </div>
        </div>
        <button
          onClick={() => logout()}
          className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-slate-400 transition-colors hover:bg-rose-500/10 hover:text-rose-400"
        >
          <LogOut size={15} />
          Đăng xuất
        </button>
      </div>
    </aside>
  );
}
