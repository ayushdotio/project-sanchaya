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
import { storageService } from "../src/services/storageService.js";
import { UserRole } from "../src/types/auth.types.js";

const PROJECT_ID = "672f8b9c1a2b3c4d5e6f7a99";

const signTestToken = (role: UserRole, email = `${role}@example.com`): string =>
  jwt.sign(
    {
      userId: "672f8b9c1a2b3c4d5e6f7a8b",
      email,
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

interface DispatchedResponse {
  status: number;
  body: any;
}

/**
 * Dispatches a synthetic HTTP request directly through the Express `app`
 * using Node's IncomingMessage/ServerResponse without opening a TCP socket.
 */
const dispatchRequest = async (
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
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
  }

  const socket = new Socket();
  const req = new http.IncomingMessage(socket);
  req.method = options.method ?? (options.formData ? "POST" : "GET");
  req.url = url;
  req.headers = normalizedHeaders;

  const res = new http.ServerResponse(req);
  const chunks: Buffer[] = [];

  return new Promise<DispatchedResponse>((resolve, reject) => {
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
        // Leave as plain text if response is non-JSON
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

describe("Upload & Fetch Meeting Notes API (/api/projects/:projectId/uploads/notes)", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("resolves ImageKit folder path as /sanchaya/<projectId>", () => {
    assert.equal(
      storageService.getProjectFolder(PROJECT_ID),
      `/sanchaya/${PROJECT_ID}`,
    );
  });

  it("returns 401 when authentication token is missing", async () => {
    const formData = new FormData();
    formData.append(
      "file",
      new Blob(["Meeting notes"], { type: "text/plain" }),
      "notes.txt",
    );

    const res = await dispatchRequest(
      `/api/projects/${PROJECT_ID}/uploads/notes`,
      { formData },
    );

    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
    assert.match(res.body.error, /Unauthorized/i);
  });

  it("returns 403 when an 'incoming' user attempts to upload notes", async () => {
    mockAuthenticatedUser();
    const token = signTestToken("incoming");

    const formData = new FormData();
    formData.append(
      "file",
      new Blob(["Meeting notes"], { type: "text/plain" }),
      "notes.txt",
    );

    const res = await dispatchRequest(
      `/api/projects/${PROJECT_ID}/uploads/notes`,
      {
        headers: { Authorization: `Bearer ${token}` },
        formData,
      },
    );

    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);
    assert.match(res.body.error, /Access denied/i);
  });

  it("returns 400 when no file is attached", async () => {
    mockAuthenticatedUser();
    mock.method(Project, "findById", async () => ({ _id: PROJECT_ID }) as any);
    const token = signTestToken("leader");

    const res = await dispatchRequest(
      `/api/projects/${PROJECT_ID}/uploads/notes`,
      {
        headers: { Authorization: `Bearer ${token}` },
        formData: new FormData(),
      },
    );

    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error, "No document file uploaded");
  });

  it("rejects unsupported file types in uploadMiddleware with 400", async () => {
    mockAuthenticatedUser();
    mock.method(Project, "findById", async () => ({ _id: PROJECT_ID }) as any);
    const token = signTestToken("leader");

    const formData = new FormData();
    formData.append(
      "file",
      new Blob(["binary payload"], { type: "application/octet-stream" }),
      "malware.exe",
    );

    const res = await dispatchRequest(
      `/api/projects/${PROJECT_ID}/uploads/notes`,
      {
        headers: { Authorization: `Bearer ${token}` },
        formData,
      },
    );

    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.match(res.body.error, /Unsupported file type/i);
  });

  it("returns 404 when target project does not exist", async () => {
    mockAuthenticatedUser();
    mock.method(Project, "findById", async () => null);
    const token = signTestToken("leader");

    const formData = new FormData();
    formData.append(
      "file",
      new Blob(["Architecture sync notes"], { type: "text/plain" }),
      "notes.txt",
    );

    const res = await dispatchRequest(
      `/api/projects/${PROJECT_ID}/uploads/notes`,
      {
        headers: { Authorization: `Bearer ${token}` },
        formData,
      },
    );

    assert.equal(res.status, 404);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error, "Project not found");
  });

  it("extracts text, redacts secrets/PII, uploads to ImageKit sanchaya/[projectId], and persists SourceRecord (201)", async () => {
    mockAuthenticatedUser();
    mock.method(Project, "findById", async () => ({ _id: PROJECT_ID }) as any);

    let uploadCallArgs: any;
    mock.method(storageService, "uploadDocument", async (params: any) => {
      uploadCallArgs = params;
      return {
        fileId: "ik-file-001",
        name: "meeting-notes_abc123.txt",
        url: `https://ik.imagekit.io/demo/sanchaya/${PROJECT_ID}/meeting-notes_abc123.txt`,
        filePath: `/sanchaya/${PROJECT_ID}/meeting-notes_abc123.txt`,
        size: params.buffer.length,
      };
    });

    let persistedDoc: any;
    mock.method(SourceRecord, "create", async (doc: any) => {
      persistedDoc = doc;
      return {
        _id: "672f8b9c1a2b3c4d5e6f7b01",
        ...doc,
      } as any;
    });

    const token = signTestToken("leader", "lead@sanchaya.dev");
    const rawContent = [
      "Handover Sync - 2026-11-10",
      "Contact: private.dev@gmail.com",
      "Temp PAT: ghp_1234567890abcdefghijklmnopqrstuvwxyz",
      "Decision: Keep MongoDB index on projectId and source_id.",
    ].join("\n");

    const formData = new FormData();
    formData.append(
      "file",
      new Blob([rawContent], { type: "text/plain" }),
      "../../meeting-notes.txt",
    );

    const res = await dispatchRequest(
      `/api/projects/${PROJECT_ID}/uploads/notes`,
      {
        headers: { Authorization: `Bearer ${token}` },
        formData,
      },
    );

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.match(res.body.data.source_id, /^SRC-DOC-[0-9A-F]{6}$/);
    assert.equal(res.body.data.origin, "meeting-notes.txt");
    assert.equal(res.body.data.fileId, "ik-file-001");
    assert.equal(
      res.body.data.fileUrl,
      `https://ik.imagekit.io/demo/sanchaya/${PROJECT_ID}/meeting-notes_abc123.txt`,
    );
    assert.equal(
      res.body.data.filePath,
      `/sanchaya/${PROJECT_ID}/meeting-notes_abc123.txt`,
    );
    assert.ok(res.body.data.redactionCount >= 2);
    assert.ok(res.body.data.created_at);

    assert.ok(uploadCallArgs);
    assert.equal(uploadCallArgs.projectId, PROJECT_ID);
    assert.equal(uploadCallArgs.fileName, "meeting-notes.txt");
    assert.ok(Buffer.isBuffer(uploadCallArgs.buffer));

    assert.ok(persistedDoc);
    assert.equal(persistedDoc.projectId, PROJECT_ID);
    assert.equal(persistedDoc.source_type, "document");
    assert.equal(persistedDoc.origin, "meeting-notes.txt");
    assert.equal(persistedDoc.raw_filename, "meeting-notes.txt");
    assert.equal(persistedDoc.metadata.author, "lead@sanchaya.dev");
    assert.equal(persistedDoc.metadata.fileId, "ik-file-001");
    assert.equal(
      persistedDoc.metadata.url,
      `https://ik.imagekit.io/demo/sanchaya/${PROJECT_ID}/meeting-notes_abc123.txt`,
    );
    assert.equal(
      persistedDoc.metadata.filePath,
      `/sanchaya/${PROJECT_ID}/meeting-notes_abc123.txt`,
    );
    assert.equal(
      persistedDoc.metadata.redactionCount,
      res.body.data.redactionCount,
    );
    assert.equal(
      persistedDoc.redacted_content.includes("private.dev@gmail.com"),
      false,
    );
    assert.equal(
      persistedDoc.redacted_content.includes(
        "ghp_1234567890abcdefghijklmnopqrstuvwxyz",
      ),
      false,
    );
    assert.equal(
      persistedDoc.redacted_content.includes("[REDACTED_PII]"),
      true,
    );
    assert.equal(
      persistedDoc.redacted_content.includes("[REDACTED_SECRET]"),
      true,
    );
    assert.ok(persistedDoc.created_at instanceof Date);
    assert.ok(persistedDoc.updated_at instanceof Date);
    assert.ok(persistedDoc.imported_at instanceof Date);
  });

  it("permits 'outgoing' role on the /upload-document alias route", async () => {
    mockAuthenticatedUser();
    mock.method(Project, "findById", async () => ({ _id: PROJECT_ID }) as any);
    mock.method(storageService, "uploadDocument", async (params: any) => ({
      fileId: "ik-file-002",
      name: "runbook.txt",
      url: `https://ik.imagekit.io/demo/sanchaya/${PROJECT_ID}/runbook.txt`,
      filePath: `/sanchaya/${PROJECT_ID}/runbook.txt`,
      size: params.buffer.length,
    }));
    mock.method(SourceRecord, "create", async (doc: any) => ({
      _id: "672f8b9c1a2b3c4d5e6f7b02",
      ...doc,
    }) as any);

    const token = signTestToken("outgoing", "outgoing@sanchaya.dev");
    const formData = new FormData();
    formData.append(
      "file",
      new Blob(["Runbook notes for deployment."], { type: "text/plain" }),
      "runbook.txt",
    );

    const res = await dispatchRequest(
      `/api/projects/${PROJECT_ID}/upload-document`,
      {
        headers: { Authorization: `Bearer ${token}` },
        formData,
      },
    );

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.match(res.body.data.source_id, /^SRC-DOC-[0-9A-F]{6}$/);
    assert.equal(res.body.data.origin, "runbook.txt");
    assert.equal(res.body.data.fileId, "ik-file-002");
    assert.equal(res.body.data.redactionCount, 0);
  });

  it("lists stored documents from ImageKit for the project (GET /uploads/notes)", async () => {
    mockAuthenticatedUser();
    mock.method(Project, "findById", async () => ({ _id: PROJECT_ID }) as any);
    let listedForProjectId: string | undefined;
    mock.method(storageService, "listProjectDocuments", async (pid: string) => {
      listedForProjectId = pid;
      return [
        {
          fileId: "ik-file-001",
          name: "meeting-notes.txt",
          url: `https://ik.imagekit.io/demo/sanchaya/${PROJECT_ID}/meeting-notes.txt`,
          filePath: `/sanchaya/${PROJECT_ID}/meeting-notes.txt`,
          size: 128,
          mime: "text/plain",
          createdAt: "2026-11-10T10:00:00.000Z",
          updatedAt: "2026-11-10T10:00:00.000Z",
          tags: ["sanchaya", "document", PROJECT_ID],
        },
      ];
    });

    const token = signTestToken("outgoing");
    const res = await dispatchRequest(
      `/api/projects/${PROJECT_ID}/uploads/notes`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(listedForProjectId, PROJECT_ID);
    assert.equal(res.body.data.length, 1);
    assert.equal(res.body.data[0].fileId, "ik-file-001");
  });

  it("blocks 'incoming' role from listing project documents (403)", async () => {
    mockAuthenticatedUser();
    const token = signTestToken("incoming");

    const res = await dispatchRequest(`/api/projects/${PROJECT_ID}/documents`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });

    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);
  });

  it("fetches single document details when file belongs to project's ImageKit folder", async () => {
    mockAuthenticatedUser();
    mock.method(Project, "findById", async () => ({ _id: PROJECT_ID }) as any);
    mock.method(storageService, "getDocumentDetails", async (fileId: string) => ({
      fileId,
      name: "meeting-notes.txt",
      url: `https://ik.imagekit.io/demo/sanchaya/${PROJECT_ID}/meeting-notes.txt`,
      filePath: `/sanchaya/${PROJECT_ID}/meeting-notes.txt`,
      size: 128,
      mime: "text/plain",
      createdAt: "2026-11-10T10:00:00.000Z",
      updatedAt: "2026-11-10T10:00:00.000Z",
      tags: ["sanchaya"],
    }));

    const token = signTestToken("leader");
    const res = await dispatchRequest(
      `/api/projects/${PROJECT_ID}/documents/ik-file-001`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.fileId, "ik-file-001");
    assert.equal(
      res.body.data.filePath,
      `/sanchaya/${PROJECT_ID}/meeting-notes.txt`,
    );
  });

  it("returns 404 when fetching a fileId that belongs to another project's folder", async () => {
    mockAuthenticatedUser();
    mock.method(Project, "findById", async () => ({ _id: PROJECT_ID }) as any);
    mock.method(storageService, "getDocumentDetails", async (fileId: string) => ({
      fileId,
      name: "secret-other-project.pdf",
      url: "https://ik.imagekit.io/demo/sanchaya/other-project/secret.pdf",
      filePath: "/sanchaya/other-project/secret.pdf",
      size: 512,
      mime: "application/pdf",
      createdAt: "2026-11-10T10:00:00.000Z",
      updatedAt: "2026-11-10T10:00:00.000Z",
      tags: [],
    }));

    const token = signTestToken("leader");
    const res = await dispatchRequest(
      `/api/projects/${PROJECT_ID}/uploads/notes/ik-other-file`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    assert.equal(res.status, 404);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error, "Document not found in project storage");
  });
});
