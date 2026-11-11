import multer from "multer";
import path from "path";
import { Request } from "express";

const NOTE_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "application/octet-stream",
]);

const TASK_MIME_TYPES = new Set([
  "text/csv",
  "application/csv",
  "application/vnd.ms-excel",
  "text/plain",
  "application/octet-stream",
]);

const NOTE_EXTENSIONS = new Set([".pdf", ".docx", ".txt"]);
const TASK_EXTENSIONS = new Set([".csv"]);
const ALL_EXTENSIONS = new Set([...NOTE_EXTENSIONS, ...TASK_EXTENSIONS]);
const ALL_MIME_TYPES = new Set([...NOTE_MIME_TYPES, ...TASK_MIME_TYPES]);

const storage = multer.memoryStorage();

export const createUploadMiddleware = (
  allowedExtensions: Set<string>,
  allowedMimeTypes: Set<string>,
  label: string,
) => {
  const fileFilter = (
    _req: Request,
    file: Express.Multer.File,
    cb: multer.FileFilterCallback,
  ) => {
    const ext = path.extname(file.originalname).toLowerCase();

    // Sanitize original filename against directory traversal
    file.originalname = path.basename(file.originalname);

    if (allowedExtensions.has(ext) && allowedMimeTypes.has(file.mimetype)) {
      cb(null, true);
    } else {
      const err = new Error(
        `Unsupported file type '${ext || file.mimetype}'. Only ${label} files are allowed.`,
      ) as Error & { statusCode?: number };
      err.statusCode = 400;
      cb(err);
    }
  };

  return multer({
    storage,
    limits: {
      fileSize: 10 * 1024 * 1024, // 10 MB limit
      files: 5,
    },
    fileFilter,
  });
};

export const uploadNotes = createUploadMiddleware(
  NOTE_EXTENSIONS,
  NOTE_MIME_TYPES,
  ".pdf, .docx, and .txt",
);

export const uploadTasks = createUploadMiddleware(
  TASK_EXTENSIONS,
  TASK_MIME_TYPES,
  ".csv",
);

export const upload = createUploadMiddleware(
  ALL_EXTENSIONS,
  ALL_MIME_TYPES,
  ".pdf, .docx, .txt, and .csv",
);
