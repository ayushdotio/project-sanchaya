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
 * GET /api/projects/:projectId/findings
 * Isolation Gate: Only leader and outgoing member may inspect candidate findings (incoming receives 403)
 */
router.get(
  "/:projectId/findings",
  authenticateToken,
  requireRoles(["leader", "outgoing"]),
  asyncHandler(inspectFindingsController),
);

/**
 * PATCH /api/projects/:projectId/findings/:findingId
 * Leader review: edit candidate finding properties
 */
router.patch(
  "/:projectId/findings/:findingId",
  authenticateToken,
  requireRoles(["leader"]),
  validateBody(updateFindingSchema),
  asyncHandler(leaderEditFindingsController),
);

/**
 * POST /api/projects/:projectId/findings/:findingId/approve
 * Leader action: marks candidate finding as approved for inclusion in handover
 */
router.post(
  "/:projectId/findings/:findingId/approve",
  authenticateToken,
  requireRoles(["leader"]),
  asyncHandler(approveCandidateFindingsController),
);

/**
 * POST /api/projects/:projectId/findings/:findingId/reject
 * Leader action: rejects candidate finding (excluded from final handover)
 */
router.post(
  "/:projectId/findings/:findingId/reject",
  authenticateToken,
  requireRoles(["leader"]),
  asyncHandler(rejectCandidateFindingsController),
);

/**
 * POST /api/projects/:projectId/reconstruct
 * Stage 2 Trigger: Triggers AI Engine extraction & deterministic 4-state verification
 */
router.post(
  "/:projectId/reconstruct",
  authenticateToken,
  requireRoles(["leader"]),
  asyncHandler(reconstructFindingsController),
);

export default router;
