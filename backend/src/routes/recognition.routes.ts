import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import {
  logRecognitionEvent,
  getRecognitionLogs,
  getStats,
} from "../controllers/recognition.controller";

const router: Router = Router();

/**
 * POST   /api/recognition/event      → Log a recognition event
 * GET    /api/recognition/logs       → Paginated attendance log
 * GET    /api/recognition/stats      → Dashboard statistics
 */

router.post("/event", asyncHandler(logRecognitionEvent));
router.get("/logs", asyncHandler(getRecognitionLogs));
router.get("/stats", asyncHandler(getStats));

export default router;
