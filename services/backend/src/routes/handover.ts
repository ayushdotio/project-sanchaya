import { Router } from "express";
import {
  authenticateToken,
  requireProjectMembership,
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
 * @name : Get Handover Report API
 * @route : GET /api/projects/:projectId/handover
 * @access : Protected (requires valid JWT via `authenticateToken` and role `"leader"` or `"incoming"` via `requireRoles`; `"incoming"` also requires `readinessStatus === "Approved for Sharing"` via `verifyHandoverAccess`)
 * @description : Stage 5 handover report endpoint returning approved findings and self-reported gap answers.
 *   1. Calls `verifyHandoverAccess` to confirm the project exists (`404` if missing) and enforce the
 *      `"Approved for Sharing"` gate for `"incoming"` users (`403` if not yet approved).
 *   2. Executes two concurrent MongoDB queries (`Promise.all`) scoped by `projectId`:
 *      - `Finding` with `review_status: "approved"`, sorted by `category` ascending and `createdAt` ascending.
 *      - `GapQuestion` with `status` in `["answered", "approved"]`, projecting `question`, `answer`,
 *        `evidence_badge`, and `answeredAt`.
 *   3. Responds with `200 OK` containing `{ success: true, data: { project, findings, gapAnswers } }`.
 */
router.get(
  "/:projectId/handover",
  authenticateToken,
  requireRoles(["leader", "incoming"]),
  requireProjectMembership,
  asyncHandler(handoverReportController),
);

/**
 * @name : Export Handover PDF API
 * @route : GET /api/projects/:projectId/handover/export-pdf
 * @access : Protected (requires valid JWT via `authenticateToken` and role `"leader"` or `"incoming"` via `requireRoles`; `"incoming"` also requires `readinessStatus === "Approved for Sharing"` via `verifyHandoverAccess`)
 * @description : Stage 5 PDF export endpoint that streams a citation-linked ReportLab handover report.
 *   1. Calls `verifyHandoverAccess` to verify the project exists (`404`) and enforce the
 *      `"Approved for Sharing"` gate for `"incoming"` users (`403`).
 *   2. Requests a binary stream from `analytics-service` via `pythonBridge.getPdfStream(projectId)`
 *      (`GET /internal/generate-pdf/:projectId`, 60s timeout).
 *   3. Sets `Content-Type: application/pdf` and `Content-Disposition: attachment; filename="sanchaya-handover-<projectId>.pdf"`,
 *      then pipes `pdfStreamResponse.data` directly to the HTTP response.
 */
router.get(
  "/:projectId/handover/export-pdf",
  authenticateToken,
  requireRoles(["leader", "incoming"]),
  requireProjectMembership,
  asyncHandler(exportPDFController),
);

/**
 * @name : Acknowledge Handover Receipt API
 * @route : POST /api/projects/:projectId/handover/acknowledge
 * @access : Protected (requires valid JWT via `authenticateToken` and `"incoming"` role via `requireRoles`; also requires `readinessStatus === "Approved for Sharing"` via `verifyHandoverAccess`)
 * @description : Stage 5 receipt endpoint allowing an incoming member to formally acknowledge handover.
 *   1. Calls `verifyHandoverAccess` to confirm the project exists (`404`) and is `"Approved for Sharing"` (`403` otherwise).
 *   2. Creates a `HandoverHistory` document recording `projectId`, `version`, `approvedSnapshot`
 *      (`projectName`, `approvedAt`, `readinessStatus`), `acknowledgedBy` (`req.user.userId`), and `acknowledgedAt`.
 *   3. Responds with `200 OK` containing `{ success: true, message: "Handover receipt successfully acknowledged.", data: receipt }`.
 */
router.post(
  "/:projectId/handover/acknowledge",
  authenticateToken,
  requireRoles(["incoming"]),
  requireProjectMembership,
  asyncHandler(handoverAcknowledgementController),
);

/**
 * @name : Get Handover History API
 * @route : GET /api/projects/:projectId/handover/history
 * @access : Protected (requires valid JWT via `authenticateToken` and role `"leader"` or `"incoming"` via `requireRoles`; `"incoming"` also requires `readinessStatus === "Approved for Sharing"` via `verifyHandoverAccess`)
 * @description : Retrieves immutable handover snapshots and incoming member acknowledgement logs for a project.
 *   1. Calls `verifyHandoverAccess` to verify the project exists (`404`) and enforce the
 *      `"Approved for Sharing"` gate for `"incoming"` users (`403`).
 *   2. Queries `HandoverHistory.find({ projectId })`, populates `acknowledgedBy` (`name`, `email`),
 *      and sorts by `createdAt` descending (newest first).
 *   3. Responds with `200 OK` containing `{ success: true, data: history }`.
 */
router.get(
  "/:projectId/handover/history",
  authenticateToken,
  requireRoles(["leader", "incoming"]),
  requireProjectMembership,
  asyncHandler(handoverHistoryController),
);

export default router;
