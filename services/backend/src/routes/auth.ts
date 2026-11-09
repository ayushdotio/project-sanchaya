import { Router, Request, Response } from "express";
import bcrypt from "bcrypt";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { env } from "../config/env.js";
import { User } from "../models/User.js";
import { authenticateToken } from "../middlewares/authMiddleware.js";
import { validateBody } from "../middlewares/validate.js";
import { JWTPayload } from "../types/auth.types.js";

const router = Router();

// Validation Schemas
const registerSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  role: z.enum(["leader", "outgoing", "incoming"]).default("incoming"),
});

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1, "Reset token is required"),
  newPassword: z.string().min(6, "New password must be at least 6 characters"),
});

/**
 * POST /api/auth/register
 */
router.post(
  "/register",
  validateBody(registerSchema),
  async (req: Request, res: Response): Promise<void> => {
    const { name, email, password, role } = req.body;

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      res.status(409).json({
        success: false,
        error: "A user with this email address already exists",
      });
      return;
    }

    const passwordHash = await bcrypt.hash(password, env.BCRYPT_SALT_ROUNDS);

    const user = await User.create({
      name,
      email: email.toLowerCase(),
      passwordHash,
      role,
    });

    const payload: JWTPayload = {
      userId: user._id.toString(),
      email: user.email,
      role: user.role,
    };

    const token = jwt.sign(payload, env.JWT_SECRET, {
      expiresIn: env.JWT_EXPIRES_IN as any,
    });

    res.status(201).json({
      success: true,
      message: "User registered successfully",
      data: {
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      },
    });
  }
);

/**
 * POST /api/auth/login
 */
router.post(
  "/login",
  validateBody(loginSchema),
  async (req: Request, res: Response): Promise<void> => {
    const { email, password } = req.body;

    // Explicitly select passwordHash which has select: false
    const user = await User.findOne({ email: email.toLowerCase() }).select("+passwordHash");
    if (!user) {
      res.status(401).json({
        success: false,
        error: "Invalid email or password",
      });
      return;
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      res.status(401).json({
        success: false,
        error: "Invalid email or password",
      });
      return;
    }

    const payload: JWTPayload = {
      userId: user._id.toString(),
      email: user.email,
      role: user.role,
    };

    const token = jwt.sign(payload, env.JWT_SECRET, {
      expiresIn: env.JWT_EXPIRES_IN as any,
    });

    res.status(200).json({
      success: true,
      message: "Authentication successful",
      data: {
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      },
    });
  }
);

/**
 * GET /api/auth/me
 */
router.get("/me", authenticateToken, async (req: Request, res: Response): Promise<void> => {
  const user = await User.findById(req.user?.userId);
  if (!user) {
    res.status(404).json({ success: false, error: "User not found" });
    return;
  }

  res.status(200).json({
    success: true,
    data: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  });
});

/**
 * POST /api/auth/forgot-password
 * Constant-time response to prevent user account enumeration
 */
router.post(
  "/forgot-password",
  validateBody(forgotPasswordSchema),
  async (req: Request, res: Response): Promise<void> => {
    const { email } = req.body;

    const user = await User.findOne({ email: email.toLowerCase() });
    if (user) {
      const resetToken = crypto.randomBytes(32).toString("hex");
      const hashedToken = crypto.createHash("sha256").update(resetToken).digest("hex");

      user.resetPasswordToken = hashedToken;
      user.resetPasswordExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 mins expiry
      await user.save();

      // In production, send via email service. In dev, log to stdout
      if (env.NODE_ENV !== "production") {
        console.log(`[Dev Password Reset Token for ${user.email}]: ${resetToken}`);
      }
    }

    // Always return identical 200 OK message to prevent account enumeration
    res.status(200).json({
      success: true,
      message: "If that email is registered, password reset instructions have been generated.",
    });
  }
);

/**
 * POST /api/auth/reset-password
 */
router.post(
  "/reset-password",
  validateBody(resetPasswordSchema),
  async (req: Request, res: Response): Promise<void> => {
    const { token, newPassword } = req.body;

    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: new Date() },
    }).select("+resetPasswordToken +resetPasswordExpires");

    if (!user) {
      res.status(400).json({
        success: false,
        error: "Password reset token is invalid or has expired",
      });
      return;
    }

    user.passwordHash = await bcrypt.hash(newPassword, env.BCRYPT_SALT_ROUNDS);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.status(200).json({
      success: true,
      message: "Password reset successfully. You may now log in.",
    });
  }
);

export default router;

