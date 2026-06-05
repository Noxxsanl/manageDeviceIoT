type DeviceStatusBadgeProps = {
  status: "online" | "offline" | "active" | "inactive" | "blocked";
};

const statusConfig: Record<string, { label: string; className: string }> = {
  online:   { label: "online",   className: "bg-emerald-500/10 text-emerald-300" },
  active:   { label: "active",   className: "bg-emerald-500/10 text-emerald-300" },
  offline:  { label: "offline",  className: "bg-slate-700/80 text-slate-300" },
  inactive: { label: "inactive", className: "bg-slate-700/80 text-slate-300" },
  blocked:  { label: "blocked",  className: "bg-rose-500/10 text-rose-300" },
};

export default function DeviceStatusBadge({ status }: DeviceStatusBadgeProps) {
  const config = statusConfig[status] ?? statusConfig.inactive;
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${config.className}`}>
      {config.label}
    </span>
  );
}
