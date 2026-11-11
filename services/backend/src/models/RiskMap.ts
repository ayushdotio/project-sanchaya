import mongoose, { Document, Schema, Types } from "mongoose";

export type RiskTier = "High" | "Medium" | "Low" | "Insufficient data";

export interface IRiskMap extends Document {
  projectId: Types.ObjectId;
  modulePath: string;
  primaryContributor: string;
  contributionPercentage: number;
  totalCommits: number;
  riskTier: RiskTier;
  notes: string[];
  updatedAt: Date;
}

const RiskMapSchema = new Schema<IRiskMap>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    modulePath: {
      type: String,
      required: true,
    },
    primaryContributor: {
      type: String,
      required: true,
    },
    contributionPercentage: {
      type: Number,
      required: true,
    },
    totalCommits: {
      type: Number,
      required: true,
    },
    riskTier: {
      type: String,
      enum: ["High", "Medium", "Low", "Insufficient data"],
      required: true,
    },
    notes: {
      type: [String],
      default: [],
    },
    updatedAt: {
      type: Date,
      default: () => new Date(),
    },
  },
  {
    collection: "risk_maps",
  },
);

export const RiskMap = mongoose.model<IRiskMap>("RiskMap", RiskMapSchema);

