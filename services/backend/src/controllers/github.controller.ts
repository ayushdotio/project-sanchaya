import { Request, Response } from "express";
import { Project } from "../models/Project.js";
import { SourceRecord } from "../models/SourceRecord.js";
import { GithubService, NormalizedGithubItem } from "../services/githubService.js";
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

const normalizeRepoUrl = (repoInput: string, slug: string): string => {
  const trimmed = repoInput.trim().replace(/\.git$/i, "").replace(/\/+$/, "");
  if (/^https?:\/\/github\.com\//i.test(trimmed)) {
    return `https://github.com/${slug}`;
  }
  return slug;
};

const buildGithubError = (err: any, fallback: string): Error & { statusCode?: number } => {
  const status = err?.statusCode || err?.status;
  const wrapped = new Error(err?.message || fallback) as Error & { statusCode?: number };
  if (typeof status === "number" && status >= 400 && status < 600) {
    wrapped.statusCode = status;
  } else {
    wrapped.statusCode = 502;
  }
  return wrapped;
};

const githubConnectController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { projectId } = req.params;
  const { repo, accessToken } = req.body;

  const project = (req as any).project || (await Project.findById(projectId));
  if (!project) {
    res.status(404).json({ success: false, error: "Project not found" });
    return;
  }

  const github = new GithubService(accessToken);
  const { slug } = github.parseRepoString(repo);
  const normalizedRepo = normalizeRepoUrl(repo, slug);

  // Validate read-only connectivity by fetching recent commits
  let testCommits: NormalizedGithubItem[];
  try {
    testCommits = await github.fetchCommits(normalizedRepo);
  } catch (err: any) {
    throw buildGithubError(
      err,
      `Failed to verify read-only access to GitHub repository '${slug}'.`,
    );
  }

  project.githubRepo = normalizedRepo;
  await project.save();

  res.status(200).json({
    success: true,
    message: `Successfully connected to GitHub repository '${normalizedRepo}'. Verified read-only access.`,
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
  const { githubRepo: inputRepo, token, branches, limit } = req.body;

  const project = (req as any).project || (await Project.findById(projectId));
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
  const { slug } = github.parseRepoString(repoToSync);
  const normalizedRepo = normalizeRepoUrl(repoToSync, slug);

  const normalizedBranches = Array.isArray(branches)
    ? Array.from(new Set(branches.map((b: string) => b.trim()).filter(Boolean)))
    : [];

  const streamErrors: any[] = [];
  let commits: NormalizedGithubItem[] = [];
  let prs: NormalizedGithubItem[] = [];
  let issues: NormalizedGithubItem[] = [];

  const fetchAllCommits = async (): Promise<NormalizedGithubItem[]> => {
    if (normalizedBranches.length === 0) {
      return github.fetchCommits(normalizedRepo, { limit });
    }

    const branchResults = await Promise.allSettled(
      normalizedBranches.map((branch) =>
        github.fetchCommits(normalizedRepo, { branch, limit }),
      ),
    );
    const seen = new Map<string, NormalizedGithubItem>();
    let anySuccess = false;
    let firstBranchErr: any = null;

    for (const r of branchResults) {
      if (r.status === "fulfilled") {
        anySuccess = true;
        for (const item of r.value) {
          if (!seen.has(item.id)) {
            seen.set(item.id, item);
          }
        }
      } else if (!firstBranchErr) {
        firstBranchErr = r.reason;
      }
    }

    if (!anySuccess && firstBranchErr) {
      throw firstBranchErr;
    }
    return Array.from(seen.values());
  };

  // 1. Fetch read-only commits, PRs, issues concurrently
  const [commitsRes, prsRes, issuesRes] = await Promise.allSettled([
    fetchAllCommits(),
    github.fetchPullRequests(normalizedRepo, { limit }),
    github.fetchIssues(normalizedRepo, { limit }),
  ]);

  if (commitsRes.status === "fulfilled") {
    commits = commitsRes.value;
  } else {
    console.warn("[GitHub Sync] Commits fetch warning:", commitsRes.reason?.message);
    streamErrors.push(commitsRes.reason);
  }

  if (prsRes.status === "fulfilled") {
    prs = prsRes.value;
  } else {
    console.warn("[GitHub Sync] PRs fetch warning:", prsRes.reason?.message);
    streamErrors.push(prsRes.reason);
  }

  if (issuesRes.status === "fulfilled") {
    issues = issuesRes.value;
  } else {
    console.warn("[GitHub Sync] Issues fetch warning:", issuesRes.reason?.message);
    streamErrors.push(issuesRes.reason);
  }

  // Fail loudly if ALL 3 GitHub API streams failed (e.g. invalid PAT, 404 repo, rate limit)
  if (streamErrors.length === 3) {
    throw buildGithubError(
      streamErrors[0],
      `Failed to sync GitHub repository '${normalizedRepo}'.`,
    );
  }

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
          ...(normalizedBranches.length === 1 ? { branch: normalizedBranches[0] } : {}),
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
    if (!project.readinessChecklist) {
      project.readinessChecklist = {} as any;
    }
    project.readinessChecklist.sourcesVerified = true;
    await project.save();
  }

  res.status(200).json({
    success: true,
    message: `Synced ${insertedCount} items from GitHub (${commits.length} commits, ${prs.length} PRs, ${issues.length} issues). Redacted ${totalRedactions} secrets/PII.`,
    data: {
      insertedCount,
      totalRedactions,
      repo: normalizedRepo,
      commitsCount: commits.length,
      pullRequestsCount: prs.length,
      issuesCount: issues.length,
    },
  });
};

export { githubConnectController, githubSyncController };
