"use client";

import { useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { ApiSensorData } from "@/types/api";

type TimeRange = "1h" | "6h" | "24h";

type ChartPoint = {
  time: string;
  temperature?: number;
  humidity?: number;
};

function formatTime(iso: string, range: TimeRange): string {
  const d = new Date(iso);
  if (range === "1h") {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function filterByRange(data: ApiSensorData[], range: TimeRange): ApiSensorData[] {
  const hours = range === "1h" ? 1 : range === "6h" ? 6 : 24;
  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  return data.filter((d) => new Date(d.received_at).getTime() >= cutoff);
}

type SensorChartProps = {
  data: ApiSensorData[];
  isLoading: boolean;
};

export default function SensorChart({ data, isLoading }: SensorChartProps) {
  const [range, setRange] = useState<TimeRange>("1h");

  const filtered = filterByRange(data, range);

  const chartData: ChartPoint[] = [...filtered]
    .sort((a, b) => new Date(a.received_at).getTime() - new Date(b.received_at).getTime())
    .map((d) => ({
      time: formatTime(d.received_at, range),
      temperature:
        typeof d.payload?.temperature === "number" ? d.payload.temperature : undefined,
      humidity:
        typeof d.payload?.humidity === "number" ? d.payload.humidity : undefined,
    }));

  return (
    <div className="rounded-4xl border border-slate-800 bg-slate-950/95 p-6">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Sensor Chart</p>
          <h3 className="mt-2 text-2xl font-semibold text-white">Temperature & Humidity</h3>
        </div>
        <div className="flex gap-2">
          {(["1h", "6h", "24h"] as TimeRange[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={`rounded-2xl px-3 py-1.5 text-xs font-semibold transition ${
                range === r
                  ? "bg-slate-700 text-white"
                  : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-52 items-center justify-center text-sm text-slate-500">
          Loading chart data…
        </div>
      ) : chartData.length === 0 ? (
        <div className="flex h-52 items-center justify-center text-sm text-slate-500">
          No data in the last {range}.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={chartData} margin={{ top: 5, right: 10, left: -15, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis
              dataKey="time"
              tick={{ fill: "#64748b", fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: "#1e293b" }}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fill: "#64748b", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#0f172a",
                border: "1px solid #1e293b",
                borderRadius: "12px",
                fontSize: 12,
              }}
              labelStyle={{ color: "#94a3b8", fontSize: 11 }}
              itemStyle={{ fontSize: 12 }}
            />
            <Legend wrapperStyle={{ fontSize: 12, color: "#94a3b8", paddingTop: 12 }} />
            <Line
              type="monotone"
              dataKey="temperature"
              stroke="#f97316"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
              name="Temperature (°C)"
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="humidity"
              stroke="#38bdf8"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
              name="Humidity (%)"
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
