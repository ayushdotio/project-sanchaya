import { afterEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { Socket } from "node:net";
import { Readable } from "node:stream";
import axios from "axios";
import jwt from "jsonwebtoken";
import app from "../src/app.js";
import { env } from "../src/config/env.js";
import { Finding } from "../src/models/Finding.js";
import { GapQuestion } from "../src/models/GapQuestion.js";
import { HandoverHistory } from "../src/models/HandoverHistory.js";
import { Project } from "../src/models/Project.js";
import { RiskMap } from "../src/models/RiskMap.js";
import { User } from "../src/models/User.js";
import { UserRole } from "../src/types/auth.types.js";

const PROJECT_ID = "672f8b9c1a2b3c4d5e6f7a99";
const LEADER_ID = "672f8b9c1a2b3c4d5e6f7a8b";
const INCOMING_ID = "672f8b9c1a2b3c4d5e6f7a8c";
const OUTSIDER_ID = "672f8b9c1a2b3c4d5e6f7fff";
const FINDING_ID = "672f8b9c1a2b3c4d5e6f7b11";

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
  name: "Sanchaya Handover",
  description: "Capstone handover",
  githubRepo: "epsilum/sanchaya",
  members: {
    leaderId: LEADER_ID,
    outgoingIds: [],
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
  recipientScope: ["project"],
  save: async function () {
    return this;
  },
  ...overrides,
});

