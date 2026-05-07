import type { Device } from "@/types/device";
import DeviceCard from "@/components/DeviceCard";

type DeviceGridProps = {
  devices: Device[];
};

export default function DeviceGrid({ devices }: DeviceGridProps) {
  return (
    <section className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {devices.map((device) => (
        <DeviceCard key={device.id} device={device} />
      ))}
    </section>
  );
}
