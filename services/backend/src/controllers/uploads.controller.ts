import { Request, Response } from "express";
import crypto from "crypto";
import { SourceRecord } from "../models/SourceRecord.js";
import { Project } from "../models/Project.js";
import { extractDocumentText } from "../services/documentParser.js";
import { parseTaskCsv } from "../services/taskParser.js";
import { scanAndRedact } from "../services/secretScanner.js";
import { storageService } from "../services/storageService.js";
import { isProjectMember } from "../middlewares/authMiddleware.js";

const VALID_SOURCE_TYPES = new Set(["github", "document", "task"]);

/**
 * Helper to generate deterministic canonical ID: SRC-DOC-xxx or SRC-TSK-xxx
 */
const generateCanonicalId = (prefix: "SRC-DOC" | "SRC-TSK"): string => {
  const rand = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `${prefix}-${rand}`;
};

const markSourcesVerifiedIfSupported = async (project: any): Promise<void> => {
  if (
    project &&
    typeof project.save === "function" &&
    project.readinessChecklist &&
    !project.readinessChecklist.sourcesVerified
  ) {
    project.readinessChecklist.sourcesVerified = true;
    await project.save();
  }
};

const uploadNotesController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { projectId } = req.params;
  const file = req.file;

  if (!file) {
    res
      .status(400)
      .json({ success: false, error: "No document file uploaded" });
    return;
  }

  const project = (req as any).project || (await Project.findById(projectId));
  if (!project) {
    res.status(404).json({ success: false, error: "Project not found" });
    return;
  }
  if (!isProjectMember(project, req.user!.userId)) {
    res.status(403).json({
      success: false,
      error: "Access denied: You are not a member of this project",
    });
    return;
  }

  // 1. Extract raw text from file buffer
  let rawText: string;
  try {
    rawText = await extractDocumentText(file.buffer, file.originalname);
  } catch (err: any) {
    const parseErr = new Error(
      err?.message || "Failed to parse uploaded document.",
    ) as Error & { statusCode?: number };
    parseErr.statusCode = 400;
    throw parseErr;
  }

  if (!rawText || !rawText.trim()) {
    res.status(400).json({
      success: false,
      error:
        "Uploaded document contains no extractable text (e.g. empty file or scanned image-only PDF).",
    });
    return;
  }

  // 2. Pre-AI Deterministic Secret & PII Scanning (Stage 1 Invariant)
  const { redactedText, redactionCount } = scanAndRedact(rawText);

  // 3. Upload document binary to ImageKit under /sanchaya/<projectId>
  const projectIdStr = String(project._id);
  const uploadedFile = await storageService.uploadDocument({
    buffer: file.buffer,
    fileName: file.originalname,
    projectId: projectIdStr,
    tags: ["sanchaya", "document", projectIdStr],
  });

  // 4. Assign deterministic canonical ID & ISO-8601 timestamps (rollback ImageKit on DB error)
  const now = new Date();
  let sourceRecord: any;
  try {
    sourceRecord = await SourceRecord.create({
      projectId: project._id,
      source_id: generateCanonicalId("SRC-DOC"),
      source_type: "document",
      origin: file.originalname,
      raw_filename: file.originalname,
      redacted_content: redactedText,
      metadata: {
        redactionCount,
        author: req.user!.email,
        url: uploadedFile.url,
        fileId: uploadedFile.fileId,
        filePath: uploadedFile.filePath,
      },
      created_at: now,
      updated_at: now,
      imported_at: now,
    });
  } catch (dbErr) {
    await storageService.deleteDocument(uploadedFile.fileId).catch((cleanupErr) => {
      console.warn(
        `[Upload Notes] Failed to rollback ImageKit file '${uploadedFile.fileId}':`,
        cleanupErr?.message || cleanupErr,
      );
    });
    throw dbErr;
  }

  await markSourcesVerifiedIfSupported(project);

  res.status(201).json({
    success: true,
    message: `Document ingested successfully with ${redactionCount} secrets/PII redacted`,
    data: {
      id: sourceRecord._id,
      source_id: sourceRecord.source_id,
      origin: sourceRecord.origin,
      redactionCount,
      fileId: uploadedFile.fileId,
      fileUrl: uploadedFile.url,
      filePath: uploadedFile.filePath,
      created_at: sourceRecord.created_at,
    },
  });
};

