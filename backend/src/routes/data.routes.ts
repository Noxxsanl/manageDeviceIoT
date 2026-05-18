import { Router, Request, Response } from "express";
import { validateDevice } from "../middleware/validateDevice";

const router = Router();

// POST /api/device/data
// Uses 2-level HMAC auth (Gateway → Sensor) via validateDevice middleware
router.post("/", validateDevice, (req: Request, res: Response) => {
  const gateway = (req as any).gateway;
  const sensor = (req as any).sensor;

  res.status(200).json({
    success: true,
    message: "Auth OK – data ingestion will be implemented in Task 6",
    gateway_id: gateway.device_id,
    sensor_id: sensor.device_id,
  });
});

export default router;
