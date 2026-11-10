import { Router } from "express";
import { z } from "zod";
import {
  authenticateToken,
  requireRoles,
} from "../middlewares/authMiddleware.js";
import { validateBody } from "../middlewares/validate.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  createProjectController,
  listProjectsController,
  fetchProjectController,
  fetchMembersController,
} from "../controllers/projects.controller.js";

const router = Router();

const createProjectSchema = z.object({
  name: z.string().min(2, "Project name must be at least 2 characters"),
  description: z.string().optional().default(""),
  githubRepo: z.string().optional().default(""),
});

const assignMembersSchema = z.object({
  outgoingIds: z.array(z.string()).optional(),
  incomingIds: z.array(z.string()).optional(),
});

/**
 * POST /api/projects - Leader only
 */
router.post(
  "/",
  authenticateToken,
  requireRoles(["leader"]),
  validateBody(createProjectSchema),
  asyncHandler(createProjectController),
);

/**
 * GET /api/projects - List user projects
 */
router.get(
  "/",
  authenticateToken,
  asyncHandler(listProjectsController),
);

/**
 * GET /api/projects/:projectId
 */
router.get(
  "/:projectId",
  authenticateToken,
  asyncHandler(fetchProjectController),
);

/**
 * POST /api/projects/:projectId/members - Leader only
 */
router.post(
  "/:projectId/members",
  authenticateToken,
  requireRoles(["leader"]),
  validateBody(assignMembersSchema),
  asyncHandler(fetchMembersController),
);

export default router;
