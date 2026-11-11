import mongoose from "mongoose";
import { env } from "./env.js";

let connectionPromise: Promise<void> | null = null;

/**
 * Ensures Mongoose is connected once per Node/serverless worker instance.
 * Safe for concurrent cold-start invocations on Vercel.
 */
export const ensureDBConnection = async (): Promise<void> => {
  if (mongoose.connection.readyState === 1) {
    return;
  }

  if (!connectionPromise) {
    connectionPromise = mongoose
      .connect(env.MONGO_URI, { serverSelectionTimeoutMS: 10000 })
      .then(() => undefined)
      .catch((err) => {
        connectionPromise = null;
        throw err;
      });
  }

  await connectionPromise;
};

/**
 * Establishes a resilient connection to MongoDB using Mongoose.
 */
export const connectDB = async (): Promise<void> => {
  try {
    mongoose.connection.on("connected", () => {
      console.log("[Sanchaya Backend] MongoDB connection established.");
    });

    mongoose.connection.on("error", (err) => {
      console.error("[Sanchaya Backend] MongoDB connection runtime error:", err);
    });

    mongoose.connection.on("disconnected", () => {
      console.warn("[Sanchaya Backend] MongoDB connection disconnected.");
      connectionPromise = null;
    });

    await ensureDBConnection();
  } catch (error) {
    console.error("[Sanchaya Backend] Initial MongoDB connection error:", error);
  }
};

/**
 * Closes the active Mongoose connection cleanly.
 */
export const closeDB = async (): Promise<void> => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close(false);
    console.log("[Sanchaya Backend] Mongoose connection closed cleanly.");
  }
};
