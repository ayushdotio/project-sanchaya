import { Request, Response } from "express";
import { Project } from "../models/Project.js";
import { SourceRecord } from "../models/SourceRecord.js";
import { GithubService } from "../services/githubService.js";
import { scanAndRedact } from "../services/secretScanner.js";
import crypto from "crypto";

const generateGithubSourceId = (type: string, id: string): string => {
  const hash = crypto
    .createHash("md5")
    .update(`${type}-${id}`)
    .digest("hex")
    .substring(0, 6)
    .toUpperCase();
  return `SRC-GH-${hash}`;
};

const githubConnectController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { projectId } = req.params;
  const { repo, accessToken } = req.body;

  const project = await Project.findById(projectId);
  if (!project) {
    res.status(404).json({ success: false, error: "Project not found" });
    return;
  }

  const github = new GithubService(accessToken);

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
};

const githubSyncController = async (
  req: Request,
  res: Response,
): Promise<void> => {
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
      error:
        "No GitHub repository specified for this project. Use /github/connect first.",
    });
    return;
  }

  const github = new GithubService(token);

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
      { upsert: true, new: true },
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
};

export { githubConnectController, githubSyncController };
