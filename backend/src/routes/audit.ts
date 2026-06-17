import { Router, Request, Response } from "express";
import pool from "../config/db";
import { verifyJWT } from "../middleware/verifyJWT";

const router = Router();

// DELETE /api/audit-log/data-recv – xóa toàn bộ log DATA_RECV (admin/operator only)
router.delete("/data-recv", verifyJWT, async (req: Request, res: Response): Promise<void> => {
  const user = (req as any).user as { role: string };
  if (user.role === "viewer") {
    res.status(403).json({ error: "FORBIDDEN" });
    return;
  }
  const [result] = await (pool as any).execute(
    "DELETE FROM audit_log WHERE event_type = 'DATA_RECV'"
  );
  res.json({ success: true, deleted: result.affectedRows });
});

// GET /api/audit-log  – filter by event_type, device_id, from, to; sorted DESC
router.get("/", verifyJWT, async (req: Request, res: Response): Promise<void> => {
  const { event_type, device_id, from, to } = req.query;

  const conditions: string[] = [];
  const params: (string | number | Date)[] = [];

  if (event_type && typeof event_type === "string") {
    conditions.push("a.event_type = ?");
    params.push(event_type);
  }
  if (device_id) {
    const id = Number(device_id);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ error: "INVALID_DEVICE_ID" });
      return;
    }
    conditions.push("a.device_id = ?");
    params.push(id);
  }
  if (from && typeof from === "string") {
    const date = new Date(from);
    if (isNaN(date.getTime())) {
      res.status(400).json({ error: "INVALID_FROM_DATE" });
      return;
    }
    conditions.push("a.created_at >= ?");
    params.push(date);
  }
  if (to && typeof to === "string") {
    const date = new Date(to);
    if (isNaN(date.getTime())) {
      res.status(400).json({ error: "INVALID_TO_DATE" });
      return;
    }
    conditions.push("a.created_at <= ?");
    params.push(date);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const sql = `
    SELECT
      a.id,
      a.event_type,
      a.device_id,
      d.device_id  AS device_identifier,
      d.device_name,
      a.ip_address,
      d.last_ip    AS device_ip,
      a.user_agent,
      a.details,
      a.created_at
    FROM audit_log a
    LEFT JOIN devices d ON a.device_id = d.id
    ${where}
    ORDER BY a.created_at DESC
    LIMIT 500
  `;

  const [rows] = await (pool as any).query(sql, params);

  res.json({ audit_log: rows });
});

export default router;
