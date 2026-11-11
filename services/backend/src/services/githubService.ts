import { Octokit } from "@octokit/rest";
import { env } from "../config/env.js";

export interface NormalizedGithubItem {
  id: string; // e.g. commit sha, PR number, Issue number
  type: "commit" | "pull_request" | "issue";
  title: string;
  author: string;
  content: string;
  created_at: Date;
  updated_at: Date;
  url: string;
}

export interface FetchCommitsOptions {
  branch?: string;
  limit?: number;
}

export interface FetchListOptions {
  limit?: number;
}

export class GithubService {
  private octokit: Octokit;

  constructor(token?: string) {
    const auth = token?.trim() || env.GITHUB_GLOBAL_PAT;
    this.octokit = new Octokit({ auth });
  }

  /**
   * Parse owner and repo name from string "owner/repo" or GitHub URL.
   */
  parseRepoString(repoInput: string): { owner: string; repo: string; slug: string } {
    const cleaned = repoInput
      .trim()
      .replace(/^https?:\/\/github\.com\//i, "")
      .replace(/\.git$/i, "")
      .replace(/\/+$/, "");
    const parts = cleaned.split("/").filter(Boolean);
    const owner = parts[0];
    const repo = parts[1];
    if (!owner || !repo || parts.length > 2) {
      const err = new Error(
        `Invalid GitHub repository format '${repoInput}'. Expected 'owner/repo' or 'https://github.com/owner/repo'.`,
      ) as Error & { statusCode?: number };
      err.statusCode = 400;
      throw err;
    }
    return { owner, repo, slug: `${owner}/${repo}` };
  }

  /**
   * Read-only fetch of repository commits (default latest 50, max 100)
   */
  async fetchCommits(
    repoInput: string,
    options: FetchCommitsOptions = {},
  ): Promise<NormalizedGithubItem[]> {
    const { owner, repo } = this.parseRepoString(repoInput);
    const perPage = Math.min(Math.max(options.limit ?? 50, 1), 100);

    const { data: commits } = await this.octokit.rest.repos.listCommits({
      owner,
      repo,
      ...(options.branch ? { sha: options.branch } : {}),
      per_page: perPage,
    });

    return commits.map((c) => {
      const commitDate =
        c.commit.committer?.date || c.commit.author?.date || new Date().toISOString();
      return {
        id: c.sha.substring(0, 12),
        type: "commit",
        title: c.commit.message.split("\n")[0] || "No message",
        author: c.commit.author?.name || c.author?.login || "Unknown",
        content: `[Commit: ${c.sha.substring(0, 12)}] Author: ${c.commit.author?.name || "Unknown"} | Date: ${commitDate}\nMessage: ${c.commit.message}`,
        created_at: new Date(commitDate),
        updated_at: new Date(commitDate),
        url: c.html_url,
      };
    });
  }

  /**
   * Read-only fetch of pull requests (closed & open, default latest 30)
   */
  async fetchPullRequests(
    repoInput: string,
    options: FetchListOptions = {},
  ): Promise<NormalizedGithubItem[]> {
    const { owner, repo } = this.parseRepoString(repoInput);
    const perPage = Math.min(Math.max(options.limit ?? 30, 1), 100);

    const { data: prs } = await this.octokit.rest.pulls.list({
      owner,
      repo,
      state: "all",
      per_page: perPage,
    });

    return prs.map((pr) => ({
      id: `PR-${pr.number}`,
      type: "pull_request",
      title: pr.title,
      author: pr.user?.login || "Unknown",
      content: `[PR #${pr.number}: ${pr.title}] State: ${pr.state} | Author: ${pr.user?.login || "Unknown"} | Merged: ${pr.merged_at || "No"}\nDescription:\n${pr.body || "No description provided."}`,
      created_at: new Date(pr.created_at),
      updated_at: new Date(pr.updated_at),
      url: pr.html_url,
    }));
  }

  /**
   * Read-only fetch of repository issues (default latest 30)
   */
  async fetchIssues(
    repoInput: string,
    options: FetchListOptions = {},
  ): Promise<NormalizedGithubItem[]> {
    const { owner, repo } = this.parseRepoString(repoInput);
    const perPage = Math.min(Math.max(options.limit ?? 30, 1), 100);

    const { data: issues } = await this.octokit.rest.issues.listForRepo({
      owner,
      repo,
      state: "all",
      per_page: perPage,
    });

    // Exclude pull requests which the issues endpoint returns
    return issues
      .filter((i) => !i.pull_request)
      .map((issue) => ({
        id: `ISSUE-${issue.number}`,
        type: "issue",
        title: issue.title,
        author: issue.user?.login || "Unknown",
        content: `[Issue #${issue.number}: ${issue.title}] State: ${issue.state} | Author: ${issue.user?.login || "Unknown"}\nDescription:\n${issue.body || "No description."}`,
        created_at: new Date(issue.created_at),
        updated_at: new Date(issue.updated_at),
        url: issue.html_url,
      }));
  }
}
