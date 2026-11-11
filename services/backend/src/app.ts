import express, { Request, Response } from "express";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";

// Configuration import
import { env } from "./config/env.js";

// Middleware imports
import { errorHandler } from "./middlewares/errorMiddleware.js";

// Route imports
import authRoutes from "./routes/auth.js";
import projectRoutes from "./routes/projects.js";
import uploadRoutes from "./routes/uploads.js";
import githubRoutes from "./routes/github.js";
import findingRoutes from "./routes/findings.js";
import gapRoutes from "./routes/gaps.js";
import readinessRoutes from "./routes/readiness.js";
import handoverRoutes from "./routes/handover.js";
import userRoutes from "./routes/users.js";

const app = express();

if (env.NODE_ENV === "production") {
  // Trust reverse proxy headers (X-Forwarded-For / X-Forwarded-Proto) behind ALB/Nginx
  app.set("trust proxy", 1);
}

// Security and utility middlewares
app.use(helmet());

// Configurable CORS whitelist
const allowedOrigins = env.CORS_ORIGIN.split(",").map((o) => o.trim());

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, curl, server-to-server) or in development
      if (
        !origin ||
        env.NODE_ENV === "development" ||
        allowedOrigins.includes(origin) ||
        (env.NODE_ENV !== "production" && allowedOrigins.includes("*"))
      ) {
        callback(null, true);
      } else {
        callback(new Error(`Origin '${origin}' not allowed by CORS policy`));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// Healthcheck endpoint
app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({
    status: "healthy",
    service: "sanchaya-backend-gateway",
    timestamp: new Date().toISOString(),
  });
});

// Mount API routes (supports both /api/* and root /* for client resilience)
app.use(["/api/auth", "/auth"], authRoutes);
app.use(["/api/projects", "/projects"], projectRoutes);
app.use(["/api/projects", "/projects"], uploadRoutes);
app.use(["/api/projects", "/projects"], githubRoutes);
app.use(["/api/projects", "/projects"], findingRoutes);
app.use(["/api/projects", "/projects"], gapRoutes);
app.use(["/api/projects", "/projects"], readinessRoutes);
app.use(["/api/projects", "/projects"], handoverRoutes);
app.use(["/api/users", "/users"], userRoutes);

// Catch 404 for unmapped endpoints
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: "Endpoint not found",
  });
});

// Standardized global 4-argument error handling middleware
app.use(errorHandler);

export default app;
