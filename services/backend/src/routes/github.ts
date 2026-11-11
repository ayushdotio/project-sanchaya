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
 * @name : Connect GitHub Repository API
 * @route : POST /api/projects/:projectId/github/connect
 * @access : Protected (requires valid JWT via `authenticateToken` and role `"leader"` or `"outgoing"` via `requireRoles`; body validated via `connectSchema`)
 * @description : Verifies read-only GitHub repository access and binds the repository to the project.
 *   1. Request body (`repo`, optional `accessToken`) is validated by `validateBody(connectSchema)`
 *      (returns `400` with field-level `errors` if invalid).
 *   2. Looks up the project via `Project.findById(projectId)`; returns `404 Not Found` if missing.
 *   3. Instantiates `GithubService(accessToken)` (falling back to `env.GITHUB_GLOBAL_PAT`) and calls
 *      `fetchCommits(repo)` (up to 50 recent commits) to verify read-only connectivity and parse `owner/repo`.
 *   4. Persists `project.githubRepo = repo` on the `Project` document.
 *   5. Responds with `200 OK` containing `{ success: true, message, data: { projectId, githubRepo, verifiedCommitsCount } }`.
 */
router.post(
  "/:projectId/github/connect",
  authenticateToken,
  requireRoles(["leader", "outgoing"]),
  requireProjectMembership,
  validateBody(connectSchema),
  asyncHandler(githubConnectController),
);

/**
 * @name : Sync GitHub Repository API
 * @route : POST /api/projects/:projectId/github/sync
 * @access : Protected (requires valid JWT via `authenticateToken` and role `"leader"` or `"outgoing"` via `requireRoles`; body validated via `syncSchema`)
 * @description : Ingests commits, pull requests, and issues from GitHub, redacts secrets/PII, and upserts canonical source records.
 *   1. Request body (optional `githubRepo`, `token`, `branches`, `limit`) is validated by `validateBody(syncSchema)`
 *      (returns `400` if invalid; note `branches` and `limit` are currently not forwarded by `githubSyncController`).
 *   2. Looks up the project via `Project.findById(projectId)` (`404` if missing) and resolves `repoToSync` from
 *      `req.body.githubRepo` or `project.githubRepo` (`400 Bad Request` if neither is configured).
 *   3. Instantiates `GithubService(token)` and concurrently fetches commits (latest 50), pull requests (all states,
 *      latest 30), and issues (all states excluding PRs, latest 30) via `Promise.all` (partial stream failures
 *      log a warning and fall back to `[]`).
 *   4. For each normalized item, runs deterministic Pre-AI `scanAndRedact(item.content)`, generates a deterministic
 *      `SRC-GH-<6-char-MD5>` `source_id`, and upserts into `SourceRecord` with `created_at`, `updated_at`, and `imported_at`.
 *   5. If at least one item was upserted (`insertedCount > 0`), sets `project.readinessChecklist.sourcesVerified = true`
 *      and saves the project.
 *   6. Responds with `200 OK` containing `{ success: true, message, data: { insertedCount, totalRedactions, repo } }`.
 */
router.post(
  "/:projectId/github/sync",
  authenticateToken,
  requireRoles(["leader", "outgoing"]),
  requireProjectMembership,
  validateBody(syncSchema),
  asyncHandler(githubSyncController),
);

export default router;
