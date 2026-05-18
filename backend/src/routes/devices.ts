import crypto from "crypto";
import { Router, Request, Response } from "express";
import pool from "../config/db";
import { verifyJWT } from "../middleware/verifyJWT";
import { requireRole } from "../middleware/rbac";
import { log } from "../services/auditLogger";

const router = Router();

// POST /api/devices/register  – admin or operator only
router.post(
  "/register",
  verifyJWT,
  requireRole("admin", "operator"),
  async (req: Request, res: Response): Promise<void> => {
    const { device_name, device_type, location } = req.body ?? {};

    if (!device_name || !device_type) {
      res.status(400).json({ error: "MISSING_FIELDS" });
      return;
    }

    if (device_type !== "sensor" && device_type !== "gateway") {
      res.status(400).json({ error: "INVALID_DEVICE_TYPE" });
      return;
    }

    const suffix = crypto.randomBytes(4).toString("hex").toUpperCase();
    const typeTag = device_type === "sensor" ? "SN" : "GW";
    const device_id = `ESP32-${typeTag}-${suffix}`;
    const secret_key = crypto.randomBytes(32).toString("hex");

    const user = (req as any).user;
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0].trim() ?? req.socket.remoteAddress ?? null;
    const user_agent = req.headers["user-agent"] ?? null;

    const [result] = await pool.execute<any>(
      `INSERT INTO devices (device_id, device_name, device_type, secret_key, status, location, fail_count, created_by)
       VALUES (?, ?, ?, ?, 'inactive', ?, 0, ?)`,
      [device_id, device_name, device_type, secret_key, location ?? null, user.id]
    );

    const insertedId = (result as any).insertId;

    await log("DEVICE_REGISTER", insertedId, ip, user_agent, {
      device_id,
      device_name,
      device_type,
      registered_by: user.username,
    });

    // Return credentials exactly once – secret_key is never returned again
    res.status(201).json({
      success: true,
      device: {
        id: insertedId,
        device_id,
        device_name,
        device_type,
        location: location ?? null,
        status: "inactive",
        secret_key,
      },
    });
  }
);

// GET /api/devices  – any authenticated user
router.get("/", verifyJWT, async (_req: Request, res: Response): Promise<void> => {
  const [rows] = await pool.execute<any[]>(
    `SELECT
       d.id,
       d.device_id,
       d.device_name,
       d.device_type,
       d.status,
       d.location,
       d.fail_count,
       d.last_seen,
       d.created_at,
       CASE
         WHEN d.last_seen IS NOT NULL AND TIMESTAMPDIFF(SECOND, d.last_seen, NOW()) < 60
         THEN TRUE ELSE FALSE
       END AS is_online
     FROM devices d
     ORDER BY d.created_at DESC`
  );
  res.json({ devices: rows });
});

// GET /api/devices/:id  – any authenticated user
router.get("/:id", verifyJWT, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  const [deviceRows] = await pool.execute<any[]>(
    `SELECT
       d.id,
       d.device_id,
       d.device_name,
       d.device_type,
       d.status,
       d.location,
       d.fail_count,
       d.last_seen,
       d.created_at,
       CASE
         WHEN d.last_seen IS NOT NULL AND TIMESTAMPDIFF(SECOND, d.last_seen, NOW()) < 60
         THEN TRUE ELSE FALSE
       END AS is_online
     FROM devices d
     WHERE d.id = ?`,
    [id]
  );

  if (!deviceRows.length) {
    res.status(404).json({ error: "DEVICE_NOT_FOUND" });
    return;
  }

  const [dataRows] = await pool.execute<any[]>(
    `SELECT id, device_id, gateway_id, payload, received_at
     FROM sensor_data
     WHERE device_id = ?
     ORDER BY received_at DESC
     LIMIT 10`,
    [id]
  );

  res.json({ device: deviceRows[0], recent_data: dataRows });
});

// PATCH /api/devices/:id/status  – admin or operator only
router.patch(
  "/:id/status",
  verifyJWT,
  requireRole("admin", "operator"),
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const { status } = req.body ?? {};

    if (!status || !["active", "blocked", "inactive"].includes(status)) {
      res.status(400).json({ error: "INVALID_STATUS" });
      return;
    }

    const [deviceRows] = await pool.execute<any[]>(
      "SELECT id, device_id FROM devices WHERE id = ?",
      [id]
    );

    if (!deviceRows.length) {
      res.status(404).json({ error: "DEVICE_NOT_FOUND" });
      return;
    }

    await pool.execute("UPDATE devices SET status = ? WHERE id = ?", [status, id]);

    const user = (req as any).user;
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0].trim() ?? req.socket.remoteAddress ?? null;
    const user_agent = req.headers["user-agent"] ?? null;

    await log("DEVICE_STATUS_CHANGE", Number(id), ip, user_agent, {
      device_id: deviceRows[0].device_id,
      new_status: status,
      changed_by: user.username,
    });

    res.json({ success: true, id: Number(id), status });
  }
);

// DELETE /api/devices/:id  – admin only
router.delete(
  "/:id",
  verifyJWT,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;

    const [deviceRows] = await pool.execute<any[]>(
      "SELECT id, device_id, device_name FROM devices WHERE id = ?",
      [id]
    );

    if (!deviceRows.length) {
      res.status(404).json({ error: "DEVICE_NOT_FOUND" });
      return;
    }

    const device = deviceRows[0];

    // Cascade: delete child records before the device row
    await pool.execute("DELETE FROM sensor_data WHERE device_id = ?", [id]);
    await pool.execute("DELETE FROM device_tokens WHERE device_id = ?", [id]);
    await pool.execute("DELETE FROM devices WHERE id = ?", [id]);

    const user = (req as any).user;
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0].trim() ?? req.socket.remoteAddress ?? null;
    const user_agent = req.headers["user-agent"] ?? null;

    await log("DEVICE_DELETE", null, ip, user_agent, {
      deleted_device_id: device.device_id,
      device_name: device.device_name,
      deleted_by: user.username,
    });

    res.json({ success: true });
  }
);

export default router;
