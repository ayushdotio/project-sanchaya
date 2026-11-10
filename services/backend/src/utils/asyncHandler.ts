import { Request, Response, NextFunction } from "express";

/**
 * Wraps an async Express route handler and forwards any thrown errors
 * to the next() error pipeline, ensuring they reach the global errorHandler
 * in errorMiddleware.ts instead of crashing as unhandled promise rejections.
 *
 * Usage:
 *   router.get("/path", asyncHandler(async (req, res) => { ... }));
 */
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };

