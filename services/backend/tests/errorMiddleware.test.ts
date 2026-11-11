import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { errorHandler, AppError } from "../src/middlewares/errorMiddleware.js";
import { Request, Response } from "express";

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

describe("Error Middleware: Mongoose Error Normalization", () => {
  it("should map Mongoose CastError to 400 Bad Request with descriptive message", () => {
    const castError: AppError = new Error("Cast to ObjectId failed for value 'abc123invalid' at path '_id'") as AppError;
    castError.name = "CastError";
    castError.value = "abc123invalid";
    castError.path = "_id";

    const req = {} as Request;
    const res = mockResponse();
    const next = () => {};

    errorHandler(castError, req, res as Response, next);

    assert.equal(res.statusCode, 400);
    assert.equal(res.jsonBody?.success, false);
    assert.ok(res.jsonBody?.error?.includes("abc123invalid"));
    assert.ok(res.jsonBody?.error?.includes("Invalid identifier format"));
  });

  it("should map MongoDB duplicate key E11000 to 409 Conflict", () => {
    const duplicateKeyError: AppError = new Error("E11000 duplicate key error collection: sanchaya.users index: email_1 dup key: { email: 'ayush@example.com' }") as AppError;
    duplicateKeyError.code = 11000;

    const req = {} as Request;
    const res = mockResponse();
    const next = () => {};

    errorHandler(duplicateKeyError, req, res as Response, next);

    assert.equal(res.statusCode, 409);
    assert.equal(res.jsonBody?.success, false);
    assert.equal(res.jsonBody?.error, "A resource with that unique identifier already exists");
  });

  it("should map Mongoose ValidationError to 400 Bad Request with field errors", () => {
    const validationError: AppError = new Error("Validation failed") as AppError;
    validationError.name = "ValidationError";
    validationError.errors = {
      email: { message: "Email is required" },
      name: { message: "Name must be at least 2 characters" },
    };

    const req = {} as Request;
    const res = mockResponse();
    const next = () => {};

    errorHandler(validationError, req, res as Response, next);

    assert.equal(res.statusCode, 400);
    assert.equal(res.jsonBody?.success, false);
    assert.equal(res.jsonBody?.error, "Database validation failed");
    assert.deepEqual(res.jsonBody?.errors?.email, ["Email is required"]);
    assert.deepEqual(res.jsonBody?.errors?.name, ["Name must be at least 2 characters"]);
  });

  it("should fall back to 500 Internal Server Error for unhandled exceptions", () => {
    const genericError: AppError = new Error("Unexpected database connection crash");

    const req = {} as Request;
    const res = mockResponse();
    const next = () => {};

    errorHandler(genericError, req, res as Response, next);

    assert.equal(res.statusCode, 500);
    assert.equal(res.jsonBody?.success, false);
    assert.equal(res.jsonBody?.error, "Unexpected database connection crash");
  });
});

