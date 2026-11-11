import { afterEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { Socket } from "node:net";
import axios from "axios";
import jwt from "jsonwebtoken";
import app from "../src/app.js";
import { env } from "../src/config/env.js";
import { Finding } from "../src/models/Finding.js";
import { Project } from "../src/models/Project.js";
import { User } from "../src/models/User.js";
import { UserRole } from "../src/types/auth.types.js";

const PROJECT_ID = "672f8b9c1a2b3c4d5e6f7a99";
const FINDING_ID = "672f8b9c1a2b3c4d5e6f7b11";
const LEADER_ID = "672f8b9c1a2b3c4d5e6f7a8b";
const OUTGOING_ID = "672f8b9c1a2b3c4d5e6f7a8d";
const INCOMING_ID = "672f8b9c1a2b3c4d5e6f7a8c";

const signTestToken = (role: UserRole, userId = LEADER_ID): string =>
  jwt.sign(
    {
      userId,
      email: `${role}@sanchaya.dev`,
      role,
    },
    env.JWT_SECRET,
    { expiresIn: "1h" },
  );

const mockAuthenticatedUser = (userId = LEADER_ID) => {
  mock.method(User, "findById", () => ({
    select: async () => ({
      _id: userId,
      passwordChangedAt: undefined,
    }),
  }) as any);
};

const sampleProject = (overrides: Record<string, any> = {}) => ({
  _id: PROJECT_ID,
  name: "Stage 3 Hardening Project",
  members: {
    leaderId: LEADER_ID,
    outgoingIds: [OUTGOING_ID],
    incomingIds: [INCOMING_ID],
  },
  readinessChecklist: {
    sourcesVerified: true,
    decisionsBackedByEvidence: true,
    unfinishedTasksAssignedOrUnknown: true,
    blockersIdentified: true,
    conflictsDisclosed: true,
    recipientPermissionsChecked: true,
    leaderApprovalRecorded: true,
  },
  readinessStatus: "Approved for Sharing",
  approvedBy: LEADER_ID,
  approvedAt: new Date("2026-11-10T00:00:00.000Z"),
  approvedSnapshotHash: "snapshot-abc",
  save: async function () {
    return this;
  },
  ...overrides,
});

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
  req.method = options.method ?? "GET";
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

describe("Stage 3 Production Hardening: Candidate Findings & Verification", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("enforces RBAC on GET /findings (allows leader & outgoing, blocks incoming with 403) and blocks outgoing on leader mutations", async () => {
    mock.method(Project, "findById", async () => sampleProject() as any);
    mock.method(Finding, "find", () => ({
      sort: async () => [],
    }) as any);

    mockAuthenticatedUser(OUTGOING_ID);
    const outgoingGet = await dispatchJsonRequest(
      `/api/projects/${PROJECT_ID}/findings`,
      { headers: { Authorization: `Bearer ${signTestToken("outgoing", OUTGOING_ID)}` } },
    );
    assert.equal(outgoingGet.status, 200);
    assert.equal(outgoingGet.body.success, true);

    mockAuthenticatedUser(INCOMING_ID);
    const incomingGet = await dispatchJsonRequest(
      `/api/projects/${PROJECT_ID}/findings`,
      { headers: { Authorization: `Bearer ${signTestToken("incoming", INCOMING_ID)}` } },
    );
    assert.equal(incomingGet.status, 403);

    mockAuthenticatedUser(OUTGOING_ID);
    const outgoingApprove = await dispatchJsonRequest(
      `/api/projects/${PROJECT_ID}/findings/${FINDING_ID}/approve`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${signTestToken("outgoing", OUTGOING_ID)}` },
      },
    );
    assert.equal(outgoingApprove.status, 403);
  });

  it("applies validated query filters on GET /findings and rejects invalid enum filters with 400", async () => {
    mockAuthenticatedUser();
    mock.method(Project, "findById", async () => sampleProject() as any);

    let capturedFilter: Record<string, any> | undefined;
    mock.method(Finding, "find", (filter: Record<string, any>) => {
      capturedFilter = filter;
      return {
        sort: async () => [
          {
            _id: FINDING_ID,
            claim: "Use MongoDB 7",
            category: "decision",
            verification_status: "Needs review",
            review_status: "pending",
            source_id: "SRC-DOC-001",
          },
        ],
      } as any;
    });

    const filteredRes = await dispatchJsonRequest(
      `/api/projects/${PROJECT_ID}/findings?status=needs_review&category=decision&review_status=pending&source_id=SRC-DOC-001&recheck=true`,
      { headers: { Authorization: `Bearer ${signTestToken("leader")}` } },
    );

    assert.equal(filteredRes.status, 200);
    assert.equal(filteredRes.body.data.length, 1);
    assert.equal(capturedFilter?.verification_status, "Needs review");
    assert.equal(capturedFilter?.category, "decision");
    assert.equal(capturedFilter?.review_status, "pending");
    assert.equal(capturedFilter?.source_id, "SRC-DOC-001");
    assert.equal(capturedFilter?.["freshness.recheck_recommended"], true);

    const invalidRes = await dispatchJsonRequest(
      `/api/projects/${PROJECT_ID}/findings?category=invalid_cat`,
      { headers: { Authorization: `Bearer ${signTestToken("leader")}` } },
    );
    assert.equal(invalidRes.status, 400);
    assert.equal(invalidRes.body.success, false);
  });

  it("rejects malformed findingId params and empty PATCH payloads with 400", async () => {
    mockAuthenticatedUser();
    mock.method(Project, "findById", async () => sampleProject() as any);

    const badParamRes = await dispatchJsonRequest(
      `/api/projects/${PROJECT_ID}/findings/not-an-object-id/approve`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${signTestToken("leader")}` },
      },
    );
    assert.equal(badParamRes.status, 400);
    assert.match(badParamRes.body.error, /Invalid route parameters/i);

    const emptyPatchRes = await dispatchJsonRequest(
      `/api/projects/${PROJECT_ID}/findings/${FINDING_ID}`,
      {
        method: "PATCH",
        headers: { Authorization: `Bearer ${signTestToken("leader")}` },
        body: {},
      },
    );
    assert.equal(emptyPatchRes.status, 400);
    assert.equal(emptyPatchRes.body.success, false);
  });

  it("sets edited audit fields on PATCH /findings/:findingId, normalizes empty nullable fields, and invalidates stale approval", async () => {
    mockAuthenticatedUser();
    const proj = sampleProject();
    mock.method(Project, "findById", async () => proj as any);
    mock.method(Finding, "countDocuments", async () => 1);

    const mockFinding: any = {
      _id: FINDING_ID,
      projectId: PROJECT_ID,
      claim: "Original decision claim",
      category: "decision",
      source_id: "SRC-DOC-001",
      verbatim_excerpt: "Team decided on JWT auth",
      verification_status: "Needs review",
      review_status: "approved",
      owner: "Alice",
      deadline: "2026-11-30",
      rationale: "Existing rationale",
      edited: false,
      editedBy: null,
      editedAt: null,
      save: async function () {
        return this;
      },
    };
    mock.method(Finding, "findOne", async () => mockFinding);

    const patchRes = await dispatchJsonRequest(
      `/api/projects/${PROJECT_ID}/findings/${FINDING_ID}`,
      {
        method: "PATCH",
        headers: { Authorization: `Bearer ${signTestToken("leader")}` },
        body: {
          claim: "  Updated decision claim  ",
          owner: "   ",
        },
      },
    );

    assert.equal(patchRes.status, 200);
    assert.equal(mockFinding.claim, "Updated decision claim");
    assert.equal(mockFinding.owner, null);
    assert.equal(mockFinding.edited, true);
    assert.equal(String(mockFinding.editedBy), LEADER_ID);
    assert.ok(mockFinding.editedAt instanceof Date);
    assert.equal(proj.readinessStatus, "Ready for Review");
    assert.equal(proj.readinessChecklist.leaderApprovalRecorded, false);
  });

  it("recalculates decisionsBackedByEvidence and resets Approved for Sharing on Undo review (review_status=pending)", async () => {
    mockAuthenticatedUser();
    const proj = sampleProject();
    mock.method(Project, "findById", async () => proj as any);

    let countCalls = 0;
    mock.method(Finding, "countDocuments", async () => {
      countCalls += 1;
      return countCalls === 1 ? 2 : 1; // 2 decisions total, 1 unverified & unapproved
    });

    const mockFinding: any = {
      _id: FINDING_ID,
      projectId: PROJECT_ID,
      claim: "Decision under review",
      category: "decision",
      verification_status: "Needs review",
      review_status: "approved",
      save: async function () {
        return this;
      },
    };
    mock.method(Finding, "findOne", async () => mockFinding);

    const res = await dispatchJsonRequest(
      `/api/projects/${PROJECT_ID}/findings/${FINDING_ID}`,
      {
        method: "PATCH",
        headers: { Authorization: `Bearer ${signTestToken("leader")}` },
        body: { review_status: "pending" },
      },
    );

    assert.equal(res.status, 200);
    assert.equal(mockFinding.review_status, "pending");
    assert.equal(proj.readinessChecklist.decisionsBackedByEvidence, false);
    assert.equal(proj.readinessStatus, "Ready for Review");
    assert.equal(proj.readinessChecklist.leaderApprovalRecorded, false);
  });

  it("re-verifies via POST /findings/:findingId/verify and syncs checklist if status flips from Supported", async () => {
    mockAuthenticatedUser();
    const proj = sampleProject();
    mock.method(Project, "findById", async () => proj as any);

    let countCalls = 0;
    mock.method(Finding, "countDocuments", async () => {
      countCalls += 1;
      return countCalls === 1 ? 1 : 1;
    });

    const mockFinding: any = {
      _id: FINDING_ID,
      projectId: PROJECT_ID,
      claim: "Use Redis cache",
      category: "decision",
      source_id: "SRC-DOC-001",
      verbatim_excerpt: "Use Redis cache",
      verification_status: "Supported",
      review_status: "pending",
      topic: "caching",
      save: async function () {
        return this;
      },
    };
    mock.method(Finding, "findOne", async () => mockFinding);

    mock.method(axios, "post", async () => ({
      data: {
        status: "Conflicting",
        explanation: "Newer ADR switched to Valkey.",
        conflicting_source_id: "SRC-GH-004",
      },
    }) as any);

    const res = await dispatchJsonRequest(
      `/api/projects/${PROJECT_ID}/findings/${FINDING_ID}/verify`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${signTestToken("leader")}` },
      },
    );

    assert.equal(res.status, 200);
    assert.equal(mockFinding.verification_status, "Conflicting");
    assert.equal(mockFinding.conflicting_source_id, "SRC-GH-004");
    assert.equal(proj.readinessChecklist.decisionsBackedByEvidence, false);
    assert.equal(proj.readinessStatus, "Ready for Review");
  });

  it("supports POST/PATCH approve & reject endpoints and recalculates checklist accurately", async () => {
    mockAuthenticatedUser();
    const proj = sampleProject({
      readinessChecklist: {
        ...sampleProject().readinessChecklist,
        decisionsBackedByEvidence: false,
      },
    });
    mock.method(Project, "findById", async () => proj as any);

    const mockFinding: any = {
      _id: FINDING_ID,
      projectId: PROJECT_ID,
      claim: "Use stateless JWT",
      category: "decision",
      verification_status: "Needs review",
      review_status: "pending",
      save: async function () {
        return this;
      },
    };
    mock.method(Finding, "findOne", async () => mockFinding);

    let callNum = 0;
    mock.method(Finding, "countDocuments", async () => {
      callNum += 1;
      // Approve call: totalDecisions=1, unverified=0 -> true
      if (callNum <= 2) return callNum === 1 ? 1 : 0;
      // Reject call: totalDecisions=1, unverified=1 -> false
      return 1;
    });

    const approveRes = await dispatchJsonRequest(
      `/api/projects/${PROJECT_ID}/findings/${FINDING_ID}/approve`,
      {
        method: "PATCH",
        headers: { Authorization: `Bearer ${signTestToken("leader")}` },
      },
    );
    assert.equal(approveRes.status, 200);
    assert.equal(mockFinding.review_status, "approved");
    assert.equal(proj.readinessChecklist.decisionsBackedByEvidence, true);

    const rejectRes = await dispatchJsonRequest(
      `/api/projects/${PROJECT_ID}/findings/${FINDING_ID}/reject`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${signTestToken("leader")}` },
      },
    );
    assert.equal(rejectRes.status, 200);
    assert.equal(mockFinding.review_status, "rejected");
    assert.equal(proj.readinessChecklist.decisionsBackedByEvidence, false);
    assert.equal(proj.readinessStatus, "Ready for Review");
  });
});

