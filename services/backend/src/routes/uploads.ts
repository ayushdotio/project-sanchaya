import { Router } from "express";
import crypto from "crypto";
import {
  authenticateToken,
  requireRoles,
} from "../middlewares/authMiddleware.js";
import { upload } from "../middlewares/uploadMiddleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  uploadNotesController,
  uploadTasksController,
  getSourcesController,
  fetchSourceDetailsController,
} from "../controllers/uploads.controller.js";

const router = Router();

/**
 * Helper to generate deterministic canonical ID: SRC-DOC-xxx or SRC-TSK-xxx
 */
const generateCanonicalId = (prefix: "SRC-DOC" | "SRC-TSK"): string => {
  const rand = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `${prefix}-${rand}`;
};

/**
 * POST /api/projects/:projectId/uploads/notes (aliased with /upload-document)
 * Stage 1 Ingestion: Ingests PDF/DOCX/TXT meeting notes with pre-AI secret redaction
 */
router.post(
  ["/:projectId/uploads/notes", "/:projectId/upload-document"],
  authenticateToken,
  requireRoles(["leader", "outgoing"]),
  upload.single("file"),
  asyncHandler(uploadNotesController),
);

/**
 * POST /api/projects/:projectId/uploads/tasks (aliased with /upload-tasks)
 * Stage 1 Ingestion: Ingests CSV task tracker with pre-AI secret redaction
 */
router.post(
  ["/:projectId/uploads/tasks", "/:projectId/upload-tasks"],
  authenticateToken,
  requireRoles(["leader", "outgoing"]),
  upload.single("file"),
  asyncHandler(uploadTasksController),
);

/**
 * GET /api/projects/:projectId/sources
 * Hard Isolation: Only leader and outgoing member may view source records (incoming receives 403)
 */
router.get(
  "/:projectId/sources",
  authenticateToken,
  requireRoles(["leader", "outgoing"]),
  asyncHandler(getSourcesController),
);

/**
 * GET /api/projects/:projectId/sources/:sourceId
 * Retrieve a specific source record including its redacted content
 */
router.get(
  "/:projectId/sources/:sourceId",
  authenticateToken,
  requireRoles(["leader", "outgoing"]),
  asyncHandler(fetchSourceDetailsController),
);

export default router;
