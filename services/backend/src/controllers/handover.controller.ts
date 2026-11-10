import { Request, Response } from "express";
import { Project } from "../models/Project.js";
import { Finding } from "../models/Finding.js";
import { GapQuestion } from "../models/GapQuestion.js";
import { HandoverHistory } from "../models/HandoverHistory.js";
import { pythonBridge } from "../services/pythonBridge.js";

/**
 * Handover Gatekeeper: Enforces that incoming members can only access
 * handover resources when the workspace is 'Approved for Sharing'.
 */
const verifyHandoverAccess = async (
  req: Request,
  res: Response,
  projectId: string,
): Promise<any | null> => {
  const project = await Project.findById(projectId);
  if (!project) {
    res.status(404).json({ success: false, error: "Project not found" });
    return null;
  }

  // Leaders can inspect at any stage; incoming members require 'Approved for Sharing'
  if (
    req.user!.role === "incoming" &&
    project.readinessStatus !== "Approved for Sharing"
  ) {
    res.status(403).json({
      success: false,
      error:
        "Access denied. Handover is not yet 'Approved for Sharing' by the Team Leader.",
    });
    return null;
  }

  return project;
};

const handoverReportController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const projectId = req.params.projectId as string;

  const project = await verifyHandoverAccess(req, res, projectId);
  if (!project) return;

  // Fetch approved/supported findings and answered gap questions
  const [findings, gapAnswers] = await Promise.all([
    Finding.find({
      projectId,
      review_status: "approved",
    }).sort({ category: 1, createdAt: 1 }),
    GapQuestion.find({
      projectId,
      status: { $in: ["answered", "approved"] },
    }).select("question answer evidence_badge answeredAt"),
  ]);

  res.status(200).json({
    success: true,
    data: {
      project: {
        id: project._id,
        name: project.name,
        description: project.description,
        githubRepo: project.githubRepo,
        readinessStatus: project.readinessStatus,
        approvedAt: project.approvedAt,
      },
      findings,
      gapAnswers,
    },
  });
};

const exportPDFController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const projectId = req.params.projectId as string;

  const project = await verifyHandoverAccess(req, res, projectId);
  if (!project) return;

  const pdfStreamResponse = await pythonBridge.getPdfStream(projectId);

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="sanchaya-handover-${projectId}.pdf"`,
  );

  pdfStreamResponse.data.pipe(res);
};

const handoverAcknowledgementController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const projectId = req.params.projectId as string;

  const project = await verifyHandoverAccess(req, res, projectId);
  if (!project) return;

  const receipt = await HandoverHistory.create({
    projectId: project._id,
    version: 1,
    approvedSnapshot: {
      projectName: project.name,
      approvedAt: project.approvedAt,
      readinessStatus: project.readinessStatus,
    },
    acknowledgedBy: req.user!.userId as any,
    acknowledgedAt: new Date(),
  });

  console.log(
    `[Handover Receipt Acknowledged] Project: ${projectId} by User: ${req.user!.userId}`,
  );

  res.status(200).json({
    success: true,
    message: "Handover receipt successfully acknowledged.",
    data: receipt,
  });
};

const handoverHistoryController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const projectId = req.params.projectId as string;

  const project = await verifyHandoverAccess(req, res, projectId);
  if (!project) return;

  const history = await HandoverHistory.find({ projectId })
    .populate("acknowledgedBy", "name email")
    .sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    data: history,
  });
};

export {
  handoverReportController,
  exportPDFController,
  handoverAcknowledgementController,
  handoverHistoryController,
};