const uploadTasksController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { projectId } = req.params;
  const file = req.file;

  if (!file) {
    res
      .status(400)
      .json({ success: false, error: "No CSV task file uploaded" });
    return;
  }

  const project = (req as any).project || (await Project.findById(projectId));
  if (!project) {
    res.status(404).json({ success: false, error: "Project not found" });
    return;
  }
  if (!isProjectMember(project, req.user!.userId)) {
    res.status(403).json({
      success: false,
      error: "Access denied: You are not a member of this project",
    });
    return;
  }

  // 1. Parse CSV rows
  let parsed: ReturnType<typeof parseTaskCsv>;
  try {
    parsed = parseTaskCsv(file.buffer);
  } catch (err: any) {
    const parseErr = new Error(
      `Invalid CSV task tracker format: ${err?.message || "unable to parse CSV"}`,
    ) as Error & { statusCode?: number };
    parseErr.statusCode = 400;
    throw parseErr;
  }

  const { serializedContent, count } = parsed;
  if (count === 0 || !serializedContent.trim()) {
    res.status(400).json({
      success: false,
      error: "Uploaded CSV file contains no task rows to ingest.",
    });
    return;
  }

  // 2. Pre-AI Deterministic Secret & PII Scanning
  const { redactedText, redactionCount } = scanAndRedact(serializedContent);

  // 3. Persist to MongoDB
  const now = new Date();
  const sourceRecord = await SourceRecord.create({
    projectId: project._id,
    source_id: generateCanonicalId("SRC-TSK"),
    source_type: "task",
    origin: file.originalname,
    raw_filename: file.originalname,
    redacted_content: redactedText,
    metadata: {
      redactionCount,
      author: req.user!.email,
      itemCount: count,
    },
    created_at: now,
    updated_at: now,
    imported_at: now,
  });

  await markSourcesVerifiedIfSupported(project);

  res.status(201).json({
    success: true,
    message: `Task tracker with ${count} tasks ingested. ${redactionCount} secrets/PII redacted.`,
    data: {
      id: sourceRecord._id,
      source_id: sourceRecord.source_id,
      taskCount: count,
      redactionCount,
      created_at: sourceRecord.created_at,
    },
  });
};

const getSourcesController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { projectId } = req.params;
  const rawType = typeof req.query.type === "string" ? req.query.type.trim().toLowerCase() : "";

  const query: Record<string, any> = { projectId };
  if (rawType && rawType !== "all") {
    if (!VALID_SOURCE_TYPES.has(rawType)) {
      res.status(400).json({
        success: false,
        error: `Invalid source type '${rawType}'. Allowed values: github, document, task.`,
      });
      return;
    }
    query.source_type = rawType;
  }

  const sources = await SourceRecord.find(query)
    .select("-redacted_content") // exclude large blobs from list view
    .sort({ imported_at: -1 });

  res.status(200).json({
    success: true,
    data: sources,
  });
};

const fetchSourceDetailsController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { projectId, sourceId } = req.params;

  const source = await SourceRecord.findOne({
    projectId,
    source_id: sourceId,
  });

  if (!source) {
    res.status(404).json({ success: false, error: "Source record not found" });
    return;
  }

  res.status(200).json({
    success: true,
    data: source,
  });
};

const listProjectDocsController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { projectId } = req.params;

  const project = (req as any).project || (await Project.findById(projectId));
  if (!project) {
    res.status(404).json({ success: false, error: "Project not found" });
    return;
  }
  if (!isProjectMember(project, req.user!.userId)) {
    res.status(403).json({
      success: false,
      error: "Access denied: You are not a member of this project",
    });
    return;
  }

  const docs = await storageService.listProjectDocuments(String(project._id));

  res.status(200).json({
    success: true,
    data: docs,
  });
};

const fetchProjectDocController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { projectId, fileId } = req.params;

  const project = (req as any).project || (await Project.findById(projectId));
  if (!project) {
    res.status(404).json({ success: false, error: "Project not found" });
    return;
  }
  if (!isProjectMember(project, req.user!.userId)) {
    res.status(403).json({
      success: false,
      error: "Access denied: You are not a member of this project",
    });
    return;
  }

  const projectIdStr = String(project._id);
  let doc: Awaited<ReturnType<typeof storageService.getDocumentDetails>>;
  try {
    doc = await storageService.getDocumentDetails(String(fileId));
  } catch (err: any) {
    const status = err?.status || err?.statusCode;
    if (status === 404) {
      res
        .status(404)
        .json({ success: false, error: "Document not found in storage" });
      return;
    }
    throw err;
  }

  const expectedPrefix = `${storageService.getProjectFolder(projectIdStr)}/`;

  if (!doc.filePath.startsWith(expectedPrefix)) {
    res
      .status(404)
      .json({ success: false, error: "Document not found in project storage" });
    return;
  }

  res.status(200).json({
    success: true,
    data: doc,
  });
};

export {
  uploadNotesController,
  uploadTasksController,
  getSourcesController,
  fetchSourceDetailsController,
  listProjectDocsController,
  fetchProjectDocController,
};
