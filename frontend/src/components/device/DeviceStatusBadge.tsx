type DeviceStatusBadgeProps = {
  status: "online" | "offline";
};

export default function DeviceStatusBadge({ status }: DeviceStatusBadgeProps) {
  const className = status === "online" ? "bg-emerald-500/10 text-emerald-300" : "bg-slate-700/80 text-slate-300";
  return <span className={`rounded-full px-3 py-1 text-xs font-semibold ${className}`}>{status}</span>;
}
