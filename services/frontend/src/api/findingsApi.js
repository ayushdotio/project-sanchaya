import { client } from "./client.js";

/**
 * Normalizes backend verification status to frontend status keys:
 * "Supported" -> "supported"
 * "Needs review" -> "needs_review"
 * "Conflicting" -> "conflicting"
 * "Unknown" -> "unknown"
 */
export function normalizeStatus(status) {
  if (!status) return "unknown";
  const s = String(status).toLowerCase().trim().replace(/[\s-]+/g, "_");
  if (s === "needs_review" || s === "needsreview") return "needs_review";
  if (s === "supported") return "supported";
  if (s === "conflicting") return "conflicting";
  return "unknown";
}

/**
 * Normalizes a raw MongoDB Finding document for frontend presentation.
 */
export function normalizeFinding(raw) {
  if (!raw) return null;
  const id = raw._id || raw.id || "";
  const status = normalizeStatus(raw.verification_status || raw.status);
  const review = raw.review_status || raw.review || "pending";

  let evidence = [];
  if (Array.isArray(raw.evidence) && raw.evidence.length > 0) {
    evidence = raw.evidence.map((e) => ({
      sourceId: e.sourceId || e.source_id || raw.source_id || "",
      excerpt: e.excerpt || e.verbatim_excerpt || "",
      evidence_origin: e.evidence_origin || raw.evidence_origin || "system",
    }));
  } else if (raw.source_id || raw.verbatim_excerpt) {
    evidence = [
      {
        sourceId: raw.source_id || "",
        excerpt: raw.verbatim_excerpt || "",
        evidence_origin: raw.evidence_origin || "system",
      },
    ];
  }

  const recheckRecommended = Boolean(
    raw.freshness?.recheck_recommended ?? raw.needs_recheck ?? raw.recheck
  );
  const recheckReason =
    raw.freshness?.reason || raw.recheck_reason || raw.recheckReason || "";

  return {
    id,
    _id: id,
    category: raw.category || "decision",
    claim: raw.claim || "",
    topic: raw.topic || null,
    status,
    rawStatus: raw.verification_status || raw.status || "Unknown",
    evidence,
    source_id: raw.source_id || "",
    verbatim_excerpt: raw.verbatim_excerpt || "",
    conflicting_source_id: raw.conflicting_source_id || null,
    conflict_details: raw.conflict_details || null,
    explanation: raw.explanation || null,
    freshness: raw.freshness || null,
    sourceUpdatedAt: raw.freshness?.source_updated_at || null,
    evidence_origin: raw.evidence_origin || "system",
    evidence_badge: raw.evidence_badge || (raw.evidence_origin === "self_reported" ? "Self-reported" : ""),
    recheck: recheckRecommended,
    recheckReason,
    review,
    reviewedBy: raw.reviewedBy || null,
    reviewedAt: raw.reviewedAt || null,
    edited: Boolean(raw.edited),
    editedAt: raw.editedAt || null,
    owner: raw.owner ?? null,
    deadline: raw.deadline ?? null,
    rationale: raw.rationale ?? null,
    createdAt: raw.createdAt || raw.created_at,
    updatedAt: raw.updatedAt || raw.updated_at,
  };
}

/**
 * Normalizes a raw SourceRecord document.
 */
export function normalizeSource(raw) {
  if (!raw) return null;
  const id = raw.source_id || raw.id || raw._id || "";
  return {
    id,
    source_id: id,
    type: raw.source_type ? `${raw.source_type.toUpperCase()}` : "Document",
    title: raw.metadata?.title || raw.metadata?.url || id,
    author: raw.metadata?.author || "Unknown",
    createdAt: raw.created_at || raw.createdAt,
    updatedAt: raw.updated_at || raw.updatedAt,
    importedAt: raw.imported_at || raw.importedAt,
    redactedContent: raw.redacted_content,
    metadata: raw.metadata || {},
  };
}

/**
 * Fetch candidate findings for a project.
 * Optional filters: { status, category, review_status, source_id, recheck }
 */
export async function getFindings(projectId, filters = {}) {
  if (!projectId) {
    return [];
  }

  const params = {};
  if (filters && typeof filters === "object") {
    if (filters.status && filters.status !== "all") {
      params.status = filters.status;
    }
    if (filters.category && filters.category !== "all") {
      params.category = filters.category;
    }
    if (filters.review_status && filters.review_status !== "all") {
      params.review_status = filters.review_status;
    }
    if (filters.source_id) {
      params.source_id = String(filters.source_id).trim();
    }
    if (filters.recheck === true || filters.recheck === "true") {
      params.recheck = "true";
    } else if (filters.recheck === false || filters.recheck === "false") {
      params.recheck = "false";
    }
  }

  const result = await client.get(`/projects/${encodeURIComponent(projectId)}/findings`, {
    params: Object.keys(params).length > 0 ? params : undefined,
  });
  const rawList = Array.isArray(result.data) ? result.data : result.findings || [];
  return rawList.map(normalizeFinding);
}

