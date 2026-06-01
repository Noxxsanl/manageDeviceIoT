"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import api, { FetchError } from "@/lib/api";
import { RegisterModal } from "@/components/device/RegisterModal";
import type { RegisterDeviceResponse } from "@/types/api";

const fieldLabelClass = "mb-1.5 block text-sm font-medium text-slate-300";
const inputClass =
  "h-10 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30";
const inputErrorClass =
  "h-10 w-full rounded-xl border border-red-500 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-red-500 focus:ring-2 focus:ring-red-500/30";
const selectClass =
  "h-10 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30";

export default function NewDevicePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [type, setType] = useState<"sensor" | "gateway">("sensor");
  const [location, setLocation] = useState("");
  const [nameError, setNameError] = useState("");
  const [apiError, setApiError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [credentials, setCredentials] = useState<{
    device_id: string;
    secret_key: string;
  } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setNameError("");
    setApiError("");

    if (!name.trim()) {
      setNameError("Tên thiết bị không được để trống.");
      return;
    }

    setSubmitting(true);
    try {
      const { data } = await api.post<RegisterDeviceResponse>(
        "/api/devices/register",
        {
          device_name: name.trim(),
          device_type: type,
          location: location.trim() || undefined,
        }
      );
      setCredentials({ device_id: data.device_id, secret_key: data.secret_key });
    } catch (err: unknown) {
      const msg =
        err instanceof FetchError
          ? ((err.data as { error?: string })?.error ?? "Đã có lỗi xảy ra. Vui lòng thử lại.")
          : "Đã có lỗi xảy ra. Vui lòng thử lại.";
      setApiError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-5rem)] w-full">
      <div className="mb-6">
        <Link
          href="/devices"
          className="inline-flex items-center gap-2 text-sm text-slate-400 transition hover:text-slate-200"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Fleet registry
        </Link>
      </div>

      <div className="mb-8">
        <p className="text-sm uppercase tracking-[0.3em] text-slate-400">Devices</p>
        <h1 className="text-4xl font-semibold text-white">Register new device</h1>
        <p className="mt-2 text-slate-400">
          Đăng ký thiết bị mới vào hệ thống. Credentials chỉ hiển thị một lần duy nhất.
        </p>
      </div>

      <div className="max-w-lg">
        <div className="rounded-[2rem] border border-slate-800 bg-slate-950/95 p-8 shadow-lg shadow-slate-950/20">
          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            <div>
              <label htmlFor="name" className={fieldLabelClass}>
                Tên thiết bị <span className="text-red-400">*</span>
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (nameError) setNameError("");
                }}
                placeholder="Nhập tên thiết bị"
                className={nameError ? inputErrorClass : inputClass}
              />
              {nameError && (
                <p className="mt-1.5 text-xs text-red-400">{nameError}</p>
              )}
            </div>

            <div>
              <label htmlFor="type" className={fieldLabelClass}>
                Loại thiết bị <span className="text-red-400">*</span>
              </label>
              <select
                id="type"
                value={type}
                onChange={(e) => setType(e.target.value as "sensor" | "gateway")}
                className={selectClass}
              >
                <option value="sensor">Sensor</option>
                <option value="gateway">Gateway</option>
              </select>
            </div>

            <div>
              <label htmlFor="location" className={fieldLabelClass}>
                Vị trí
              </label>
              <input
                id="location"
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Nhập vị trí thiết bị (tuỳ chọn)"
                className={inputClass}
              />
            </div>

            {apiError && (
              <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {apiError}
              </p>
            )}

            <div className="flex items-center gap-3 pt-2">
              <Link
                href="/devices"
                className="rounded-2xl border border-slate-700 px-5 py-2.5 text-sm font-semibold text-slate-300 transition hover:bg-slate-800"
              >
                Huỷ
              </Link>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-2xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? "Đang đăng ký…" : "Đăng ký thiết bị"}
              </button>
            </div>
          </form>
        </div>
      </div>

      {credentials && (
        <RegisterModal
          deviceId={credentials.device_id}
          secretKey={credentials.secret_key}
          onClose={() => router.push("/devices")}
        />
      )}
    </div>
  );
}
