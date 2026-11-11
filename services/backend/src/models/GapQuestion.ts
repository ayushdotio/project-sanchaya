import mongoose, { Document, Schema, Types } from "mongoose";

export type GapCategory =
  | "missing_owner"
  | "missing_rationale"
  | "unknown_claim"
  | "conflicting_sources";

export interface IGapQuestion extends Document {
  projectId: Types.ObjectId;
  relatedFindingId?: Types.ObjectId;
  question: string;
  status: "pending" | "answered" | "approved";
  answer?: string;
  answeredBy?: Types.ObjectId | null;
  answeredAt?: Date | null;
  evidence_badge: string;
  gap_category?: GapCategory | null;
  createdAt: Date;
  updatedAt: Date;
}

const GapQuestionSchema = new Schema<IGapQuestion>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    relatedFindingId: {
      type: Schema.Types.ObjectId,
      ref: "Finding",
    },
    question: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "answered", "approved"],
      default: "pending",
    },
    answer: {
      type: String,
      default: "",
    },
    answeredBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    answeredAt: {
      type: Date,
      default: null,
    },
    evidence_badge: {
      type: String,
      default: "Self-reported",
    },
    gap_category: {
      type: String,
      enum: [
        "missing_owner",
        "missing_rationale",
        "unknown_claim",
        "conflicting_sources",
      ],
      default: null,
    },
  },
  {
    timestamps: true,
    collection: "gap_questions",
  }
);

export const GapQuestion = mongoose.model<IGapQuestion>(
  "GapQuestion",
  GapQuestionSchema
);

