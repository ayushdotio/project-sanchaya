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
  if (!project || !project.readinessChecklist || typeof project.save !== "function") {
    return;
  }

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

const STATUS_QUERY_MAP: Record<string, string> = {
  supported: "Supported",
  needs_review: "Needs review",
  "needs review": "Needs review",
  conflicting: "Conflicting",
  unknown: "Unknown",
};

const normalizeNullableText = (value: string | null | undefined): string | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const inspectFindingsController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const projectId = req.params.projectId as string;
  const {
    status,
    verification_status,
    category,
    review_status,
    source_id,
    recheck,
  } = ((req as any).validatedQuery || req.query || {}) as Record<string, string | undefined>;

  const filter: Record<string, any> = { projectId };
  const rawStatus = verification_status || status;
  if (rawStatus) {
    filter.verification_status =
      STATUS_QUERY_MAP[rawStatus.trim().toLowerCase()] || rawStatus;
  }
  if (category) {
    filter.category = category;
  }
  if (review_status) {
    filter.review_status = review_status;
  }
  if (source_id) {
    filter.source_id = source_id;
  }
  if (recheck === "true") {
    filter["freshness.recheck_recommended"] = true;
  } else if (recheck === "false") {
    filter["freshness.recheck_recommended"] = { $ne: true };
  }

  const findings = await Finding.find(filter).sort({ createdAt: -1 });

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
    topic,
    reverify,
  } = req.body;

  const finding = await Finding.findOne({ _id: findingId, projectId });
  if (!finding) {
    res.status(404).json({ success: false, error: "Finding not found" });
    return;
  }

  if (claim !== undefined) finding.claim = claim.trim();
  if (category !== undefined) finding.category = category;
  if (owner !== undefined) finding.owner = normalizeNullableText(owner) ?? null;
  if (deadline !== undefined) finding.deadline = normalizeNullableText(deadline) ?? null;
  if (rationale !== undefined) finding.rationale = normalizeNullableText(rationale) ?? null;
  if (topic !== undefined) finding.topic = normalizeNullableText(topic) ?? null;

  const hasContentEdit =
    claim !== undefined ||
    category !== undefined ||
    owner !== undefined ||
    deadline !== undefined ||
    rationale !== undefined ||
    topic !== undefined;

  if (hasContentEdit) {
    finding.edited = true;
    finding.editedBy = req.user!.userId as any;
    finding.editedAt = new Date();
  }

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
    if (validation.freshness !== undefined) {
      finding.freshness = (validation.freshness as any) ?? null;
    }
  }

  if (review_status !== undefined) {
    finding.review_status = review_status;
    finding.reviewedBy = req.user!.userId as any;
    finding.reviewedAt = new Date();
  }

  await finding.save();

  const shouldInvalidateApproval =
    hasContentEdit ||
    reverify === true ||
    review_status === "rejected" ||
    review_status === "pending";

  if (review_status !== undefined || shouldInvalidateApproval) {
    await syncDecisionChecklistAndApproval(projectId, shouldInvalidateApproval);
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
  if (validation.freshness !== undefined) {
    finding.freshness = (validation.freshness as any) ?? null;
  }
  await finding.save();

  await syncDecisionChecklistAndApproval(
    projectId,
    finding.verification_status !== "Supported" && finding.review_status !== "approved",
  );

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

  const project = (req as any).project || (await Project.findById(projectId));
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

  const project = (req as any).project || (await Project.findById(projectId));
  if (!project) {
    res.status(404).json({ success: false, error: "Project not found" });
    return;
  }

  const sourceFilter: Record<string, any> = {
    projectId: project._id || projectId,
  };
  const hasFilter =
    (Array.isArray(sourceIds) && sourceIds.length > 0) ||
    (Array.isArray(sourceTypes) && sourceTypes.length > 0);
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
      error: hasFilter
        ? "No ingested source records matched the selected sourceIds/sourceTypes filter."
        : "No ingested source records found for this project. Connect GitHub or upload notes/tasks before reconstructing.",
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

  if ((result.findingsCount ?? 0) > 0) {
    await syncDecisionChecklistAndApproval(projectId, true);
  }

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
