import { CookieOptions, Request, Response } from "express";
import bcrypt from "bcrypt";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { IUser, User } from "../models/User.js";
import { JWTPayload, UserRole } from "../types/auth.types.js";

export const AUTH_COOKIE_NAME = "token";

const DEFAULT_COOKIE_MAX_AGE_MS = 3 * 60 * 60 * 1000;
// Pre-computed bcrypt hash used when an account does not exist so login timing
// stays uniform and prevents email enumeration via response latency.
const DUMMY_BCRYPT_HASH =
  "$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

const TIME_UNIT_MS: Record<string, number> = {
  ms: 1,
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  w: 7 * 24 * 60 * 60 * 1000,
  y: 365.25 * 24 * 60 * 60 * 1000,
};

/**
 * Converts a JWT duration string (e.g. "3h", "7d", "30m") into milliseconds for cookie maxAge.
 */
export const parseExpiresInToMs = (expiresIn: string): number => {
  const trimmed = expiresIn.trim().toLowerCase();
  const match = /^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d|w|y)?$/.exec(trimmed);
  if (!match || !match[1]) {
    return DEFAULT_COOKIE_MAX_AGE_MS;
  }

  const amount = Number(match[1]);
  const unit = match[2] ?? "ms";
  const multiplier = TIME_UNIT_MS[unit];

  if (!Number.isFinite(amount) || amount <= 0 || !multiplier) {
    return DEFAULT_COOKIE_MAX_AGE_MS;
  }

  return Math.floor(amount * multiplier);
};

export const getAuthCookieOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "lax",
  maxAge: parseExpiresInToMs(env.JWT_EXPIRES_IN),
  path: "/",
});

export const getClearAuthCookieOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
});

/**
 * Signs a JWT for the authenticated user and attaches it as an HttpOnly cookie.
 */
const issueAuthTokenAndCookie = (
  res: Response,
  user: Pick<IUser, "_id" | "email" | "role">,
): string => {
  const payload: JWTPayload = {
    userId: user._id.toString(),
    email: user.email,
    role: user.role,
  };

  const token = jwt.sign(payload, env.JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });

  res.cookie(AUTH_COOKIE_NAME, token, getAuthCookieOptions());
  return token;
};

/**
 * Shared registration helper that hashes the password, persists the user with an
 * explicitly assigned role, and issues an HttpOnly JWT cookie + response token.
 */
const registerUserWithRole = async (
  req: Request,
  res: Response,
  role: UserRole,
  successMessage: string,
): Promise<void> => {
  const { name, email, password } = req.body;

  const passwordHash = await bcrypt.hash(password, env.BCRYPT_SALT_ROUNDS);

  let user;
  try {
    user = await User.create({
      name,
      email: email.toLowerCase(),
      passwordHash,
      role,
    });
  } catch (err: unknown) {
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code?: number }).code === 11000
    ) {
      res.status(409).json({
        success: false,
        error: "A user with this email address already exists",
      });
      return;
    }
    throw err;
  }

  const token = issueAuthTokenAndCookie(res, user);

  // NOTE: Auto-login on registration is a conscious decision.
  // Sanchaya has no email verification service, so we cannot gate access
  // behind a verified email. If email verification is added in the future,
  // remove this token from the response and require the user to verify first.
  res.status(201).json({
    success: true,
    message: successMessage,
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
};

const registerController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  // Role is never trusted from the client on self-registration.
  // Standard registration always assigns "incoming".
  await registerUserWithRole(req, res, "incoming", "User registered successfully");
};

const registerAsLeaderController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  // Server-enforced role assignment to "leader" regardless of any client-supplied role field.
  await registerUserWithRole(req, res, "leader", "Leader registered successfully");
};

const registerAsOutgoingController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  // Server-enforced role assignment to "outgoing" for outgoing project members.
  await registerUserWithRole(
    req,
    res,
    "outgoing",
    "Outgoing member registered successfully",
  );
};

const loginController = async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body;
  const normalizedEmail = String(email).trim().toLowerCase();

  // Explicitly select passwordHash which has select: false
  const user = await User.findOne({ email: normalizedEmail }).select(
    "+passwordHash",
  );
  if (!user) {
    await bcrypt.compare(password, DUMMY_BCRYPT_HASH);
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

  const token = issueAuthTokenAndCookie(res, user);

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
};

const logoutController = async (
  _req: Request,
  res: Response,
): Promise<void> => {
  res.clearCookie(AUTH_COOKIE_NAME, getClearAuthCookieOptions());
  res.status(200).json({
    success: true,
    message: "Logged out successfully",
  });
};

const getmeController = async (req: Request, res: Response): Promise<void> => {
  // req.user is already populated and synced with live DB role by authenticateToken.
  res.status(200).json({
    success: true,
    data: {
      id: req.user?.userId,
      email: req.user?.email,
      role: req.user?.role,
    },
  });
};

const forgotPasswordController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const normalizedEmail = String(req.body.email).trim().toLowerCase();

  const user = await User.findOne({ email: normalizedEmail });
  if (user) {
    const resetToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");

    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 mins expiry
    await user.save();

    // In production, send via email service. In non-production (dev/test),
    // return the raw token directly since no email service is configured.
    if (env.NODE_ENV !== "production") {
      res.status(200).json({
        success: true,
        message: "Dev mode: token returned directly.",
        data: { resetToken },
      });
      return;
    }
  }

  // Always return identical 200 OK message to prevent account enumeration
  res.status(200).json({
    success: true,
    message:
      "If that email is registered, password reset instructions have been generated.",
  });
};

const resetPasswordController = async (
  req: Request,
  res: Response,
): Promise<void> => {
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
  // Stamp the change time so authMiddleware can invalidate pre-reset JWTs
  user.passwordChangedAt = new Date();
  await user.save();

  res.clearCookie(AUTH_COOKIE_NAME, getClearAuthCookieOptions());
  res.status(200).json({
    success: true,
    message: "Password reset successfully. You may now log in.",
  });
};

export {
  registerController,
  registerAsLeaderController,
  registerAsOutgoingController,
  loginController,
  logoutController,
  getmeController,
  forgotPasswordController,
  resetPasswordController,
};
