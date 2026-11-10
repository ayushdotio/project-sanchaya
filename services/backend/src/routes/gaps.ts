import { Router } from "express";
import { z } from "zod";
import {
  authenticateToken,
  requireRoles,
} from "../middlewares/authMiddleware.js";
import { validateBody } from "../middlewares/validate.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  listUnresolvedGapsController,
  gapQuestionsController,
  answerController,
} from "../controllers/gaps.controller.js";

const router = Router();

const answerSchema = z.object({
  answer: z.string().min(2, "Answer must contain at least 2 characters"),
});

/**
 * GET /api/projects/:projectId/gaps
 * Stage 4 Knowledge Gap Radar: Lists unresolved gaps (Unknown/Conflicting findings, unowned tasks, blockers)
 * Isolation Gate: Incoming members receive 403 Forbidden
 */
router.get(
  "/:projectId/gaps",
  authenticateToken,
  requireRoles(["leader", "outgoing"]),
  asyncHandler(listUnresolvedGapsController),
);

/**
 * GET /api/projects/:projectId/gap-questions
 * Isolation Gate: Incoming members are forbidden from inspecting internal gaps
 */
router.get(
  "/:projectId/gap-questions",
  authenticateToken,
  requireRoles(["leader", "outgoing"]),
  asyncHandler(gapQuestionsController),
);

/**
 * POST /api/projects/:projectId/gap-questions/:questionId/answer
 * Gap-to-Question Loop: Only departing member ('outgoing') can submit self-reported answers
 */
router.post(
  "/:projectId/gap-questions/:questionId/answer",
  authenticateToken,
  requireRoles(["outgoing"]),
  validateBody(answerSchema),
  asyncHandler(answerController),
);

export default router;
