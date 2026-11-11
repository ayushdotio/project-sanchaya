import { afterEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { CookieOptions, Request, Response } from "express";
import {
  AUTH_COOKIE_NAME,
  loginController,
  parseExpiresInToMs,
  registerAsLeaderController,
  registerController,
} from "../src/controllers/auth.controller.js";
import { authenticateToken } from "../src/middlewares/authMiddleware.js";
import { User } from "../src/models/User.js";
import { env } from "../src/config/env.js";
import { JWTPayload } from "../src/types/auth.types.js";

interface RecordedCookie {
  name: string;
  value: string;
  options: CookieOptions;
}

const mockResponse = () => {
  const cookies: RecordedCookie[] = [];
  const res: Partial<Response> & {
    statusCode?: number;
    jsonBody?: any;
    cookies: RecordedCookie[];
  } = { cookies };

  res.cookie = ((name: string, value: string, options: CookieOptions = {}) => {
    cookies.push({ name, value, options });
    return res as Response;
  }) as Response["cookie"];

  res.status = (code: number) => {
    res.statusCode = code;
    return res as Response;
  };

  res.json = (body: any) => {
    res.jsonBody = body;
    return res as Response;
  };

  return res;
};

describe("Auth Cookies & JWT Issuance", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("parseExpiresInToMs converts common JWT duration strings accurately", () => {
    assert.equal(parseExpiresInToMs("3h"), 3 * 60 * 60 * 1000);
    assert.equal(parseExpiresInToMs("24h"), 24 * 60 * 60 * 1000);
    assert.equal(parseExpiresInToMs("7d"), 7 * 24 * 60 * 60 * 1000);
    assert.equal(parseExpiresInToMs("30m"), 30 * 60 * 1000);
    assert.equal(parseExpiresInToMs("45s"), 45 * 1000);
    assert.equal(parseExpiresInToMs("invalid"), 3 * 60 * 60 * 1000);
  });

  it("registerController sets an HttpOnly JWT cookie and returns token in response body", async () => {
    const fakeUser = {
      _id: "672f8b9c1a2b3c4d5e6f7a8b",
      name: "Ayush",
      email: "ayush@example.com",
      role: "incoming" as const,
    };

    mock.method(User, "create", async () => fakeUser as any);

    const req = {
      body: {
        name: "Ayush",
        email: "Ayush@Example.com",
        password: "Password1!",
      },
    } as Request;
    const res = mockResponse();

    await registerController(req, res as Response);

    assert.equal(res.statusCode, 201);
    assert.equal(res.jsonBody?.success, true);
    assert.equal(res.cookies.length, 1);

    const cookie = res.cookies[0]!;
    assert.equal(cookie.name, AUTH_COOKIE_NAME);
    assert.equal(cookie.value, res.jsonBody?.data?.token);
    assert.equal(cookie.options.httpOnly, true);
    assert.equal(cookie.options.sameSite, "lax");
    assert.equal(cookie.options.path, "/");
    assert.equal(cookie.options.secure, env.NODE_ENV === "production");
    assert.equal(cookie.options.maxAge, parseExpiresInToMs(env.JWT_EXPIRES_IN));

    const decoded = jwt.verify(cookie.value, env.JWT_SECRET) as JWTPayload;
    assert.equal(decoded.userId, fakeUser._id);
    assert.equal(decoded.email, fakeUser.email);
    assert.equal(decoded.role, fakeUser.role);
  });

  it("registerAsLeaderController creates user with 'leader' role and issues leader JWT cookie", async () => {
    let capturedRole: string | undefined;
    const fakeLeader = {
      _id: "672f8b9c1a2b3c4d5e6f7a8e",
      name: "Leader User",
      email: "leader.reg@example.com",
      role: "leader" as const,
    };

    mock.method(User, "create", async (doc: any) => {
      capturedRole = doc.role;
      return fakeLeader as any;
    });

    const req = {
      body: {
        name: "Leader User",
        email: "Leader.Reg@Example.com",
        password: "Password1!",
      },
    } as Request;
    const res = mockResponse();

    await registerAsLeaderController(req, res as Response);

    assert.equal(capturedRole, "leader");
    assert.equal(res.statusCode, 201);
    assert.equal(res.jsonBody?.success, true);
    assert.equal(res.jsonBody?.data?.user?.role, "leader");
    assert.equal(res.cookies.length, 1);

    const cookie = res.cookies[0]!;
    const decoded = jwt.verify(cookie.value, env.JWT_SECRET) as JWTPayload;
    assert.equal(decoded.userId, fakeLeader._id);
    assert.equal(decoded.email, fakeLeader.email);
    assert.equal(decoded.role, "leader");
  });

  it("loginController sets an HttpOnly JWT cookie and returns token in response body", async () => {
    const fakeUser = {
      _id: "672f8b9c1a2b3c4d5e6f7a8c",
      name: "Lokesh",
      email: "lokesh@example.com",
      role: "leader" as const,
      passwordHash: "hashed-password",
    };

    mock.method(User, "findOne", () => ({
      select: async () => fakeUser,
    }) as any);
    mock.method(bcrypt, "compare", async () => true);

    const req = {
      body: {
        email: "Lokesh@Example.com",
        password: "Password1!",
      },
    } as Request;
    const res = mockResponse();

    await loginController(req, res as Response);

    assert.equal(res.statusCode, 200);
    assert.equal(res.jsonBody?.success, true);
    assert.equal(res.cookies.length, 1);

    const cookie = res.cookies[0]!;
    assert.equal(cookie.name, AUTH_COOKIE_NAME);
    assert.equal(cookie.value, res.jsonBody?.data?.token);
    assert.equal(cookie.options.httpOnly, true);
    assert.equal(cookie.options.sameSite, "lax");
    assert.equal(cookie.options.path, "/");
    assert.equal(cookie.options.secure, env.NODE_ENV === "production");
    assert.equal(cookie.options.maxAge, parseExpiresInToMs(env.JWT_EXPIRES_IN));

    const decoded = jwt.verify(cookie.value, env.JWT_SECRET) as JWTPayload;
    assert.equal(decoded.userId, fakeUser._id);
    assert.equal(decoded.email, fakeUser.email);
    assert.equal(decoded.role, fakeUser.role);
  });

  it("authenticateToken authenticates requests using the JWT cookie", async () => {
    const token = jwt.sign(
      {
        userId: "672f8b9c1a2b3c4d5e6f7a8d",
        email: "cookie@example.com",
        role: "outgoing",
      },
      env.JWT_SECRET,
      { expiresIn: "1h" },
    );

    mock.method(User, "findById", () => ({
      select: async () => ({
        _id: "672f8b9c1a2b3c4d5e6f7a8d",
        passwordChangedAt: undefined,
      }),
    }) as any);

    const req = {
      headers: {
        cookie: `other=123; ${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}`,
      },
    } as Request;
    const res = mockResponse();
    let nextCalled = false;

    await authenticateToken(req, res as Response, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.equal(res.statusCode, undefined);
    assert.equal(req.user?.userId, "672f8b9c1a2b3c4d5e6f7a8d");
    assert.equal(req.user?.role, "outgoing");
  });
});

