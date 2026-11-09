export type SourceType = "github" | "document" | "task";

export type VerificationStatus = "Supported" | "Needs review" | "Conflicting" | "Unknown";

export type ReadinessStatus = "Needs Attention" | "Ready for Review" | "Approved for Sharing";

export type EvidenceOrigin = "system" | "self_reported";

export type FindingCategory = "decision" | "task" | "blocker" | "dependency";

export interface IReadinessChecklist {
  sourcesVerified: boolean;
  decisionsBackedByEvidence: boolean;
  unfinishedTasksAssignedOrUnknown: boolean;
  blockersIdentified: boolean;
  conflictsDisclosed: boolean;
  recipientPermissionsChecked: boolean;
  leaderApprovalRecorded: boolean;
}

export interface ISourceRecordMetadata {
  redactionCount: number;
  author?: string;
  url?: string;
  sha?: string;
  branch?: string;
  itemCount?: number;
}

