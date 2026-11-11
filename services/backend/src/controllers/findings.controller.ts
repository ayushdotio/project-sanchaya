import { Request, Response } from "express";
import mongoose from "mongoose";
import { Finding } from "../models/Finding.js";
import { Project } from "../models/Project.js";
import { SourceRecord } from "../models/SourceRecord.js";
import {
  pythonBridge,
  SerializedSourceRecord,
} from "../services/pythonBridge.js";

const syncDecisionChecklistAndApproval = async (
  projectId: string,
  invalidateApproval: boolean,
): Promise<void> => {
  const project = await Project.findById(projectId);
  if (!project) return;

  const [totalDecisions, unverifiedDecisions] = await Promise.all([
    Finding.countDocuments({ projectId, category: "decision" }),
    Finding.countDocuments({
      projectId,
      category: "decision",
      verification_status: { $ne: "Supported" },
      review_status: { $ne: "approved" },
    }),
  ]);

  project.readinessChecklist.decisionsBackedByEvidence =
    totalDecisions > 0 && unverifiedDecisions === 0;

  if (
    invalidateApproval &&
    (project.readinessStatus === "Approved for Sharing" ||
      project.readinessChecklist.leaderApprovalRecorded)
  ) {
    project.readinessStatus = "Ready for Review";
    project.readinessChecklist.leaderApprovalRecorded = false;
    project.approvedBy = null;
    project.approvedAt = null;
    project.approvedSnapshotHash = null;
  }

  await project.save();
};

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
  const projectId = req.params.projectId as string;
  const findingId = req.params.findingId as string;
  const {
    claim,
    category,
    review_status,
    owner,
    deadline,
    rationale,
    reverify,
  } = req.body;

  const finding = await Finding.findOne({ _id: findingId, projectId });
  if (!finding) {
    res.status(404).json({ success: false, error: "Finding not found" });
    return;
  }

  if (claim !== undefined) finding.claim = claim;
  if (category !== undefined) finding.category = category;
  if (owner !== undefined) finding.owner = owner;
  if (deadline !== undefined) finding.deadline = deadline;
  if (rationale !== undefined) finding.rationale = rationale;

  if (reverify === true) {
    const validation = await pythonBridge.validateFindingEvidence({
      projectId,
      source_id: finding.source_id,
      evidence_excerpt: finding.verbatim_excerpt,
      claim: finding.claim,
      topic: finding.topic ?? undefined,
      category: finding.category,
      owner: finding.owner ?? undefined,
      deadline: finding.deadline ?? undefined,
    });
    finding.verification_status = validation.status;
    finding.explanation = validation.explanation;
    finding.conflicting_source_id = validation.conflicting_source_id ?? null;
    finding.conflict_details = (validation.conflict_details as any) ?? null;
  }

  if (review_status) {
    finding.review_status = review_status;
    finding.reviewedBy = req.user!.userId as any;
    finding.reviewedAt = new Date();
  }

  await finding.save();

  const contentEdited =
    claim !== undefined ||
    category !== undefined ||
    owner !== undefined ||
    deadline !== undefined ||
    rationale !== undefined ||
    reverify === true ||
    review_status === "rejected";

  if (review_status === "approved" || contentEdited) {
    await syncDecisionChecklistAndApproval(projectId, contentEdited);
  }

  res.status(200).json({
    success: true,
    message: "Finding updated successfully",
    data: finding,
  });
};

const reverifyFindingController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const projectId = req.params.projectId as string;
  const findingId = req.params.findingId as string;

  const finding = await Finding.findOne({ _id: findingId, projectId });
  if (!finding) {
    res.status(404).json({ success: false, error: "Finding not found" });
    return;
  }

  const validation = await pythonBridge.validateFindingEvidence({
    projectId,
    source_id: finding.source_id,
    evidence_excerpt: finding.verbatim_excerpt,
    claim: finding.claim,
    topic: finding.topic ?? undefined,
    category: finding.category,
    owner: finding.owner ?? undefined,
    deadline: finding.deadline ?? undefined,
  });

  finding.verification_status = validation.status;
  finding.explanation = validation.explanation;
  finding.conflicting_source_id = validation.conflicting_source_id ?? null;
  finding.conflict_details = (validation.conflict_details as any) ?? null;
  await finding.save();

  res.status(200).json({
    success: true,
    message: "Finding re-verified against source records via AI Engine",
    data: finding,
  });
};

const scanFindingsFreshnessController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const projectId = req.params.projectId as string;
  const { maxAgeDays = 90, limit = 500 } = req.body || {};

  const project = await Project.findById(projectId);
  if (!project) {
    res.status(404).json({ success: false, error: "Project not found" });
    return;
  }

  const report = await pythonBridge.scanProjectFreshness(
    projectId,
    maxAgeDays,
    limit,
  );

  res.status(200).json({
    success: true,
    message: "Findings freshness scan completed",
    data: report,
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

  // Re-evaluate decisionsBackedByEvidence across all project decisions (LOGIC-01)
  await syncDecisionChecklistAndApproval(projectId as string, false);

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

  await syncDecisionChecklistAndApproval(projectId as string, true);

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
  const { sourceIds, sourceTypes } = (req.body || {}) as {
    sourceIds?: string[];
    sourceTypes?: Array<"github" | "document" | "task">;
  };

  const project = await Project.findById(projectId);
  if (!project) {
    res.status(404).json({ success: false, error: "Project not found" });
    return;
  }

  const sourceFilter: Record<string, any> = {
    projectId: project._id || projectId,
  };
  if (sourceIds && sourceIds.length > 0) {
    sourceFilter.source_id = { $in: sourceIds };
  }
  if (sourceTypes && sourceTypes.length > 0) {
    sourceFilter.source_type = { $in: sourceTypes };
  }

  const sourceRecords = await SourceRecord.find(sourceFilter)
    .sort({ updated_at: 1 })
    .lean();

  if (!sourceRecords || sourceRecords.length === 0) {
    res.status(400).json({
      success: false,
      error:
        "No ingested source records found for this project. Connect GitHub or upload notes/tasks before reconstructing.",
    });
    return;
  }

  const serializedSources: SerializedSourceRecord[] = sourceRecords.map(
    (rec: any) => ({
      source_id: rec.source_id,
      source_type: rec.source_type,
      origin: rec.origin,
      raw_filename: rec.raw_filename || "",
      redacted_content: rec.redacted_content,
      metadata: rec.metadata || {},
      created_at: rec.created_at,
      updated_at: rec.updated_at,
      imported_at: rec.imported_at,
    }),
  );

  const databaseName = mongoose.connection?.name || undefined;
  const result = await pythonBridge.triggerExtractionAndVerify(projectId, {
    sourceRecords: serializedSources,
    databaseName,
  });

  res.status(200).json({
    success: true,
    message:
      result.message ||
      "AI reconstruction and verification triggered successfully",
    data: {
      ...result,
      sourcesUsed: serializedSources.length,
      sourceIds: serializedSources.map((s) => s.source_id),
    },
  });
};

export {
  inspectFindingsController,
  leaderEditFindingsController,
  reverifyFindingController,
  scanFindingsFreshnessController,
  approveCandidateFindingsController,
  rejectCandidateFindingsController,
  reconstructFindingsController,
};
