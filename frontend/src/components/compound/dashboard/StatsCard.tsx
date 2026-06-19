type StatsCardProps = {
  title: string;
  value: number | string;
  subtitle: string;
  icon: React.ReactNode;
  accent: string;
  iconBg?: string;
};

export default function StatsCard({ title, value, subtitle, icon, accent, iconBg }: StatsCardProps) {
  return (
    <div className="rounded-xl border border-[#E5EAF0] bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <div className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${iconBg ?? "bg-gray-100"}`}>
          {icon}
        </div>
        <div className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${accent}`}>
          Live
        </div>
      </div>
      <p className="mt-4 text-2xl font-semibold text-gray-900">{value}</p>
      <p className="mt-0.5 text-sm font-medium text-gray-700">{title}</p>
      <p className="mt-1 text-xs leading-5 text-gray-400">{subtitle}</p>
    </div>
  );
}
