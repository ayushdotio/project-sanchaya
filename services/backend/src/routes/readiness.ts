import { Router } from "express";
import { z } from "zod";
import {
  authenticateToken,
  requireRoles,
} from "../middlewares/authMiddleware.js";
import { validateBody } from "../middlewares/validate.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  readinessController,
  riskMapController,
  readinessEvaluateController,
  readinessSignOffController,
} from "../controllers/readiness.controller.js";

const router = Router();

const signOffSchema = z.object({
  checklistUpdates: z
    .object({
      sourcesVerified: z.boolean().optional(),
      decisionsBackedByEvidence: z.boolean().optional(),
      unfinishedTasksAssignedOrUnknown: z.boolean().optional(),
      blockersIdentified: z.boolean().optional(),
      conflictsDisclosed: z.boolean().optional(),
      recipientPermissionsChecked: z.boolean().optional(),
    })
    .optional(),
});

/**
 * @name : Get Readiness Status API
 * @route : GET /api/projects/:projectId/readiness
 * @access : Protected (requires valid JWT via `authenticateToken`)
 * @description : Retrieves the 7-point handover readiness checklist and approval status for a project.
 *   1. Queries `Project.findById(projectId)` projecting `name`, `readinessChecklist`, `readinessStatus`,
 *      `approvedBy`, and `approvedAt`, and populates `approvedBy` with `name` and `email`.
 *   2. Returns `404 Not Found` if no project matches `projectId`.
 *   3. Responds with `200 OK` containing `{ success: true, data: { readinessStatus, checklist, approvedBy, approvedAt } }`.
 */
router.get(
  "/:projectId/readiness",
  authenticateToken,
  asyncHandler(readinessController),
);

/**
 * @name : Get Contribution Risk Map API
 * @route : GET /api/projects/:projectId/risk-map
 * @access : Protected (requires valid JWT via `authenticateToken` and role `"leader"` or `"outgoing"` via `requireRoles`; `"incoming"` receives `403`)
 * @description : Stage 2/4 risk analysis endpoint returning the Contribution Concentration Risk Map.
 *   1. Verifies the project exists via `Project.findById(projectId)`; returns `404 Not Found` if missing.
 *   2. Calls `pythonBridge.computeRiskAndReadiness(projectId)` (`POST /internal/compute-risk-and-readiness`
 *      on `analytics-service`, 30s timeout).
 *   3. Responds with `200 OK` containing `{ success: true, data: riskData.riskSummary || riskData }`.
 */
router.get(
  "/:projectId/risk-map",
  authenticateToken,
  requireRoles(["leader", "outgoing"]),
  asyncHandler(riskMapController),
);

/**
 * @name : Evaluate Readiness API
 * @route : POST /api/projects/:projectId/readiness/evaluate
 * @access : Protected (requires valid JWT via `authenticateToken` and `"leader"` role via `requireRoles`)
 * @description : Triggers `analytics-service` to compute contribution concentration risk and evaluate the 7-point checklist.
 *   1. Calls `pythonBridge.computeRiskAndReadiness(projectId)` (`POST /internal/compute-risk-and-readiness`
 *      on `analytics-service`, 30s timeout).
 *   2. Responds with `200 OK` containing `{ success: true, message: "Readiness evaluated via Analytics Service", data: result }`.
 */
router.post(
  "/:projectId/readiness/evaluate",
  authenticateToken,
  requireRoles(["leader"]),
  asyncHandler(readinessEvaluateController),
);

/**
 * @name : Leader Readiness Sign-Off API
 * @route : POST /api/projects/:projectId/readiness/sign-off
 * @access : Protected (requires valid JWT via `authenticateToken` and `"leader"` role via `requireRoles`; body validated via `signOffSchema`)
 * @description : Records leader sign-off on the 7-point Handover Readiness Checklist and transitions workspace state.
 *   1. Request body (optional `checklistUpdates` boolean overrides for the 6 non-leader checklist items)
 *      is validated by `validateBody(signOffSchema)` (`400` on invalid input).
 *   2. Looks up the project via `Project.findById(projectId)`; returns `404 Not Found` if missing.
 *   3. Applies any `checklistUpdates` to `project.readinessChecklist` and sets `leaderApprovalRecorded = true`.
 *   4. Verifies all 7 checklist items are `true`:
 *      - If any item is `false`, sets `readinessStatus = "Ready for Review"`, saves, and returns `400 Bad Request`
 *        with the current `readinessStatus` and `checklist`.
 *      - If all 7 pass, sets `readinessStatus = "Approved for Sharing"`, records `approvedBy = req.user.userId`
 *        and `approvedAt = new Date()`, saves, and responds with `200 OK`.
 */
router.post(
  "/:projectId/readiness/sign-off",
  authenticateToken,
  requireRoles(["leader"]),
  validateBody(signOffSchema),
  asyncHandler(readinessSignOffController),
);

export default router;
