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
  name: "Stage 5 Handover Project",
  description: "Production handover test project",
  githubRepo: "epsilum/sanchaya",
  members: {
    leaderId: LEADER_ID,
    outgoingIds: [OUTGOING_ID],
    incomingIds: [INCOMING_ID],
  },
  readinessStatus: "Approved for Sharing",
  approvedAt: new Date("2026-11-11T00:00:00.000Z"),
  approvedSnapshotHash: "abcdef1234567890",
  recipientScope: ["project"],
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

describe("Stage 5 Production Hardening: Handover Report, PDF & Receipts", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("blocks outgoing from Stage 5 routes, blocks incoming before Approved for Sharing, and blocks leader from /acknowledge", async () => {
    mock.method(Project, "findById", async () =>
      sampleProject({ readinessStatus: "Ready for Review" }) as any,
    );

    mockAuthenticatedUser(OUTGOING_ID);
    const outgoingReport = await dispatchRequest(`/api/projects/${PROJECT_ID}/handover`, {
      headers: { Authorization: `Bearer ${signTestToken("outgoing", OUTGOING_ID)}` },
    });
    assert.equal(outgoingReport.status, 403);

    mockAuthenticatedUser(INCOMING_ID);
    for (const path of [
      `/api/projects/${PROJECT_ID}/handover`,
      `/api/projects/${PROJECT_ID}/handover/export-pdf`,
      `/api/projects/${PROJECT_ID}/handover/history`,
    ]) {
      const res = await dispatchRequest(path, {
        headers: { Authorization: `Bearer ${signTestToken("incoming", INCOMING_ID)}` },
      });
      assert.equal(res.status, 403);
    }

    mockAuthenticatedUser(LEADER_ID);
    const leaderAck = await dispatchRequest(
      `/api/projects/${PROJECT_ID}/handover/acknowledge`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${signTestToken("leader", LEADER_ID)}` },
      },
    );
    assert.equal(leaderAck.status, 403);
  });

  it("rejects malformed Stage 5 projectId params and invalid ?draft query values with 400", async () => {
    mockAuthenticatedUser(LEADER_ID);
    mock.method(Project, "findById", async () => sampleProject() as any);

    const badParam = await dispatchRequest(`/api/projects/not-valid-oid/handover`, {
      headers: { Authorization: `Bearer ${signTestToken("leader")}` },
    });
    assert.equal(badParam.status, 400);
    assert.match(badParam.body.error, /Invalid route parameters/i);

    const badDraftQuery = await dispatchRequest(
      `/api/projects/${PROJECT_ID}/handover/export-pdf?draft=invalid`,
      {
        headers: { Authorization: `Bearer ${signTestToken("leader")}` },
      },
    );
    assert.equal(badDraftQuery.status, 400);
    assert.match(badDraftQuery.body.error, /Invalid query parameters/i);
  });

  it("allows leader draft PDF export before approval and returns snapshotHash + recipientScope in GET /handover", async () => {
    mockAuthenticatedUser(LEADER_ID);
    mock.method(Project, "findById", async () =>
      sampleProject({ readinessStatus: "Ready for Review" }) as any,
    );

    let receivedParams: any;
    mock.method(axios, "get", async (_url: string, config: any) => {
      receivedParams = config.params;
      return {
        data: Readable.from([Buffer.from("%PDF-1.4\ndraft")]),
      } as any;
    });

    const pdfRes = await dispatchRequest(
      `/api/projects/${PROJECT_ID}/handover/export-pdf`,
      {
        headers: { Authorization: `Bearer ${signTestToken("leader")}` },
      },
    );
    assert.equal(pdfRes.status, 200);
    assert.deepEqual(receivedParams, { allow_draft: true });

    mock.method(Finding, "find", () => ({ sort: async () => [] }) as any);
    mock.method(GapQuestion, "find", () => ({ select: async () => [] }) as any);
    mock.method(RiskMap, "find", () => ({ sort: async () => [] }) as any);

    const reportRes = await dispatchRequest(`/api/projects/${PROJECT_ID}/handover`, {
      headers: { Authorization: `Bearer ${signTestToken("leader")}` },
    });
    assert.equal(reportRes.status, 200);
    assert.equal(reportRes.body.data.project.approvedSnapshotHash, "abcdef1234567890");
    assert.deepEqual(reportRes.body.data.project.recipientScope, ["project"]);
  });

  it("records idempotent HandoverHistory acknowledgements preserving snapshot metadata and sorts history", async () => {
    mockAuthenticatedUser(INCOMING_ID);
    mock.method(Project, "findById", async () => sampleProject() as any);

    const latestSnap = {
      _id: "hist-snap-2",
      version: 2,
      approvedSnapshot: {
        projectName: "Stage 5 Handover Project",
        snapshotHash: "abcdef1234567890",
        approvedFindingsCount: 7,
      },
    };

    let findOneCalls = 0;
    mock.method(HandoverHistory, "findOne", (query: any) => {
      findOneCalls += 1;
      if (query?.acknowledgedBy) {
        // 1st acknowledge: not yet acknowledged; 2nd acknowledge: already acknowledged
        return findOneCalls <= 2
          ? null
          : {
              _id: "ack-rec-2",
              version: 2,
              acknowledgedBy: INCOMING_ID,
              acknowledgedAt: new Date("2026-11-11T01:00:00.000Z"),
            };
      }
      return {
        sort: async () => latestSnap,
      } as any;
    });

    let createdCount = 0;
    let lastCreatedDoc: any;
    mock.method(HandoverHistory, "create", async (doc: any) => {
      createdCount += 1;
      lastCreatedDoc = doc;
      return { _id: "ack-rec-2", ...doc } as any;
    });

    const firstAck = await dispatchRequest(
      `/api/projects/${PROJECT_ID}/handover/acknowledge`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${signTestToken("incoming", INCOMING_ID)}` },
      },
    );
    assert.equal(firstAck.status, 200);
    assert.equal(createdCount, 1);
    assert.equal(lastCreatedDoc.version, 2);
    assert.equal(lastCreatedDoc.approvedSnapshot.approvedFindingsCount, 7);
    assert.equal(lastCreatedDoc.approvedSnapshot.snapshotHash, "abcdef1234567890");

    const secondAck = await dispatchRequest(
      `/api/projects/${PROJECT_ID}/handover/acknowledge`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${signTestToken("incoming", INCOMING_ID)}` },
      },
    );
    assert.equal(secondAck.status, 200);
    assert.equal(createdCount, 1); // no duplicate inserted!
    assert.match(secondAck.body.message, /already acknowledged/i);

    let capturedSort: any;
    mock.method(HandoverHistory, "find", () => ({
      populate: () => ({
        sort: async (sortObj: any) => {
          capturedSort = sortObj;
          return [latestSnap];
        },
      }),
    }) as any);

    const histRes = await dispatchRequest(`/api/projects/${PROJECT_ID}/handover/history`, {
      headers: { Authorization: `Bearer ${signTestToken("incoming", INCOMING_ID)}` },
    });
    assert.equal(histRes.status, 200);
    assert.equal(histRes.body.data.length, 1);
    assert.deepEqual(capturedSort, { version: -1, createdAt: -1 });
  });
});

