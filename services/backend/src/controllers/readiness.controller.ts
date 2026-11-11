import crypto from "crypto";
import { Request, Response } from "express";
import { Finding } from "../models/Finding.js";
import { HandoverHistory } from "../models/HandoverHistory.js";
import { Project } from "../models/Project.js";
import { pythonBridge } from "../services/pythonBridge.js";

const PREREQUISITE_CHECKLIST_KEYS = [
  "sourcesVerified",
  "decisionsBackedByEvidence",
  "unfinishedTasksAssignedOrUnknown",
  "blockersIdentified",
  "conflictsDisclosed",
  "recipientPermissionsChecked",
] as const;

const readinessController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const projectId = req.params.projectId as string;

  const project = await Project.findById(projectId)
    .select(
      "name readinessChecklist readinessStatus approvedBy approvedAt approvedSnapshotHash",
    )
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
      approvedSnapshotHash: project.approvedSnapshotHash ?? null,
    },
  });
};

const riskMapController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const projectId = req.params.projectId as string;

  const project = (req as any).project || (await Project.findById(projectId));
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

  const project = (req as any).project || (await Project.findById(projectId));
  if (!project) {
    res.status(404).json({ success: false, error: "Project not found" });
    return;
  }

  const result = await pythonBridge.computeRiskAndReadiness(projectId);

  res.status(200).json({
    success: true,
    message: result.message || "Readiness evaluated via Analytics Service",
    data: result,
  });
};

const readinessSignOffController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const projectId = req.params.projectId as string;
  const { checklistUpdates, evaluateWithAnalytics } = req.body || {};

  const project = (req as any).project || (await Project.findById(projectId));
  if (!project) {
    res.status(404).json({ success: false, error: "Project not found" });
    return;
  }

  if (evaluateWithAnalytics === true) {
    const evaluated = await pythonBridge.computeRiskAndReadiness(projectId);
    if (evaluated.checklist) {
      Object.assign(project.readinessChecklist, evaluated.checklist);
    }
    const snapshotHash = (evaluated.riskSummary as any)?.snapshot_hash;
    if (snapshotHash) {
      project.approvedSnapshotHash = snapshotHash;
    }
  }

  // Apply any explicit checklist confirmations
  if (checklistUpdates) {
    Object.assign(project.readinessChecklist, checklistUpdates);
  }

  // Check prerequisite 6 criteria before recording leader sign-off
  const cl = project.readinessChecklist;
  const failingCriteria = PREREQUISITE_CHECKLIST_KEYS.filter((key) => !cl[key]);

  if (failingCriteria.length > 0) {
    project.readinessChecklist.leaderApprovalRecorded = false;
    project.readinessStatus = "Ready for Review";
    project.approvedBy = null;
    project.approvedAt = null;
    project.approvedSnapshotHash = null;
    await project.save();

    res.status(400).json({
      success: false,
      error:
        "Cannot approve for sharing: All 7 readiness checklist items must be satisfied.",
      data: {
        readinessStatus: project.readinessStatus,
        checklist: project.readinessChecklist,
        failingCriteria,
      },
    });
    return;
  }

  // Record leader approval once prerequisites pass
  project.readinessChecklist.leaderApprovalRecorded = true;
  project.readinessStatus = "Approved for Sharing";
  project.approvedBy = req.user!.userId as any;
  project.approvedAt = new Date();
  if (!project.approvedSnapshotHash) {
    project.approvedSnapshotHash = crypto
      .createHash("sha256")
      .update(
        JSON.stringify({
          projectId: String(project._id),
          approvedBy: String(project.approvedBy),
          approvedAt: project.approvedAt.toISOString(),
          checklist: project.readinessChecklist,
        }),
      )
      .digest("hex");
  }
  await project.save();

  // Record an immutable handover snapshot version in handover_history
  const [latestHistory, approvedFindingsCount] = await Promise.all([
    HandoverHistory.findOne({ projectId: project._id }).sort({ version: -1 }),
    Finding.countDocuments({ projectId: project._id, review_status: "approved" }),
  ]);
  const nextVersion = (latestHistory?.version ?? 0) + 1;

  await HandoverHistory.create({
    projectId: project._id,
    version: nextVersion,
    approvedSnapshot: {
      projectName: project.name,
      approvedAt: project.approvedAt,
      readinessStatus: project.readinessStatus,
      approvedFindingsCount,
      snapshotHash: project.approvedSnapshotHash ?? null,
    },
  });

  res.status(200).json({
    success: true,
    message:
      "Handover signed off by Team Leader. Workspace is now 'Approved for Sharing'.",
    data: {
      readinessStatus: project.readinessStatus,
      checklist: project.readinessChecklist,
      approvedAt: project.approvedAt,
      version: nextVersion,
    },
  });
};

export {
  readinessController,
  riskMapController,
  readinessEvaluateController,
  readinessSignOffController,
};
