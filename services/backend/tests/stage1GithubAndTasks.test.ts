import { afterEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { Socket } from "node:net";
import jwt from "jsonwebtoken";
import app from "../src/app.js";
import { env } from "../src/config/env.js";
import { Project } from "../src/models/Project.js";
import { SourceRecord } from "../src/models/SourceRecord.js";
import { User } from "../src/models/User.js";
import { GithubService } from "../src/services/githubService.js";
import { storageService } from "../src/services/storageService.js";
import { UserRole } from "../src/types/auth.types.js";

const PROJECT_ID = "672f8b9c1a2b3c4d5e6f7a99";
const USER_ID = "672f8b9c1a2b3c4d5e6f7a8b";

const signTestToken = (role: UserRole, email = `${role}@example.com`): string =>
  jwt.sign({ userId: USER_ID, email, role }, env.JWT_SECRET, { expiresIn: "1h" });

const mockAuthenticatedUser = () => {
  mock.method(User, "findById", () => ({
    select: async () => ({
      _id: USER_ID,
      passwordChangedAt: undefined,
    }),
  }) as any);
};

interface DispatchedResponse {
  status: number;
  body: any;
}

const dispatchRequest = async (
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    jsonBody?: any;
    formData?: FormData;
  } = {},
): Promise<DispatchedResponse> => {
  let bodyBuffer = Buffer.alloc(0);
  const normalizedHeaders: Record<string, string> = {};
  for (const [k, v] of Object.entries(options.headers ?? {})) {
    normalizedHeaders[k.toLowerCase()] = v;
  }

  if (options.formData) {
    const serialized = new Response(options.formData);
    const contentType = serialized.headers.get("content-type");
    bodyBuffer = Buffer.from(await serialized.arrayBuffer());
    if (contentType) {
      normalizedHeaders["content-type"] = contentType;
    }
    normalizedHeaders["content-length"] = String(bodyBuffer.byteLength);
  } else if (options.jsonBody !== undefined) {
    bodyBuffer = Buffer.from(JSON.stringify(options.jsonBody), "utf-8");
    normalizedHeaders["content-type"] = "application/json";
    normalizedHeaders["content-length"] = String(bodyBuffer.byteLength);
  }

  const socket = new Socket();
  const req = new http.IncomingMessage(socket);
  req.method = options.method ?? (options.formData || options.jsonBody ? "POST" : "GET");
  req.url = url;
  req.headers = normalizedHeaders;

  const res = new http.ServerResponse(req);
  const chunks: Buffer[] = [];

  return new Promise<DispatchedResponse>((resolve, reject) => {
    res.write = ((chunk: any) => {
      if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      return true;
    }) as any;

    res.end = ((chunk?: any) => {
      if (chunk && typeof chunk !== "function") {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const raw = Buffer.concat(chunks).toString("utf-8");
      let parsed: any = raw;
      try {
        parsed = raw ? JSON.parse(raw) : undefined;
      } catch {
        // plain text
      }
      socket.destroy();
      resolve({ status: res.statusCode, body: parsed });
      return res;
    }) as any;

    try {
      (app as any)(req, res);
      if (bodyBuffer.byteLength > 0) req.push(bodyBuffer);
      req.complete = true;
      req.push(null);
    } catch (err) {
      socket.destroy();
      reject(err);
    }
  });
};

describe("Stage 1 Production Hardening: GitHub, Tasks CSV, Sources & Rollback", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("connects GitHub repo and normalizes trailing slash / .git suffix", async () => {
    mockAuthenticatedUser();
    let savedRepo = "";
    mock.method(Project, "findById", async () => ({
      _id: PROJECT_ID,
      githubRepo: "",
      save: async function () {
        savedRepo = this.githubRepo;
      },
    }) as any);

    mock.method(GithubService.prototype, "fetchCommits", async () => [
      {
        id: "abc123def456",
        type: "commit",
        title: "init",
        author: "Dev",
        content: "init",
        created_at: new Date(),
        updated_at: new Date(),
        url: "https://github.com/team/repo/commit/abc123def456",
      },
    ]);

    const token = signTestToken("leader");
    const res = await dispatchRequest(`/api/projects/${PROJECT_ID}/github/connect`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      jsonBody: { repo: "https://github.com/team/repo.git" },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(savedRepo, "https://github.com/team/repo");
    assert.equal(res.body.data.verifiedCommitsCount, 1);
  });

  it("forwards branches & limit in POST /github/sync and deduplicates commits", async () => {
    mockAuthenticatedUser();
    const projectStub: any = {
      _id: PROJECT_ID,
      githubRepo: "team/repo",
      readinessChecklist: { sourcesVerified: false },
      save: async () => {},
    };
    mock.method(Project, "findById", async () => projectStub);

    const seenBranches: string[] = [];
    let seenLimit: number | undefined;
    mock.method(GithubService.prototype, "fetchCommits", async (_repo: string, opts: any) => {
      if (opts?.branch) seenBranches.push(opts.branch);
      seenLimit = opts?.limit;
      return [
        {
          id: "sharedsha123",
          type: "commit",
          title: "Shared commit",
          author: "Dev",
          content: "Shared commit ghp_1234567890abcdefghijklmnopqrstuvwxyz",
          created_at: new Date("2026-11-01T00:00:00Z"),
          updated_at: new Date("2026-11-01T00:00:00Z"),
          url: "https://github.com/team/repo/commit/sharedsha123",
        },
      ];
    });
    mock.method(GithubService.prototype, "fetchPullRequests", async () => []);
    mock.method(GithubService.prototype, "fetchIssues", async () => []);

    const upsertedIds: string[] = [];
    mock.method(SourceRecord, "findOneAndUpdate", async (_filter: any, update: any) => {
      upsertedIds.push(update.source_id);
      return update as any;
    });

    const token = signTestToken("outgoing");
    const res = await dispatchRequest(`/api/projects/${PROJECT_ID}/github/sync`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      jsonBody: { branches: ["main", "develop"], limit: 15 },
    });

    assert.equal(res.status, 200);
    assert.deepEqual(seenBranches, ["main", "develop"]);
    assert.equal(seenLimit, 15);
    assert.equal(upsertedIds.length, 1);
    assert.equal(res.body.data.insertedCount, 1);
    assert.ok(res.body.data.totalRedactions >= 1);
    assert.equal(projectStub.readinessChecklist.sourcesVerified, true);
  });

  it("fails with upstream status when all GitHub sync streams fail", async () => {
    mockAuthenticatedUser();
    mock.method(Project, "findById", async () => ({
      _id: PROJECT_ID,
      githubRepo: "team/private-repo",
      readinessChecklist: {},
    }) as any);

    const authErr: any = new Error("Bad credentials");
    authErr.status = 401;
    mock.method(GithubService.prototype, "fetchCommits", async () => {
      throw authErr;
    });
    mock.method(GithubService.prototype, "fetchPullRequests", async () => {
      throw authErr;
    });
    mock.method(GithubService.prototype, "fetchIssues", async () => {
      throw authErr;
    });

    const token = signTestToken("leader");
    const res = await dispatchRequest(`/api/projects/${PROJECT_ID}/github/sync`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      jsonBody: {},
    });

    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
    assert.match(res.body.error, /Bad credentials/i);
  });

  it("rejects empty notes document with 400 before calling ImageKit", async () => {
    mockAuthenticatedUser();
    mock.method(Project, "findById", async () => ({ _id: PROJECT_ID }) as any);

    let imageKitCalled = false;
    mock.method(storageService, "uploadDocument", async () => {
      imageKitCalled = true;
      return {} as any;
    });

    const token = signTestToken("leader");
    const formData = new FormData();
    formData.append("file", new Blob(["   \n  "], { type: "text/plain" }), "empty.txt");

    const res = await dispatchRequest(`/api/projects/${PROJECT_ID}/uploads/notes`, {
      headers: { Authorization: `Bearer ${token}` },
      formData,
    });

    assert.equal(res.status, 400);
    assert.equal(imageKitCalled, false);
    assert.match(res.body.error, /no extractable text/i);
  });

  it("rolls back ImageKit upload if SourceRecord.create fails", async () => {
    mockAuthenticatedUser();
    mock.method(Project, "findById", async () => ({ _id: PROJECT_ID }) as any);

    let deletedFileId = "";
    mock.method(storageService, "uploadDocument", async () => ({
      fileId: "ik-rollback-01",
      name: "doc.txt",
      url: "https://ik.imagekit.io/demo/doc.txt",
      filePath: `/sanchaya/${PROJECT_ID}/doc.txt`,
      size: 20,
    }));
    mock.method(storageService, "deleteDocument", async (fid: string) => {
      deletedFileId = fid;
    });
    mock.method(SourceRecord, "create", async () => {
      throw new Error("Simulated DB failure");
    });

    const token = signTestToken("leader");
    const formData = new FormData();
    formData.append("file", new Blob(["Valid notes text"], { type: "text/plain" }), "doc.txt");

    const res = await dispatchRequest(`/api/projects/${PROJECT_ID}/uploads/notes`, {
      headers: { Authorization: `Bearer ${token}` },
      formData,
    });

    assert.equal(res.status, 500);
    assert.equal(deletedFileId, "ik-rollback-01");
  });

  it("rejects empty CSV task tracker with 400 and ingests valid CSV with 201", async () => {
    mockAuthenticatedUser();
    mock.method(Project, "findById", async () => ({
      _id: PROJECT_ID,
      readinessChecklist: { sourcesVerified: false },
      save: async () => {},
    }) as any);

    const token = signTestToken("outgoing");

    // 1. Header-only CSV -> 400
    const emptyCsv = new FormData();
    emptyCsv.append("file", new Blob(["task_id,title,owner\n"], { type: "text/csv" }), "empty.csv");
    const emptyRes = await dispatchRequest(`/api/projects/${PROJECT_ID}/uploads/tasks`, {
      headers: { Authorization: `Bearer ${token}` },
      formData: emptyCsv,
    });
    assert.equal(emptyRes.status, 400);
    assert.match(emptyRes.body.error, /no task rows/i);

    // 2. Valid CSV -> 201
    mock.method(SourceRecord, "create", async (doc: any) => ({
      _id: "672f8b9c1a2b3c4d5e6f7c01",
      ...doc,
    }) as any);

    const validCsv = new FormData();
    validCsv.append(
      "file",
      new Blob(
        ["task_id,title,status,owner\nT-1,Rotate key,Open,bob@gmail.com\n"],
        { type: "text/csv" },
      ),
      "tasks.csv",
    );
    const validRes = await dispatchRequest(`/api/projects/${PROJECT_ID}/upload-tasks`, {
      headers: { Authorization: `Bearer ${token}` },
      formData: validCsv,
    });

    assert.equal(validRes.status, 201);
    assert.equal(validRes.body.success, true);
    assert.match(validRes.body.data.source_id, /^SRC-TSK-[0-9A-F]{6}$/);
    assert.equal(validRes.body.data.taskCount, 1);
    assert.ok(validRes.body.data.redactionCount >= 1);
  });

  it("validates ?type= filter on GET /sources and fetches single source by sourceId", async () => {
    mockAuthenticatedUser();
    mock.method(Project, "findById", async () => ({ _id: PROJECT_ID }) as any);
    const token = signTestToken("leader");

    const invalidTypeRes = await dispatchRequest(
      `/api/projects/${PROJECT_ID}/sources?type=invalid_type`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    assert.equal(invalidTypeRes.status, 400);

    mock.method(SourceRecord, "findOne", async () => ({
      source_id: "SRC-GH-112233",
      source_type: "github",
      redacted_content: "Redacted commit content",
    }) as any);

    const detailRes = await dispatchRequest(
      `/api/projects/${PROJECT_ID}/sources/SRC-GH-112233`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    assert.equal(detailRes.status, 200);
    assert.equal(detailRes.body.data.source_id, "SRC-GH-112233");
  });
});