const dispatchRequest = async (
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: any;
  } = {},
): Promise<{ status: number; headers: http.OutgoingHttpHeaders; rawBody: Buffer; body: any }> => {
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
      const rawBody = Buffer.concat(chunks);
      const text = rawBody.toString("utf-8");
      let parsed: any = text;
      try {
        parsed = text ? JSON.parse(text) : undefined;
      } catch {
        // binary or plain text
      }
      socket.destroy();
      resolve({ status: res.statusCode, headers: res.getHeaders(), rawBody, body: parsed });
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

describe("Analytics Service <-> Backend Integration", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("enforces SEC-01 project membership check across project routes (403 for non-member)", async () => {
    mockAuthenticatedUser(OUTSIDER_ID);
    mock.method(Project, "findById", async () => sampleProject() as any);

    const res = await dispatchRequest(
      `/api/projects/${PROJECT_ID}/risk-map`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${signTestToken("leader", OUTSIDER_ID)}` },
      },
    );

    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);
    assert.match(res.body.error, /not a member of this project/i);
  });

  it("calls analytics-service /internal/compute-risk-and-readiness on GET /risk-map and POST /readiness/evaluate", async () => {
    mockAuthenticatedUser(LEADER_ID);
    mock.method(Project, "findById", async () => sampleProject() as any);

    const calledUrls: string[] = [];
    mock.method(axios, "post", async (url: string, data: any) => {
      calledUrls.push(url);
      assert.deepEqual(data, { projectId: PROJECT_ID });
      return {
        data: {
          success: true,
          message: "Contribution concentration risk and readiness checklist evaluated.",
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
          riskSummary: {
            units: [{ unit: "services/backend", level: "High", top_commit_share: 0.85 }],
            hotspot_files: [],
            task_groups: [],
            rules: [],
            failing_rules: [7],
          },
        },
      } as any;
    });

    const riskRes = await dispatchRequest(`/api/projects/${PROJECT_ID}/risk-map`, {
      method: "GET",
      headers: { Authorization: `Bearer ${signTestToken("leader")}` },
    });
    assert.equal(riskRes.status, 200);
    assert.equal(riskRes.body.data.units[0].unit, "services/backend");

    const evalRes = await dispatchRequest(
      `/api/projects/${PROJECT_ID}/readiness/evaluate`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${signTestToken("leader")}` },
      },
    );
    assert.equal(evalRes.status, 200);
    assert.equal(evalRes.body.data.readinessStatus, "Ready for Review");
    assert.equal(calledUrls.length, 2);
    assert.equal(
      calledUrls[0],
      `${env.ANALYTICS_SERVICE_URL}/internal/compute-risk-and-readiness`,
    );
  });

  it("streams ReportLab PDF from analytics-service on GET /handover/export-pdf", async () => {
    mockAuthenticatedUser(INCOMING_ID);
    mock.method(Project, "findById", async () =>
      sampleProject({ readinessStatus: "Approved for Sharing" }) as any,
    );

    let requestedUrl = "";
    mock.method(axios, "get", async (url: string, config: any) => {
      requestedUrl = url;
      assert.equal(config.responseType, "stream");
      assert.equal(config.params, undefined);
      return {
        data: Readable.from([Buffer.from("%PDF-1.4\nmock-handover-bytes")]),
      } as any;
    });

    const res = await dispatchRequest(
      `/api/projects/${PROJECT_ID}/handover/export-pdf`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${signTestToken("incoming", INCOMING_ID)}` },
      },
    );

    assert.equal(res.status, 200);
    assert.equal(
      requestedUrl,
      `${env.ANALYTICS_SERVICE_URL}/internal/generate-pdf/${PROJECT_ID}`,
    );
    assert.equal(res.headers["content-type"], "application/pdf");
    assert.equal(res.rawBody.subarray(0, 4).toString("utf-8"), "%PDF");
  });

  it("filters handover report sections for incoming user based on project.recipientScope", async () => {
    mockAuthenticatedUser(INCOMING_ID);
    mock.method(Project, "findById", async () =>
      sampleProject({
        readinessStatus: "Approved for Sharing",
        recipientScope: ["decisions"],
      }) as any,
    );

    mock.method(Finding, "find", () => ({
      sort: async () => [
        { _id: "f1", category: "decision", claim: "Use MongoDB" },
        { _id: "f2", category: "task", claim: "Fix webhook" },
      ],
    }) as any);
    mock.method(GapQuestion, "find", () => ({
      select: async () => [{ question: "Q1", answer: "A1", evidence_badge: "Self-reported" }],
    }) as any);
    mock.method(RiskMap, "find", () => ({
      sort: async () => [{ modulePath: "services/backend", riskTier: "High" }],
    }) as any);

    const res = await dispatchRequest(`/api/projects/${PROJECT_ID}/handover`, {
      method: "GET",
      headers: { Authorization: `Bearer ${signTestToken("incoming", INCOMING_ID)}` },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.findings.length, 1);
    assert.equal(res.body.data.findings[0].category, "decision");
    assert.deepEqual(res.body.data.gapAnswers, []);
    assert.deepEqual(res.body.data.riskMaps, []);
  });

  it("LOGIC-01: keeps decisionsBackedByEvidence=false when unverified decisions remain", async () => {
    mockAuthenticatedUser(LEADER_ID);
    const projectStub = sampleProject({
      readinessChecklist: {
        sourcesVerified: true,
        decisionsBackedByEvidence: false,
        unfinishedTasksAssignedOrUnknown: true,
        blockersIdentified: true,
        conflictsDisclosed: true,
        recipientPermissionsChecked: true,
        leaderApprovalRecorded: false,
      },
    });
    mock.method(Project, "findById", async () => projectStub as any);

    const findingStub: any = {
      _id: FINDING_ID,
      projectId: PROJECT_ID,
      category: "decision",
      review_status: "pending",
      save: async () => findingStub,
    };
    mock.method(Finding, "findOne", async () => findingStub);

    let countCalls = 0;
    mock.method(Finding, "countDocuments", async () => {
      countCalls += 1;
      // 1st call: totalDecisions = 2, 2nd call: unverifiedDecisions = 1
      return countCalls === 1 ? 2 : 1;
    });

    const res = await dispatchRequest(
      `/api/projects/${PROJECT_ID}/findings/${FINDING_ID}/approve`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${signTestToken("leader")}` },
      },
    );

    assert.equal(res.status, 200);
    assert.equal(projectStub.readinessChecklist.decisionsBackedByEvidence, false);
  });

  it("records HandoverHistory version on POST /readiness/sign-off", async () => {
    mockAuthenticatedUser(LEADER_ID);
    const projectStub = sampleProject();
    mock.method(Project, "findById", async () => projectStub as any);
    mock.method(HandoverHistory, "findOne", () => ({
      sort: async () => ({ version: 2 }),
    }) as any);
    mock.method(Finding, "countDocuments", async () => 3);

    let createdDoc: any;
    mock.method(HandoverHistory, "create", async (doc: any) => {
      createdDoc = doc;
      return { _id: "hist-3", ...doc } as any;
    });

    const res = await dispatchRequest(
      `/api/projects/${PROJECT_ID}/readiness/sign-off`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${signTestToken("leader")}` },
        body: {},
      },
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.data.readinessStatus, "Approved for Sharing");
    assert.equal(res.body.data.version, 3);
    assert.equal(createdDoc.version, 3);
    assert.equal(createdDoc.approvedSnapshot.approvedFindingsCount, 3);
  });
});

