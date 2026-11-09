import { Router, Request, Response } from "express";
import { z } from "zod";
import { authenticateToken, requireRoles } from "../middlewares/authMiddleware.js";
import { validateBody } from "../middlewares/validate.js";
import { GapQuestion } from "../models/GapQuestion.js";
import { Finding } from "../models/Finding.js";

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
  async (req: Request, res: Response): Promise<void> => {
    const { projectId } = req.params;

    const [unresolvedFindings, pendingQuestions] = await Promise.all([
      Finding.find({
        projectId,
        $or: [
          { verification_status: { $in: ["Unknown", "Conflicting"] } },
          { category: "blocker" },
        ],
      }).sort({ verification_status: 1, createdAt: -1 }),
      GapQuestion.find({
        projectId,
        status: "pending",
      }),
    ]);

    res.status(200).json({
      success: true,
      data: {
        totalGapsCount: unresolvedFindings.length + pendingQuestions.length,
        unresolvedFindings,
        pendingQuestions,
      },
    });
  }
);

/**
 * GET /api/projects/:projectId/gap-questions
 * Isolation Gate: Incoming members are forbidden from inspecting internal gaps
 */
router.get(
  "/:projectId/gap-questions",
  authenticateToken,
  requireRoles(["leader", "outgoing"]),
  async (req: Request, res: Response): Promise<void> => {
    const { projectId } = req.params;

    const questions = await GapQuestion.find({ projectId })
      .populate("relatedFindingId", "claim category verification_status")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: questions,
    });
  }
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
  async (req: Request, res: Response): Promise<void> => {
    const { projectId, questionId } = req.params;
    const { answer } = req.body;

    const question = await GapQuestion.findOne({ _id: questionId, projectId });
    if (!question) {
      res.status(404).json({ success: false, error: "Gap question not found" });
      return;
    }

    question.answer = answer;
    question.status = "answered";
    question.answeredBy = req.user!.userId as any;
    question.answeredAt = new Date();
    question.evidence_badge = "Self-reported";
    await question.save();

    // If linked to a finding, mark finding with evidence_origin: 'self_reported'
    if (question.relatedFindingId) {
      await Finding.findByIdAndUpdate(question.relatedFindingId, {
        evidence_origin: "self_reported",
        verification_status: "Supported", // Now backed by departing member self-reported statement
      });
    }

    res.status(200).json({
      success: true,
      message: "Answer recorded with 'Self-reported' badge",
      data: question,
    });
  }
);

export default router;
