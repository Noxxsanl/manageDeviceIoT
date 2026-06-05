type StatsCardProps = {
  title: string;
  value: number | string;
  subtitle: string;
  icon: React.ReactNode;
  accent: string;
};

export default function StatsCard({ title, value, subtitle, icon, accent }: StatsCardProps) {
  return (
    <div className="rounded-3xl border border-slate-900/10 bg-slate-900/90 p-6 shadow-lg shadow-slate-950/20 transition hover:-translate-y-1 hover:border-slate-700/60 hover:bg-slate-950/95">
      <div className="flex items-center justify-between gap-4">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-3xl bg-slate-800/80 text-slate-200 shadow-inner">
          {icon}
        </div>
        <div className={`inline-flex rounded-2xl px-3 py-1 text-xs font-semibold ${accent}`}>
          Live
        </div>
      </div>
      <p className="mt-6 text-3xl font-semibold text-white">{value}</p>
      <p className="mt-2 text-sm text-slate-400">{title}</p>
      <p className="mt-3 text-sm leading-6 text-slate-500">{subtitle}</p>
    </div>
  );
}
