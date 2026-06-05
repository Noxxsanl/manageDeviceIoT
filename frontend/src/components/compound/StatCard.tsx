type StatCardProps = {
  title: string;
  value: number;
  description: string;
  accentClass: string;
};

export default function StatCard({ title, value, description, accentClass }: StatCardProps) {
  return (
    <div className="rounded-[1.5rem] border border-slate-200/80 bg-white/90 p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg dark:border-slate-700/80 dark:bg-slate-900/90">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">{title}</p>
        <div className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${accentClass}`}>Live</div>
      </div>
      <p className="mt-5 text-4xl font-semibold tracking-tight text-slate-950 dark:text-white">{value}</p>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{description}</p>
    </div>
  );
}
