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
 * GET /api/projects/:projectId/readiness
 * Retrieves the 7-point readiness checklist and current status
 */
router.get(
  "/:projectId/readiness",
  authenticateToken,
  asyncHandler(readinessController),
);

/**
 * GET /api/projects/:projectId/risk-map
 * Stage 2 Risk Analysis: Retrieves Contribution Concentration Risk Map computed by analytics-service
 */
router.get(
  "/:projectId/risk-map",
  authenticateToken,
  requireRoles(["leader", "outgoing"]),
  asyncHandler(riskMapController),
);

/**
 * POST /api/projects/:projectId/readiness/evaluate
 * Triggers analytics-service to evaluate risk & update readiness
 */
router.post(
  "/:projectId/readiness/evaluate",
  authenticateToken,
  requireRoles(["leader"]),
  asyncHandler(readinessEvaluateController),
);

/**
 * POST /api/projects/:projectId/readiness/sign-off
 * Leader only: signs off on the 7-point Handover Readiness Checklist,
 * transitioning the workspace into 'Approved for Sharing'.
 */
router.post(
  "/:projectId/readiness/sign-off",
  authenticateToken,
  requireRoles(["leader"]),
  validateBody(signOffSchema),
  asyncHandler(readinessSignOffController),
);

export default router;
