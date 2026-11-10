import { Router } from "express";
import { z } from "zod";
import {
  authenticateToken,
  requireRoles,
} from "../middlewares/authMiddleware.js";
import { validateBody } from "../middlewares/validate.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  inspectFindingsController,
  leaderEditFindingsController,
  approveCandidateFindingsController,
  rejectCandidateFindingsController,
  reconstructFindingsController,
} from "../controllers/findings.controller.js";

const router = Router();

const updateFindingSchema = z.object({
  claim: z.string().optional(),
  category: z.enum(["decision", "task", "blocker", "dependency"]).optional(),
  review_status: z.enum(["pending", "approved", "rejected"]).optional(),
});

/**
 * @name : Inspect Candidate Findings API
 * @route : GET /api/projects/:projectId/findings
 * @access : Protected (requires valid JWT via `authenticateToken` and role `"leader"` or `"outgoing"` via `requireRoles`; `"incoming"` receives `403`)
 * @description : Retrieves all reconstructed candidate findings for a project prior to or during review.
 *   1. Enforces authentication (`401`) and the Stage 2/3 isolation gate (`403` for `"incoming"` users).
 *   2. Queries MongoDB (`Finding.find({ projectId }).sort({ createdAt: -1 })`) to return all findings
 *      scoped to `projectId`, ordered newest first.
 *   3. Responds with `200 OK` containing `{ success: true, data: findings }`.
 */
router.get(
  "/:projectId/findings",
  authenticateToken,
  requireRoles(["leader", "outgoing"]),
  asyncHandler(inspectFindingsController),
);

/**
 * @name : Edit Candidate Finding API
 * @route : PATCH /api/projects/:projectId/findings/:findingId
 * @access : Protected (requires valid JWT via `authenticateToken` and `"leader"` role via `requireRoles`; body validated via `updateFindingSchema`)
 * @description : Allows a project leader to update properties or review status of a candidate finding.
 *   1. Request body (`claim`, `category`, `review_status`) is validated by `validateBody(updateFindingSchema)`
 *      (returns `400` with field-level `errors` if invalid).
 *   2. Looks up the finding in MongoDB scoped by `{ _id: findingId, projectId }`; returns `404 Not Found` if missing.
 *   3. Applies updated `claim` and/or `category` when provided. If `review_status` is provided, updates
 *      `review_status` and stamps `reviewedBy` (`req.user.userId`) and `reviewedAt` (`new Date()`), then saves.
 *   4. If `review_status === "approved"`, updates the parent `Project` by setting
 *      `readinessChecklist.decisionsBackedByEvidence = true`.
 *   5. Responds with `200 OK` containing `{ success: true, message: "Finding updated successfully", data: finding }`.
 */
router.patch(
  "/:projectId/findings/:findingId",
  authenticateToken,
  requireRoles(["leader"]),
  validateBody(updateFindingSchema),
  asyncHandler(leaderEditFindingsController),
);

/**
 * @name : Approve Candidate Finding API
 * @route : POST /api/projects/:projectId/findings/:findingId/approve
 * @access : Protected (requires valid JWT via `authenticateToken` and `"leader"` role via `requireRoles`)
 * @description : Marks a candidate finding as approved for inclusion in the handover candidate set.
 *   1. Looks up the finding in MongoDB scoped by `{ _id: findingId, projectId }`; returns `404 Not Found` if missing.
 *   2. Sets `review_status = "approved"`, `reviewedBy = req.user.userId`, and `reviewedAt = new Date()`, then saves.
 *   3. Updates the parent `Project` document by setting `readinessChecklist.decisionsBackedByEvidence = true`.
 *   4. Responds with `200 OK` containing `{ success: true, message, data: finding }`.
 */
router.post(
  "/:projectId/findings/:findingId/approve",
  authenticateToken,
  requireRoles(["leader"]),
  asyncHandler(approveCandidateFindingsController),
);

/**
 * @name : Reject Candidate Finding API
 * @route : POST /api/projects/:projectId/findings/:findingId/reject
 * @access : Protected (requires valid JWT via `authenticateToken` and `"leader"` role via `requireRoles`)
 * @description : Marks a candidate finding as rejected so it is excluded from the final handover.
 *   1. Looks up the finding in MongoDB scoped by `{ _id: findingId, projectId }`; returns `404 Not Found` if missing.
 *   2. Sets `review_status = "rejected"`, `reviewedBy = req.user.userId`, and `reviewedAt = new Date()`, then saves.
 *   3. Responds with `200 OK` containing `{ success: true, message: "Finding marked as rejected", data: finding }`.
 */
router.post(
  "/:projectId/findings/:findingId/reject",
  authenticateToken,
  requireRoles(["leader"]),
  asyncHandler(rejectCandidateFindingsController),
);

/**
 * @name : Reconstruct Findings API
 * @route : POST /api/projects/:projectId/reconstruct
 * @access : Protected (requires valid JWT via `authenticateToken` and `"leader"` role via `requireRoles`)
 * @description : Stage 2 trigger that invokes AI extraction and deterministic 4-state evidence verification.
 *   1. Verifies the target project exists via `Project.findById(projectId)`; returns `404 Not Found` if missing.
 *   2. Calls `pythonBridge.triggerExtractionAndVerify(projectId)` (`POST /internal/extract-and-verify` on
 *      `ai-engine`, 120s timeout) to run LLM claim extraction, deterministic substring verification,
 *      freshness calculation, and gap question generation.
 *   3. Responds with `200 OK` containing `{ success: true, message, data: result }`.
 */
router.post(
  "/:projectId/reconstruct",
  authenticateToken,
  requireRoles(["leader"]),
  asyncHandler(reconstructFindingsController),
);

export default router;
