import { Request, Response, NextFunction } from "express";
import { ZodSchema } from "zod";

/**
 * Validates req.body using the provided Zod schema.
 */
export const validateBody = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        success: false,
        error: "Validation failed",
        errors: result.error.flatten().fieldErrors,
      });
      return;
    }
    req.body = result.data;
    next();
  };
};

/**
 * Validates req.query using the provided Zod schema.
 */
export const validateQuery = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      res.status(400).json({
        success: false,
        error: "Invalid query parameters",
        errors: result.error.flatten().fieldErrors,
      });
      return;
    }
    (req as any).validatedQuery = result.data;
    Object.defineProperty(req, "query", {
      value: result.data,
      configurable: true,
      enumerable: true,
      writable: true,
    });
    next();
  };
};

/**
 * Validates req.params using the provided Zod schema.
 */
export const validateParams = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      res.status(400).json({
        success: false,
        error: "Invalid route parameters",
        errors: result.error.flatten().fieldErrors,
      });
      return;
    }
    req.params = result.data as any;
    next();
  };
};

