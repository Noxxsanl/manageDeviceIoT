import { Router } from "express";
import authRoutes from "./auth";
import auditRoutes from "./audit";
import dashboardRoutes from "./dashboard";
import dataRoutes from "./data.routes";
import deviceRoutes from "./devices";
import healthRoutes from "./health.routes";
import notificationRoutes from "./notifications";
import sensorsRoutes from "./sensors.routes";
import userRoutes from "./users";

const router = Router();

router.use("/health", healthRoutes);
router.use("/auth", authRoutes);
router.use("/devices", deviceRoutes);
router.use("/device/data", dataRoutes);
router.use("/device/sensors", sensorsRoutes);
router.use("/dashboard", dashboardRoutes);
router.use("/audit-log", auditRoutes);
router.use("/users", userRoutes);
router.use("/notifications", notificationRoutes);

export default router;
