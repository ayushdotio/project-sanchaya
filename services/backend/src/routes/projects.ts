import { Router } from "express";
import { z } from "zod";
import {
  authenticateToken,
  requireProjectMembership,
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
 * @name : Create Project API
 * @route : POST /api/projects
 * @access : Protected (requires valid JWT via `authenticateToken` and `"leader"` role via `requireRoles`; body validated via `createProjectSchema`)
 * @description : Creates a new handover project workspace owned by the authenticated leader.
 *   1. Request body (`name` min 2 chars, optional `description`, optional `githubRepo`) is validated by
 *      `validateBody(createProjectSchema)` (returns `400` with field-level `errors` if invalid).
 *   2. Persists a new `Project` document with `members.leaderId` set to `req.user.userId`, empty
 *      `outgoingIds` / `incomingIds`, all 7 `readinessChecklist` flags initialized to `false`,
 *      and `readinessStatus` set to `"Needs Attention"`.
 *   3. Responds with `201 Created` containing `{ success: true, message: "Project workspace created successfully", data: project }`.
 */
router.post(
  "/",
  authenticateToken,
  requireRoles(["leader"]),
  validateBody(createProjectSchema),
  asyncHandler(createProjectController),
);

/**
 * @name : List User Projects API
 * @route : GET /api/projects
 * @access : Protected (requires valid JWT via `authenticateToken`)
 * @description : Lists all project workspaces in which the authenticated user is a member.
 *   1. Queries `Project.find(...)` where `req.user.userId` matches `members.leaderId`,
 *      `members.outgoingIds`, or `members.incomingIds`.
 *   2. Sorts results by `updatedAt` descending (most recently updated first).
 *   3. Responds with `200 OK` containing `{ success: true, data: projects }`.
 */
router.get(
  "/",
  authenticateToken,
  asyncHandler(listProjectsController),
);

/**
 * @name : Get Project Details API
 * @route : GET /api/projects/:projectId
 * @access : Protected (requires valid JWT via `authenticateToken`)
 * @description : Retrieves a single project workspace by ID with populated member profiles.
 *   1. Queries `Project.findById(req.params.projectId)` and populates `members.leaderId`,
 *      `members.outgoingIds`, and `members.incomingIds` with `name`, `email`, and `role`.
 *   2. Returns `404 Not Found` if no project exists for `projectId`.
 *   3. Responds with `200 OK` containing `{ success: true, data: project }`.
 */
router.get(
  "/:projectId",
  authenticateToken,
  requireProjectMembership,
  asyncHandler(fetchProjectController),
);

/**
 * @name : Assign Project Members API
 * @route : POST /api/projects/:projectId/members
 * @access : Protected (requires valid JWT via `authenticateToken` and `"leader"` role via `requireRoles`; body validated via `assignMembersSchema`)
 * @description : Assigns or replaces the outgoing and incoming member lists on a project workspace.
 *   1. Request body (optional `outgoingIds`, optional `incomingIds` string arrays) is validated by
 *      `validateBody(assignMembersSchema)` (returns `400` with field-level `errors` if invalid).
 *   2. Looks up the project via `Project.findById(req.params.projectId)`; returns `404 Not Found` if missing.
 *   3. Overwrites `project.members.outgoingIds` and/or `project.members.incomingIds` when provided
 *      and saves the updated `Project` document.
 *   4. Responds with `200 OK` containing `{ success: true, message: "Project members updated successfully", data: project }`.
 */
router.post(
  "/:projectId/members",
  authenticateToken,
  requireRoles(["leader"]),
  requireProjectMembership,
  validateBody(assignMembersSchema),
  asyncHandler(fetchMembersController),
);

export default router;
