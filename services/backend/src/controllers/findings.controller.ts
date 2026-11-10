import { Request, Response } from "express";
import { Finding } from "../models/Finding.js";
import { Project } from "../models/Project.js";
import { pythonBridge } from "../services/pythonBridge.js";

const inspectFindingsController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const projectId = req.params.projectId as string;

  const findings = await Finding.find({ projectId }).sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    data: findings,
  });
};

const leaderEditFindingsController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { projectId, findingId } = req.params;
  const { claim, category, review_status } = req.body;

  const finding = await Finding.findOne({ _id: findingId, projectId });
  if (!finding) {
    res.status(404).json({ success: false, error: "Finding not found" });
    return;
  }

  if (claim) finding.claim = claim;
  if (category) finding.category = category;
  if (review_status) {
    finding.review_status = review_status;
    finding.reviewedBy = req.user!.userId as any;
    finding.reviewedAt = new Date();
  }

  await finding.save();

  if (review_status === "approved") {
    const project = await Project.findById(projectId);
    if (project) {
      project.readinessChecklist.decisionsBackedByEvidence = true;
      await project.save();
    }
  }

  res.status(200).json({
    success: true,
    message: "Finding updated successfully",
    data: finding,
  });
};

const approveCandidateFindingsController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { projectId, findingId } = req.params;

  const finding = await Finding.findOne({ _id: findingId, projectId });
  if (!finding) {
    res.status(404).json({ success: false, error: "Finding not found" });
    return;
  }

  finding.review_status = "approved";
  finding.reviewedBy = req.user!.userId as any;
  finding.reviewedAt = new Date();
  await finding.save();

  // Re-evaluate and record in readiness checklist
  const project = await Project.findById(projectId);
  if (project) {
    project.readinessChecklist.decisionsBackedByEvidence = true;
    await project.save();
  }

  res.status(200).json({
    success: true,
    message:
      "Finding approved successfully and added to handover candidate set",
    data: finding,
  });
};

const rejectCandidateFindingsController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { projectId, findingId } = req.params;

  const finding = await Finding.findOne({ _id: findingId, projectId });
  if (!finding) {
    res.status(404).json({ success: false, error: "Finding not found" });
    return;
  }

  finding.review_status = "rejected";
  finding.reviewedBy = req.user!.userId as any;
  finding.reviewedAt = new Date();
  await finding.save();

  res.status(200).json({
    success: true,
    message: "Finding marked as rejected",
    data: finding,
  });
};

const reconstructFindingsController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const projectId = req.params.projectId as string;

  const project = await Project.findById(projectId);
  if (!project) {
    res.status(404).json({ success: false, error: "Project not found" });
    return;
  }

  const result = await pythonBridge.triggerExtractionAndVerify(projectId);

  res.status(200).json({
    success: true,
    message: "AI reconstruction and verification triggered successfully",
    data: result,
  });
};

export {
  inspectFindingsController,
  leaderEditFindingsController,
  approveCandidateFindingsController,
  rejectCandidateFindingsController,
  reconstructFindingsController
};
