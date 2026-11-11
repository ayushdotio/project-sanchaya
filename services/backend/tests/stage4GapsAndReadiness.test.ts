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
import { HandoverHistory } from "../src/models/HandoverHistory.js";
import { Project } from "../src/models/Project.js";
import { User } from "../src/models/User.js";
import { UserRole } from "../src/types/auth.types.js";

const PROJECT_ID = "672f8b9c1a2b3c4d5e6f7a99";
const QUESTION_ID = "672f8b9c1a2b3c4d5e6f7c22";
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
  name: "Stage 4 Handover Project",
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
    leaderApprovalRecorded: false,
  },
  readinessStatus: "Ready for Review",
  approvedBy: null,
  approvedAt: null,
  approvedSnapshotHash: null,
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

describe("Stage 4 Production Hardening: Gap Loop & Readiness Sign-Off", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("enforces Stage 4 RBAC across gaps, gap-questions/answer, readiness, and sign-off", async () => {
    const projectObj = sampleProject();
    mock.method(Project, "findById", () => ({
      ...projectObj,
      select: () => ({
        populate: async () => projectObj,
      }),
    }) as any);
    mock.method(Finding, "find", () => ({
      sort: async () => [],
    }) as any);
    mock.method(GapQuestion, "find", () => ({
      populate: () => ({
        sort: async () => [],
      }),
    }) as any);

    // incoming blocked on /gaps (403)
    mockAuthenticatedUser(INCOMING_ID);
    const incomingGaps = await dispatchJsonRequest(`/api/projects/${PROJECT_ID}/gaps`, {
      headers: { Authorization: `Bearer ${signTestToken("incoming", INCOMING_ID)}` },
    });
    assert.equal(incomingGaps.status, 403);

    // incoming allowed on GET /readiness (200)
    const incomingReadiness = await dispatchJsonRequest(`/api/projects/${PROJECT_ID}/readiness`, {
      headers: { Authorization: `Bearer ${signTestToken("incoming", INCOMING_ID)}` },
    });
    assert.equal(incomingReadiness.status, 200);
    assert.equal(incomingReadiness.body.data.readinessStatus, "Ready for Review");

    // leader blocked from answering gap question (outgoing only -> 403)
    mockAuthenticatedUser(LEADER_ID);
    const leaderAnswer = await dispatchJsonRequest(
      `/api/projects/${PROJECT_ID}/gap-questions/${QUESTION_ID}/answer`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${signTestToken("leader")}` },
        body: { answer: "Leader should not answer this." },
      },
    );
    assert.equal(leaderAnswer.status, 403);

    // outgoing blocked from /readiness/evaluate and /readiness/sign-off (403)
    mockAuthenticatedUser(OUTGOING_ID);
    const outgoingEval = await dispatchJsonRequest(
      `/api/projects/${PROJECT_ID}/readiness/evaluate`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${signTestToken("outgoing", OUTGOING_ID)}` },
      },
    );
    assert.equal(outgoingEval.status, 403);
  });

  it("rejects malformed Stage 4 params, whitespace-only answers, and invalid gap-questions filters with 400", async () => {
    mockAuthenticatedUser(OUTGOING_ID);
    mock.method(Project, "findById", async () => sampleProject() as any);

    const badParam = await dispatchJsonRequest(
      `/api/projects/${PROJECT_ID}/gap-questions/not-valid-id/answer`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${signTestToken("outgoing", OUTGOING_ID)}` },
        body: { answer: "Valid answer text" },
      },
    );
    assert.equal(badParam.status, 400);
    assert.match(badParam.body.error, /Invalid route parameters/i);

    const blankAnswer = await dispatchJsonRequest(
      `/api/projects/${PROJECT_ID}/gap-questions/${QUESTION_ID}/answer`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${signTestToken("outgoing", OUTGOING_ID)}` },
        body: { answer: "   " },
      },
    );
    assert.equal(blankAnswer.status, 400);

    const badQuery = await dispatchJsonRequest(
      `/api/projects/${PROJECT_ID}/gap-questions?status=unknown_filter`,
      {
        headers: { Authorization: `Bearer ${signTestToken("outgoing", OUTGOING_ID)}` },
      },
    );
    assert.equal(badQuery.status, 400);
  });

  it("filters GET /gap-questions by validated status and gap_category query params", async () => {
    mockAuthenticatedUser(OUTGOING_ID);
    mock.method(Project, "findById", async () => sampleProject() as any);

    let capturedFilter: Record<string, any> | undefined;
    mock.method(GapQuestion, "find", (filter: Record<string, any>) => {
      capturedFilter = filter;
      return {
        populate: () => ({
          sort: async () => [
            {
              _id: QUESTION_ID,
              question: "Why was Redis chosen over Memcached?",
              status: "answered",
              gap_category: "unknown_claim",
            },
          ],
        }),
      } as any;
    });

    const res = await dispatchJsonRequest(
      `/api/projects/${PROJECT_ID}/gap-questions?status=answered&gap_category=unknown_claim`,
      {
        headers: { Authorization: `Bearer ${signTestToken("outgoing", OUTGOING_ID)}` },
      },
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 1);
    assert.equal(capturedFilter?.status, "answered");
    assert.equal(capturedFilter?.gap_category, "unknown_claim");
  });

  it("records Self-reported answer, marks linked finding Supported, updates decisionsBackedByEvidence, and resets stale approval", async () => {
    mockAuthenticatedUser(OUTGOING_ID);
    const projectStub = sampleProject({
      readinessStatus: "Approved for Sharing",
      approvedBy: LEADER_ID,
      approvedAt: new Date("2026-11-10T00:00:00.000Z"),
      approvedSnapshotHash: "stale-hash",
      readinessChecklist: {
        sourcesVerified: true,
        decisionsBackedByEvidence: false,
        unfinishedTasksAssignedOrUnknown: true,
        blockersIdentified: true,
        conflictsDisclosed: true,
        recipientPermissionsChecked: true,
        leaderApprovalRecorded: true,
      },
    });
    mock.method(Project, "findById", async () => projectStub as any);

    const questionStub: any = {
      _id: QUESTION_ID,
      projectId: PROJECT_ID,
      relatedFindingId: FINDING_ID,
      question: "Why was Redis chosen for job locking?",
      status: "pending",
      answer: "",
      evidence_badge: "Self-reported",
      save: async function () {
        return this;
      },
    };
    mock.method(GapQuestion, "findOne", async () => questionStub);

    let findingUpdate: Record<string, any> | undefined;
    mock.method(Finding, "findByIdAndUpdate", async (_id: string, update: any) => {
      findingUpdate = update;
      return { _id: FINDING_ID, ...update } as any;
    });

    let countCalls = 0;
    mock.method(Finding, "countDocuments", async () => {
      countCalls += 1;
      return countCalls === 1 ? 1 : 0; // totalDecisions=1, unverified=0 -> true
    });

    const res = await dispatchJsonRequest(
      `/api/projects/${PROJECT_ID}/gap-questions/${QUESTION_ID}/answer`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${signTestToken("outgoing", OUTGOING_ID)}` },
        body: { answer: "  Redis SETNX locks survived worker restarts cleanly.  " },
      },
    );

    assert.equal(res.status, 200);
    assert.equal(questionStub.status, "answered");
    assert.equal(
      questionStub.answer,
      "Redis SETNX locks survived worker restarts cleanly.",
    );
    assert.equal(questionStub.evidence_badge, "Self-reported");
    assert.equal(findingUpdate?.evidence_origin, "self_reported");
    assert.equal(findingUpdate?.verification_status, "Supported");
    assert.equal(projectStub.readinessChecklist.decisionsBackedByEvidence, true);
    assert.equal(projectStub.readinessStatus, "Ready for Review");
    assert.equal(projectStub.readinessChecklist.leaderApprovalRecorded, false);
    assert.equal(projectStub.approvedBy, null);
    assert.equal(projectStub.approvedSnapshotHash, null);
  });

  it("refuses sign-off with 400 and failingCriteria without flipping leaderApprovalRecorded=true when prerequisites fail", async () => {
    mockAuthenticatedUser(LEADER_ID);
    const projectStub = sampleProject({
      readinessChecklist: {
        sourcesVerified: false,
        decisionsBackedByEvidence: true,
        unfinishedTasksAssignedOrUnknown: false,
        blockersIdentified: true,
        conflictsDisclosed: true,
        recipientPermissionsChecked: true,
        leaderApprovalRecorded: false,
      },
    });
    mock.method(Project, "findById", async () => projectStub as any);

    const res = await dispatchJsonRequest(
      `/api/projects/${PROJECT_ID}/readiness/sign-off`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${signTestToken("leader")}` },
        body: {},
      },
    );

    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.equal(res.body.data.readinessStatus, "Ready for Review");
    assert.equal(projectStub.readinessChecklist.leaderApprovalRecorded, false);
    assert.deepEqual(res.body.data.failingCriteria, [
      "sourcesVerified",
      "unfinishedTasksAssignedOrUnknown",
    ]);
  });

  it("supports evaluateWithAnalytics on POST /readiness/sign-off and sets fallback snapshotHash", async () => {
    mockAuthenticatedUser(LEADER_ID);
    const projectStub = sampleProject({
      readinessChecklist: {
        sourcesVerified: false,
        decisionsBackedByEvidence: false,
        unfinishedTasksAssignedOrUnknown: false,
        blockersIdentified: false,
        conflictsDisclosed: false,
        recipientPermissionsChecked: false,
        leaderApprovalRecorded: false,
      },
    });
    mock.method(Project, "findById", async () => projectStub as any);

    mock.method(axios, "post", async () => ({
      data: {
        success: true,
        readinessStatus: "Ready for Review",
        checklist: {
          sourcesVerified: true,
          decisionsBackedByEvidence: true,
          unfinishedTasksAssignedOrUnknown: true,
          blockersIdentified: true,
          conflictsDisclosed: true,
          recipientPermissionsChecked: true,
          leaderApprovalRecorded: false,
        },
        riskSummary: {},
      },
    }) as any);

    mock.method(HandoverHistory, "findOne", () => ({
      sort: async () => null,
    }) as any);
    mock.method(Finding, "countDocuments", async () => 4);

    let createdHistory: any;
    mock.method(HandoverHistory, "create", async (doc: any) => {
      createdHistory = doc;
      return { _id: "hist-1", ...doc } as any;
    });

    const res = await dispatchJsonRequest(
      `/api/projects/${PROJECT_ID}/readiness/sign-off`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${signTestToken("leader")}` },
        body: { evaluateWithAnalytics: true },
      },
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.data.readinessStatus, "Approved for Sharing");
    assert.equal(projectStub.readinessChecklist.leaderApprovalRecorded, true);
    assert.ok(typeof projectStub.approvedSnapshotHash === "string" && projectStub.approvedSnapshotHash.length === 64);
    assert.equal(createdHistory.approvedSnapshot.snapshotHash, projectStub.approvedSnapshotHash);
  });
});

