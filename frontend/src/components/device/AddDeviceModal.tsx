"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";
import { X } from "lucide-react";
import api, { FetchError } from "@/lib/api";
import { RegisterModal } from "@/components/device/RegisterModal";
import type { RegisterDeviceResponse } from "@/types/api";

interface AddDeviceModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const inputBase =
  "h-10 w-full rounded-xl border bg-slate-950 px-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 transition";

export function AddDeviceModal({ open, onClose, onSuccess }: AddDeviceModalProps) {
  const { mutate } = useSWRConfig();
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

  if (!open) return null;

  function reset() {
    setName("");
    setType("sensor");
    setLocation("");
    setNameError("");
    setApiError("");
    setSubmitting(false);
    setCredentials(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setNameError("");
    setApiError("");
    if (!name.trim()) {
      setNameError("Tên thiết bị không được để trống.");
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await api.post<RegisterDeviceResponse>("/api/devices/register", {
        device_name: name.trim(),
        device_type: type,
        location: location.trim() || undefined,
      });
      setCredentials({ device_id: data.device.device_id, secret_key: data.device.secret_key });
    } catch (err: unknown) {
      const msg =
        err instanceof FetchError
          ? ((err.data as { error?: string })?.error ?? "Đã có lỗi xảy ra.")
          : "Đã có lỗi xảy ra.";
      setApiError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  function handleCredentialClose() {
    mutate("/api/devices");
    reset();
    onClose();
    onSuccess?.();
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={handleClose}
        />
        <div className="relative z-10 w-full max-w-md rounded-4xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Register new device</h2>
            <button
              type="button"
              onClick={handleClose}
              className="rounded-xl p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-white"
            >
              <X size={18} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <label htmlFor="add-name" className="mb-1.5 block text-sm font-medium text-slate-300">
                Tên thiết bị <span className="text-red-400">*</span>
              </label>
              <input
                id="add-name"
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (nameError) setNameError("");
                }}
                placeholder="Nhập tên thiết bị"
                className={`${inputBase} ${
                  nameError
                    ? "border-red-500 focus:ring-2 focus:ring-red-500/30"
                    : "border-slate-700 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
                }`}
              />
              {nameError && <p className="mt-1.5 text-xs text-red-400">{nameError}</p>}
            </div>

            <div>
              <label htmlFor="add-type" className="mb-1.5 block text-sm font-medium text-slate-300">
                Loại thiết bị
              </label>
              <select
                id="add-type"
                value={type}
                onChange={(e) => setType(e.target.value as "sensor" | "gateway")}
                className="h-10 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
              >
                <option value="sensor">Sensor</option>
                <option value="gateway">Gateway</option>
              </select>
            </div>

            <div>
              <label htmlFor="add-location" className="mb-1.5 block text-sm font-medium text-slate-300">
                Vị trí
              </label>
              <input
                id="add-location"
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Nhập vị trí thiết bị (tuỳ chọn)"
                className={`${inputBase} border-slate-700 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20`}
              />
            </div>

            {apiError && (
              <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {apiError}
              </p>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={handleClose}
                className="rounded-2xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:bg-slate-800"
              >
                Huỷ
              </button>
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
          onClose={handleCredentialClose}
        />
      )}
    </>
  );
}
