import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

// Load the single root .env file regardless of which subdirectory npm is invoked from
// (e.g. running `npm run dev` inside services/backend/ while .env lives at repo root).
const loadEnvFile = (): void => {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, ".env");
    if (fs.existsSync(candidate)) {
      dotenv.config({ path: candidate });
      return;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  dotenv.config();
};

loadEnvFile();

const PLACEHOLDER_SECRET_PATTERN = /^(replace|changeme|example|secret|default)/i;

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(5000),
    MONGO_URI: z.string().min(1).default("mongodb://127.0.0.1:27017/sanchaya"),
    DATABASE_NAME: z.string().trim().min(1).default("sanchaya"),
    // JWT_SECRET has no default — it MUST be explicitly set in every environment.
    // A missing or weak secret allows anyone to forge valid tokens.
    JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
    JWT_EXPIRES_IN: z.string().default("3h"),
    BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),
    CORS_ORIGIN: z.string().default("http://localhost:5173"),
    GITHUB_GLOBAL_PAT: z.string().optional(),
    IMAGEKIT_PUBLIC_KEY: z.string().optional(),
    IMAGEKIT_PRIVATE_KEY: z.string().optional(),
    IMAGEKIT_URL_ENDPOINT: z.string().optional(),
    // Support both canonical and legacy environment variable names
    AI_SERVICE_URL: z.string().url().default("http://ai-engine:8001"),
    ANALYTICS_SERVICE_URL: z.string().url().default("http://analytics-service:8002"),
    INTERNAL_API_TOKEN: z.string().optional(),
    VARAD_AI_SERVICE_URL: z.string().url().optional(),
    PRAKHAR_ANALYTICS_SERVICE_URL: z.string().url().optional(),
  })
  .superRefine((data, ctx) => {
    if (PLACEHOLDER_SECRET_PATTERN.test(data.JWT_SECRET.trim())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["JWT_SECRET"],
        message: "JWT_SECRET must not use a placeholder value",
      });
    }

    if (data.NODE_ENV === "production") {
      if (!process.env.MONGO_URI?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["MONGO_URI"],
          message: "MONGO_URI is required when NODE_ENV=production",
        });
      }

      const corsEntries = data.CORS_ORIGIN.split(",").map((o) => o.trim()).filter(Boolean);
      if (corsEntries.length === 0 || corsEntries.includes("*")) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["CORS_ORIGIN"],
          message: "CORS_ORIGIN must explicitly list allowed origins (no '*' wildcard) in production",
        });
      }

      const internalToken = (data.INTERNAL_API_TOKEN || "").trim();
      if (internalToken.length < 32) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["INTERNAL_API_TOKEN"],
          message: "INTERNAL_API_TOKEN (min 32 characters) is required when NODE_ENV=production",
        });
      }
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("[Sanchaya Config] Invalid environment variables:", parsed.error.format());
  throw new Error("Invalid environment configuration");
}

export const env = {
  ...parsed.data,
  // Resolve service URLs with fallback to legacy names if present
  AI_SERVICE_URL: parsed.data.VARAD_AI_SERVICE_URL || parsed.data.AI_SERVICE_URL,
  ANALYTICS_SERVICE_URL: parsed.data.PRAKHAR_ANALYTICS_SERVICE_URL || parsed.data.ANALYTICS_SERVICE_URL,
};
