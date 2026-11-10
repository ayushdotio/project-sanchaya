import { Router } from "express";
import { z } from "zod";
import {
  authenticateToken,
  requireRoles,
} from "../middlewares/authMiddleware.js";
import { validateBody } from "../middlewares/validate.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  githubConnectController,
  githubSyncController,
} from "../controllers/github.controller.js";

const router = Router();

const connectSchema = z.object({
  repo: z.string().min(1, "Repository name is required (e.g. owner/repo)"),
  accessToken: z.string().optional(),
});

const syncSchema = z.object({
  githubRepo: z.string().optional(),
  token: z.string().optional(),
  branches: z.array(z.string()).optional(),
  limit: z.number().optional(),
});

/**
 * POST /api/projects/:projectId/github/connect
 * Validates read-only repository connectivity and binds it to the project
 */
router.post(
  "/:projectId/github/connect",
  authenticateToken,
  requireRoles(["leader", "outgoing"]),
  validateBody(connectSchema),
  asyncHandler(githubConnectController),
);

/**
 * POST /api/projects/:projectId/github/sync
 * Read-only GitHub ingestion of commits, PRs, and issues with deterministic secret redaction
 */
router.post(
  "/:projectId/github/sync",
  authenticateToken,
  requireRoles(["leader", "outgoing"]),
  validateBody(syncSchema),
  asyncHandler(githubSyncController),
);

export default router;
