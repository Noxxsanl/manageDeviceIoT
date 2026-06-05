"use client";

import { useState } from "react";
import { Copy, Check, AlertTriangle } from "lucide-react";

interface RegisterModalProps {
  deviceId: string;
  secretKey: string;
  onClose: () => void;
}

export function RegisterModal({ deviceId, secretKey, onClose }: RegisterModalProps) {
  const [copiedId, setCopiedId] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);

  const copy = async (text: string, which: "id" | "key") => {
    await navigator.clipboard.writeText(text);
    if (which === "id") {
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    } else {
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative z-10 w-full max-w-lg rounded-4xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
        <h2 className="text-xl font-semibold text-white">Device Credentials</h2>
        <p className="mt-1 text-sm text-slate-400">Thiết bị đã được đăng ký thành công.</p>

        <div className="mt-4 flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
          <p className="text-sm font-semibold text-red-300">
            Chỉ hiển thị 1 lần  Hãy lưu lại trước khi đóng!
          </p>
        </div>

        <div className="mt-5 space-y-4">
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
            <label className="block text-xs font-semibold uppercase tracking-widest text-slate-400">
              Device ID
            </label>
            <div className="mt-2 flex items-center gap-2">
              <code className="flex-1 break-all rounded-lg bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100">
                {deviceId}
              </code>
              <button
                type="button"
                onClick={() => copy(deviceId, "id")}
                className="flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:bg-slate-800"
              >
                {copiedId ? (
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                {copiedId ? "Copied" : "Copy"}
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
            <label className="block text-xs font-semibold uppercase tracking-widest text-slate-400">
              Secret Key
            </label>
            <div className="mt-2 flex items-center gap-2">
              <code className="flex-1 break-all rounded-lg bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100">
                {secretKey}
              </code>
              <button
                type="button"
                onClick={() => copy(secretKey, "key")}
                className="flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:bg-slate-800"
              >
                {copiedKey ? (
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                {copiedKey ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
          >
            Tôi đã lưu – Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
