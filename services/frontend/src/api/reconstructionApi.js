import { client } from "./client.js";

const VALID_SOURCE_TYPES = new Set(["github", "document", "task"]);

function normalizeRiskMapPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  if (Array.isArray(payload)) {
    return payload;
  }

  return {
    ...payload,
    units: Array.isArray(payload.units) ? payload.units : [],
    hotspot_files: Array.isArray(payload.hotspot_files) ? payload.hotspot_files : [],
    task_groups: Array.isArray(payload.task_groups) ? payload.task_groups : [],
    contributors: Array.isArray(payload.contributors) ? payload.contributors : [],
    departing_member_risk_units: Array.isArray(payload.departing_member_risk_units)
      ? payload.departing_member_risk_units
      : [],
    task_risk:
      payload.task_risk && typeof payload.task_risk === "object"
        ? payload.task_risk
        : null,
    disclaimer:
      typeof payload.disclaimer === "string" && payload.disclaimer.trim()
        ? payload.disclaimer
        : "Concentration risk highlights single-owner knowledge areas and is not a measure of individual performance.",
  };
}

/**
 * Stage 2: Trigger AI extraction and 4-state deterministic verification.
 * options: { sourceIds?: string[], sourceTypes?: ("github" | "document" | "task")[] }
 */
export async function reconstructProject(projectId, options = {}) {
  if (!projectId) {
    throw new Error("Project ID is required.");
  }

  const payload = {};
  if (Array.isArray(options.sourceIds)) {
    const cleanIds = [
      ...new Set(
        options.sourceIds
          .map((id) => (typeof id === "string" ? id.trim() : ""))
          .filter(Boolean)
      ),
    ];
    if (cleanIds.length > 0) {
      payload.sourceIds = cleanIds;
    }
  }
  if (Array.isArray(options.sourceTypes)) {
    const cleanTypes = [
      ...new Set(
        options.sourceTypes
          .map((t) => (typeof t === "string" ? t.trim().toLowerCase() : ""))
          .filter((t) => VALID_SOURCE_TYPES.has(t))
      ),
    ];
    if (cleanTypes.length > 0) {
      payload.sourceTypes = cleanTypes;
    }
  }

  const result = await client.post(
    `/projects/${encodeURIComponent(projectId)}/reconstruct`,
    payload
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
  const raw = result?.data ?? result;
  return normalizeRiskMapPayload(raw);
}
