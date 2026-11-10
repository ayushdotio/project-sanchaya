import { env } from "./src/config/env.js";
import app from "./src/app.js";
import { connectDB, closeDB } from "./src/config/db.js";

const PORT = env.PORT;

await connectDB();

const server = app.listen(PORT, () => {
  console.log(`[Sanchaya Backend] Service running on port ${PORT}`);
});

let isShuttingDown = false;

const gracefulShutdown = async (signal: string): Promise<void> => {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;

  console.log(`\n[Sanchaya Backend] Received ${signal}. Starting graceful shutdown...`);

  // Force shutdown after 10 seconds if connections fail to close in time
  const forceExitTimeout = setTimeout(() => {
    console.error("[Sanchaya Backend] Forceful shutdown initiated due to timeout (10s).");
    process.exit(1);
  }, 10000);
  forceExitTimeout.unref();

  server.close(async (err) => {
    if (err) {
      console.error("[Sanchaya Backend] Error closing HTTP server:", err);
      process.exit(1);
    }
    console.log("[Sanchaya Backend] HTTP server closed.");

    try {
      await closeDB();
      console.log("[Sanchaya Backend] Graceful shutdown completed.");
      process.exit(0);
    } catch (dbErr) {
      console.error("[Sanchaya Backend] Error during database disconnect:", dbErr);
      process.exit(1);
    }
  });
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
