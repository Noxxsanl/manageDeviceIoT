const navLinks = [
  { label: "Dashboard", href: "#", active: true },
  { label: "Devices", href: "#" },
  { label: "Logs", href: "#" },
];

export default function Sidebar() {
  return (
    <aside className="hidden w-full max-w-xs shrink-0 overflow-hidden rounded-4xl border border-slate-200/80 bg-white/90 p-6 shadow-sm dark:border-slate-700/80 dark:bg-slate-950/90 lg:block">
      <div className="flex flex-col gap-6">
        <div>
          <p className="text-sm uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">IoT Control</p>
          <h2 className="mt-3 text-2xl font-semibold text-slate-950 dark:text-white">Device Dashboard</h2>
          <p className="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400">Monitor device health, connectivity and environment from one place.</p>
        </div>
        <nav className="space-y-2">
          {navLinks.map((item) => (
            <a
              key={item.label}
              href={item.href}
              className={`group flex items-center gap-3 rounded-3xl px-4 py-3 text-sm font-medium transition ${
                item.active
                  ? "bg-slate-100 text-slate-950 shadow-sm shadow-slate-200/80 dark:bg-slate-800 dark:text-white"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
              }`}
            >
              <span className="h-2.5 w-2.5 rounded-full bg-slate-400 group-hover:bg-slate-600 dark:group-hover:bg-slate-300"></span>
              {item.label}
            </a>
          ))}
        </nav>
      </div>
    </aside>
  );
}
