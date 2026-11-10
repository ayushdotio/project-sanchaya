import { Router } from "express";
import { z } from "zod";
import { authenticateToken } from "../middlewares/authMiddleware.js";
import { validateBody } from "../middlewares/validate.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  registerController,
  loginController,
  getmeController,
  forgotPasswordController,
  resetPasswordController,
} from "../controllers/auth.controller.js";

const router = Router();

// Validation Schemas
const registerSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters"),
  email: z.string().trim().email("Invalid email address"),
  password: z.string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character"),
  // "role" is intentionally excluded — clients cannot self-assign roles.
  // All users register as "incoming". Use a protected admin route to promote.
});

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
});

const resetPasswordSchema = z.object({
  token: z.string().length(64, "Reset token must be exactly 64 characters"),
  newPassword: z.string()
    .min(8, "New password must be at least 8 characters")
    .regex(/[A-Z]/, "New password must contain at least one uppercase letter")
    .regex(/[0-9]/, "New password must contain at least one number")
    .regex(/[^A-Za-z0-9]/, "New password must contain at least one special character"),
});

/**
 * POST /api/auth/register
 */
router.post("/register", validateBody(registerSchema), asyncHandler(registerController));

/**
 * POST /api/auth/login
 */
router.post("/login", validateBody(loginSchema), asyncHandler(loginController));

/**
 * GET /api/auth/me
 */
router.get("/me", authenticateToken, asyncHandler(getmeController));

/**
 * POST /api/auth/forgot-password
 * Constant-time response to prevent user account enumeration
 */
router.post(
  "/forgot-password",
  validateBody(forgotPasswordSchema),
  asyncHandler(forgotPasswordController),
);

/**
 * POST /api/auth/reset-password
 */
router.post(
  "/reset-password",
  validateBody(resetPasswordSchema),
  asyncHandler(resetPasswordController),
);

export default router;
