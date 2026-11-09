import { Router, Request, Response } from "express";
import { authenticateToken, requireRoles } from "../middlewares/authMiddleware.js";
import { Project } from "../models/Project.js";
import { Finding } from "../models/Finding.js";
import { GapQuestion } from "../models/GapQuestion.js";
import { HandoverHistory } from "../models/HandoverHistory.js";
import { pythonBridge } from "../services/pythonBridge.js";

const router = Router();

/**
 * Handover Gatekeeper: Enforces that incoming members can only access
 * handover resources when the workspace is 'Approved for Sharing'.
 */
const verifyHandoverAccess = async (
  req: Request,
  res: Response,
  projectId: string
): Promise<any | null> => {
  const project = await Project.findById(projectId);
  if (!project) {
    res.status(404).json({ success: false, error: "Project not found" });
    return null;
  }

  // Leaders can inspect at any stage; incoming members require 'Approved for Sharing'
  if (req.user!.role === "incoming" && project.readinessStatus !== "Approved for Sharing") {
    res.status(403).json({
      success: false,
      error: "Access denied. Handover is not yet 'Approved for Sharing' by the Team Leader.",
    });
    return null;
  }

  return project;
};

/**
 * GET /api/projects/:projectId/handover
 * Stage 5 Handover View: Role-gated handover report with citations & badges
 */
router.get(
  "/:projectId/handover",
  authenticateToken,
  requireRoles(["leader", "incoming"]),
  async (req: Request, res: Response): Promise<void> => {
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
  }
);

/**
 * GET /api/projects/:projectId/handover/export-pdf
 * Stage 5 Export: Streams citation-linked ReportLab PDF from analytics-service
 */
router.get(
  "/:projectId/handover/export-pdf",
  authenticateToken,
  requireRoles(["leader", "incoming"]),
  async (req: Request, res: Response): Promise<void> => {
    const projectId = req.params.projectId as string;

    const project = await verifyHandoverAccess(req, res, projectId);
    if (!project) return;

    try {
      const pdfStreamResponse = await pythonBridge.getPdfStream(projectId);

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="sanchaya-handover-${projectId}.pdf"`
      );

      pdfStreamResponse.data.pipe(res);
    } catch (error: any) {
      res.status(502).json({
        success: false,
        error: `Downstream PDF generation failed: ${error.message}`,
      });
    }
  }
);

/**
 * POST /api/projects/:projectId/handover/acknowledge
 * Stage 5 Receipt: Incoming member acknowledges receipt of verified handover
 */
router.post(
  "/:projectId/handover/acknowledge",
  authenticateToken,
  requireRoles(["incoming"]),
  async (req: Request, res: Response): Promise<void> => {
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

    console.log(`[Handover Receipt Acknowledged] Project: ${projectId} by User: ${req.user!.userId}`);

    res.status(200).json({
      success: true,
      message: "Handover receipt successfully acknowledged.",
      data: receipt,
    });
  }
);

/**
 * GET /api/projects/:projectId/handover/history
 * Retrieves version snapshots and incoming member acknowledgement logs
 */
router.get(
  "/:projectId/handover/history",
  authenticateToken,
  requireRoles(["leader", "incoming"]),
  async (req: Request, res: Response): Promise<void> => {
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
  }
);

export default router;
