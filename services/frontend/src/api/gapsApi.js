import { client } from "./client.js";

/**
 * Stage 4 Knowledge Gap Radar: list unresolved findings and pending questions.
 */
export async function getUnresolvedGaps(projectId) {
  if (!projectId) return { totalGapsCount: 0, unresolvedFindings: [], pendingQuestions: [] };
  const result = await client.get(`/projects/${encodeURIComponent(projectId)}/gaps`);
  return result.data || { totalGapsCount: 0, unresolvedFindings: [], pendingQuestions: [] };
}

/**
 * Stage 4 Gap-to-Question Loop: fetch questions generated for a project.
 * Optional filters: { status?: "pending"|"answered"|"approved", gap_category?: string }
 */
export async function getGapQuestions(projectId, filters = {}) {
  if (!projectId) return [];

  const params = {};
  if (filters && typeof filters === "object") {
    if (filters.status && filters.status !== "all") {
      params.status = filters.status;
    }
    if (filters.gap_category && filters.gap_category !== "all") {
      params.gap_category = filters.gap_category;
    }
  }

  const result = await client.get(`/projects/${encodeURIComponent(projectId)}/gap-questions`, {
    params: Object.keys(params).length > 0 ? params : undefined,
  });
  return Array.isArray(result.data) ? result.data : [];
}

/**
 * Outgoing member submits a self-reported answer to a gap question.
 */
export async function answerGapQuestion(projectId, questionId, answer) {
  if (!projectId || !questionId) {
    throw new Error("Project ID and Question ID are required.");
  }
  if (!answer || answer.trim().length < 2) {
    throw new Error("Answer must contain at least 2 characters.");
  }

  const result = await client.post(
    `/projects/${encodeURIComponent(projectId)}/gap-questions/${encodeURIComponent(questionId)}/answer`,
    { answer: answer.trim() }
  );
  return result.data;
}

/**
 * Get the 7-Point Handover Readiness Checklist and status.
 */
export async function getReadiness(projectId) {
  if (!projectId) {
    return {
      readinessStatus: "Needs Attention",
      checklist: {
        sourcesVerified: false,
        decisionsBackedByEvidence: false,
        unfinishedTasksAssignedOrUnknown: false,
        blockersIdentified: false,
        conflictsDisclosed: false,
        recipientPermissionsChecked: false,
        leaderApprovalRecorded: false,
      },
    };
  }

  const result = await client.get(`/projects/${encodeURIComponent(projectId)}/readiness`);
  return result.data;
}

/**
 * Trigger deterministic readiness calculation via Analytics Service.
 */
export async function evaluateReadiness(projectId) {
  if (!projectId) throw new Error("Project ID is required.");
  const result = await client.post(`/projects/${encodeURIComponent(projectId)}/readiness/evaluate`);
  return result.data;
}

/**
 * Team Leader signs off on the 7-point readiness checklist.
 * transitions project status to "Approved for Sharing" if all 7 pass.
 */
export async function signOffReadiness(projectId, options = {}) {
  if (!projectId) throw new Error("Project ID is required.");
  let body = {};
  if (
    options &&
    (options.checklistUpdates !== undefined || options.evaluateWithAnalytics !== undefined)
  ) {
    body = {
      ...(options.evaluateWithAnalytics !== undefined
        ? { evaluateWithAnalytics: Boolean(options.evaluateWithAnalytics) }
        : {}),
      ...(options.checklistUpdates && Object.keys(options.checklistUpdates).length > 0
        ? { checklistUpdates: options.checklistUpdates }
        : {}),
    };
  } else if (options && Object.keys(options).length > 0) {
    body = { checklistUpdates: options };
  }

  const result = await client.post(
    `/projects/${encodeURIComponent(projectId)}/readiness/sign-off`,
    body
  );
  return result.data;
}

