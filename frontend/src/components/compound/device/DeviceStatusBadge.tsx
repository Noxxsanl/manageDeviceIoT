type DeviceStatusBadgeProps = {
  status: "online" | "offline" | "active" | "inactive" | "blocked";
};

const statusConfig: Record<string, { label: string; className: string }> = {
  online:   { label: "online",   className: "bg-emerald-50 text-emerald-700" },
  active:   { label: "active",   className: "bg-emerald-50 text-emerald-700" },
  offline:  { label: "offline",  className: "bg-gray-100 text-gray-500" },
  inactive: { label: "inactive", className: "bg-gray-100 text-gray-500" },
  blocked:  { label: "blocked",  className: "bg-red-50 text-red-700" },
};

export default function DeviceStatusBadge({ status }: DeviceStatusBadgeProps) {
  const config = statusConfig[status] ?? statusConfig.inactive;
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${config.className}`}>
      {config.label}
    </span>
  );
}
