import multer from "multer";
import path from "path";
import { Request } from "express";

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/csv",
  "application/csv",
  "application/vnd.ms-excel",
]);

const ALLOWED_EXTENSIONS = new Set([".pdf", ".docx", ".txt", ".csv"]);

const storage = multer.memoryStorage();

const fileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  const ext = path.extname(file.originalname).toLowerCase();
  
  // Sanitize original filename against directory traversal
  file.originalname = path.basename(file.originalname);

  if (ALLOWED_EXTENSIONS.has(ext) && ALLOWED_MIME_TYPES.has(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        `Unsupported file type '${ext}'. Only .pdf, .docx, .txt, and .csv are allowed.`
      )
    );
  }
};

export const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB limit
    files: 5,
  },
  fileFilter,
});

