import mongoose, { Document, Schema, Types } from "mongoose";
import { ISourceRecordMetadata, SourceType } from "../types/source.types.js";

export interface ISourceRecord extends Document {
  projectId: Types.ObjectId;
  source_id: string;
  source_type: SourceType;
  origin: string;
  raw_filename: string;
  redacted_content: string;
  metadata: ISourceRecordMetadata;
  created_at: Date;
  updated_at: Date;
  imported_at: Date;
  createdAt: Date;
  updatedAt: Date;
}

const SourceRecordSchema = new Schema<ISourceRecord>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    source_id: {
      type: String,
      required: true,
      index: true,
    },
    source_type: {
      type: String,
      enum: ["github", "document", "task"],
      required: true,
    },
    origin: {
      type: String,
      required: true,
    },
    raw_filename: {
      type: String,
      default: "",
    },
    redacted_content: {
      type: String,
      required: true,
    },
    metadata: {
      redactionCount: { type: Number, default: 0 },
      author: { type: String, default: "" },
      url: { type: String, default: "" },
      fileId: { type: String, default: "" },
      filePath: { type: String, default: "" },
      sha: { type: String, default: "" },
      branch: { type: String, default: "" },
      itemCount: { type: Number, default: 0 },
    },
    created_at: {
      type: Date,
      required: true,
    },
    updated_at: {
      type: Date,
      required: true,
    },
    imported_at: {
      type: Date,
      default: () => new Date(),
    },
  },
  {
    timestamps: true,
    collection: "source_records",
  }
);

SourceRecordSchema.index({ projectId: 1, source_id: 1 }, { unique: true });

export const SourceRecord = mongoose.model<ISourceRecord>(
  "SourceRecord",
  SourceRecordSchema
);

