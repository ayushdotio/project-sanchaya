import { afterEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { Socket } from "node:net";
import crypto from "node:crypto";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import app from "../src/app.js";
import { env } from "../src/config/env.js";
import { clearRateLimitBuckets } from "../src/middlewares/rateLimitMiddleware.js";
import { User } from "../src/models/User.js";

const USER_ID = "672f8b9c1a2b3c4d5e6f7a8b";

const dispatchJsonRequest = async (
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: any;
  } = {},
): Promise<{
  status: number;
  headers: http.OutgoingHttpHeaders;
  body: any;
}> => {
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
      resolve({ status: res.statusCode, headers: res.getHeaders(), body: parsed });
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

describe("Auth Routes Production Hardening", () => {
  afterEach(() => {
    clearRateLimitBuckets();
    mock.restoreAll();
  });

  it("sets Cache-Control: no-store on auth routes and validates trimmed inputs & password caps", async () => {
    const weakPasswordRes = await dispatchJsonRequest("/api/auth/register", {
      body: {
        name: "Ayush",
        email: "ayush@sanchaya.dev",
        password: "weak",
      },
    });
    assert.equal(weakPasswordRes.status, 400);
    assert.equal(weakPasswordRes.headers["cache-control"], "no-store");

    const hugePasswordRes = await dispatchJsonRequest("/api/auth/login", {
      body: {
        email: "  ayush@sanchaya.dev  ",
        password: "A".repeat(140),
      },
    });
    assert.equal(hugePasswordRes.status, 400);
    assert.equal(hugePasswordRes.body.success, false);

    const nonHexResetRes = await dispatchJsonRequest("/api/auth/reset-password", {
      body: {
        token: "z".repeat(64),
        newPassword: "Password1!",
      },
    });
    assert.equal(nonHexResetRes.status, 400);
  });

  it("ignores client-supplied role during registration and maps duplicate emails to 409", async () => {
    let persistedRole: string | undefined;
    mock.method(User, "create", async (doc: any) => {
      persistedRole = doc.role;
      return {
        _id: USER_ID,
        name: doc.name,
        email: doc.email,
        role: doc.role,
      } as any;
    });

    const regRes = await dispatchJsonRequest("/api/auth/register", {
      body: {
        name: "  Incoming Member  ",
        email: "  New.Member@Sanchaya.dev ",
        password: "Password1!",
        role: "leader",
      },
    });
    assert.equal(regRes.status, 201);
    assert.equal(persistedRole, "incoming");
    assert.equal(regRes.body.data.user.role, "incoming");
    assert.equal(regRes.body.data.user.email, "new.member@sanchaya.dev");

    mock.restoreAll();
    mock.method(User, "create", async () => {
      const dupErr: any = new Error("E11000 duplicate key");
      dupErr.code = 11000;
      throw dupErr;
    });

    const dupRes = await dispatchJsonRequest("/api/auth/register-as-outgoing", {
      body: {
        name: "Dup User",
        email: "dup@sanchaya.dev",
        password: "Password1!",
      },
    });
    assert.equal(dupRes.status, 409);
  });

  it("executes constant-time dummy bcrypt check on missing login user and trims login email", async () => {
    let compared = false;
    mock.method(User, "findOne", (query: any) => {
      assert.equal(query.email, "missing@sanchaya.dev");
      return { select: async () => null } as any;
    });
    mock.method(bcrypt, "compare", async () => {
      compared = true;
      return false;
    });

    const res = await dispatchJsonRequest("/api/auth/login", {
      body: {
        email: "  Missing@Sanchaya.dev ",
        password: "Password1!",
      },
    });

    assert.equal(res.status, 401);
    assert.equal(compared, true);
    assert.equal(res.body.error, "Invalid email or password");
  });

  it("evicts HttpOnly cookie cleanly on POST /api/auth/logout", async () => {
    const res = await dispatchJsonRequest("/api/auth/logout", {
      method: "POST",
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    const setCookie = res.headers["set-cookie"];
    const cookieStr = Array.isArray(setCookie) ? setCookie.join(";") : String(setCookie || "");
    assert.match(cookieStr, /token=;/);
    assert.match(cookieStr, /HttpOnly/i);
  });

  it("syncs live DB role in GET /api/auth/me and rejects tokens issued before passwordChangedAt", async () => {
    const issuedAtSec = Math.floor(Date.now() / 1000) - 60;
    const staleRoleToken = jwt.sign(
      {
        userId: USER_ID,
        email: "member@sanchaya.dev",
        role: "incoming",
        iat: issuedAtSec,
      },
      env.JWT_SECRET,
      { algorithm: "HS256", expiresIn: "1h" },
    );

    // User promoted to outgoing in DB -> /me immediately reflects outgoing
    mock.method(User, "findById", () => ({
      select: async () => ({
        _id: USER_ID,
        email: "member@sanchaya.dev",
        role: "outgoing",
        passwordChangedAt: undefined,
      }),
    }) as any);

    const meRes = await dispatchJsonRequest("/api/auth/me", {
      method: "GET",
      headers: { Authorization: `Bearer ${staleRoleToken}` },
    });
    assert.equal(meRes.status, 200);
    assert.equal(meRes.body.data.role, "outgoing");

    // Password reset invalidated old JWT -> 401
    mock.restoreAll();
    mock.method(User, "findById", () => ({
      select: async () => ({
        _id: USER_ID,
        role: "outgoing",
        passwordChangedAt: new Date(Date.now()),
      }),
    }) as any);

    const invalidatedRes = await dispatchJsonRequest("/api/auth/me", {
      method: "GET",
      headers: { Authorization: `Bearer ${staleRoleToken}` },
    });
    assert.equal(invalidatedRes.status, 401);
  });

  it("enforces anti-enumeration on /forgot-password in production and clears cookie on /reset-password", async () => {
    const userDoc: any = {
      _id: USER_ID,
      email: "user@sanchaya.dev",
      resetPasswordToken: undefined,
      resetPasswordExpires: undefined,
      passwordHash: "old-hash",
      passwordChangedAt: undefined,
      save: async function () {
        return this;
      },
    };
    mock.method(User, "findOne", async () => userDoc);

    const forgotRes = await dispatchJsonRequest("/api/auth/forgot-password", {
      body: { email: "  User@Sanchaya.dev  " },
    });
    assert.equal(forgotRes.status, 200);
    assert.ok(userDoc.resetPasswordToken);
    if (env.NODE_ENV === "production") {
      assert.equal(forgotRes.body.data, undefined);
    }

    mock.restoreAll();
    const rawToken = crypto.randomBytes(32).toString("hex");
    mock.method(User, "findOne", () => ({
      select: async () => userDoc,
    }) as any);

    const resetRes = await dispatchJsonRequest("/api/auth/reset-password", {
      body: { token: rawToken, newPassword: "NewPassword1!" },
    });
    assert.equal(resetRes.status, 200);
    assert.equal(userDoc.resetPasswordToken, undefined);
    assert.ok(userDoc.passwordChangedAt instanceof Date);
    const setCookie = resetRes.headers["set-cookie"];
    const cookieStr = Array.isArray(setCookie) ? setCookie.join(";") : String(setCookie || "");
    assert.match(cookieStr, /token=;/);
  });

  it("rate limits excessive POST /api/auth/login attempts with 429 and Retry-After headers", async () => {
    mock.method(User, "findOne", () => ({
      select: async () => null,
    }) as any);
    mock.method(bcrypt, "compare", async () => false);

    let lastRes: { status: number; headers: http.OutgoingHttpHeaders; body: any } | undefined;
    for (let i = 0; i < 21; i++) {
      lastRes = await dispatchJsonRequest("/api/auth/login", {
        body: { email: "brute@sanchaya.dev", password: "WrongPassword1!" },
      });
    }

    assert.equal(lastRes?.status, 429);
    assert.equal(lastRes?.body.success, false);
    assert.ok(lastRes?.headers["retry-after"]);
    assert.equal(lastRes?.headers["ratelimit-remaining"], "0");
  });
});

