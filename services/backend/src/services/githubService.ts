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

export class GithubService {
  private octokit: Octokit;

  constructor(token?: string) {
    const auth = token || env.GITHUB_GLOBAL_PAT;
    this.octokit = new Octokit({ auth });
  }

  /**
   * Parse owner and repo name from string "owner/repo" or GitHub URL
   */
  private parseRepoString(repoInput: string): { owner: string; repo: string } {
    const cleaned = repoInput.replace(/^https?:\/\/github\.com\//i, "").replace(/\.git$/i, "");
    const parts = cleaned.split("/");
    const owner = parts[0];
    const repo = parts[1];
    if (!owner || !repo) {
      throw new Error(`Invalid GitHub repository format '${repoInput}'. Expected 'owner/repo'.`);
    }
    return { owner, repo };
  }

  /**
   * Read-only fetch of repository commits (latest 50)
   */
  async fetchCommits(repoInput: string): Promise<NormalizedGithubItem[]> {
    const { owner, repo } = this.parseRepoString(repoInput);

    const { data: commits } = await this.octokit.rest.repos.listCommits({
      owner,
      repo,
      per_page: 50,
    });

    return commits.map((c) => {
      const commitDate = c.commit.committer?.date || c.commit.author?.date || new Date().toISOString();
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
   * Read-only fetch of pull requests (closed & open, latest 30)
   */
  async fetchPullRequests(repoInput: string): Promise<NormalizedGithubItem[]> {
    const { owner, repo } = this.parseRepoString(repoInput);

    const { data: prs } = await this.octokit.rest.pulls.list({
      owner,
      repo,
      state: "all",
      per_page: 30,
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
   * Read-only fetch of repository issues (latest 30)
   */
  async fetchIssues(repoInput: string): Promise<NormalizedGithubItem[]> {
    const { owner, repo } = this.parseRepoString(repoInput);

    const { data: issues } = await this.octokit.rest.issues.listForRepo({
      owner,
      repo,
      state: "all",
      per_page: 30,
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

