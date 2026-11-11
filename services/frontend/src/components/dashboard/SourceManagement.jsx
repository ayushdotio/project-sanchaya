import { useEffect, useState } from "react";
import {
  GitBranch,
  FileText,
  ExternalLink,
  FolderOpen,
  X,
  ShieldCheck,
  Eye,
  Table,
  Upload,
  RefreshCw,
} from "lucide-react";

import { client } from "@/api/client";
import { getSources } from "@/api/findingsApi";

/**
 * Parse CSV preview text into rows of cells.
 */
function parseCSV(content) {
  if (!content) return [];
  const rows = [];
  let row = [];
  let cell = "";
  let insideQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const next = content[i + 1];

    if (char === '"' && insideQuotes && next === '"') {
      cell += '"';
      i++;
    } else if (char === '"') {
      insideQuotes = !insideQuotes;
    } else if (char === "," && !insideQuotes) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !insideQuotes) {
      if (char === "\r" && next === "\n") i++;
      row.push(cell);
      if (row.some((value) => value.trim() !== "")) {
        rows.push(row);
      }
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell);
  if (row.some((value) => value.trim() !== "")) {
    rows.push(row);
  }
  return rows;
}

export default function SourceManagement({ projectId = "", onUploadSources = null }) {
  const [sources, setSources] = useState([]);
  const [filterType, setFilterType] = useState("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedSource, setSelectedSource] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  async function loadSources() {
    if (!projectId) {
      setSources([]);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const data = await getSources(projectId, filterType);
      setSources(data);
    } catch (err) {
      console.error("Failed to load sources:", err);
      setError(err.message || "Could not load project sources.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSources();
  }, [projectId, filterType]);

  async function handleInspectSource(src) {
    if (!projectId || !src?.id) return;
    setDetailsLoading(true);
    try {
      const result = await client.get(
        `/projects/${encodeURIComponent(projectId)}/sources/${encodeURIComponent(src.id)}`
      );
      setSelectedSource(result.data || src);
    } catch {
      // Fallback to basic source metadata if detailed endpoint fails
      setSelectedSource(src);
    } finally {
      setDetailsLoading(false);
    }
  }

  function formatDate(date) {
    if (!date) return "Not available";
    return new Date(date).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  function getBadgeClass(type) {
    const t = (type || "").toLowerCase();
    if (t.includes("git")) return "bg-[#EAF5EF] text-[#0A6C3B] border-[#CCEAD9]";
    if (t.includes("task") || t.includes("csv")) return "bg-[#F3EFFB] text-[#5B32A3] border-[#DFD5F5]";
    return "bg-[#EBF3FB] text-[#1E5D88] border-[#CCE2F4]";
  }

  const isCsv = (selectedSource?.source_type === "task" || selectedSource?.type?.includes("CSV"));
  const csvRows = isCsv ? parseCSV(selectedSource?.redacted_content || "") : [];

  return (
    <>
      <section className="dashboard-enter dashboard-delay-3 dashboard-card mb-8 rounded-2xl border border-[#DCE9E3] bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <FolderOpen size={20} className="text-[#159B59]" />
              <h2 className="text-xl font-bold text-[#001E2B]">
                Project Sources & Evidence Slips
              </h2>
            </div>
            <p className="mt-1 text-sm text-[#71817B]">
              Canonical ingested records scanned deterministically for secrets and PII.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-[#DCE9E3] bg-[#F7FAF8] p-1 text-xs font-semibold">
              {["all", "github", "document", "task"].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setFilterType(t)}
                  className={`rounded-md px-2.5 py-1 capitalize ${
                    filterType === t
                      ? "bg-white text-[#001E2B] shadow-sm"
                      : "text-[#64756F] hover:text-[#001E2B]"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={loadSources}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-lg border border-[#DCE9E3] px-3 py-1.5 text-xs font-semibold text-[#001E2B] hover:bg-[#F5F9F6] disabled:opacity-50"
            >
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
              Refresh
            </button>

            {onUploadSources && (
              <button
                type="button"
                onClick={onUploadSources}
                className="flex items-center gap-1.5 rounded-lg bg-[#001E2B] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#023D35]"
              >
                <Upload size={13} />
                Connect / Upload
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-lg bg-red-50 p-3 text-xs text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="py-12 text-center text-sm text-[#71817B]">
            Loading project sources...
          </div>
        ) : sources.length === 0 ? (
          <div className="mt-5 rounded-xl border border-dashed border-[#DCE9E3] bg-[#FAFCFA] py-10 text-center">
            <FolderOpen size={32} className="mx-auto text-[#A0ACA6]" />
            <p className="mt-2 text-sm font-semibold text-[#001E2B]">
              No sources imported yet.
            </p>
            <p className="mt-1 text-xs text-[#71817B]">
              Connect a GitHub repository, upload meeting notes (PDF/DOCX), or task trackers (CSV).
            </p>
            {onUploadSources && (
              <button
                type="button"
                onClick={onUploadSources}
                className="mt-4 rounded-lg bg-[#159B59] px-4 py-2 text-xs font-semibold text-white hover:bg-[#12834A]"
              >
                Upload First Source
              </button>
            )}
          </div>
        ) : (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-[#E8F0EC] bg-[#FAFCFA] text-xs font-semibold uppercase text-[#71817B]">
                <tr>
                  <th className="px-4 py-3">Canonical ID</th>
                  <th className="px-4 py-3">Source Name / Target</th>
                  <th className="px-4 py-3">Origin Type</th>
                  <th className="px-4 py-3">Imported Date</th>
                  <th className="px-4 py-3">Redactions</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0F4F2]">
                {sources.map((src) => (
                  <tr key={src.id} className="hover:bg-[#F9FCFA]">
                    <td className="px-4 py-3 font-mono text-xs font-bold text-[#001E2B]">
                      {src.id}
                    </td>
                    <td className="px-4 py-3 font-medium text-[#001E2B]">
                      <div className="max-w-xs truncate" title={src.title}>
                        {src.title}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold ${getBadgeClass(
                          src.type
                        )}`}
                      >
                        {src.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-[#71817B]">
                      {formatDate(src.importedAt || src.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {src.metadata?.redactionCount != null && src.metadata.redactionCount > 0 ? (
                        <span className="font-semibold text-amber-700">
                          {src.metadata.redactionCount} masked
                        </span>
                      ) : (
                        <span className="text-[#8E9B95]">Clean</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleInspectSource(src)}
                        className="inline-flex items-center gap-1 rounded border border-[#DCE9E3] bg-white px-2.5 py-1 text-xs font-semibold text-[#001E2B] hover:bg-[#F0F8F4]"
                      >
                        <Eye size={12} />
                        Inspect Slip
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Source Preview & Redacted Content Modal */}
      {selectedSource && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setSelectedSource(null)}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#E8F0EC] p-5">
              <div>
                <h3 className="font-mono text-base font-bold text-[#001E2B]">
                  {selectedSource.source_id || selectedSource.id}
                </h3>
                <p className="mt-0.5 text-xs text-[#71817B]">
                  {selectedSource.title || selectedSource.metadata?.title || "Source Record"}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSelectedSource(null)}
                className="rounded-lg p-1.5 text-[#8E9B95] hover:bg-[#F0F4F2] hover:text-[#001E2B]"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              <div className="mb-4 flex items-center gap-2 rounded-lg bg-[#EAF8EF] p-3 text-xs text-[#0A6C3B]">
                <ShieldCheck size={16} className="shrink-0" />
                <span>
                  Deterministic Pre-AI Secret & PII scanner masked sensitive tokens with{" "}
                  <code>[REDACTED_SECRET]</code> and <code>[REDACTED_PII]</code>.
                </span>
              </div>

              {detailsLoading ? (
                <div className="py-8 text-center text-sm text-[#71817B]">
                  Loading verbatim excerpt...
                </div>
              ) : isCsv && csvRows.length > 0 ? (
                <div className="overflow-x-auto rounded-lg border border-[#E8F0EC]">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#FAFCFA] font-semibold text-[#71817B]">
                      <tr>
                        {csvRows[0].map((cell, idx) => (
                          <th key={idx} className="border-b px-3 py-2">
                            {cell}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {csvRows.slice(1, 15).map((row, rIdx) => (
                        <tr key={rIdx} className="border-b hover:bg-[#FAFCFA]">
                          {row.map((cell, cIdx) => (
                            <td key={cIdx} className="px-3 py-1.5">
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {csvRows.length > 15 && (
                    <p className="p-2 text-center text-xs text-[#8E9B95]">
                      Showing first 15 of {csvRows.length - 1} rows
                    </p>
                  )}
                </div>
              ) : (
                <pre className="max-h-96 overflow-y-auto rounded-lg border border-[#E8F0EC] bg-[#FAFCFA] p-4 text-xs font-mono leading-5 text-[#001E2B] whitespace-pre-wrap">
                  {selectedSource.redacted_content ||
                    selectedSource.redactedContent ||
                    "No redacted content available for this source record."}
                </pre>
              )}
            </div>

            <div className="flex justify-end border-t border-[#E8F0EC] p-4">
              <button
                type="button"
                onClick={() => setSelectedSource(null)}
                className="rounded-lg bg-[#001E2B] px-4 py-2 text-xs font-semibold text-white hover:bg-[#023D35]"
              >
                Close Slip
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
