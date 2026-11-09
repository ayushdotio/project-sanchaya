import mongoose, { Document, Schema, Types } from "mongoose";

export interface IGapQuestion extends Document {
  projectId: Types.ObjectId;
  relatedFindingId?: Types.ObjectId;
  question: string;
  status: "pending" | "answered" | "approved";
  answer?: string;
  answeredBy?: Types.ObjectId | null;
  answeredAt?: Date | null;
  evidence_badge: string;
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

