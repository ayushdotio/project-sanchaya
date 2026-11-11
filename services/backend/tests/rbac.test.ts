import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { requireRoles } from "../src/middlewares/authMiddleware.js";
import { Request, Response } from "express";
import { UserRole } from "../src/types/auth.types.js";

const mockResponse = () => {
  const res: Partial<Response> & { statusCode?: number; jsonBody?: any } = {};
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

describe("Metric 5: Three-Tier RBAC Enforcement Middleware", () => {
  it("should return 401 Unauthorized if user context is missing", () => {
    const req = { headers: {} } as Request;
    const res = mockResponse();
    let nextCalled = false;
    const next = () => {
      nextCalled = true;
    };

    const guard = requireRoles(["leader"]);
    guard(req, res as Response, next);

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 401);
    assert.equal(res.jsonBody?.success, false);
  });

  it("should block 'incoming' user with 403 Forbidden on leader-only routes", () => {
    const req = {
      user: {
        userId: "user-inc-01",
        email: "incoming@example.com",
        role: "incoming" as UserRole,
      },
    } as Request;
    const res = mockResponse();
    let nextCalled = false;
    const next = () => {
      nextCalled = true;
    };

    const guard = requireRoles(["leader"]);
    guard(req, res as Response, next);

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
    assert.equal(res.jsonBody?.success, false);
    assert.ok(res.jsonBody?.error?.includes("Access denied"));
  });

  it("should block 'incoming' user on source inspection routes restricted to leader/outgoing", () => {
    const req = {
      user: {
        userId: "user-inc-01",
        email: "incoming@example.com",
        role: "incoming" as UserRole,
      },
    } as Request;
    const res = mockResponse();
    let nextCalled = false;
    const next = () => {
      nextCalled = true;
    };

    const guard = requireRoles(["leader", "outgoing"]);
    guard(req, res as Response, next);

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
  });

  it("should block 'outgoing' user on leader-only approval routes", () => {
    const req = {
      user: {
        userId: "user-out-01",
        email: "outgoing@example.com",
        role: "outgoing" as UserRole,
      },
    } as Request;
    const res = mockResponse();
    let nextCalled = false;
    const next = () => {
      nextCalled = true;
    };

    const guard = requireRoles(["leader"]);
    guard(req, res as Response, next);

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
  });

  it("should permit authorized role and call next()", () => {
    const req = {
      user: {
        userId: "user-lead-01",
        email: "leader@example.com",
        role: "leader" as UserRole,
      },
    } as Request;
    const res = mockResponse();
    let nextCalled = false;
    const next = () => {
      nextCalled = true;
    };

    const guard = requireRoles(["leader"]);
    guard(req, res as Response, next);

    assert.equal(nextCalled, true);
    assert.equal(res.statusCode, undefined);
  });
});

