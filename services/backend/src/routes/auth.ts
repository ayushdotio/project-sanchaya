import { Router } from "express";
import { z } from "zod";
import { authenticateToken } from "../middlewares/authMiddleware.js";
import { validateBody } from "../middlewares/validate.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  registerController,
  registerAsLeaderController,
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
 * @name : Register API
 * @route : POST /api/auth/register
 * @access : Public (validated via `registerSchema` before reaching `registerController`)
 * @description : Registers a new user account and performs immediate auto-login.
 *   1. Request body (`name`, `email`, `password`) is validated and sanitized by `validateBody(registerSchema)`
 *      (returns `400` with field-level `errors` if invalid).
 *   2. Enforces least-privilege by hardcoding `role` to `"incoming"` — clients cannot self-assign
 *      `"leader"` or `"outgoing"` roles (role promotion requires a protected admin route).
 *   3. Hashes the plaintext password with `bcrypt` using `env.BCRYPT_SALT_ROUNDS`.
 *   4. Persists the user in MongoDB with `email` normalized to lowercase (`email.toLowerCase()`).
 *      If a duplicate key error (`code === 11000`) occurs, responds with `409 Conflict`.
 *   5. Issues a signed JWT (`{ userId, email, role }`) via `issueAuthTokenAndCookie` and sets it as an
 *      `HttpOnly` cookie (`token`, `sameSite: "lax"`, `secure` in production, `maxAge` from `env.JWT_EXPIRES_IN`),
 *      since Sanchaya does not currently gate registration behind email verification.
 *   6. Responds with `201 Created` containing `{ success: true, message, data: { token, user: { id, name, email, role } } }`.
 */
router.post("/register", validateBody(registerSchema), asyncHandler(registerController));

/**
 * @name : Register as Leader API
 * @route : POST /api/auth/register-as-leader
 * @access : Public (validated via `registerSchema` before reaching `registerAsLeaderController`)
 * @description : Registers a new user account with the `"leader"` role and performs immediate auto-login.
 *   1. Request body (`name`, `email`, `password`) is validated and sanitized by `validateBody(registerSchema)`
 *      (returns `400` with field-level `errors` if invalid).
 *   2. Assigns `role` to `"leader"` server-side (via `registerUserWithRole`) regardless of client payload,
 *      granting full leader RBAC permissions across protected routes.
 *   3. Hashes the plaintext password with `bcrypt` using `env.BCRYPT_SALT_ROUNDS`.
 *   4. Persists the user in MongoDB with `email` normalized to lowercase (`email.toLowerCase()`).
 *      If a duplicate key error (`code === 11000`) occurs, responds with `409 Conflict`.
 *   5. Issues a signed JWT (`{ userId, email, role: "leader" }`) via `issueAuthTokenAndCookie` and sets it
 *      as an `HttpOnly` cookie (`token`, `sameSite: "lax"`, `secure` in production, `maxAge` from `env.JWT_EXPIRES_IN`).
 *   6. Responds with `201 Created` containing `{ success: true, message: "Leader registered successfully", data: { token, user: { id, name, email, role } } }`.
 */
router.post(
  "/register-as-leader",
  validateBody(registerSchema),
  asyncHandler(registerAsLeaderController),
);

/**
 * @name : Login API
 * @route : POST /api/auth/login
 * @access : Public (validated via `loginSchema` before reaching `loginController`)
 * @description : Authenticates an existing user with email and password and issues a session JWT.
 *   1. Request body (`email`, `password`) is validated by `validateBody(loginSchema)`
 *      (returns `400` with field-level `errors` if invalid).
 *   2. Looks up the user in MongoDB by `email.toLowerCase()`, explicitly selecting `+passwordHash`
 *      (which is hidden by default via `select: false`).
 *   3. Verifies `password` against `user.passwordHash` using `bcrypt.compare`. If the user is not
 *      found or the password does not match, responds with an identical `401 Unauthorized`
 *      (`"Invalid email or password"`) to prevent account enumeration.
 *   4. Signs a JWT (`{ userId, email, role }`) via `issueAuthTokenAndCookie` and attaches it as an
 *      `HttpOnly` cookie (`token`, `sameSite: "lax"`, `secure` in production, `maxAge` from `env.JWT_EXPIRES_IN`).
 *   5. Responds with `200 OK` containing `{ success: true, message, data: { token, user: { id, name, email, role } } }`.
 */
router.post("/login", validateBody(loginSchema), asyncHandler(loginController));

/**
 * @name : Get Current User API
 * @route : GET /api/auth/me
 * @access : Protected (requires a valid Bearer JWT or `token` cookie via `authenticateToken`)
 * @description : Returns the authenticated user's identity claims from the verified JWT context.
 *   1. `authenticateToken` extracts the token from the `Authorization: Bearer <token>` header or
 *      the `token` cookie, verifies its signature/expiry with `env.JWT_SECRET`, confirms the user
 *      exists in MongoDB, and rejects tokens issued prior to `user.passwordChangedAt` (`401`).
 *   2. `getmeController` reads `req.user` directly without an extra database query.
 *   3. Responds with `200 OK` containing `{ success: true, data: { id, email, role } }`.
 */
router.get("/me", authenticateToken, asyncHandler(getmeController));

/**
 * @name : Forgot Password API
 * @route : POST /api/auth/forgot-password
 * @access : Public (validated via `forgotPasswordSchema` before reaching `forgotPasswordController`)
 * @description : Generates a short-lived password reset token without leaking account existence.
 *   1. Request body (`email`) is validated by `validateBody(forgotPasswordSchema)`
 *      (returns `400` with field-level `errors` if invalid).
 *   2. Queries MongoDB by `email.toLowerCase()`. If a matching user exists:
 *      - Generates a 32-byte random hex token (64 chars) via `crypto.randomBytes(32)` and stores
 *        its SHA-256 digest in `resetPasswordToken` with a 15-minute `resetPasswordExpires` window.
 *      - In non-production (`env.NODE_ENV !== "production"`), returns `200 OK` with `data: { resetToken }`
 *        for local development/testing since no email service is configured.
 *   3. In production (or when no user matches), always responds with an identical `200 OK` generic
 *      message to prevent user account enumeration.
 */
router.post(
  "/forgot-password",
  validateBody(forgotPasswordSchema),
  asyncHandler(forgotPasswordController),
);

/**
 * @name : Reset Password API
 * @route : POST /api/auth/reset-password
 * @access : Public (validated via `resetPasswordSchema` before reaching `resetPasswordController`)
 * @description : Validates a password reset token, updates the user's password, and invalidates old sessions.
 *   1. Request body (`token` of length 64, `newPassword` meeting complexity rules) is validated by
 *      `validateBody(resetPasswordSchema)` (returns `400` with field-level `errors` if invalid).
 *   2. Hashes the submitted `token` with SHA-256 and looks up a user with matching
 *      `resetPasswordToken` and unexpired `resetPasswordExpires` (`> now`). Returns `400 Bad Request`
 *      if the token is invalid or expired.
 *   3. Hashes `newPassword` with `bcrypt` (`env.BCRYPT_SALT_ROUNDS`), saves the new `passwordHash`,
 *      clears `resetPasswordToken` and `resetPasswordExpires`, and sets `passwordChangedAt = new Date()`
 *      so `authenticateToken` rejects any JWT issued before the reset.
 *   4. Responds with `200 OK` containing `{ success: true, message }`.
 */
router.post(
  "/reset-password",
  validateBody(resetPasswordSchema),
  asyncHandler(resetPasswordController),
);

export default router;
