import mongoose, { Document, Schema, Types } from "mongoose";
import {
  EvidenceOrigin,
  FindingCategory,
  VerificationStatus,
} from "../types/source.types.js";

export interface IConflictVersion {
  source_id: string;
  claim?: string | null;
  verbatim_excerpt?: string;
  recorded_at?: string | null;
  source_type?: string | null;
  origin?: string | null;
  url?: string | null;
}

export interface IConflictDetails {
  topic: string;
  earlier_version: IConflictVersion;
  newer_version: IConflictVersion;
  all_versions: IConflictVersion[];
}

export interface IFreshnessInfo {
  source_updated_at?: string | null;
  recheck_recommended: boolean;
  reason?: string | null;
}

export interface IFinding extends Document {
  projectId: Types.ObjectId;
  claim: string;
  category: FindingCategory;
  source_id: string;
  verbatim_excerpt: string;
  verification_status: VerificationStatus;
  evidence_origin: EvidenceOrigin;
  review_status: "pending" | "approved" | "rejected";
  owner?: string | null;
  deadline?: string | null;
  rationale?: string | null;
  topic?: string | null;
  conflicting_source_id?: string | null;
  conflict_details?: IConflictDetails | null;
  freshness?: IFreshnessInfo | null;
  explanation?: string | null;
  edited?: boolean;
  editedBy?: Types.ObjectId | null;
  editedAt?: Date | null;
  reviewedBy?: Types.ObjectId | null;
  reviewedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const ConflictVersionSchema = new Schema<IConflictVersion>(
  {
    source_id: { type: String, required: true },
    claim: { type: String, default: null },
    verbatim_excerpt: { type: String, default: "" },
    recorded_at: { type: String, default: null },
    source_type: { type: String, default: null },
    origin: { type: String, default: null },
    url: { type: String, default: null },
  },
  { _id: false }
);

const FindingSchema = new Schema<IFinding>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    claim: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      enum: ["decision", "task", "blocker", "dependency"],
      required: true,
    },
    source_id: {
      type: String,
      required: true,
      index: true,
    },
    verbatim_excerpt: {
      type: String,
      required: true,
    },
    verification_status: {
      type: String,
      enum: ["Supported", "Needs review", "Conflicting", "Unknown"],
      default: "Unknown",
    },
    evidence_origin: {
      type: String,
      enum: ["system", "self_reported"],
      default: "system",
    },
    review_status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    owner: {
      type: String,
      default: null,
    },
    deadline: {
      type: String,
      default: null,
    },
    rationale: {
      type: String,
      default: null,
    },
    topic: {
      type: String,
      default: null,
    },
    conflicting_source_id: {
      type: String,
      default: null,
    },
    conflict_details: {
      type: {
        topic: { type: String, required: true },
        earlier_version: { type: ConflictVersionSchema, required: true },
        newer_version: { type: ConflictVersionSchema, required: true },
        all_versions: { type: [ConflictVersionSchema], default: [] },
      },
      default: null,
      _id: false,
    },
    freshness: {
      type: {
        source_updated_at: { type: String, default: null },
        recheck_recommended: { type: Boolean, default: false },
        reason: { type: String, default: null },
      },
      default: null,
      _id: false,
    },
    explanation: {
      type: String,
      default: null,
    },
    edited: {
      type: Boolean,
      default: false,
    },
    editedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    editedAt: {
      type: Date,
      default: null,
    },
    reviewedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: "findings",
  }
);

export const Finding = mongoose.model<IFinding>("Finding", FindingSchema);
