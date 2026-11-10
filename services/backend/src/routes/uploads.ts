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
 * @name : Upload Meeting Notes API
 * @route : POST /api/projects/:projectId/uploads/notes (aliased with /upload-document)
 * @access : Protected (requires valid JWT via `authenticateToken`, role `"leader"` or `"outgoing"` via `requireRoles`, and multipart field `"file"` via `upload.single("file")`)
 * @description : Stage 1 ingestion endpoint for PDF, DOCX, and TXT meeting notes with pre-AI secret/PII redaction.
 *   1. `upload.single("file")` buffers the file in memory (10 MB max, allowed extensions `.pdf`/`.docx`/`.txt`/`.csv`)
 *      and sanitizes `file.originalname`.
 *   2. Validates `req.file` is present (`400 Bad Request` if missing) and verifies the target project exists
 *      via `Project.findById(projectId)` (`404 Not Found` if missing).
 *   3. Extracts raw text via `extractDocumentText(file.buffer, file.originalname)` and runs deterministic
 *      Pre-AI redaction via `scanAndRedact(rawText)` before any persistence.
 *   4. Assigns a canonical `SRC-DOC-<6-hex-chars>` `source_id` and persists a `SourceRecord` (`source_type: "document"`)
 *      with `redacted_content`, `metadata` (`redactionCount`, `author`), and `created_at` / `updated_at` / `imported_at`.
 *   5. Responds with `201 Created` containing `{ success: true, message, data: { id, source_id, origin, redactionCount, created_at } }`.
 */
router.post(
  ["/:projectId/uploads/notes", "/:projectId/upload-document"],
  authenticateToken,
  requireRoles(["leader", "outgoing"]),
  upload.single("file"),
  asyncHandler(uploadNotesController),
);

/**
 * @name : Upload CSV Task Tracker API
 * @route : POST /api/projects/:projectId/uploads/tasks (aliased with /upload-tasks)
 * @access : Protected (requires valid JWT via `authenticateToken`, role `"leader"` or `"outgoing"` via `requireRoles`, and multipart field `"file"` via `upload.single("file")`)
 * @description : Stage 1 ingestion endpoint for CSV task trackers with pre-AI secret/PII redaction.
 *   1. `upload.single("file")` buffers the uploaded file in memory (10 MB max) and sanitizes `file.originalname`.
 *   2. Validates `req.file` is present (`400 Bad Request` if missing) and verifies the target project exists
 *      via `Project.findById(projectId)` (`404 Not Found` if missing).
 *   3. Parses the CSV buffer via `parseTaskCsv(file.buffer)` into normalized tasks and `serializedContent`,
 *      then runs deterministic Pre-AI redaction via `scanAndRedact(serializedContent)`.
 *   4. Assigns a canonical `SRC-TSK-<6-hex-chars>` `source_id` and persists a `SourceRecord` (`source_type: "task"`)
 *      with `redacted_content`, `metadata` (`redactionCount`, `author`, `itemCount`), and `created_at` / `updated_at` / `imported_at`.
 *   5. Responds with `201 Created` containing `{ success: true, message, data: { id, source_id, taskCount, redactionCount, created_at } }`.
 */
router.post(
  ["/:projectId/uploads/tasks", "/:projectId/upload-tasks"],
  authenticateToken,
  requireRoles(["leader", "outgoing"]),
  upload.single("file"),
  asyncHandler(uploadTasksController),
);

/**
 * @name : List Project Sources API
 * @route : GET /api/projects/:projectId/sources
 * @access : Protected (requires valid JWT via `authenticateToken` and role `"leader"` or `"outgoing"` via `requireRoles`; `"incoming"` receives `403`)
 * @description : Lists ingested source records for a project without exposing full redacted text blobs.
 *   1. Enforces authentication (`401`) and the Stage 1 hard isolation gate (`403` for `"incoming"` users).
 *   2. Filters `SourceRecord` by `projectId` (and optional `req.query.type` mapped to `source_type`),
 *      excludes `redacted_content` (`.select("-redacted_content")`), and sorts by `imported_at` descending.
 *   3. Responds with `200 OK` containing `{ success: true, data: sources }`.
 */
router.get(
  "/:projectId/sources",
  authenticateToken,
  requireRoles(["leader", "outgoing"]),
  asyncHandler(getSourcesController),
);

/**
 * @name : Get Source Record Details API
 * @route : GET /api/projects/:projectId/sources/:sourceId
 * @access : Protected (requires valid JWT via `authenticateToken` and role `"leader"` or `"outgoing"` via `requireRoles`; `"incoming"` receives `403`)
 * @description : Retrieves a single source record (including its `redacted_content`) by canonical `source_id`.
 *   1. Enforces authentication (`401`) and the Stage 1 hard isolation gate (`403` for `"incoming"` users).
 *   2. Queries `SourceRecord.findOne({ projectId, source_id: sourceId })`; returns `404 Not Found` if missing.
 *   3. Responds with `200 OK` containing `{ success: true, data: source }`.
 */
router.get(
  "/:projectId/sources/:sourceId",
  authenticateToken,
  requireRoles(["leader", "outgoing"]),
  asyncHandler(fetchSourceDetailsController),
);

export default router;