/**
 * Fetch sources ingested for a project.
 * Optional type filter: "github", "document", "task".
 */
export async function getSources(projectId, type = null) {
  if (!projectId) {
    return [];
  }

  const params = type && type !== "all" ? { type } : undefined;
  const result = await client.get(`/projects/${encodeURIComponent(projectId)}/sources`, {
    params,
  });
  const rawList = Array.isArray(result.data) ? result.data : result.sources || [];
  return rawList.map(normalizeSource);
}

/**
 * Fetch a single source record including full redacted_content.
 */
export async function getSourceById(projectId, sourceId) {
  if (!projectId || !sourceId) {
    throw new Error("Project ID and Source ID are required.");
  }

  const result = await client.get(
    `/projects/${encodeURIComponent(projectId)}/sources/${encodeURIComponent(sourceId)}`
  );
  return result.data ? normalizeSource(result.data) : null;
}

/**
 * Approve a finding.
 */
export async function approveFinding(projectId, findingId) {
  if (!projectId || !findingId) {
    throw new Error("Project ID and Finding ID are required to approve a finding.");
  }

  const result = await client.post(
    `/projects/${encodeURIComponent(projectId)}/findings/${encodeURIComponent(findingId)}/approve`
  );
  return normalizeFinding(result.data);
}

/**
 * Reject a finding.
 */
export async function rejectFinding(projectId, findingId) {
  if (!projectId || !findingId) {
    throw new Error("Project ID and Finding ID are required to reject a finding.");
  }

  const result = await client.post(
    `/projects/${encodeURIComponent(projectId)}/findings/${encodeURIComponent(findingId)}/reject`
  );
  return normalizeFinding(result.data);
}

/**
 * Edit finding properties (claim, category, owner, deadline, rationale, review_status, reverify).
 * Supports both editFinding(projectId, findingId, claimString, reverifyBool)
 * and editFinding(projectId, findingId, { claim, category, ... })
 */
export async function editFinding(projectId, findingId, dataOrClaim, reverify = false) {
  if (!projectId || !findingId) {
    throw new Error("Project ID and Finding ID are required to edit a finding.");
  }

  const rawPayload =
    typeof dataOrClaim === "object" && dataOrClaim !== null
      ? dataOrClaim
      : { claim: dataOrClaim, reverify };

  const payload = {};
  if (rawPayload.claim !== undefined) {
    const trimmedClaim = String(rawPayload.claim).trim();
    if (!trimmedClaim) {
      throw new Error("Claim cannot be empty.");
    }
    payload.claim = trimmedClaim;
  }
  if (rawPayload.category !== undefined) payload.category = rawPayload.category;
  if (rawPayload.review_status !== undefined) payload.review_status = rawPayload.review_status;
  if (rawPayload.owner !== undefined) {
    payload.owner = rawPayload.owner === null ? null : String(rawPayload.owner).trim() || null;
  }
  if (rawPayload.deadline !== undefined) {
    payload.deadline =
      rawPayload.deadline === null ? null : String(rawPayload.deadline).trim() || null;
  }
  if (rawPayload.rationale !== undefined) {
    payload.rationale =
      rawPayload.rationale === null ? null : String(rawPayload.rationale).trim() || null;
  }
  if (rawPayload.topic !== undefined) {
    payload.topic = rawPayload.topic === null ? null : String(rawPayload.topic).trim() || null;
  }
  if (rawPayload.reverify !== undefined) {
    payload.reverify = Boolean(rawPayload.reverify);
  }

  if (Object.keys(payload).length === 0) {
    throw new Error("At least one field must be provided to update a finding.");
  }

  const result = await client.patch(
    `/projects/${encodeURIComponent(projectId)}/findings/${encodeURIComponent(findingId)}`,
    payload
  );
  return normalizeFinding(result.data);
}

/**
 * Re-verify a candidate finding against source records via AI Engine.
 */
export async function reverifyFinding(projectId, findingId) {
  if (!projectId || !findingId) {
    throw new Error("Project ID and Finding ID are required to re-verify a finding.");
  }

  const result = await client.post(
    `/projects/${encodeURIComponent(projectId)}/findings/${encodeURIComponent(findingId)}/verify`
  );
  return normalizeFinding(result.data);
}

/**
 * Trigger freshness scan on findings.
 */
export async function scanFreshness(projectId, options = {}) {
  if (!projectId) {
    throw new Error("Project ID is required.");
  }

  const payload = {};
  if (typeof options.maxAgeDays === "number" && options.maxAgeDays >= 1) {
    payload.maxAgeDays = Math.floor(options.maxAgeDays);
  }
  if (typeof options.limit === "number" && options.limit >= 1) {
    payload.limit = Math.floor(options.limit);
  }

  const result = await client.post(
    `/projects/${encodeURIComponent(projectId)}/findings/freshness-scan`,
    payload
  );
  return result?.data ?? result;
}
