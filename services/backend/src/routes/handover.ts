import { Router } from "express";
import {
  authenticateToken,
  requireRoles,
} from "../middlewares/authMiddleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  handoverReportController,
  exportPDFController,
  handoverAcknowledgementController,
  handoverHistoryController,
} from "../controllers/handover.controller.js";

const router = Router();

/**
 * GET /api/projects/:projectId/handover
 * Stage 5 Handover View: Role-gated handover report with citations & badges
 */
router.get(
  "/:projectId/handover",
  authenticateToken,
  requireRoles(["leader", "incoming"]),
  asyncHandler(handoverReportController),
);

/**
 * GET /api/projects/:projectId/handover/export-pdf
 * Stage 5 Export: Streams citation-linked ReportLab PDF from analytics-service
 */
router.get(
  "/:projectId/handover/export-pdf",
  authenticateToken,
  requireRoles(["leader", "incoming"]),
  asyncHandler(exportPDFController),
);

/**
 * POST /api/projects/:projectId/handover/acknowledge
 * Stage 5 Receipt: Incoming member acknowledges receipt of verified handover
 */
router.post(
  "/:projectId/handover/acknowledge",
  authenticateToken,
  requireRoles(["incoming"]),
  asyncHandler(handoverAcknowledgementController),
);

/**
 * GET /api/projects/:projectId/handover/history
 * Retrieves version snapshots and incoming member acknowledgement logs
 */
router.get(
  "/:projectId/handover/history",
  authenticateToken,
  requireRoles(["leader", "incoming"]),
  asyncHandler(handoverHistoryController),
);

export default router;
