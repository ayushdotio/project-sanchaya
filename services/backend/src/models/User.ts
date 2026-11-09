import mongoose, { Document, Schema } from "mongoose";
import { UserRole } from "../types/auth.types.js";

export interface IUser extends Document {
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  resetPasswordToken?: string;
  resetPasswordExpires?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false, // Never return passwordHash in standard queries
    },
    role: {
      type: String,
      enum: ["leader", "outgoing", "incoming"],
      default: "incoming",
      required: true,
    },
    resetPasswordToken: {
      type: String,
      select: false,
    },
    resetPasswordExpires: {
      type: Date,
      select: false,
    },
  },
  {
    timestamps: true,
    collection: "users",
  }
);

export const User = mongoose.model<IUser>("User", UserSchema);

