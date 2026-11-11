import { client } from "./client.js";

/**
 * Stage 2: Trigger AI extraction and 4-state deterministic verification.
 * options: { sourceIds?: string[], sourceTypes?: ("github" | "document" | "task")[] }
 */
export async function reconstructProject(projectId, options = {}) {
  if (!projectId) {
    throw new Error("Project ID is required.");
  }

  const result = await client.post(
    `/projects/${encodeURIComponent(projectId)}/reconstruct`,
    options
  );
  return result;
}

/**
 * Stage 2: Fetch Contribution Concentration Risk Map from Analytics Service.
 */
export async function getProjectRiskMap(projectId) {
  if (!projectId) {
    throw new Error("Project ID is required.");
  }

  const result = await client.get(
    `/projects/${encodeURIComponent(projectId)}/risk-map`
  );
  return result.data ?? result;
}
