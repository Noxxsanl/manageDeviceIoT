import { Router, Request, Response } from "express";
import pool from "../config/db";
import { verifyJWT } from "../middleware/verifyJWT";

const router = Router();

// GET /api/dashboard/stats
router.get("/stats", verifyJWT, async (_req: Request, res: Response): Promise<void> => {
  const [[counts]] = await pool.execute<any[]>(`
    SELECT
      COALESCE(SUM(device_type = 'gateway'), 0)                                                                        AS total_gateways,
      COALESCE(SUM(device_type = 'sensor'), 0)                                                                         AS total_sensors,
      COALESCE(SUM(device_type = 'gateway' AND last_seen IS NOT NULL AND TIMESTAMPDIFF(SECOND, last_seen, NOW()) < 60), 0) AS online_gateways,
      COALESCE(SUM(device_type = 'sensor'  AND last_seen IS NOT NULL AND TIMESTAMPDIFF(SECOND, last_seen, NOW()) < 60), 0) AS online_sensors
    FROM devices
  `);

  const [[dataCount]] = await pool.execute<any[]>(
    `SELECT COUNT(*) AS total_data_points FROM sensor_data`
  );

  res.json({
    total_gateways: Number(counts.total_gateways),
    total_sensors: Number(counts.total_sensors),
    online_gateways: Number(counts.online_gateways),
    online_sensors: Number(counts.online_sensors),
    total_data_points: Number(dataCount.total_data_points),
  });
});

export default router;
