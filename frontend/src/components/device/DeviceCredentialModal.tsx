"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface DeviceCredentialModalProps {
  deviceId: string;
  secretKey: string;
  onClose: () => void;
}

export function DeviceCredentialModal({ deviceId, secretKey, onClose }: DeviceCredentialModalProps) {
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    console.log(`${label} copied to clipboard`);
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-125">
        <DialogHeader>
          <DialogTitle>Device Credentials</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-4">
            <label className="block text-sm font-medium text-slate-200">Device ID</label>
            <div className="mt-2 flex items-center space-x-2">
              <code className="flex-1 rounded bg-slate-950 p-2 font-mono text-sm text-slate-100">
                {deviceId}
              </code>
              <Button
                size="sm"
                variant="outline"
                className="border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
                onClick={() => copyToClipboard(deviceId, "Device ID")}
              >
                Copy
              </Button>
            </div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-4">
            <label className="block text-sm font-medium text-slate-200">Secret Key</label>
            <div className="mt-2 flex items-center space-x-2">
              <code className="flex-1 rounded bg-slate-950 p-2 font-mono text-sm text-slate-100 break-all">
                {secretKey}
              </code>
              <Button
                size="sm"
                variant="outline"
                className="border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
                onClick={() => copyToClipboard(secretKey, "Secret Key")}
              >
                Copy
              </Button>
            </div>
          </div>
          <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-4">
            <p className="text-sm text-yellow-300">
              Warning: Save this secret key. It will not be shown again.
            </p>
          </div>
          <div className="flex justify-end">
            <Button onClick={onClose}>Close</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
