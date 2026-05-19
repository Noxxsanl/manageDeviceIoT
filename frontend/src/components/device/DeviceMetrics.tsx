import type { DeviceMetrics } from "@/types/device";

type DeviceMetricsProps = {
  metrics: DeviceMetrics;
};

const metricItems = [
  { key: "temperature", label: "Temperature", unit: "°C" },
  { key: "humidity", label: "Humidity", unit: "%" },
  { key: "battery", label: "Battery", unit: "%" },
  { key: "signalStrength", label: "Signal Strength", unit: "%" },
  { key: "dataSentToday", label: "Data Sent Today", unit: "" },
  { key: "uptime", label: "Uptime", unit: "" },
] as const;

export default function DeviceMetrics({ metrics }: DeviceMetricsProps) {
  return (
    <div className="rounded-4xl border border-slate-900/10 bg-slate-950/95 p-6 shadow-lg shadow-slate-950/20">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Metrics</p>
          <h3 className="mt-2 text-2xl font-semibold text-white">Performance overview</h3>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {metricItems.map((item) => (
          <div key={item.key} className="rounded-3xl bg-slate-900/90 p-5">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">{item.label}</p>
            <p className="mt-4 text-3xl font-semibold text-white">
              {metrics[item.key]}{item.unit}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
