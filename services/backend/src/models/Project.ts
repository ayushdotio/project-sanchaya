import mongoose, { Document, Schema, Types } from "mongoose";
import {
  IReadinessChecklist,
  ReadinessStatus,
  SourceType,
} from "../types/source.types.js";

export interface IProject extends Document {
  name: string;
  description?: string;
  githubRepo?: string;
  members: {
    leaderId: Types.ObjectId;
    outgoingIds: Types.ObjectId[];
    incomingIds: Types.ObjectId[];
  };
  readinessChecklist: IReadinessChecklist;
  readinessStatus: ReadinessStatus;
  approvedBy?: Types.ObjectId | null;
  approvedAt?: Date | null;
  approvedSnapshotHash?: string | null;
  plannedSourceTypes?: SourceType[];
  recipientScope?: string[];
  createdAt: Date;
  updatedAt: Date;
}

const ProjectSchema = new Schema<IProject>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
    },
    githubRepo: {
      type: String,
      trim: true,
      default: "",
    },
    members: {
      leaderId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
      outgoingIds: [
        {
          type: Schema.Types.ObjectId,
          ref: "User",
        },
      ],
      incomingIds: [
        {
          type: Schema.Types.ObjectId,
          ref: "User",
        },
      ],
    },
    readinessChecklist: {
      sourcesVerified: { type: Boolean, default: false },
      decisionsBackedByEvidence: { type: Boolean, default: false },
      unfinishedTasksAssignedOrUnknown: { type: Boolean, default: false },
      blockersIdentified: { type: Boolean, default: false },
      conflictsDisclosed: { type: Boolean, default: false },
      recipientPermissionsChecked: { type: Boolean, default: false },
      leaderApprovalRecorded: { type: Boolean, default: false },
    },
    readinessStatus: {
      type: String,
      enum: ["Needs Attention", "Ready for Review", "Approved for Sharing"],
      default: "Needs Attention",
    },
    approvedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    approvedSnapshotHash: {
      type: String,
      default: null,
    },
    plannedSourceTypes: {
      type: [String],
      enum: ["github", "document", "task"],
      default: [],
    },
    recipientScope: {
      type: [String],
      default: ["project"],
    },
  },
  {
    timestamps: true,
    collection: "projects",
  }
);

export const Project = mongoose.model<IProject>("Project", ProjectSchema);

