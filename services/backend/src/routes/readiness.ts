import { Router, Request, Response } from "express";
import { z } from "zod";
import { authenticateToken, requireRoles } from "../middlewares/authMiddleware.js";
import { validateBody } from "../middlewares/validate.js";
import { Project } from "../models/Project.js";
import { pythonBridge } from "../services/pythonBridge.js";

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
  async (req: Request, res: Response): Promise<void> => {
    const projectId = req.params.projectId as string;

    const project = await Project.findById(projectId)
      .select("name readinessChecklist readinessStatus approvedBy approvedAt")
      .populate("approvedBy", "name email");

    if (!project) {
      res.status(404).json({ success: false, error: "Project not found" });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        readinessStatus: project.readinessStatus,
        checklist: project.readinessChecklist,
        approvedBy: project.approvedBy,
        approvedAt: project.approvedAt,
      },
    });
  }
);

/**
 * GET /api/projects/:projectId/risk-map
 * Stage 2 Risk Analysis: Retrieves Contribution Concentration Risk Map computed by analytics-service
 */
router.get(
  "/:projectId/risk-map",
  authenticateToken,
  requireRoles(["leader", "outgoing"]),
  async (req: Request, res: Response): Promise<void> => {
    const projectId = req.params.projectId as string;

    const project = await Project.findById(projectId);
    if (!project) {
      res.status(404).json({ success: false, error: "Project not found" });
      return;
    }

    try {
      const riskData = await pythonBridge.computeRiskAndReadiness(projectId);

      res.status(200).json({
        success: true,
        data: riskData.riskSummary || riskData,
      });
    } catch (error: any) {
      res.status(502).json({
        success: false,
        error: `Could not retrieve risk map: ${error.message}`,
      });
    }
  }
);

/**
 * POST /api/projects/:projectId/readiness/evaluate
 * Triggers analytics-service to evaluate risk & update readiness
 */
router.post(
  "/:projectId/readiness/evaluate",
  authenticateToken,
  requireRoles(["leader"]),
  async (req: Request, res: Response): Promise<void> => {
    const projectId = req.params.projectId as string;

    try {
      const result = await pythonBridge.computeRiskAndReadiness(projectId);

      res.status(200).json({
        success: true,
        message: "Readiness evaluated via Analytics Service",
        data: result,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: `Readiness evaluation failed: ${error.message}`,
      });
    }
  }
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
  async (req: Request, res: Response): Promise<void> => {
    const projectId = req.params.projectId as string;
    const { checklistUpdates } = req.body;

    const project = await Project.findById(projectId);
    if (!project) {
      res.status(404).json({ success: false, error: "Project not found" });
      return;
    }

    // Apply any explicit checklist confirmations
    if (checklistUpdates) {
      Object.assign(project.readinessChecklist, checklistUpdates);
    }

    // Record leader approval
    project.readinessChecklist.leaderApprovalRecorded = true;

    // Check if all 7 criteria are met
    const cl = project.readinessChecklist;
    const allPassed =
      cl.sourcesVerified &&
      cl.decisionsBackedByEvidence &&
      cl.unfinishedTasksAssignedOrUnknown &&
      cl.blockersIdentified &&
      cl.conflictsDisclosed &&
      cl.recipientPermissionsChecked &&
      cl.leaderApprovalRecorded;

    if (!allPassed) {
      project.readinessStatus = "Ready for Review";
      await project.save();

      res.status(400).json({
        success: false,
        error: "Cannot approve for sharing: All 7 readiness checklist items must be satisfied.",
        data: {
          readinessStatus: project.readinessStatus,
          checklist: project.readinessChecklist,
        },
      });
      return;
    }

    project.readinessStatus = "Approved for Sharing";
    project.approvedBy = req.user!.userId as any;
    project.approvedAt = new Date();
    await project.save();

    res.status(200).json({
      success: true,
      message: "Handover signed off by Team Leader. Workspace is now 'Approved for Sharing'.",
      data: {
        readinessStatus: project.readinessStatus,
        checklist: project.readinessChecklist,
        approvedAt: project.approvedAt,
      },
    });
  }
);

export default router;
