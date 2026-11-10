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

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(5000),
  MONGO_URI: z.string().min(1).default("mongodb://127.0.0.1:27017/sanchaya"),
  // JWT_SECRET has no default — it MUST be explicitly set in every environment.
  // A missing or weak secret allows anyone to forge valid tokens.
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_EXPIRES_IN: z.string().default("3h"),
  BCRYPT_SALT_ROUNDS: z.coerce.number().default(12),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  GITHUB_GLOBAL_PAT: z.string().optional(),
  // Support both canonical and legacy environment variable names
  AI_SERVICE_URL: z.string().url().default("http://ai-engine:8001"),
  ANALYTICS_SERVICE_URL: z.string().url().default("http://analytics-service:8002"),
  VARAD_AI_SERVICE_URL: z.string().url().optional(),
  PRAKHAR_ANALYTICS_SERVICE_URL: z.string().url().optional(),
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
