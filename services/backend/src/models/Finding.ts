import mongoose, { Document, Schema, Types } from "mongoose";
import {
  EvidenceOrigin,
  FindingCategory,
  VerificationStatus,
} from "../types/source.types.js";

export interface IFinding extends Document {
  projectId: Types.ObjectId;
  claim: string;
  category: FindingCategory;
  source_id: string;
  verbatim_excerpt: string;
  verification_status: VerificationStatus;
  evidence_origin: EvidenceOrigin;
  review_status: "pending" | "approved" | "rejected";
  reviewedBy?: Types.ObjectId | null;
  reviewedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

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

