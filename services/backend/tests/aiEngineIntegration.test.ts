import { afterEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { Socket } from "node:net";
import axios from "axios";
import jwt from "jsonwebtoken";
import app from "../src/app.js";
import { env } from "../src/config/env.js";
import { Finding } from "../src/models/Finding.js";
import { GapQuestion } from "../src/models/GapQuestion.js";
import { Project } from "../src/models/Project.js";
import { SourceRecord } from "../src/models/SourceRecord.js";
import { User } from "../src/models/User.js";
import { UserRole } from "../src/types/auth.types.js";

const PROJECT_ID = "672f8b9c1a2b3c4d5e6f7a99";
const FINDING_ID = "672f8b9c1a2b3c4d5e6f7b11";

const signTestToken = (role: UserRole): string =>
  jwt.sign(
    {
      userId: "672f8b9c1a2b3c4d5e6f7a8b",
      email: `${role}@sanchaya.dev`,
      role,
    },
    env.JWT_SECRET,
    { expiresIn: "1h" },
  );

const mockAuthenticatedUser = (userId = "672f8b9c1a2b3c4d5e6f7a8b") => {
  mock.method(User, "findById", () => ({
    select: async () => ({
      _id: userId,
      passwordChangedAt: undefined,
    }),
  }) as any);
};

const dispatchJsonRequest = async (
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: any;
  } = {},
): Promise<{ status: number; body: any }> => {
  const hasBody = options.body !== undefined;
  const bodyBuffer = hasBody
    ? Buffer.from(JSON.stringify(options.body), "utf-8")
    : Buffer.alloc(0);

  const normalizedHeaders: Record<string, string> = {};
  for (const [k, v] of Object.entries(options.headers ?? {})) {
    normalizedHeaders[k.toLowerCase()] = v;
  }
  if (hasBody) {
    normalizedHeaders["content-type"] = "application/json";
    normalizedHeaders["content-length"] = String(bodyBuffer.byteLength);
  }

  const socket = new Socket();
  const req = new http.IncomingMessage(socket);
  req.method = options.method ?? "POST";
  req.url = url;
  req.headers = normalizedHeaders;

  const res = new http.ServerResponse(req);
  const chunks: Buffer[] = [];

  return new Promise((resolve, reject) => {
    res.write = ((chunk: any) => {
      if (chunk) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
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
      if (bodyBuffer.byteLength > 0) {
        req.push(bodyBuffer);
      }
      req.complete = true;
      req.push(null);
    } catch (err) {
      socket.destroy();
      reject(err);
    }
  });
};

const mockSourceRecords = (records: any[]) => {
  mock.method(SourceRecord, "find", () => ({
    sort: () => ({
      lean: async () => records,
    }),
  }) as any);
};

const sampleSources = [
  {
    source_id: "SRC-DOC-001",
    source_type: "document",
    origin: "architecture.md",
    raw_filename: "architecture.md",
    redacted_content: "Team decided to use stateless JWT authentication.",
    metadata: { redactionCount: 0 },
    created_at: "2026-11-01T10:00:00.000Z",
    updated_at: "2026-11-01T10:00:00.000Z",
    imported_at: "2026-11-02T10:00:00.000Z",
  },
];

describe("AI Engine <-> Backend Integration", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("blocks 'outgoing' and 'incoming' from POST /reconstruct (403)", async () => {
    mockAuthenticatedUser();
    for (const role of ["outgoing", "incoming"] as UserRole[]) {
      const res = await dispatchJsonRequest(
        `/api/projects/${PROJECT_ID}/reconstruct`,
        {
          headers: { Authorization: `Bearer ${signTestToken(role)}` },
        },
      );
      assert.equal(res.status, 403);
      assert.equal(res.body.success, false);
    }
  });

  it("returns 400 from POST /reconstruct when no source records exist for the project", async () => {
    mockAuthenticatedUser();
    mock.method(Project, "findById", async () => ({ _id: PROJECT_ID }) as any);
    mockSourceRecords([]);

    const res = await dispatchJsonRequest(
      `/api/projects/${PROJECT_ID}/reconstruct`,
      {
        headers: { Authorization: `Bearer ${signTestToken("leader")}` },
      },
    );

    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.match(res.body.error, /No ingested source records found/i);
  });

  it("loads project SourceRecords and forwards them to ai-engine /internal/extract-and-verify (200)", async () => {
    mockAuthenticatedUser();
    mock.method(Project, "findById", async () => ({ _id: PROJECT_ID }) as any);
    mockSourceRecords(sampleSources);

    let calledUrl = "";
    let calledPayload: any;
    mock.method(axios, "post", async (url: string, data: any) => {
      calledUrl = url;
      calledPayload = data;
      return {
        data: {
          success: true,
          message: "AI extraction, deterministic verification, and gap detection completed.",
          findingsCount: 4,
          supportedCount: 2,
          gapsGenerated: 2,
        },
      } as any;
    });

    const res = await dispatchJsonRequest(
      `/api/projects/${PROJECT_ID}/reconstruct`,
      {
        headers: { Authorization: `Bearer ${signTestToken("leader")}` },
      },
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(calledUrl, `${env.AI_SERVICE_URL}/internal/extract-and-verify`);
    assert.equal(calledPayload.projectId, PROJECT_ID);
    assert.equal(calledPayload.sourceRecords.length, 1);
    assert.equal(calledPayload.sourceRecords[0].source_id, "SRC-DOC-001");
    assert.equal(res.body.data.findingsCount, 4);
    assert.equal(res.body.data.supportedCount, 2);
    assert.equal(res.body.data.gapsGenerated, 2);
    assert.equal(res.body.data.sourcesUsed, 1);
    assert.deepEqual(res.body.data.sourceIds, ["SRC-DOC-001"]);
  });

  it("propagates FastAPI detail error and 503 status when ai-engine fails", async () => {
    mockAuthenticatedUser();
    mock.method(Project, "findById", async () => ({ _id: PROJECT_ID }) as any);
    mockSourceRecords(sampleSources);

    mock.method(axios, "post", async () => {
      const err: any = new Error("Request failed with status code 503");
      err.response = {
        status: 503,
        data: { detail: "OPENAI_API_KEY is not configured." },
      };
      throw err;
    });

    const res = await dispatchJsonRequest(
      `/api/projects/${PROJECT_ID}/reconstruct`,
      {
        headers: { Authorization: `Bearer ${signTestToken("leader")}` },
      },
    );

    assert.equal(res.status, 503);
    assert.equal(res.body.success, false);
    assert.match(res.body.error, /OPENAI_API_KEY is not configured/);
  });

  it("falls back from Docker DNS ai-engine to 127.0.0.1 on ENOTFOUND when running on host", async () => {
    mockAuthenticatedUser();
    mock.method(Project, "findById", async () => ({ _id: PROJECT_ID }) as any);
    mockSourceRecords(sampleSources);

    const attemptedUrls: string[] = [];
    mock.method(axios, "post", async (url: string) => {
      attemptedUrls.push(url);
      if (url.includes("://ai-engine:")) {
        const err: any = new Error("getaddrinfo ENOTFOUND ai-engine");
        err.code = "ENOTFOUND";
        throw err;
      }
      return {
        data: {
          success: true,
          message: "OK from localhost fallback",
          findingsCount: 1,
          supportedCount: 1,
          gapsGenerated: 0,
        },
      } as any;
    });

    const res = await dispatchJsonRequest(
      `/api/projects/${PROJECT_ID}/reconstruct`,
      {
        headers: { Authorization: `Bearer ${signTestToken("leader")}` },
      },
    );

    assert.equal(res.status, 200);
    assert.equal(attemptedUrls.length, 2);
    assert.match(attemptedUrls[0]!, /^http:\/\/ai-engine:8001\/internal\/extract-and-verify$/);
    assert.match(attemptedUrls[1]!, /^http:\/\/127\.0\.0\.1:8001\/internal\/extract-and-verify$/);
  });

  it("re-verifies a single finding via POST /findings/:findingId/verify", async () => {
    mockAuthenticatedUser();
    mock.method(Project, "findById", async () => ({ _id: PROJECT_ID }) as any);

    let saved = false;
    const mockFinding: any = {
      _id: FINDING_ID,
      projectId: PROJECT_ID,
      claim: "Use stateless JWT authentication",
      category: "decision",
      source_id: "SRC-DOC-001",
      verbatim_excerpt: "decided to use stateless JWT authentication",
      verification_status: "Needs review",
      topic: "authentication",
      owner: null,
      deadline: null,
      save: async () => {
        saved = true;
        return mockFinding;
      },
    };
    mock.method(Finding, "findOne", async () => mockFinding);

    let calledUrl = "";
    let calledPayload: any;
    mock.method(axios, "post", async (url: string, data: any) => {
      calledUrl = url;
      calledPayload = data;
      return {
        data: {
          status: "Supported",
          explanation: "Verbatim excerpt verified in MongoDB source_records.",
          source_id: "SRC-DOC-001",
          conflicting_source_id: null,
          conflict_details: null,
        },
      } as any;
    });

    const res = await dispatchJsonRequest(
      `/api/projects/${PROJECT_ID}/findings/${FINDING_ID}/verify`,
      {
        headers: { Authorization: `Bearer ${signTestToken("leader")}` },
      },
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(calledUrl, `${env.AI_SERVICE_URL}/api/v1/evidence/validate`);
    assert.equal(calledPayload.projectId, PROJECT_ID);
    assert.equal(calledPayload.source_id, "SRC-DOC-001");
    assert.equal(saved, true);
    assert.equal(mockFinding.verification_status, "Supported");
    assert.equal(
      mockFinding.explanation,
      "Verbatim excerpt verified in MongoDB source_records.",
    );
  });

  it("supports reverify=true on PATCH /findings/:findingId", async () => {
    mockAuthenticatedUser();
    mock.method(Project, "findById", async () => ({
      _id: PROJECT_ID,
      readinessChecklist: { decisionsBackedByEvidence: false },
      readinessStatus: "Needs Attention",
      save: async function () {
        return this;
      },
    }) as any);
    mock.method(Finding, "countDocuments", async () => 1);

    const mockFinding: any = {
      _id: FINDING_ID,
      projectId: PROJECT_ID,
      claim: "Old claim",
      category: "task",
      source_id: "SRC-TSK-001",
      verbatim_excerpt: "Implement webhook retry queue",
      verification_status: "Needs review",
      owner: null,
      deadline: null,
      save: async () => mockFinding,
    };
    mock.method(Finding, "findOne", async () => mockFinding);

    mock.method(axios, "post", async () => ({
      data: {
        status: "Supported",
        explanation: "Verified with owner and deadline.",
      },
    }) as any);

    const res = await dispatchJsonRequest(
      `/api/projects/${PROJECT_ID}/findings/${FINDING_ID}`,
      {
        method: "PATCH",
        headers: { Authorization: `Bearer ${signTestToken("leader")}` },
        body: {
          claim: "Implement webhook retry queue",
          owner: "ayush-nirmal",
          deadline: "2026-11-20",
          reverify: true,
        },
      },
    );

    assert.equal(res.status, 200);
    assert.equal(mockFinding.owner, "ayush-nirmal");
    assert.equal(mockFinding.verification_status, "Supported");
  });

  it("scans findings freshness via POST /findings/freshness-scan", async () => {
    mockAuthenticatedUser();
    mock.method(Project, "findById", async () => ({ _id: PROJECT_ID }) as any);

    let calledUrl = "";
    let calledPayload: any;
    mock.method(axios, "post", async (url: string, data: any) => {
      calledUrl = url;
      calledPayload = data;
      return {
        data: {
          scanned: 5,
          current_count: 4,
          stale_count: 1,
          invalid_date_count: 0,
          stale_evidence_ids: [FINDING_ID],
          invalid_date_evidence_ids: [],
          max_age_days: 60,
          checked_at: "2026-11-11T00:00:00+00:00",
        },
      } as any;
    });

    const res = await dispatchJsonRequest(
      `/api/projects/${PROJECT_ID}/findings/freshness-scan`,
      {
        headers: { Authorization: `Bearer ${signTestToken("leader")}` },
        body: { maxAgeDays: 60, limit: 100 },
      },
    );

    assert.equal(res.status, 200);
    assert.equal(calledUrl, `${env.AI_SERVICE_URL}/api/v1/evidence/freshness/scan`);
    assert.deepEqual(calledPayload, {
      projectId: PROJECT_ID,
      max_age_days: 60,
      limit: 100,
    });
    assert.equal(res.body.data.stale_count, 1);
  });

  it("preserves ai-engine metadata fields in Finding and GapQuestion Mongoose schemas", () => {
    const finding = new Finding({
      projectId: PROJECT_ID,
      claim: "Use MongoDB",
      category: "decision",
      source_id: "SRC-DOC-001",
      verbatim_excerpt: "decided to use MongoDB",
      verification_status: "Conflicting",
      evidence_origin: "system",
      owner: "ayush-nirmal",
      rationale: "Flexible schema",
      topic: "database",
      conflicting_source_id: "SRC-GH-002",
      conflict_details: {
        topic: "database",
        earlier_version: { source_id: "SRC-DOC-001", verbatim_excerpt: "MongoDB" },
        newer_version: { source_id: "SRC-GH-002", verbatim_excerpt: "PostgreSQL" },
        all_versions: [],
      },
      freshness: {
        source_updated_at: "2026-11-01T00:00:00+00:00",
        recheck_recommended: true,
        reason: "Newer project activity",
      },
      explanation: "Sources disagree on topic 'database'",
    });

    const json = finding.toJSON();
    assert.equal(json.owner, "ayush-nirmal");
    assert.equal(json.topic, "database");
    assert.equal(json.conflicting_source_id, "SRC-GH-002");
    assert.equal(json.conflict_details?.newer_version.source_id, "SRC-GH-002");
    assert.equal(json.freshness?.recheck_recommended, true);

    const gap = new GapQuestion({
      projectId: PROJECT_ID,
      relatedFindingId: FINDING_ID,
      question: "Which database is active?",
      gap_category: "conflicting_sources",
    });
    assert.equal(gap.toJSON().gap_category, "conflicting_sources");
  });

  it("filters SourceRecords by sourceIds and sourceTypes in POST /reconstruct and returns filter-specific 400 when unmatched", async () => {
    mockAuthenticatedUser();
    mock.method(Project, "findById", async () => ({ _id: PROJECT_ID }) as any);

    let capturedFilter: Record<string, any> | undefined;
    mock.method(SourceRecord, "find", (filter: Record<string, any>) => {
      capturedFilter = filter;
      return {
        sort: () => ({
          lean: async () => [],
        }),
      } as any;
    });

    const emptyRes = await dispatchJsonRequest(
      `/api/projects/${PROJECT_ID}/reconstruct`,
      {
        headers: { Authorization: `Bearer ${signTestToken("leader")}` },
        body: {
          sourceIds: ["SRC-GH-999"],
          sourceTypes: ["github"],
        },
      },
    );

    assert.equal(emptyRes.status, 400);
    assert.equal(emptyRes.body.success, false);
    assert.match(emptyRes.body.error, /matched the selected sourceIds\/sourceTypes filter/i);
    assert.deepEqual(capturedFilter?.source_id, { $in: ["SRC-GH-999"] });
    assert.deepEqual(capturedFilter?.source_type, { $in: ["github"] });

    mockSourceRecords(sampleSources);
    mock.method(axios, "post", async (_url: string, payload: any) => {
      assert.equal(payload.sourceRecords.length, 1);
      return {
        data: {
          success: true,
          message: "Filtered extraction complete",
          findingsCount: 0,
          supportedCount: 0,
          gapsGenerated: 0,
        },
      } as any;
    });

    const okRes = await dispatchJsonRequest(
      `/api/projects/${PROJECT_ID}/reconstruct`,
      {
        headers: { Authorization: `Bearer ${signTestToken("leader")}` },
        body: {
          sourceIds: ["SRC-DOC-001"],
          sourceTypes: ["document"],
        },
      },
    );

    assert.equal(okRes.status, 200);
    assert.equal(okRes.body.success, true);
    assert.equal(okRes.body.data.sourcesUsed, 1);
    assert.deepEqual(okRes.body.data.sourceIds, ["SRC-DOC-001"]);
  });

  it("invalidates stale Approved for Sharing status and updates decisionsBackedByEvidence when POST /reconstruct extracts findings", async () => {
    mockAuthenticatedUser();
    let savedCount = 0;
    const projectDoc: any = {
      _id: PROJECT_ID,
      readinessStatus: "Approved for Sharing",
      approvedBy: "672f8b9c1a2b3c4d5e6f7a8b",
      approvedAt: new Date("2026-11-01T00:00:00.000Z"),
      approvedSnapshotHash: "hash-before-reconstruct",
      readinessChecklist: {
        sourcesConnected: true,
        decisionsBackedByEvidence: true,
        criticalGapsResolved: true,
        highRiskModulesReviewed: true,
        freshnessVerified: true,
        handoverDocumentCompiled: true,
        leaderApprovalRecorded: true,
      },
      save: async () => {
        savedCount += 1;
        return projectDoc;
      },
    };
    mock.method(Project, "findById", async () => projectDoc);
    mockSourceRecords(sampleSources);

    let countCalls = 0;
    mock.method(Finding, "countDocuments", async () => {
      countCalls += 1;
      return countCalls === 1 ? 3 : 1;
    });

    mock.method(axios, "post", async () => ({
      data: {
        success: true,
        message: "Extraction complete",
        findingsCount: 3,
        supportedCount: 2,
        gapsGenerated: 1,
      },
    }) as any);

    const res = await dispatchJsonRequest(
      `/api/projects/${PROJECT_ID}/reconstruct`,
      {
        headers: { Authorization: `Bearer ${signTestToken("leader")}` },
      },
    );

    assert.equal(res.status, 200);
    assert.equal(savedCount, 1);
    assert.equal(projectDoc.readinessStatus, "Ready for Review");
    assert.equal(projectDoc.readinessChecklist.decisionsBackedByEvidence, false);
    assert.equal(projectDoc.readinessChecklist.leaderApprovalRecorded, false);
    assert.equal(projectDoc.approvedBy, null);
    assert.equal(projectDoc.approvedAt, null);
    assert.equal(projectDoc.approvedSnapshotHash, null);
  });

  it("maps downstream AI Engine ECONNABORTED timeout errors to HTTP 504 on POST /reconstruct", async () => {
    mockAuthenticatedUser();
    mock.method(Project, "findById", async () => ({ _id: PROJECT_ID }) as any);
    mockSourceRecords(sampleSources);

    mock.method(axios, "post", async () => {
      const err: any = new Error("timeout of 120000ms exceeded");
      err.code = "ECONNABORTED";
      throw err;
    });

    const res = await dispatchJsonRequest(
      `/api/projects/${PROJECT_ID}/reconstruct`,
      {
        headers: { Authorization: `Bearer ${signTestToken("leader")}` },
      },
    );

    assert.equal(res.status, 504);
    assert.equal(res.body.success, false);
    assert.match(res.body.error, /timed out/i);
  });
});

