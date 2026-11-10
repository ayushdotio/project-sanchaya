
import { useEffect, useState } from "react";
import {
  GitBranch,
  FileText,
  ExternalLink,
  Trash2,
  FolderOpen,
  X,
  CalendarDays,
  HardDrive,
  ShieldCheck,
  Eye,
  Table,
} from "lucide-react";

import {
  getSavedSources,
  removeSavedSource,
} from "@/services/sourceStorage";

/**
 * Parse CSV preview text into rows of cells, retaining quoted commas and line
 * breaks and decoding doubled quotes. Rows containing only blank cells are omitted.
 */
function parseCSV(content) {
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

export default function SourceManagement() {
  const [sources, setSources] = useState([]);
  const [selectedSource, setSelectedSource] = useState(null);

  useEffect(() => {
    setSources(getSavedSources());
  }, []);

  function handleRemove(id) {
    const confirmed = window.confirm(
      "Are you sure you want to remove this source from the demo list?"
    );

    if (!confirmed) return;

    setSources(removeSavedSource(id));
    setSelectedSource(null);
  }

  function formatDate(date) {
    return new Date(date).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }

  function formatSize(bytes) {
    if (bytes == null) return "Not available";

    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }

    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function isRepository(source) {
    return source.type === "GitHub Repository";
  }

  function canPreview(source) {
    return ["CSV", "TXT"].includes(source.type);
  }

  const csvRows =
    selectedSource?.type === "CSV"
      ? parseCSV(selectedSource.previewContent || "")
      : [];

  return (
    <>
      <section className="dashboard-enter dashboard-delay-3 dashboard-card mb-8 rounded-2xl border border-[#DCE9E3] bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <FolderOpen size={20} className="text-[#159B59]" />
              <h2 className="text-xl font-bold text-[#001E2B]">
                Source Management
              </h2>
            </div>

            <p className="mt-1 text-sm text-[#71817B]">
              Manage connected repositories and uploaded project documents.
            </p>
          </div>

          <span className="rounded-full bg-[#E8F8EF] px-3 py-1 text-xs font-semibold text-[#087A3D]">
            {sources.length} source{sources.length !== 1 ? "s" : ""}
          </span>
        </div>

        {sources.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-[#CDE9D8] bg-[#F7FAF8] px-5 py-10 text-center">
            <FolderOpen size={32} className="mx-auto text-[#159B59]" />

            <h3 className="mt-3 font-semibold text-[#001E2B]">
              No project sources added yet
            </h3>

            <p className="mt-1 text-sm text-[#71817B]">
              Connect a GitHub repository or upload meeting notes to see them here.
            </p>
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {sources.map((source) => {
              const repository = isRepository(source);

              return (
                <div
                  key={source.id}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-[#E4EDE7] p-4 transition hover:border-[#BBD9C7] hover:bg-[#FAFCFA]"
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#E8F8EF] text-[#087A3D]">
                    {repository ? (
                      <GitBranch size={21} />
                    ) : (
                      <FileText size={21} />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[#001E2B]">
                      {source.name}
                    </p>

                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[#71817B]">
                      <span>{source.category || source.type}</span>

                      {!repository && (
                        <span>{formatSize(source.size)}</span>
                      )}

                      <span>{formatDate(source.createdAt)}</span>
                    </div>

                    <span className="mt-2 inline-flex rounded-full bg-[#E8F8EF] px-2.5 py-1 text-xs font-medium text-[#087A3D]">
                      {source.status}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setSelectedSource(source)}
                      title="View source details"
                      aria-label={`View details of ${source.name}`}
                      className="rounded-lg p-2 text-[#64756F] transition hover:bg-[#E8F8EF] hover:text-[#087A3D]"
                    >
                      <Eye size={17} />
                    </button>

                    {repository && (
                      <button
                        type="button"
                        onClick={() =>
                          window.open(
                            source.url,
                            "_blank",
                            "noopener,noreferrer"
                          )
                        }
                        title="Open GitHub repository"
                        aria-label="Open GitHub repository"
                        className="rounded-lg p-2 text-[#64756F] transition hover:bg-[#E8F8EF] hover:text-[#087A3D]"
                      >
                        <ExternalLink size={17} />
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => handleRemove(source.id)}
                      title="Remove source"
                      aria-label={`Remove ${source.name}`}
                      className="rounded-lg p-2 text-[#64756F] transition hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <p className="mt-4 text-xs text-[#84918B]">
          Demo records are saved in this browser only. Actual server storage is
          pending backend integration.
        </p>
      </section>

      {selectedSource && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#001E2B]/50 p-4 backdrop-blur-sm"
          onClick={() => setSelectedSource(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="source-detail-title"
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[#DCE9E3] bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-[#E5EEE9] p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#E8F8EF] text-[#087A3D]">
                  {isRepository(selectedSource) ? (
                    <GitBranch size={24} />
                  ) : (
                    <FileText size={24} />
                  )}
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#159B59]">
                    Source Details
                  </p>

                  <h2
                    id="source-detail-title"
                    className="mt-1 text-lg font-bold text-[#001E2B]"
                  >
                    {selectedSource.name}
                  </h2>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedSource(null)}
                aria-label="Close details"
                className="rounded-lg p-2 text-[#64756F] transition hover:bg-[#F0F5F2] hover:text-[#001E2B]"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-5 p-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[#84918B]">
                  Source Name
                </p>
                <p className="mt-1 break-all text-sm font-semibold text-[#001E2B]">
                  {selectedSource.name}
                </p>
              </div>

              {isRepository(selectedSource) ? (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#84918B]">
                    Repository URL
                  </p>

                  <a
                    href={selectedSource.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 flex items-center gap-2 break-all text-sm font-medium text-[#087A3D] hover:underline"
                  >
                    {selectedSource.url}
                    <ExternalLink size={14} />
                  </a>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap gap-6">
                    <div>
                      <p className="text-xs text-[#84918B]">File Type</p>
                      <p className="text-sm font-semibold text-[#001E2B]">
                        {selectedSource.type}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-[#84918B]">File Size</p>
                      <p className="text-sm font-semibold text-[#001E2B]">
                        {formatSize(selectedSource.size)}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-[#84918B]">Date Added</p>
                      <p className="text-sm font-semibold text-[#001E2B]">
                        {formatDate(selectedSource.createdAt)}
                      </p>
                    </div>
                  </div>
                </>
              )}

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#84918B]">
                  Source Status
                </p>

                <span className="inline-flex rounded-full bg-[#E8F8EF] px-3 py-1 text-xs font-semibold text-[#087A3D]">
                  <ShieldCheck size={14} className="mr-1" />
                  {selectedSource.status}
                </span>
              </div>

              {/* CSV Preview */}
              {selectedSource.type === "CSV" && (
                <div>
                  <div className="mb-3 flex items-center gap-2">
                    <Table size={18} className="text-[#159B59]" />
                    <h3 className="font-semibold text-[#001E2B]">
                      CSV Preview
                    </h3>
                  </div>

                  {selectedSource.previewContent ? (
                    <div className="max-h-72 overflow-auto rounded-xl border border-[#DCE9E3]">
                      <table className="min-w-full text-left text-xs">
                        <tbody>
                          {csvRows.map((row, rowIndex) => (
                            <tr
                              key={rowIndex}
                              className={
                                rowIndex === 0
                                  ? "bg-[#E8F8EF] font-bold text-[#001E2B]"
                                  : "border-t border-[#E5EEE9] text-[#64756F]"
                              }
                            >
                              {row.map((cell, cellIndex) => (
                                <td
                                  key={cellIndex}
                                  className="whitespace-nowrap px-3 py-2"
                                >
                                  {cell}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="rounded-xl bg-[#F7FAF8] p-4 text-sm text-[#64756F]">
                      No CSV preview is available. Upload this file again to
                      generate its preview.
                    </p>
                  )}
                </div>
              )}

              {/* TXT Preview */}
              {selectedSource.type === "TXT" && (
                <div>
                  <div className="mb-3 flex items-center gap-2">
                    <FileText size={18} className="text-[#159B59]" />
                    <h3 className="font-semibold text-[#001E2B]">
                      Text Preview
                    </h3>
                  </div>

                  {selectedSource.previewContent ? (
                    <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-[#DCE9E3] bg-[#F7FAF8] p-4 text-xs leading-6 text-[#42534B]">
                      {selectedSource.previewContent}
                    </pre>
                  ) : (
                    <p className="rounded-xl bg-[#F7FAF8] p-4 text-sm text-[#64756F]">
                      No text preview is available. Upload this file again to
                      generate its preview.
                    </p>
                  )}
                </div>
              )}

              {selectedSource.previewTruncated && (
                <p className="text-xs text-[#8A6500]">
                  Preview limited to the first 50,000 characters.
                </p>
              )}

              {!canPreview(selectedSource) && !isRepository(selectedSource) && (
                <p className="rounded-xl bg-[#F7FAF8] p-4 text-sm text-[#64756F]">
                  Preview is currently available for CSV and TXT files only.
                </p>
              )}

              <div className="rounded-xl border border-[#DCE9E3] bg-[#F7FAF8] p-4">
                <p className="text-xs leading-5 text-[#64756F]">
                  This is a locally saved demo preview. Actual server-side
                  storage and document processing are pending backend
                  integration.
                </p>
              </div>
            </div>

            <div className="flex justify-end border-t border-[#E5EEE9] p-5">
              <button
                type="button"
                onClick={() => setSelectedSource(null)}
                className="rounded-xl bg-[#001E2B] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#023D35]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
