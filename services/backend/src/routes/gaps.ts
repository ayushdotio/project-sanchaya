import { Router } from "express";
import { z } from "zod";
import {
  authenticateToken,
  requireProjectMembership,
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
 * @name : List Unresolved Gaps API
 * @route : GET /api/projects/:projectId/gaps
 * @access : Protected (requires valid JWT via `authenticateToken` and role `"leader"` or `"outgoing"` via `requireRoles`; `"incoming"` receives `403`)
 * @description : Stage 4 Knowledge Gap Radar endpoint that aggregates unresolved project gaps.
 *   1. Enforces authentication (`401`) and the isolation gate (`403` for `"incoming"` users).
 *   2. Executes two concurrent MongoDB queries (`Promise.all`) scoped by `projectId`:
 *      - `Finding`: items where `verification_status` is `"Unknown"` or `"Conflicting"`, or `category` is
 *        `"blocker"`, sorted by `verification_status` ascending and `createdAt` descending.
 *      - `GapQuestion`: questions with `status: "pending"`.
 *   3. Computes `totalGapsCount` (`unresolvedFindings.length + pendingQuestions.length`).
 *   4. Responds with `200 OK` containing `{ success: true, data: { totalGapsCount, unresolvedFindings, pendingQuestions } }`.
 */
router.get(
  "/:projectId/gaps",
  authenticateToken,
  requireRoles(["leader", "outgoing"]),
  requireProjectMembership,
  asyncHandler(listUnresolvedGapsController),
);

/**
 * @name : List Gap Questions API
 * @route : GET /api/projects/:projectId/gap-questions
 * @access : Protected (requires valid JWT via `authenticateToken` and role `"leader"` or `"outgoing"` via `requireRoles`; `"incoming"` receives `403`)
 * @description : Retrieves all targeted gap questions (pending and answered) for a project.
 *   1. Enforces authentication (`401`) and the isolation gate (`403` for `"incoming"` users).
 *   2. Queries `GapQuestion.find({ projectId })`, populates `relatedFindingId` with
 *      `claim`, `category`, and `verification_status`, and sorts by `createdAt` descending.
 *   3. Responds with `200 OK` containing `{ success: true, data: questions }`.
 */
router.get(
  "/:projectId/gap-questions",
  authenticateToken,
  requireRoles(["leader", "outgoing"]),
  requireProjectMembership,
  asyncHandler(gapQuestionsController),
);

/**
 * @name : Answer Gap Question API
 * @route : POST /api/projects/:projectId/gap-questions/:questionId/answer
 * @access : Protected (requires valid JWT via `authenticateToken` and `"outgoing"` role via `requireRoles`; body validated via `answerSchema`)
 * @description : Gap-to-Question Loop endpoint for an outgoing member to submit a self-reported answer.
 *   1. Request body (`answer`, min 2 characters) is validated by `validateBody(answerSchema)`
 *      (returns `400` with field-level `errors` if invalid).
 *   2. Looks up the question in MongoDB scoped by `{ _id: questionId, projectId }`; returns `404 Not Found` if missing.
 *   3. Updates the question with `answer`, `status = "answered"`, `answeredBy = req.user.userId`,
 *      `answeredAt = new Date()`, and `evidence_badge = "Self-reported"`, then saves.
 *   4. If `question.relatedFindingId` is set, updates the linked `Finding` with
 *      `evidence_origin: "self_reported"` and `verification_status: "Supported"` so it remains
 *      explicitly badged as self-reported rather than system-verified evidence.
 *   5. Responds with `200 OK` containing `{ success: true, message: "Answer recorded with 'Self-reported' badge", data: question }`.
 */
router.post(
  "/:projectId/gap-questions/:questionId/answer",
  authenticateToken,
  requireRoles(["outgoing"]),
  requireProjectMembership,
  validateBody(answerSchema),
  asyncHandler(answerController),
);

export default router;
