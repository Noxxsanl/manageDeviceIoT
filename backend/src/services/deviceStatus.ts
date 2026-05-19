import pool from "../config/db";

// In-memory cache: updated every 30 seconds by the heartbeat monitor
let onlineDeviceIds = new Set<number>();

export function isOnline(lastSeen: Date | string | null): boolean {
  if (!lastSeen) return false;
  const diffSeconds = (Date.now() - new Date(lastSeen).getTime()) / 1000;
  return diffSeconds < 60;
}

export function isOnlineFromCache(deviceId: number): boolean {
  return onlineDeviceIds.has(deviceId);
}

export function getOnlineDeviceIds(): ReadonlySet<number> {
  return onlineDeviceIds;
}

async function tick(): Promise<void> {
  try {
    const [rows] = await pool.execute<any[]>(
      `SELECT id FROM devices
       WHERE last_seen IS NOT NULL AND TIMESTAMPDIFF(SECOND, last_seen, NOW()) < 60`
    );
    onlineDeviceIds = new Set(rows.map((r) => r.id));
  } catch {
    // never crash the main flow
  }
}

export function startHeartbeatMonitor(): void {
  tick();
  setInterval(tick, 30_000);
}
