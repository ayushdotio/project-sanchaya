import { Request, Response } from "express";
import { GapQuestion } from "../models/GapQuestion.js";
import { Finding } from "../models/Finding.js";

const listUnresolvedGapsController = async (
  req: Request,
  res: Response,
): Promise<void> => {
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
    })
      .populate("relatedFindingId", "claim category verification_status source_id topic")
      .sort({ createdAt: -1 }),
  ]);

  res.status(200).json({
    success: true,
    data: {
      totalGapsCount: unresolvedFindings.length + pendingQuestions.length,
      unresolvedFindings,
      pendingQuestions,
    },
  });
};

const gapQuestionsController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { projectId } = req.params;

  const questions = await GapQuestion.find({ projectId })
    .populate(
      "relatedFindingId",
      "claim category verification_status source_id topic owner rationale",
    )
    .sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    data: questions,
  });
};

const answerController = async (req: Request, res: Response): Promise<void> => {
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
};

export {
  listUnresolvedGapsController,
  gapQuestionsController,
  answerController,
};
