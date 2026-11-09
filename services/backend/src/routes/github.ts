import { Router, Request, Response } from "express";
import crypto from "crypto";
import { z } from "zod";
import { authenticateToken, requireRoles } from "../middlewares/authMiddleware.js";
import { validateBody } from "../middlewares/validate.js";
import { Project } from "../models/Project.js";
import { SourceRecord } from "../models/SourceRecord.js";
import { GithubService } from "../services/githubService.js";
import { scanAndRedact } from "../services/secretScanner.js";

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

const generateGithubSourceId = (type: string, id: string): string => {
  const hash = crypto.createHash("md5").update(`${type}-${id}`).digest("hex").substring(0, 6).toUpperCase();
  return `SRC-GH-${hash}`;
};

/**
 * POST /api/projects/:projectId/github/connect
 * Validates read-only repository connectivity and binds it to the project
 */
router.post(
  "/:projectId/github/connect",
  authenticateToken,
  requireRoles(["leader", "outgoing"]),
  validateBody(connectSchema),
  async (req: Request, res: Response): Promise<void> => {
    const { projectId } = req.params;
    const { repo, accessToken } = req.body;

    const project = await Project.findById(projectId);
    if (!project) {
      res.status(404).json({ success: false, error: "Project not found" });
      return;
    }

    const github = new GithubService(accessToken);

    try {
      // Validate connectivity by fetching recent commits
      const testCommits = await github.fetchCommits(repo);

      project.githubRepo = repo;
      await project.save();

      res.status(200).json({
        success: true,
        message: `Successfully connected to GitHub repository '${repo}'. Verified read-only access.`,
        data: {
          projectId: project._id,
          githubRepo: project.githubRepo,
          verifiedCommitsCount: testCommits.length,
        },
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: `Could not connect to GitHub repository '${repo}': ${error.message}`,
      });
    }
  }
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
  async (req: Request, res: Response): Promise<void> => {
    const { projectId } = req.params;
    const { githubRepo: inputRepo, token } = req.body;

    const project = await Project.findById(projectId);
    if (!project) {
      res.status(404).json({ success: false, error: "Project not found" });
      return;
    }

    const repoToSync = inputRepo || project.githubRepo;
    if (!repoToSync) {
      res.status(400).json({
        success: false,
        error: "No GitHub repository specified for this project. Use /github/connect first.",
      });
      return;
    }

    const github = new GithubService(token);

    try {
      // 1. Fetch read-only commits, PRs, issues
      const [commits, prs, issues] = await Promise.all([
        github.fetchCommits(repoToSync).catch((e) => {
          console.warn("[GitHub Sync] Commits fetch warning:", e.message);
          return [];
        }),
        github.fetchPullRequests(repoToSync).catch((e) => {
          console.warn("[GitHub Sync] PRs fetch warning:", e.message);
          return [];
        }),
        github.fetchIssues(repoToSync).catch((e) => {
          console.warn("[GitHub Sync] Issues fetch warning:", e.message);
          return [];
        }),
      ]);

      const allItems = [...commits, ...prs, ...issues];
      let totalRedactions = 0;
      let insertedCount = 0;

      for (const item of allItems) {
        // Deterministic Pre-AI Secret & PII Scanning
        const { redactedText, redactionCount } = scanAndRedact(item.content);
        totalRedactions += redactionCount;

        const sourceId = generateGithubSourceId(item.type, item.id);

        await SourceRecord.findOneAndUpdate(
          { projectId: project._id, source_id: sourceId },
          {
            projectId: project._id,
            source_id: sourceId,
            source_type: "github",
            origin: item.url,
            raw_filename: `${item.type}-${item.id}`,
            redacted_content: redactedText,
            metadata: {
              redactionCount,
              author: item.author,
              url: item.url,
              sha: item.type === "commit" ? item.id : undefined,
            },
            created_at: item.created_at,
            updated_at: item.updated_at,
            imported_at: new Date(),
          },
          { upsert: true, new: true }
        );
        insertedCount++;
      }

      // Mark sourcesVerified in readiness checklist if records exist
      if (insertedCount > 0) {
        project.readinessChecklist.sourcesVerified = true;
        await project.save();
      }

      res.status(200).json({
        success: true,
        message: `Synced ${insertedCount} items from GitHub (${commits.length} commits, ${prs.length} PRs, ${issues.length} issues). Redacted ${totalRedactions} secrets/PII.`,
        data: {
          insertedCount,
          totalRedactions,
          repo: repoToSync,
        },
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: `GitHub sync failed: ${error.message}`,
      });
    }
  }
);

export default router;
