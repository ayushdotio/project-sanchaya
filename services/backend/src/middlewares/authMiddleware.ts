import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { JWTPayload, UserRole } from "../types/auth.types.js";

/**
 * Validates the Authorization Bearer JWT on protected routes.
 */
export const authenticateToken = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    res.status(401).json({
      success: false,
      error: "Unauthorized: Missing authentication token",
    });
    return;
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as JWTPayload;
    req.user = decoded;
    next();
  } catch (_err) {
    res.status(401).json({
      success: false,
      error: "Unauthorized: Invalid or expired token",
    });
  }
};

/**
 * Strict Role-Based Access Control (RBAC) guard.
 */
export const requireRoles = (roles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: "Unauthorized: User context missing",
      });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: `Access denied. Requires one of roles: [${roles.join(", ")}]`,
      });
      return;
    }

    next();
  };
};

