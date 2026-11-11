import { Router } from "express";
import { z } from "zod";
import {
  authenticateToken,
  requireProjectMembership,
  requireRoles,
} from "../middlewares/authMiddleware.js";
import { validateBody, validateParams, validateQuery } from "../middlewares/validate.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  inspectFindingsController,
  leaderEditFindingsController,
  reverifyFindingController,
  scanFindingsFreshnessController,
  approveCandidateFindingsController,
  rejectCandidateFindingsController,
  reconstructFindingsController,
} from "../controllers/findings.controller.js";

const router = Router();

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

const projectParamsSchema = z.object({
  projectId: z.string().regex(objectIdRegex, "Invalid projectId format"),
});

const findingParamsSchema = z.object({
  projectId: z.string().regex(objectIdRegex, "Invalid projectId format"),
  findingId: z.string().regex(objectIdRegex, "Invalid findingId format"),
});

const listFindingsQuerySchema = z.object({
  status: z
    .enum([
      "Supported",
      "Needs review",
      "Conflicting",
      "Unknown",
      "supported",
      "needs_review",
      "conflicting",
      "unknown",
    ])
    .optional(),
  verification_status: z
    .enum(["Supported", "Needs review", "Conflicting", "Unknown"])
    .optional(),
  category: z.enum(["decision", "task", "blocker", "dependency"]).optional(),
  review_status: z.enum(["pending", "approved", "rejected"]).optional(),
  source_id: z.string().trim().min(1).optional(),
  recheck: z.enum(["true", "false"]).optional(),
});

const updateFindingSchema = z
  .object({
    claim: z.string().trim().min(1).optional(),
    category: z.enum(["decision", "task", "blocker", "dependency"]).optional(),
    review_status: z.enum(["pending", "approved", "rejected"]).optional(),
    owner: z.string().trim().nullable().optional(),
    deadline: z.string().trim().nullable().optional(),
    rationale: z.string().trim().nullable().optional(),
    topic: z.string().trim().nullable().optional(),
    reverify: z.boolean().optional(),
  })
  .refine(
    (data) => Object.values(data).some((value) => value !== undefined),
    { message: "At least one field must be provided to update the finding." },
  );

const freshnessScanSchema = z
  .object({
    maxAgeDays: z.number().int().min(1).max(3650).optional(),
    limit: z.number().int().min(1).max(1000).optional(),
  })
  .optional()
  .default({});

const reconstructSchema = z
  .object({
    sourceIds: z.array(z.string().min(1)).optional(),
    sourceTypes: z.array(z.enum(["github", "document", "task"])).optional(),
  })
  .optional()
  .default({});

/**
 * @name : Inspect Candidate Findings API
 * @route : GET /api/projects/:projectId/findings
 * @access : Protected (requires valid JWT via `authenticateToken` and role `"leader"` or `"outgoing"` via `requireRoles`; `"incoming"` receives `403`)
 */
router.get(
  "/:projectId/findings",
  authenticateToken,
  requireRoles(["leader", "outgoing"]),
  requireProjectMembership,
  validateParams(projectParamsSchema),
  validateQuery(listFindingsQuerySchema),
  asyncHandler(inspectFindingsController),
);

/**
 * @name : Scan Findings Freshness API
 * @route : POST /api/projects/:projectId/findings/freshness-scan
 * @access : Protected (requires valid JWT via `authenticateToken` and `"leader"` role via `requireRoles`)
 */
router.post(
  "/:projectId/findings/freshness-scan",
  authenticateToken,
  requireRoles(["leader"]),
  requireProjectMembership,
  validateParams(projectParamsSchema),
  validateBody(freshnessScanSchema),
  asyncHandler(scanFindingsFreshnessController),
);

/**
 * @name : Edit Candidate Finding API
 * @route : PATCH /api/projects/:projectId/findings/:findingId
 * @access : Protected (requires valid JWT via `authenticateToken` and `"leader"` role via `requireRoles`; body validated via `updateFindingSchema`)
 */
router.patch(
  "/:projectId/findings/:findingId",
  authenticateToken,
  requireRoles(["leader"]),
  requireProjectMembership,
  validateParams(findingParamsSchema),
  validateBody(updateFindingSchema),
  asyncHandler(leaderEditFindingsController),
);

/**
 * @name : Re-verify Candidate Finding API
 * @route : POST /api/projects/:projectId/findings/:findingId/verify
 * @access : Protected (requires valid JWT via `authenticateToken` and `"leader"` role via `requireRoles`)
 */
router.post(
  "/:projectId/findings/:findingId/verify",
  authenticateToken,
  requireRoles(["leader"]),
  requireProjectMembership,
  validateParams(findingParamsSchema),
  asyncHandler(reverifyFindingController),
);

/**
 * @name : Approve Candidate Finding API
 * @route : POST /api/projects/:projectId/findings/:findingId/approve
 * @access : Protected (requires valid JWT via `authenticateToken` and `"leader"` role via `requireRoles`)
 */
router.post(
  "/:projectId/findings/:findingId/approve",
  authenticateToken,
  requireRoles(["leader"]),
  requireProjectMembership,
  validateParams(findingParamsSchema),
  asyncHandler(approveCandidateFindingsController),
);
router.patch(
  "/:projectId/findings/:findingId/approve",
  authenticateToken,
  requireRoles(["leader"]),
  requireProjectMembership,
  validateParams(findingParamsSchema),
  asyncHandler(approveCandidateFindingsController),
);

/**
 * @name : Reject Candidate Finding API
 * @route : POST /api/projects/:projectId/findings/:findingId/reject
 * @access : Protected (requires valid JWT via `authenticateToken` and `"leader"` role via `requireRoles`)
 */
router.post(
  "/:projectId/findings/:findingId/reject",
  authenticateToken,
  requireRoles(["leader"]),
  requireProjectMembership,
  validateParams(findingParamsSchema),
  asyncHandler(rejectCandidateFindingsController),
);
router.patch(
  "/:projectId/findings/:findingId/reject",
  authenticateToken,
  requireRoles(["leader"]),
  requireProjectMembership,
  validateParams(findingParamsSchema),
  asyncHandler(rejectCandidateFindingsController),
);

/**
 * @name : Reconstruct Findings API
 * @route : POST /api/projects/:projectId/reconstruct
 * @access : Protected (requires valid JWT via `authenticateToken` and `"leader"` role via `requireRoles`)
 */
router.post(
  "/:projectId/reconstruct",
  authenticateToken,
  requireRoles(["leader"]),
  requireProjectMembership,
  validateBody(reconstructSchema),
  asyncHandler(reconstructFindingsController),
);

export default router;
