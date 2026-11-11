import { Request, Response } from "express";
import { Project } from "../models/Project.js";
import { Finding } from "../models/Finding.js";
import { GapQuestion } from "../models/GapQuestion.js";
import { HandoverHistory } from "../models/HandoverHistory.js";
import { RiskMap } from "../models/RiskMap.js";
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
  const project = (req as any).project || (await Project.findById(projectId));
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

  // Fetch approved findings, answered gap questions, and analytics risk maps
  const [rawFindings, rawGapAnswers, rawRiskMaps] = await Promise.all([
    Finding.find({
      projectId,
      review_status: "approved",
    }).sort({ category: 1, createdAt: 1 }),
    GapQuestion.find({
      projectId,
      status: { $in: ["answered", "approved"] },
    }).select("question answer evidence_badge answeredAt gap_category"),
    RiskMap.find({ projectId }).sort({ riskTier: 1, contributionPercentage: -1 }),
  ]);

  let findings = rawFindings;
  let gapAnswers = rawGapAnswers;
  let riskMaps = rawRiskMaps;

  // Enforce recipientScope filtering for incoming members when restricted
  if (req.user!.role === "incoming" && Array.isArray(project.recipientScope) && project.recipientScope.length > 0) {
    const scope = new Set(project.recipientScope.map((s: string) => s.trim().toLowerCase()));
    const fullProject = scope.has("project") || scope.has("all") || scope.has("*");
    if (!fullProject) {
      const allowedCategories = new Set<string>();
      if (scope.has("decisions") || scope.has("decision")) allowedCategories.add("decision");
      if (scope.has("tasks") || scope.has("task")) allowedCategories.add("task");
      if (scope.has("dependencies") || scope.has("dependency")) allowedCategories.add("dependency");
      if (scope.has("known_problems") || scope.has("blockers") || scope.has("blocker")) allowedCategories.add("blocker");
      findings = rawFindings.filter((f) => allowedCategories.has(f.category));
      if (!scope.has("open_gaps") && !scope.has("gaps") && !scope.has("gap_answers")) {
        gapAnswers = [];
      }
      if (!scope.has("risk_areas") && !scope.has("risks") && !scope.has("risk_map")) {
        riskMaps = [];
      }
    }
  }

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
      riskMaps,
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

  const allowDraft =
    req.user!.role === "leader" &&
    (req.query.draft === "true" || project.readinessStatus !== "Approved for Sharing");

  const pdfStreamResponse = await pythonBridge.getPdfStream(projectId, {
    allowDraft,
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="sanchaya-handover-${projectId}.pdf"`,
  );

  pdfStreamResponse.data.on("error", (streamErr: Error) => {
    console.error("[Handover PDF Stream Error]", streamErr.message);
    if (!res.headersSent) {
      res.status(502).json({
        success: false,
        error: "Failed to stream handover PDF from Analytics Service",
      });
    } else {
      res.end();
    }
  });

  pdfStreamResponse.data.pipe(res);
};

const handoverAcknowledgementController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const projectId = req.params.projectId as string;

  const project = await verifyHandoverAccess(req, res, projectId);
  if (!project) return;

  const latestSnapshot = await HandoverHistory.findOne({
    projectId: project._id,
  }).sort({ version: -1 });
  const currentVersion = latestSnapshot?.version ?? 1;

  const receipt = await HandoverHistory.create({
    projectId: project._id,
    version: currentVersion,
    approvedSnapshot: {
      projectName: project.name,
      approvedAt: project.approvedAt,
      readinessStatus: project.readinessStatus,
      snapshotHash: project.approvedSnapshotHash ?? null,
    },
    acknowledgedBy: req.user!.userId as any,
    acknowledgedAt: new Date(),
  });

  console.log(
    `[Handover Receipt Acknowledged] Project: ${projectId} v${currentVersion} by User: ${req.user!.userId}`,
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
