import { useEffect, useRef, useState } from "react";
import {
  GitBranch,
  FileText,
  Upload,
  Link2,
  CheckCircle2,
  AlertCircle,
  X,
  LoaderCircle,
  FolderOpen,
  ShieldCheck,
  ExternalLink,
  RefreshCw,
  Eye,
  FileSpreadsheet,
  Download,
} from "lucide-react";

import {
  connectGithub,
  syncGithub,
  uploadMeetingNotes,
  uploadTaskTracker,
  getProjectSources,
  getSourceRecordById,
  getProjectDocuments,
  getProjectDocumentById,
} from "../api/sourcesApi";

const ACCEPTED_TYPES = [".pdf", ".docx", ".txt"];
const MAX_FILE_SIZE = 10 * 1024 * 1024;

export default function SourceUpload({ onNavigate, projectId }) {
  const [repoUrl, setRepoUrl] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [verifiedCommits, setVerifiedCommits] = useState(null);
  const [repoStatus, setRepoStatus] = useState("idle");
  const [repoMessage, setRepoMessage] = useState("");
  const [repoConnected, setRepoConnected] = useState(false);
  const [syncStatus, setSyncStatus] = useState("idle");
  const [syncMessage, setSyncMessage] = useState("");

  const [files, setFiles] = useState([]);
  const [fileStatus, setFileStatus] = useState("idle");
  const [fileMessage, setFileMessage] = useState("");

  const [taskFile, setTaskFile] = useState(null);
  const [taskStatus, setTaskStatus] = useState("idle");
  const [taskMessage, setTaskMessage] = useState("");

  const [sources, setSources] = useState([]);
  const [sourceTypeFilter, setSourceTypeFilter] = useState("all");
  const [sourcesStatus, setSourcesStatus] = useState("idle");
  const [sourcesMessage, setSourcesMessage] = useState("");
  const [selectedSource, setSelectedSource] = useState(null);
  const [detailStatus, setDetailStatus] = useState("idle");

  const [documents, setDocuments] = useState([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [selectedDocDetail, setSelectedDocDetail] = useState(null);
  const [docDetailStatus, setDocDetailStatus] = useState("idle");

  const taskInputRef = useRef(null);
  const fileInputRef = useRef(null);

  // Load project sources on mount and when filter changes
  useEffect(() => {
    if (projectId) {
      loadSources();
      loadDocuments();
    }
  }, [projectId, sourceTypeFilter]);

  // Connect GitHub repository using backend API
  async function handleConnectRepository(e) {
    e.preventDefault();
    setRepoMessage("");
    setVerifiedCommits(null);

    if (!projectId) {
      setRepoStatus("error");
      setRepoMessage("No project selected. Return to My Projects and open a project first.");
      return;
    }

    const validGithubUrl =
      /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/?(?:\.git)?$/i.test(
        repoUrl.trim()
      );

    if (!validGithubUrl) {
      setRepoStatus("error");
      setRepoMessage("Enter a valid GitHub repository URL (e.g. https://github.com/owner/repo).");
      return;
    }

    setRepoStatus("loading");

    try {
      const result = await connectGithub(projectId, {
        repo: repoUrl.trim(),
        accessToken: accessToken.trim(),
      });

      setRepoStatus("success");
      setRepoConnected(true);
      setVerifiedCommits(result.data?.verifiedCommitsCount ?? 0);
      setRepoMessage(result.message || "GitHub repository connected successfully.");
      setAccessToken("");
      loadSources();
    } catch (error) {
      console.error("GitHub connection failed:", error);
      setRepoStatus("error");
      setRepoMessage(error.message || "Unable to connect GitHub repository.");
    }
  }

  // Sync commits, pull requests, and issues from the connected repository
  async function handleSyncRepository() {
    setSyncMessage("");

    if (!projectId) {
      setSyncStatus("error");
      setSyncMessage("No project selected. Return to My Projects and open a project first.");
      return;
    }

    if (!repoConnected) {
      setSyncStatus("error");
      setSyncMessage("Connect the GitHub repository before syncing.");
      return;
    }

    setSyncStatus("loading");

    try {
      const result = await syncGithub(projectId);
      const insertedCount = result.data?.insertedCount ?? 0;
      const totalRedactions = result.data?.totalRedactions ?? 0;
      const syncedRepo = result.data?.repo || repoUrl.trim();

      setSyncStatus("success");
      setSyncMessage(
        `${result.message || "GitHub sync completed."} Repository: ${syncedRepo}. Processed records: ${insertedCount}. Redactions: ${totalRedactions}.`
      );
      loadSources();
    } catch (error) {
      console.error("GitHub sync failed:", error);
      setSyncStatus("error");
      setSyncMessage(error.message || "Unable to sync GitHub repository.");
    }
  }

  // Meeting notes file selection
  function handleFileSelection(event) {
    const selectedFiles = Array.from(event.target.files || []);
    const validFiles = [];
    const errors = [];

    selectedFiles.forEach((file) => {
      const extension = "." + file.name.split(".").pop().toLowerCase();

      if (!ACCEPTED_TYPES.includes(extension)) {
        errors.push(`${file.name}: unsupported file type.`);
      } else if (file.size > MAX_FILE_SIZE) {
        errors.push(`${file.name}: file exceeds 10 MB.`);
      } else {
        validFiles.push({
          id: `${file.name}-${file.lastModified}`,
          file,
          name: file.name,
          size: file.size,
        });
      }
    });

    setFiles((previous) => {
      const combined = [...previous, ...validFiles];
      return combined.filter(
        (item, index) => combined.findIndex((other) => other.id === item.id) === index
      );
    });

    setFileStatus("idle");
    setFileMessage(errors.join(" "));
    event.target.value = "";
  }

  function removeFile(id) {
    setFiles((previous) => previous.filter((item) => item.id !== id));
    setFileStatus("idle");
    setFileMessage("");
  }

  // Upload meeting-notes files to backend with Pre-AI redaction & ImageKit storage
  async function handleUploadFiles() {
    if (!projectId) {
      setFileStatus("error");
      setFileMessage("No project selected. Return to My Projects and open a project first.");
      return;
    }

    if (files.length === 0) {
      setFileStatus("error");
      setFileMessage("Select at least one file before uploading.");
      return;
    }

    setFileStatus("loading");
    setFileMessage("");

    const uploadResults = await Promise.all(
      files.map(async (item) => {
        try {
          const result = await uploadMeetingNotes(projectId, item.file);
          return { item, success: true, data: result.data || {} };
        } catch (error) {
          return {
            item,
            success: false,
            error: error.message || "Unable to upload file.",
          };
        }
      })
    );

    const successful = uploadResults.filter((result) => result.success);
    const failed = uploadResults.filter((result) => !result.success);

    if (successful.length > 0) {
      const uploadedIds = new Set(successful.map((result) => result.item.id));
      setFiles((previous) => previous.filter((item) => !uploadedIds.has(item.id)));
      loadSources();
      loadDocuments();
    }

    if (failed.length === 0) {
      setFileStatus("success");
      const redactions = successful.reduce(
        (total, result) => total + (result.data.redactionCount || 0),
        0
      );
      setFileMessage(
        `${successful.length} meeting note file(s) ingested & stored in ImageKit. Redactions: ${redactions}.`
      );
    } else if (successful.length > 0) {
      setFileStatus("error");
      setFileMessage(
        `${successful.length} file(s) uploaded; ${failed.length} failed. ${failed
          .map((result) => `${result.item.name}: ${result.error}`)
          .join(" ")}`
      );
    } else {
      setFileStatus("error");
      setFileMessage(
        failed.map((result) => `${result.item.name}: ${result.error}`).join(" ")
      );
    }
  }

  // Select CSV task tracker file
  function handleTaskFileSelection(event) {
    const selected = event.target.files?.[0] || null;
    event.target.value = "";

    if (!selected) return;
    if (!selected.name.toLowerCase().endsWith(".csv")) {
      setTaskFile(null);
      setTaskStatus("error");
      setTaskMessage("Only CSV task tracker files are supported.");
      return;
    }
    if (selected.size > MAX_FILE_SIZE) {
      setTaskFile(null);
      setTaskStatus("error");
      setTaskMessage("The CSV file exceeds the 10 MB limit.");
      return;
    }

    setTaskFile(selected);
    setTaskStatus("idle");
    setTaskMessage("");
  }

  // Upload CSV task tracker to backend
  async function handleUploadTaskFile() {
    if (!projectId) {
      setTaskStatus("error");
      setTaskMessage("No project selected. Return to My Projects and open a project first.");
      return;
    }
    if (!taskFile) {
      setTaskStatus("error");
      setTaskMessage("Select a CSV task tracker before uploading.");
      return;
    }

    setTaskStatus("loading");
    setTaskMessage("");

    try {
      const result = await uploadTaskTracker(projectId, taskFile);
      const taskCount = result.data?.taskCount ?? 0;
      const sourceId = result.data?.source_id || "Source ID unavailable";
      const redactions = result.data?.redactionCount ?? 0;
      setTaskStatus("success");
      setTaskMessage(
        `${result.message || "Task tracker uploaded successfully."} Source ID: ${sourceId}. Tasks: ${taskCount}. Redactions: ${redactions}.`
      );
      setTaskFile(null);
      loadSources();
    } catch (error) {
      setTaskStatus("error");
      setTaskMessage(error.message || "Unable to upload task tracker.");
    }
  }

  // Load project sources list
  async function loadSources() {
    if (!projectId) return;
    setSourcesStatus("loading");
    setSourcesMessage("");

    try {
      const data = await getProjectSources(projectId, sourceTypeFilter);
      setSources(data);
      setSourcesStatus("success");
    } catch (error) {
      console.error("Sources fetch failed:", error);
      setSourcesStatus("error");
      setSourcesMessage(error.message || "Unable to load project sources.");
    }
  }

  // Load ImageKit stored documents
  async function loadDocuments() {
    if (!projectId) return;
    setDocsLoading(true);
    try {
      const docs = await getProjectDocuments(projectId);
      setDocuments(docs);
    } catch (err) {
      console.warn("Could not load ImageKit documents:", err);
    } finally {
      setDocsLoading(false);
    }
  }

  // Fetch single ImageKit document details by fileId
  async function handleInspectDocument(fileId) {
    if (!projectId || !fileId) return;
    setDocDetailStatus("loading");
    setSelectedDocDetail(null);
    try {
      const data = await getProjectDocumentById(projectId, fileId);
      setSelectedDocDetail(data);
      setDocDetailStatus("success");
    } catch (err) {
      console.warn("Could not fetch document details:", err);
      setDocDetailStatus("error");
    }
  }

  // Inspect source details (full redacted content)
  async function handleOpenSource(sourceId) {
    if (!projectId || !sourceId) return;
    setDetailStatus("loading");
    setSelectedSource(null);

    try {
      const data = await getSourceRecordById(projectId, sourceId);
      setSelectedSource(data);
      setDetailStatus("success");
    } catch (error) {
      setDetailStatus("error");
      setSourcesMessage(error.message || "Unable to load source details.");
    }
  }

  function formatSize(bytes) {
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  const statusStyle = (status) => {
    if (status === "success") return "text-[#087A3D] bg-[#E8F8EF]";
    if (status === "error") return "text-red-700 bg-red-50";
    return "text-[#64756F] bg-[#F2F6F3]";
  };

  return (
    <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
      {/* Page Header */}
      <div className="mb-8">
        <button
          type="button"
          onClick={() => onNavigate?.("dashboard")}
          className="mb-5 text-sm font-semibold text-[#087A3D] hover:underline"
        >
          ← Back to Dashboard
        </button>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-[#159B59]">
              Stage 1 · Connect & Ingest
            </p>
            <h1 className="mt-2 text-3xl font-bold text-[#001E2B]">
              Add project sources
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#64756F]">
              Ingest GitHub activity, meeting notes (PDF/DOCX/TXT), and task trackers (CSV).
              All text is scanned and redacted deterministically before persistence.
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-full border border-[#CDEBD8] bg-[#F0FBF4] px-4 py-2 text-xs font-semibold text-[#087A3D]">
            <ShieldCheck size={15} />
            Pre-AI Secret & PII Scanner Active
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* GitHub Repository */}
        <section className="rounded-2xl border border-[#DDEBE3] bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#F0F3F2] text-[#001E2B]">
              <GitBranch size={25} />
            </div>

            <div>
              <h2 className="text-lg font-bold text-[#001E2B]">
                GitHub Repository
              </h2>
              <p className="text-sm text-[#64756F]">
                Connect source code, commits, PRs, and issues
              </p>
            </div>
          </div>

          <form onSubmit={handleConnectRepository} className="mt-7">
            <label className="mb-2 block text-sm font-semibold text-[#001E2B]">
              Repository URL
            </label>

            <div className="flex items-center gap-2 rounded-xl border border-[#DDEBE3] px-3 focus-within:border-[#159B59] focus-within:ring-2 focus-within:ring-[#159B59]/10">
              <Link2 size={17} className="shrink-0 text-[#7A8C84]" />
              <input
                type="url"
                value={repoUrl}
                onChange={(e) => {
                  setRepoUrl(e.target.value);
                  setRepoStatus("idle");
                  setRepoMessage("");
                }}
                placeholder="https://github.com/owner/repository"
                className="w-full bg-transparent py-3 text-sm text-[#001E2B] outline-none placeholder:text-[#9AA9A2]"
              />
            </div>

            <p className="mt-2 text-xs text-[#7A8C84]">
              Example: https://github.com/team/project
            </p>

            <label className="mb-2 mt-5 block text-sm font-semibold text-[#001E2B]">
              GitHub Personal Access Token (optional)
            </label>
            <input
              type="password"
              autoComplete="off"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              placeholder="Enter token if repository is private"
              className="w-full rounded-xl border border-[#DDEBE3] px-3 py-3 text-sm outline-none focus:border-[#159B59] focus:ring-2 focus:ring-[#159B59]/10"
            />
            <p className="mt-2 text-xs leading-5 text-[#7A8C84]">
              Optional. If omitted, the backend uses its configured server token.
            </p>

            <button
              type="submit"
              disabled={repoStatus === "loading" || !repoUrl.trim()}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#001E2B] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#023D35] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {repoStatus === "loading" ? (
                <>
                  <LoaderCircle size={17} className="animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <GitBranch size={17} />
                  Connect Repository
                </>
              )}
            </button>
          </form>

          <button
            type="button"
            onClick={handleSyncRepository}
            disabled={!repoConnected || syncStatus === "loading"}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-[#159B59] bg-white px-5 py-3 text-sm font-semibold text-[#087A3D] transition hover:bg-[#F0FBF4] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {syncStatus === "loading" ? (
              <>
                <LoaderCircle size={17} className="animate-spin" />
                Syncing repository...
              </>
            ) : (
              <>
                <GitBranch size={17} />
                Sync GitHub Repository (SRC-GH-*)
              </>
            )}
          </button>

          {syncMessage && (
            <div className={`mt-4 flex items-start gap-2 rounded-xl p-3 text-sm ${statusStyle(syncStatus)}`}>
              {syncStatus === "success" ? <CheckCircle2 size={18} className="shrink-0" /> : <AlertCircle size={18} className="shrink-0" />}
              <span>{syncMessage}</span>
            </div>
          )}

          {repoMessage && (
            <div className={`mt-4 flex items-start gap-2 rounded-xl p-3 text-sm ${statusStyle(repoStatus)}`}>
              {repoStatus === "success" ? <CheckCircle2 size={18} className="shrink-0" /> : <AlertCircle size={18} className="shrink-0" />}
              <span>{repoMessage}</span>
            </div>
          )}

          {repoStatus === "success" && verifiedCommits !== null && (
            <p className="mt-3 text-sm font-semibold text-[#087A3D]">
              Verified commits: {verifiedCommits}
            </p>
          )}
        </section>

        {/* Meeting Notes Upload */}
        <section className="rounded-2xl border border-[#DDEBE3] bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#E8F8EF] text-[#087A3D]">
              <FileText size={24} />
            </div>

            <div>
              <h2 className="text-lg font-bold text-[#001E2B]">
                Meeting Notes & Documents
              </h2>
              <p className="text-sm text-[#64756F]">
                Ingest discussions, architecture specs, and notes
              </p>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.txt"
            multiple
            onChange={handleFileSelection}
            className="hidden"
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="mt-7 flex min-h-44 w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-[#BBD9C7] bg-[#F7FCF8] px-5 py-7 text-center transition hover:border-[#159B59] hover:bg-[#F0FBF4]"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#E8F8EF] text-[#087A3D]">
              <Upload size={22} />
            </div>

            <p className="mt-3 text-sm font-bold text-[#001E2B]">
              Click to browse files
            </p>

            <p className="mt-1 text-xs text-[#64756F]">
              PDF, DOCX or TXT · Maximum 10 MB per file
            </p>
          </button>

          {files.length > 0 && (
            <div className="mt-5 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-[#001E2B]">
                  Selected files
                </p>
                <span className="text-xs text-[#64756F]">
                  {files.length} file(s)
                </span>
              </div>

              {files.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 rounded-xl border border-[#E4EDE7] p-3"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#F0FBF4] text-[#087A3D]">
                    <FileText size={18} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[#001E2B]">
                      {item.name}
                    </p>
                    <p className="text-xs text-[#7A8C84]">
                      {formatSize(item.size)}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => removeFile(item.id)}
                    disabled={fileStatus === "loading"}
                    aria-label={`Remove ${item.name}`}
                    className="rounded-lg p-2 text-[#7A8C84] hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                  >
                    <X size={17} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={handleUploadFiles}
            disabled={fileStatus === "loading" || files.length === 0}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#159B59] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#087A3D] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {fileStatus === "loading" ? (
              <>
                <LoaderCircle size={17} className="animate-spin" />
                Ingesting & Redacting...
              </>
            ) : (
              <>
                <Upload size={17} />
                Upload Meeting Notes (SRC-DOC-*)
              </>
            )}
          </button>

          {fileMessage && (
            <div className={`mt-4 flex items-start gap-2 rounded-xl p-3 text-sm ${statusStyle(fileStatus)}`}>
              {fileStatus === "success" ? <CheckCircle2 size={18} className="shrink-0" /> : <AlertCircle size={18} className="shrink-0" />}
              <span>{fileMessage}</span>
            </div>
          )}
        </section>

        {/* Task Tracker CSV Upload */}
        <section className="rounded-2xl border border-[#DDEBE3] bg-white p-6 shadow-sm lg:col-span-2">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#E8F8EF] text-[#087A3D]">
              <FileSpreadsheet size={24} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#001E2B]">CSV Task Tracker</h2>
              <p className="text-sm text-[#64756F]">Upload your project tasks as a CSV file (SRC-TSK-*)</p>
            </div>
          </div>

          <input
            ref={taskInputRef}
            type="file"
            accept=".csv,text/csv,application/csv"
            onChange={handleTaskFileSelection}
            className="hidden"
          />

          <div className="mt-6 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-center">
            <button
              type="button"
              onClick={() => taskInputRef.current?.click()}
              disabled={taskStatus === "loading"}
              className="flex min-h-24 w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-[#BBD9C7] bg-[#F7FCF8] px-5 py-5 text-center transition hover:border-[#159B59] hover:bg-[#F0FBF4] disabled:opacity-50"
            >
              <Upload size={21} className="text-[#087A3D]" />
              <span className="mt-2 text-sm font-bold text-[#001E2B]">
                {taskFile ? taskFile.name : "Click to select CSV file"}
              </span>
              <span className="mt-1 text-xs text-[#64756F]">CSV only · Maximum 10 MB</span>
            </button>

            <button
              type="button"
              onClick={handleUploadTaskFile}
              disabled={!taskFile || taskStatus === "loading"}
              className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#159B59] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#087A3D] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {taskStatus === "loading" ? <LoaderCircle size={17} className="animate-spin" /> : <Upload size={17} />}
              {taskStatus === "loading" ? "Uploading..." : "Upload Task CSV"}
            </button>
          </div>

          {taskMessage && (
            <div className={`mt-4 flex items-start gap-2 rounded-xl p-3 text-sm ${statusStyle(taskStatus)}`}>
              {taskStatus === "success" ? <CheckCircle2 size={18} className="shrink-0" /> : <AlertCircle size={18} className="shrink-0" />}
              <span>{taskMessage}</span>
            </div>
          )}
        </section>
      </div>

      {/* ImageKit Stored Documents */}
      {documents.length > 0 && (
        <section className="mt-6 rounded-2xl border border-[#DDEBE3] bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-[#001E2B]">Stored Documents (ImageKit)</h2>
              <p className="text-xs text-[#64756F]">Persisted under /sanchaya/{projectId}/ in cloud storage</p>
            </div>
            <button
              type="button"
              onClick={loadDocuments}
              className="text-xs font-semibold text-[#087A3D] hover:underline"
            >
              Refresh
            </button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {documents.map((doc) => (
              <div key={doc.fileId || doc.name} className="flex items-center justify-between rounded-xl border border-[#E4EDE7] p-3 text-xs">
                <div className="min-w-0 pr-2">
                  <p className="truncate font-semibold text-[#001E2B]">{doc.name}</p>
                  <p className="text-[#64756F]">{doc.size ? formatSize(doc.size) : "Cloud document"}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {doc.fileId && (
                    <button
                      type="button"
                      onClick={() => handleInspectDocument(doc.fileId)}
                      className="inline-flex items-center gap-1 font-semibold text-[#00665D] hover:underline"
                    >
                      <Eye size={12} /> Info
                    </button>
                  )}
                  {doc.url && (
                    <a
                      href={doc.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 font-semibold text-[#159B59] hover:underline"
                    >
                      Open <ExternalLink size={12} />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>

          {selectedDocDetail && (
            <div className="mt-4 rounded-xl border border-[#CDE9D8] bg-[#F7FCF9] p-4 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-[#001E2B]">
                  Document Metadata: {selectedDocDetail.name}
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedDocDetail(null)}
                  className="text-[#64756F] hover:text-black"
                >
                  <X size={14} />
                </button>
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-2 text-[#4A5F5B]">
                <div>
                  File ID: <span className="font-mono text-[#001E2B]">{selectedDocDetail.fileId}</span>
                </div>
                <div>
                  Folder:{" "}
                  <span className="font-mono text-[#001E2B]">
                    {selectedDocDetail.filePath || selectedDocDetail.folder || "N/A"}
                  </span>
                </div>
                <div>
                  Size:{" "}
                  <span className="font-semibold text-[#001E2B]">
                    {selectedDocDetail.size ? formatSize(selectedDocDetail.size) : "N/A"}
                  </span>
                </div>
                <div>
                  Created:{" "}
                  <span className="text-[#001E2B]">
                    {selectedDocDetail.createdAt
                      ? new Date(selectedDocDetail.createdAt).toLocaleString()
                      : "N/A"}
                  </span>
                </div>
              </dl>
            </div>
          )}
        </section>
      )}

      {/* Project Sources: list and inspect source records */}
      <section className="mt-6 rounded-2xl border border-[#DDEBE3] bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-[#001E2B]">Canonical Project Sources</h2>
            <p className="mt-1 text-sm text-[#64756F]">
              Ingested records with deterministic IDs (SRC-GH-*, SRC-DOC-*, SRC-TSK-*).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-[#DDEBE3] bg-[#F7FAF8] p-1 text-xs font-semibold">
              {["all", "github", "document", "task"].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setSourceTypeFilter(t)}
                  className={`rounded-md px-2.5 py-1 capitalize ${
                    sourceTypeFilter === t
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
              disabled={sourcesStatus === "loading"}
              className="flex items-center gap-1.5 rounded-xl bg-[#001E2B] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              <RefreshCw size={13} className={sourcesStatus === "loading" ? "animate-spin" : ""} />
              {sourcesStatus === "loading" ? "Loading..." : "Refresh Sources"}
            </button>
          </div>
        </div>

        {sourcesMessage && (
          <div className={`mt-4 rounded-xl p-3 text-sm ${statusStyle("error")}`}>
            {sourcesMessage}
          </div>
        )}

        {sourcesStatus === "success" && (
          <div className="mt-4 space-y-2">
            {sources.length === 0 ? (
              <p className="rounded-xl bg-[#F7FAF8] p-4 text-sm text-[#64756F]">
                No sources matching this filter for this project yet.
              </p>
            ) : (
              sources.map((source) => (
                <div
                  key={source.source_id || source._id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E4EDE7] p-4 hover:bg-[#FAFCFA]"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-[#001E2B]">
                        {source.source_id}
                      </span>
                      <span className="rounded-full bg-[#EAF8EF] px-2 py-0.5 text-[11px] font-semibold text-[#087A3D] uppercase">
                        {source.source_type}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-sm font-semibold text-[#001E2B]">
                      {source.raw_filename || source.origin || source.source_id}
                    </p>
                    <p className="mt-0.5 text-xs text-[#64756F]">
                      Imported: {source.imported_at ? new Date(source.imported_at).toLocaleString() : "Date unavailable"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleOpenSource(source.source_id)}
                    disabled={!source.source_id || detailStatus === "loading"}
                    className="inline-flex items-center gap-1 rounded-lg border border-[#159B59] px-3 py-1.5 text-xs font-semibold text-[#087A3D] hover:bg-[#F0FBF4] disabled:opacity-50"
                  >
                    <Eye size={13} />
                    Inspect Redacted Content
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {detailStatus === "loading" && (
          <p className="mt-4 text-sm text-[#64756F]">Loading source record details...</p>
        )}

        {selectedSource && (
          <div className="mt-5 rounded-xl border border-[#CDEBD8] bg-[#F7FCF8] p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-[#001E2B]">Evidence Source Record</h3>
                <p className="mt-1 text-xs text-[#64756F]">
                  {selectedSource.source_id} · {selectedSource.source_type?.toUpperCase()}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSource(null)}
                className="text-xs font-semibold text-[#087A3D] hover:underline"
              >
                Close
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-4 text-xs text-[#4A5F5B]">
              <span><strong>Origin:</strong> {selectedSource.origin || selectedSource.raw_filename}</span>
              <span><strong>Imported:</strong> {new Date(selectedSource.imported_at || selectedSource.created_at).toLocaleString()}</span>
              {selectedSource.metadata?.redactionCount !== undefined && (
                <span><strong>Redactions:</strong> {selectedSource.metadata.redactionCount} secrets/PII masked</span>
              )}
            </div>
            <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-white p-3 font-mono text-xs leading-5 text-[#33443C] border border-[#E1ECE6]">
              {selectedSource.redacted_content || "No redacted content returned."}
            </pre>
          </div>
        )}
      </section>
    </main>
  );
}
