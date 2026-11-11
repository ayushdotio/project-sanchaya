import { client } from "./client.js";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const NOTE_EXTENSIONS = [".pdf", ".docx", ".txt"];

/**
 * Stage 1: Connect a GitHub repository to a project.
 * Verifies read-only access and binds repository to project.
 */
export async function connectGithub(projectId, { repo, accessToken } = {}) {
  if (!projectId) {
    throw new Error("Project ID is required.");
  }
  if (!repo || !repo.trim()) {
    throw new Error("Repository URL or name (owner/repo) is required.");
  }

  const normalizedRepo = repo
    .trim()
    .replace(/\.git$/i, "")
    .replace(/\/+$/, "");

  const payload = {
    repo: normalizedRepo,
    ...(accessToken && accessToken.trim() ? { accessToken: accessToken.trim() } : {}),
  };

  const result = await client.post(
    `/projects/${encodeURIComponent(projectId)}/github/connect`,
    payload
  );
  return result;
}

/**
 * Stage 1: Ingest commits, PRs, and issues from the connected GitHub repo,
 * redacting secrets/PII and upserting canonical SRC-GH-* records.
 */
export async function syncGithub(projectId, options = {}) {
  if (!projectId) {
    throw new Error("Project ID is required.");
  }

  const branches = Array.isArray(options.branches)
    ? options.branches.map((b) => String(b).trim()).filter(Boolean)
    : undefined;
  const parsedLimit =
    options.limit !== undefined && options.limit !== "" && options.limit !== null
      ? Number(options.limit)
      : undefined;

  const payload = {
    ...(options.githubRepo && options.githubRepo.trim()
      ? {
          githubRepo: options.githubRepo
            .trim()
            .replace(/\.git$/i, "")
            .replace(/\/+$/, ""),
        }
      : {}),
    ...(options.token && options.token.trim() ? { token: options.token.trim() } : {}),
    ...(branches && branches.length > 0 ? { branches } : {}),
    ...(Number.isInteger(parsedLimit) && parsedLimit >= 1 && parsedLimit <= 100
      ? { limit: parsedLimit }
      : {}),
  };

  const result = await client.post(
    `/projects/${encodeURIComponent(projectId)}/github/sync`,
    payload
  );
  return result;
}

/**
 * Stage 1: Upload meeting notes file (.pdf, .docx, .txt) with secret/PII redaction
 * and storage under ImageKit /sanchaya/<projectId>.
 */
export async function uploadMeetingNotes(projectId, file) {
  if (!projectId) {
    throw new Error("Project ID is required.");
  }
  if (!file) {
    throw new Error("File is required.");
  }
  const lowerName = (file.name || "").toLowerCase();
  if (!NOTE_EXTENSIONS.some((ext) => lowerName.endsWith(ext))) {
    throw new Error("Only .pdf, .docx, and .txt meeting note files are supported.");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("File exceeds the 10 MB size limit.");
  }

  const formData = new FormData();
  formData.append("file", file);

  const result = await client.post(
    `/projects/${encodeURIComponent(projectId)}/uploads/notes`,
    formData
  );
  return result;
}

/**
 * Stage 1: Upload CSV task tracker with secret/PII redaction and persistence as SRC-TSK-*.
 */
export async function uploadTaskTracker(projectId, file) {
  if (!projectId) {
    throw new Error("Project ID is required.");
  }
  if (!file) {
    throw new Error("File is required.");
  }
  if (!(file.name || "").toLowerCase().endsWith(".csv")) {
    throw new Error("Only .csv task tracker files are supported.");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("CSV file exceeds the 10 MB size limit.");
  }

  const formData = new FormData();
  formData.append("file", file);

  const result = await client.post(
    `/projects/${encodeURIComponent(projectId)}/uploads/tasks`,
    formData
  );
  return result;
}

/**
 * Stage 1: List documents stored in ImageKit under /sanchaya/<projectId>/.
 */
export async function getProjectDocuments(projectId) {
  if (!projectId) return [];
  const result = await client.get(
    `/projects/${encodeURIComponent(projectId)}/uploads/notes`
  );
  return Array.isArray(result.data) ? result.data : [];
}

/**
 * Stage 1: Get single ImageKit document details & delivery URL by fileId.
 */
export async function getProjectDocumentById(projectId, fileId) {
  if (!projectId || !fileId) {
    throw new Error("Project ID and File ID are required.");
  }
  const result = await client.get(
    `/projects/${encodeURIComponent(projectId)}/uploads/notes/${encodeURIComponent(fileId)}`
  );
  return result.data;
}

/**
 * Stage 1: List ingested source records for a project (without large content blobs).
 * Optional type filter: "github", "document", "task".
 */
export async function getProjectSources(projectId, type = null) {
  if (!projectId) return [];
  const params = type && type !== "all" ? { type } : undefined;
  const result = await client.get(
    `/projects/${encodeURIComponent(projectId)}/sources`,
    { params }
  );
  return Array.isArray(result.data) ? result.data : [];
}

/**
 * Stage 1: Get full source record with redacted_content by canonical source_id.
 */
export async function getSourceRecordById(projectId, sourceId) {
  if (!projectId || !sourceId) {
    throw new Error("Project ID and Source ID are required.");
  }
  const result = await client.get(
    `/projects/${encodeURIComponent(projectId)}/sources/${encodeURIComponent(sourceId)}`
  );
  return result.data;
}
