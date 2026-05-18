import { Router } from "express";
import healthRoutes from "./health.routes";
import dataRoutes from "./data.routes";

const router = Router();

router.use("/health", healthRoutes);
router.use("/device/data", dataRoutes);

export default router;
