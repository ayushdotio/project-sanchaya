import { client } from "./client.js";

/**
 * Update a user's role (Team Leader only).
 * Allowed roles: "leader", "outgoing", "incoming".
 * Returns { success: true, message, data: { id, name, email, role } }
 */
export async function updateUserRole(userId, role) {
  if (!userId) {
    throw new Error("User ID is required.");
  }
  if (!["leader", "outgoing", "incoming"].includes(role)) {
    throw new Error("Role must be one of: leader, outgoing, incoming.");
  }

  const result = await client.put(`/users/${encodeURIComponent(userId)}/role`, {
    role,
  });
  return result.data || result;
}
