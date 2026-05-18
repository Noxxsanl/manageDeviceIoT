import pool from "../config/db";

export async function log(
  event_type: string,
  device_id: number | null,
  ip: string | null,
  user_agent: string | null,
  details: Record<string, unknown> | null
): Promise<void> {
  try {
    await pool.execute(
      `INSERT INTO audit_log (event_type, device_id, ip_address, user_agent, details)
       VALUES (?, ?, ?, ?, ?)`,
      [event_type, device_id ?? null, ip ?? null, user_agent ?? null, details ? JSON.stringify(details) : null]
    );
  } catch {
    // audit logging must never crash the main flow
  }
}
