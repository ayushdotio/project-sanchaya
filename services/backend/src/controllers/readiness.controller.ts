import { Request, Response } from "express";
import { Project } from "../models/Project.js";
import { pythonBridge } from "../services/pythonBridge.js";

const readinessController = async (
  req: Request,
  res: Response,
): Promise<void> => {
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
};

const riskMapController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const projectId = req.params.projectId as string;

  const project = await Project.findById(projectId);
  if (!project) {
    res.status(404).json({ success: false, error: "Project not found" });
    return;
  }

  const riskData = await pythonBridge.computeRiskAndReadiness(projectId);

  res.status(200).json({
    success: true,
    data: riskData.riskSummary || riskData,
  });
};

const readinessEvaluateController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const projectId = req.params.projectId as string;

  const result = await pythonBridge.computeRiskAndReadiness(projectId);

  res.status(200).json({
    success: true,
    message: "Readiness evaluated via Analytics Service",
    data: result,
  });
};

const readinessSignOffController = async (
  req: Request,
  res: Response,
): Promise<void> => {
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
      error:
        "Cannot approve for sharing: All 7 readiness checklist items must be satisfied.",
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
    message:
      "Handover signed off by Team Leader. Workspace is now 'Approved for Sharing'.",
    data: {
      readinessStatus: project.readinessStatus,
      checklist: project.readinessChecklist,
      approvedAt: project.approvedAt,
    },
  });
};

export {
  readinessController,
  riskMapController,
  readinessEvaluateController,
  readinessSignOffController,
};
