import { client } from "./client.js";

/**
 * Stage 5 Handover Report: fetch approved findings, self-reported answers, and risk maps.
 */
export async function getHandoverReport(projectId) {
  if (!projectId) {
    return { project: null, findings: [], gapAnswers: [], riskMaps: [] };
  }
  const result = await client.get(`/projects/${encodeURIComponent(projectId)}/handover`);
  const data = result.data || {};
  return {
    project: data.project || null,
    findings: Array.isArray(data.findings) ? data.findings : [],
    gapAnswers: Array.isArray(data.gapAnswers) ? data.gapAnswers : [],
    riskMaps: Array.isArray(data.riskMaps) ? data.riskMaps : [],
  };
}

/**
 * Stage 5 PDF Export: streams official citation-linked ReportLab PDF and triggers browser download.
 */
export async function downloadHandoverPdf(projectId, filename, { draft = false } = {}) {
  if (!projectId) {
    throw new Error("Project ID is required to export PDF.");
  }

  const endpoint = `/projects/${encodeURIComponent(projectId)}/handover/export-pdf${draft ? "?draft=true" : ""}`;
  const blob = await client.getBlob(endpoint);
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || `sanchaya-handover-${projectId}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => {
    window.URL.revokeObjectURL(url);
  }, 1000);
  return true;
}

/**
 * Stage 5 Handover Acknowledgment: Incoming member formally acknowledges handover.
 */
export async function acknowledgeHandover(projectId) {
  if (!projectId) {
    throw new Error("Project ID is required.");
  }

  const result = await client.post(
    `/projects/${encodeURIComponent(projectId)}/handover/acknowledge`
  );
  return result.data;
}

/**
 * Stage 5 Handover History: inspect immutable snapshot versions and acknowledgements.
 */
export async function getHandoverHistory(projectId) {
  if (!projectId) return [];
  const result = await client.get(`/projects/${encodeURIComponent(projectId)}/handover/history`);
  return Array.isArray(result.data) ? result.data : [];
}

