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
    }));
  } else if (raw.source_id || raw.verbatim_excerpt) {
    evidence = [
      {
        sourceId: raw.source_id || "",
        excerpt: raw.verbatim_excerpt || "",
      },
    ];
  }

  return {
    id,
    _id: id,
    category: raw.category || "General",
    claim: raw.claim || "",
    status,
    rawStatus: raw.verification_status || raw.status,
    evidence,
    evidence_origin: raw.evidence_origin || "system",
    evidence_badge: raw.evidence_badge || (raw.evidence_origin === "self_reported" ? "Self-reported" : ""),
    recheck: Boolean(raw.needs_recheck || raw.recheck),
    recheckReason: raw.recheck_reason || raw.recheckReason || "",
    review,
    edited: Boolean(raw.edited),
    owner: raw.owner || null,
    deadline: raw.deadline || null,
    rationale: raw.rationale || null,
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
 */
export async function getFindings(projectId) {
  if (!projectId) {
    return [];
  }

  const result = await client.get(`/projects/${encodeURIComponent(projectId)}/findings`);
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

  const payload =
    typeof dataOrClaim === "object" && dataOrClaim !== null
      ? dataOrClaim
      : { claim: dataOrClaim, reverify };

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

  return client.post(
    `/projects/${encodeURIComponent(projectId)}/findings/freshness-scan`,
    options
  );
}
