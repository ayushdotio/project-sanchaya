import { Request, Response } from "express";
import crypto from "crypto";
import { SourceRecord } from "../models/SourceRecord.js";
import { Project } from "../models/Project.js";
import { extractDocumentText } from "../services/documentParser.js";
import { parseTaskCsv } from "../services/taskParser.js";
import { scanAndRedact } from "../services/secretScanner.js";
import { storageService } from "../services/storageService.js";
import { isProjectMember } from "../middlewares/authMiddleware.js";

/**
 * Helper to generate deterministic canonical ID: SRC-DOC-xxx or SRC-TSK-xxx
 */
const generateCanonicalId = (prefix: "SRC-DOC" | "SRC-TSK"): string => {
  const rand = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `${prefix}-${rand}`;
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

  const project = await Project.findById(projectId);
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
  const rawText = await extractDocumentText(file.buffer, file.originalname);

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

  // 4. Assign deterministic canonical ID & ISO-8601 timestamps
  const now = new Date();
  const sourceRecord = await SourceRecord.create({
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

  const project = await Project.findById(projectId);
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
  const { tasks, serializedContent, count } = parseTaskCsv(file.buffer);

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
  const { type } = req.query;

  const query: Record<string, any> = { projectId };
  if (type) {
    query.source_type = type;
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

  const project = await Project.findById(projectId);
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

  const project = await Project.findById(projectId);
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
  const doc = await storageService.getDocumentDetails(String(fileId));
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
