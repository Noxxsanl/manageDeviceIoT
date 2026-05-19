"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { generateDeviceCredentials } from "@/lib/deviceGenerator";
import { DeviceCredentialModal } from "./DeviceCredentialModal";
import { useAddDevice } from "@/contexts/AddDeviceContext";

const mockGateways = ["Gateway A", "Gateway B", "Gateway C"];

interface AddDeviceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const fieldLabelClass = "mb-1.5 block text-sm font-medium text-slate-200";
const selectClass =
  "h-10 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30";

export function AddDeviceModal({ isOpen, onClose }: AddDeviceModalProps) {
  const { onDeviceAdded } = useAddDevice();
  const [name, setName] = useState("");
  const [type, setType] = useState<"sensor" | "gateway">("sensor");
  const [location, setLocation] = useState("");
  const [gateway, setGateway] = useState("");
  const [credentials, setCredentials] = useState<{ deviceId: string; secretKey: string } | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const creds = generateDeviceCredentials(type);
    setCredentials(creds);

    // Create new device object
    const newDevice = {
      id: Date.now().toString(), // Simple ID generation
      deviceId: creds.deviceId,
      name: name.trim(),
      status: "offline" as const,
      role: type,
      token: creds.secretKey,
      securityStatus: "Normal" as const,
      lastSeen: "Never",
      firmwareVersion: "v1.0.0",
      gateway: type === "sensor" ? gateway : "N/A",
      isUnderAttack: false,
      metrics: {
        temperature: 0,
        humidity: 0,
        battery: 100,
        signalStrength: 0,
        dataSentToday: "0GB",
        uptime: "0d 00h",
      },
    };

    onDeviceAdded?.(newDevice);
    console.log("Device created successfully");
    onClose();
    // Reset form
    setName("");
    setType("sensor");
    setLocation("");
    setGateway("");
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-106.25">
          <DialogHeader>
            <DialogTitle>Add New Device</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="name" className={fieldLabelClass}>Device Name</label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter device name"
                className="border-slate-700 bg-slate-900 text-slate-100 placeholder:text-slate-500 focus-visible:ring-blue-500"
                required
              />
            </div>
            <div>
              <label htmlFor="type" className={fieldLabelClass}>Device Type</label>
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
              <label htmlFor="location" className={fieldLabelClass}>Location</label>
              <Input
                id="location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Enter location"
                className="border-slate-700 bg-slate-900 text-slate-100 placeholder:text-slate-500 focus-visible:ring-blue-500"
              />
            </div>
            {type === "sensor" && (
              <div>
                <label htmlFor="gateway" className={fieldLabelClass}>Gateway Selection</label>
                <select
                  id="gateway"
                  value={gateway}
                  onChange={(e) => setGateway(e.target.value)}
                  className={selectClass}
                >
                  {mockGateways.map((gw) => (
                    <option key={gw} value={gw}>
                      {gw}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex justify-end space-x-2">
              <Button
                type="button"
                variant="outline"
                className="border-slate-700 bg-slate-900 text-200 hover:bg-slate-800"
                onClick={onClose}
              >
                Cancel
              </Button>
              <Button type="submit">Create Device</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      {credentials && (
        <DeviceCredentialModal
          deviceId={credentials.deviceId}
          secretKey={credentials.secretKey}
          onClose={() => setCredentials(null)}
        />
      )}
    </>
  );
}
