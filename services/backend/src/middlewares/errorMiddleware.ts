import { Request, Response, NextFunction } from "express";
import multer from "multer";

export interface AppError extends Error {
  statusCode?: number;
  status?: number;
  code?: number | string;
  value?: any;
  path?: string;
  errors?: Record<string, any>;
}

/**
 * Standardized global 4-argument error-handling middleware.
 * Intercepts unhandled exceptions, normalizes Mongoose, Multer & validation errors,
 * formats a consistent JSON envelope, and prevents stack trace leakage.
 */
export const errorHandler = (
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  let statusCode =
    err.statusCode ||
    err.status ||
    500;
  let errorMessage = err.message || "Internal Server Error";
  let fieldErrors: Record<string, string[]> | undefined = err.errors;

  // 0. Multer file upload errors (size limits, unexpected fields, etc.)
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      statusCode = 413;
      errorMessage = "Uploaded file exceeds the 10 MB size limit.";
    } else {
      statusCode = 400;
      errorMessage = err.message || "Invalid file upload request";
    }
  }

  // 1. Mongoose CastError (e.g. invalid MongoDB ObjectId format in route parameter)
  else if (err.name === "CastError") {
    statusCode = 400;
    errorMessage = `Invalid identifier format: '${err.value}' for field '${err.path || "id"}'`;
  }

  // 2. MongoDB Duplicate Key Conflict (E11000)
  else if (err.code === 11000) {
    statusCode = 409;
    errorMessage = "A resource with that unique identifier already exists";
  }

  // 3. Mongoose Schema Validation Error
  else if (err.name === "ValidationError" && err.errors) {
    statusCode = 400;
    errorMessage = "Database validation failed";
    fieldErrors = {};
    for (const [field, errorObj] of Object.entries(err.errors)) {
      fieldErrors[field] = [(errorObj as any).message || "Invalid value"];
    }
  }

  // Log error on server for observability in dev mode
  if (process.env.NODE_ENV === "development") {
    console.error(`[Sanchaya Backend Error] ${statusCode}:`, err);
  }

  res.status(statusCode).json({
    success: false,
    error: errorMessage,
    ...(fieldErrors ? { errors: fieldErrors } : {}),
  });
};
