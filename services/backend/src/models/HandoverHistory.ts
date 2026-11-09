import mongoose, { Document, Schema, Types } from "mongoose";

export interface IHandoverHistory extends Document {
  projectId: Types.ObjectId;
  version: number;
  approvedSnapshot: Record<string, any>;
  pdfExportedAt?: Date;
  acknowledgedBy?: Types.ObjectId;
  acknowledgedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const HandoverHistorySchema = new Schema<IHandoverHistory>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    version: {
      type: Number,
      default: 1,
    },
    approvedSnapshot: {
      type: Schema.Types.Mixed,
      default: {},
    },
    pdfExportedAt: {
      type: Date,
    },
    acknowledgedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    acknowledgedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    collection: "handover_history",
  }
);

export const HandoverHistory = mongoose.model<IHandoverHistory>(
  "HandoverHistory",
  HandoverHistorySchema
);

