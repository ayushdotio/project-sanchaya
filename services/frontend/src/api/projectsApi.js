import { client } from "./client.js";

/**
 * Get all projects where the authenticated user is a member (leader, outgoing, or incoming).
 */
export async function getProjects() {
  const result = await client.get("/projects");
  return result.data || [];
}

/**
 * Create a new project workspace (Team Leader only).
 */
export async function createProject(projectData) {
  const result = await client.post("/projects", {
    name: projectData.name,
    description: projectData.description || "",
    githubRepo: projectData.githubRepo || "",
  });
  return result.data;
}

/**
 * Get populated details of a project by ID.
 */
export async function getProjectById(projectId) {
  if (!projectId) {
    throw new Error("Project ID is required.");
  }
  const result = await client.get(`/projects/${encodeURIComponent(projectId)}`);
  return result.data;
}

/**
 * Assign outgoing or incoming members to a project workspace (Team Leader only).
 */
export async function assignMembers(projectId, memberData) {
  if (!projectId) {
    throw new Error("Project ID is required.");
  }
  const result = await client.post(
    `/projects/${encodeURIComponent(projectId)}/members`,
    memberData
  );
  return result.data;
}
