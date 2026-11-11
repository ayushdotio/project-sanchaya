import { client } from "./client.js";

/**
 * Health check for Sanchaya backend gateway.
 * Returns { status: "healthy", service: "sanchaya-backend-gateway", timestamp: string }
 */
export async function getHealth() {
  const result = await client.get("/health");
  return result;
}
