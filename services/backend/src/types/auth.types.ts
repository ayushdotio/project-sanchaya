import { Request } from "express";

export type UserRole = "leader" | "outgoing" | "incoming";

export interface JWTPayload {
  userId: string;
  email: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}

export interface AuthenticatedRequest extends Request {
  user?: JWTPayload;
}

declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
    }
  }
}

