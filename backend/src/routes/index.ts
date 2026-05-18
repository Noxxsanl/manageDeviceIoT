import { Router } from "express";
import authRoutes from "./auth";
import dataRoutes from "./data.routes";
import deviceRoutes from "./devices";
import healthRoutes from "./health.routes";

const router = Router();

router.use("/health", healthRoutes);
router.use("/auth", authRoutes);
router.use("/devices", deviceRoutes);
router.use("/device/data", dataRoutes);

export default router;
