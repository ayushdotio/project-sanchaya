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
  Sparkles,
  ArrowRight,
  SlidersHorizontal,
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
import { getProjects, getProjectById } from "../api/projectsApi";
import { reconstructProject } from "../api/reconstructionApi";

const ACCEPTED_TYPES = [".pdf", ".docx", ".txt"];
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const REPO_FORMAT_REGEX =
  /^(https?:\/\/github\.com\/)?[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/?(?:\.git)?$/i;

export default function SourceUpload({ user = null, onNavigate, projectId = "" }) {
  const [projects, setProjects] = useState([]);
  const [overrideProjectId, setOverrideProjectId] = useState("");
  const activeProjectId =
    overrideProjectId || projectId || projects[0]?._id || projects[0]?.id || "";

  const [repoUrl, setRepoUrl] = useState("");
  const [connectedRepoLabel, setConnectedRepoLabel] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [verifiedCommits, setVerifiedCommits] = useState(null);
  const [repoStatus, setRepoStatus] = useState("idle");
  const [repoMessage, setRepoMessage] = useState("");
  const [repoConnected, setRepoConnected] = useState(false);

  const [showSyncOptions, setShowSyncOptions] = useState(false);
  const [syncBranches, setSyncBranches] = useState("");
  const [syncLimit, setSyncLimit] = useState("50");
  const [syncToken, setSyncToken] = useState("");
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
  const [sourcesLoadedKey, setSourcesLoadedKey] = useState("");
  const [sourcesError, setSourcesError] = useState("");
  const [sourcesRefreshTick, setSourcesRefreshTick] = useState(0);
  const [selectedSource, setSelectedSource] = useState(null);
  const [detailStatus, setDetailStatus] = useState("idle");

  const [documents, setDocuments] = useState([]);
  const [docsLoadedKey, setDocsLoadedKey] = useState("");
  const [docsError, setDocsError] = useState("");
  const [docsRefreshTick, setDocsRefreshTick] = useState(0);
  const [selectedDocDetail, setSelectedDocDetail] = useState(null);
  const [docDetailStatus, setDocDetailStatus] = useState("idle");
  const [docDetailError, setDocDetailError] = useState("");

  const [reconstructStatus, setReconstructStatus] = useState("idle");
  const [reconstructMessage, setReconstructMessage] = useState("");
  const [reconstructData, setReconstructData] = useState(null);

  const taskInputRef = useRef(null);
  const fileInputRef = useRef(null);

  const sourcesLoading =
    Boolean(activeProjectId) &&
    sourcesLoadedKey !== `${activeProjectId}:${sourceTypeFilter}:${sourcesRefreshTick}`;
  const docsLoading =
    Boolean(activeProjectId) && docsLoadedKey !== `${activeProjectId}:${docsRefreshTick}`;

  // Load projects for selector / fallback
  useEffect(() => {
    let active = true;
    getProjects()
      .then((list) => {
        if (!active) return;
        setProjects(Array.isArray(list) ? list : []);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // Hydrate existing project GitHub binding when project changes
  useEffect(() => {
    let active = true;
    if (!activeProjectId) return () => { active = false; };

    getProjectById(activeProjectId)
      .then((proj) => {
        if (!active || !proj) return;
        const boundRepo = (proj.githubRepo || "").trim();
        if (boundRepo) {
          setConnectedRepoLabel(boundRepo);
          setRepoUrl((prev) => prev || boundRepo);
          setRepoConnected(true);
        } else {
          setConnectedRepoLabel("");
          setRepoConnected(false);
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [activeProjectId]);

  // Load project sources whenever activeProjectId, filter, or refresh tick changes
  useEffect(() => {
    let active = true;
    if (!activeProjectId) {
      return () => {
        active = false;
      };
    }

    const requestKey = `${activeProjectId}:${sourceTypeFilter}:${sourcesRefreshTick}`;
    getProjectSources(activeProjectId, sourceTypeFilter)
      .then((data) => {
        if (!active) return;
        setSourcesError("");
        setSources(Array.isArray(data) ? data : []);
      })
      .catch((error) => {
        console.error("Sources fetch failed:", error);
        if (active) {
          setSourcesError(error.message || "Unable to load project sources.");
        }
      })
      .finally(() => {
        if (active) setSourcesLoadedKey(requestKey);
      });

    return () => {
      active = false;
    };
  }, [activeProjectId, sourceTypeFilter, sourcesRefreshTick]);

  // Load ImageKit stored documents whenever activeProjectId or refresh tick changes
  useEffect(() => {
    let active = true;
    if (!activeProjectId) {
      return () => {
        active = false;
      };
    }

    const requestKey = `${activeProjectId}:${docsRefreshTick}`;
    getProjectDocuments(activeProjectId)
      .then((docs) => {
        if (!active) return;
        setDocsError("");
        setDocuments(Array.isArray(docs) ? docs : []);
      })
      .catch((err) => {
        console.warn("Could not load ImageKit documents:", err);
        if (active) {
          setDocsError(err.message || "Unable to load stored documents from ImageKit.");
        }
      })
      .finally(() => {
        if (active) setDocsLoadedKey(requestKey);
      });

    return () => {
      active = false;
    };
  }, [activeProjectId, docsRefreshTick]);

  function handleSelectProject(nextId) {
    setOverrideProjectId(nextId);
    setRepoUrl("");
    setConnectedRepoLabel("");
    setRepoConnected(false);
    setRepoStatus("idle");
    setRepoMessage("");
    setVerifiedCommits(null);
    setSyncStatus("idle");
    setSyncMessage("");
    setFileStatus("idle");
    setFileMessage("");
    setTaskStatus("idle");
    setTaskMessage("");
    setSelectedSource(null);
    setSelectedDocDetail(null);
    setDocDetailStatus("idle");
    setDocDetailError("");
    setReconstructStatus("idle");
    setReconstructMessage("");
    setReconstructData(null);
  }

  // Connect GitHub repository using backend API
  async function handleConnectRepository(e) {
    e.preventDefault();
    setRepoMessage("");
    setVerifiedCommits(null);

    if (!activeProjectId) {
      setRepoStatus("error");
      setRepoMessage("No project selected. Create or select a project first.");
      return;
    }

    if (!REPO_FORMAT_REGEX.test(repoUrl.trim())) {
      setRepoStatus("error");
      setRepoMessage(
        "Enter a valid GitHub repository URL or slug (e.g. https://github.com/owner/repo or owner/repo)."
      );
      return;
    }

    setRepoStatus("loading");

    try {
      const result = await connectGithub(activeProjectId, {
        repo: repoUrl.trim(),
        accessToken: accessToken.trim(),
      });

      const savedRepo = result.data?.githubRepo || repoUrl.trim();
      setRepoStatus("success");
      setRepoConnected(true);
      setConnectedRepoLabel(savedRepo);
      setRepoUrl(savedRepo);
      setVerifiedCommits(result.data?.verifiedCommitsCount ?? 0);
      setRepoMessage(result.message || "GitHub repository connected successfully.");
      setAccessToken("");
      setSourcesRefreshTick((t) => t + 1);
    } catch (error) {
      console.error("GitHub connection failed:", error);
      setRepoStatus("error");
      setRepoMessage(error.message || "Unable to connect GitHub repository.");
    }
  }

  // Sync commits, pull requests, and issues from the connected repository
  async function handleSyncRepository() {
    setSyncMessage("");

    if (!activeProjectId) {
      setSyncStatus("error");
      setSyncMessage("No project selected. Create or select a project first.");
      return;
    }

    const effectiveRepo = connectedRepoLabel || repoUrl.trim();
    if (!repoConnected && !effectiveRepo) {
      setSyncStatus("error");
      setSyncMessage("Connect a GitHub repository before syncing.");
      return;
    }

    const parsedBranches = syncBranches
      .split(",")
      .map((b) => b.trim())
      .filter(Boolean);
    const parsedLimit = syncLimit ? Number(syncLimit) : undefined;
    if (
      parsedLimit !== undefined &&
      (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 100)
    ) {
      setSyncStatus("error");
      setSyncMessage("Sync limit must be an integer between 1 and 100.");
      return;
    }

    setSyncStatus("loading");

    try {
      const result = await syncGithub(activeProjectId, {
        ...(effectiveRepo && !repoConnected ? { githubRepo: effectiveRepo } : {}),
        ...(syncToken.trim() ? { token: syncToken.trim() } : {}),
        ...(parsedBranches.length > 0 ? { branches: parsedBranches } : {}),
        ...(parsedLimit ? { limit: parsedLimit } : {}),
      });
      const insertedCount = result.data?.insertedCount ?? 0;
      const totalRedactions = result.data?.totalRedactions ?? 0;
      const syncedRepo = result.data?.repo || effectiveRepo;

      setSyncStatus("success");
      setSyncToken("");
      setSyncMessage(
        `${result.message || "GitHub sync completed."} Repository: ${syncedRepo}. Processed records: ${insertedCount}. Redactions: ${totalRedactions}.`
      );
      setSourcesRefreshTick((t) => t + 1);
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

    setFileStatus(errors.length > 0 ? "error" : "idle");
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
    if (!activeProjectId) {
      setFileStatus("error");
      setFileMessage("No project selected. Create or select a project first.");
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
          const result = await uploadMeetingNotes(activeProjectId, item.file);
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
      setSourcesRefreshTick((t) => t + 1);
      setDocsRefreshTick((t) => t + 1);
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
    if (!activeProjectId) {
      setTaskStatus("error");
      setTaskMessage("No project selected. Create or select a project first.");
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
      const result = await uploadTaskTracker(activeProjectId, taskFile);
      const taskCount = result.data?.taskCount ?? 0;
      const sourceId = result.data?.source_id || "Source ID unavailable";
      const redactions = result.data?.redactionCount ?? 0;
      setTaskStatus("success");
      setTaskMessage(
        `${result.message || "Task tracker uploaded successfully."} Source ID: ${sourceId}. Tasks: ${taskCount}. Redactions: ${redactions}.`
      );
      setTaskFile(null);
      setSourcesRefreshTick((t) => t + 1);
    } catch (error) {
      setTaskStatus("error");
      setTaskMessage(error.message || "Unable to upload task tracker.");
    }
  }

  // Fetch single ImageKit document details by fileId
  async function handleInspectDocument(fileId) {
    if (!activeProjectId || !fileId) return;
    setDocDetailStatus("loading");
    setDocDetailError("");
    setSelectedDocDetail(null);
    try {
      const data = await getProjectDocumentById(activeProjectId, fileId);
      setSelectedDocDetail(data);
      setDocDetailStatus("success");
    } catch (err) {
      console.warn("Could not fetch document details:", err);
      setDocDetailStatus("error");
      setDocDetailError(err.message || "Unable to load document details.");
    }
  }

  // Inspect source details (full redacted content)
  async function handleOpenSource(sourceId) {
    if (!activeProjectId || !sourceId) return;
    setDetailStatus("loading");
    setSelectedSource(null);

    try {
      const data = await getSourceRecordById(activeProjectId, sourceId);
      setSelectedSource(data);
      setDetailStatus("success");
    } catch (error) {
      setDetailStatus("error");
      setSourcesError(error.message || "Unable to load source details.");
    }
  }

  // Trigger Stage 2 Knowledge Reconstruction directly after ingesting sources (Leader only)
  async function handleTriggerStage2() {
    if (!activeProjectId) return;
    setReconstructStatus("loading");
    setReconstructMessage("");
    setReconstructData(null);
    try {
      const result = await reconstructProject(activeProjectId);
      setReconstructStatus("success");
      setReconstructData(result?.data || null);
      setReconstructMessage(
        result?.message || "Stage 2 knowledge reconstruction completed successfully."
      );
    } catch (error) {
      setReconstructStatus("error");
      setReconstructMessage(
        error.message || "Unable to trigger Stage 2 knowledge reconstruction."
      );
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
          onClick={() => onNavigate?.("dashboard", activeProjectId)}
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

          <div className="flex flex-wrap items-center gap-3">
            {projects.length > 0 && (
              <select
                aria-label="Select project for Stage 1 ingestion"
                value={activeProjectId}
                onChange={(e) => handleSelectProject(e.target.value)}
                className="rounded-xl border border-[#D8E7DF] bg-white px-3.5 py-2 text-xs font-semibold text-[#29483B] outline-none focus:border-[#159B59]"
              >
                {projects.map((p) => (
                  <option key={p._id || p.id} value={p._id || p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}

            <div className="flex items-center gap-2 rounded-full border border-[#CDEBD8] bg-[#F0FBF4] px-4 py-2 text-xs font-semibold text-[#087A3D]">
              <ShieldCheck size={15} />
              Pre-AI Secret & PII Scanner Active
            </div>
          </div>
        </div>

        {!activeProjectId && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-[#F2DFBE] bg-[#FFF8EC] p-3.5 text-sm text-[#9A681D]">
            <AlertCircle size={18} className="shrink-0" />
            <span>
              No project workspace found yet. Create a project on the Team Leader Dashboard before ingesting sources.
            </span>
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* GitHub Repository */}
        <section className="rounded-2xl border border-[#DDEBE3] bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-3">
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

            {repoConnected && connectedRepoLabel && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#E8F8EF] px-2.5 py-1 text-[11px] font-semibold text-[#087A3D]">
                <CheckCircle2 size={12} />
                Bound
              </span>
            )}
          </div>

          <form onSubmit={handleConnectRepository} className="mt-7">
            <label className="mb-2 block text-sm font-semibold text-[#001E2B]">
              Repository URL or Slug
            </label>

            <div className="flex items-center gap-2 rounded-xl border border-[#DDEBE3] px-3 focus-within:border-[#159B59] focus-within:ring-2 focus-within:ring-[#159B59]/10">
              <Link2 size={17} className="shrink-0 text-[#7A8C84]" />
              <input
                type="text"
                value={repoUrl}
                onChange={(e) => {
                  setRepoUrl(e.target.value);
                  setRepoStatus("idle");
                  setRepoMessage("");
                }}
                placeholder="https://github.com/owner/repository or owner/repository"
                className="w-full bg-transparent py-3 text-sm text-[#001E2B] outline-none placeholder:text-[#9AA9A2]"
              />
            </div>

            <p className="mt-2 text-xs text-[#7A8C84]">
              Accepts full URL or <code className="font-mono">owner/repo</code> slug
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
              className="w-full rounded-xl border border-[#DDEBE3] px-3 py-3 text-sm outline-none focus:border-[#159B59] focus:ring-2 focus-within:ring-[#159B59]/10"
            />
            <p className="mt-2 text-xs leading-5 text-[#7A8C84]">
              Optional. If omitted, the backend uses its configured server token.
            </p>

            <button
              type="submit"
              disabled={!activeProjectId || repoStatus === "loading" || !repoUrl.trim()}
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
                  {repoConnected ? "Update Connected Repository" : "Connect Repository"}
                </>
              )}
            </button>
          </form>

          {/* Optional Sync Options */}
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setShowSyncOptions((prev) => !prev)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#4A5F5B] hover:text-[#001E2B]"
            >
              <SlidersHorizontal size={13} />
              {showSyncOptions ? "Hide Sync Options" : "Advanced Sync Options (branches, limit, token)"}
            </button>

            {showSyncOptions && (
              <div className="mt-3 grid gap-3 rounded-xl border border-[#E4EDE7] bg-[#F8FCF9] p-3.5 text-xs sm:grid-cols-2">
                <div>
                  <label className="mb-1 block font-semibold text-[#29483B]">
                    Branches (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={syncBranches}
                    onChange={(e) => setSyncBranches(e.target.value)}
                    placeholder="e.g. main, develop"
                    className="w-full rounded-lg border border-[#DDEBE3] bg-white px-2.5 py-2 text-xs outline-none focus:border-[#159B59]"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-semibold text-[#29483B]">
                    Items Limit (1–100)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={syncLimit}
                    onChange={(e) => setSyncLimit(e.target.value)}
                    className="w-full rounded-lg border border-[#DDEBE3] bg-white px-2.5 py-2 text-xs outline-none focus:border-[#159B59]"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block font-semibold text-[#29483B]">
                    Sync PAT Override (optional)
                  </label>
                  <input
                    type="password"
                    autoComplete="off"
                    value={syncToken}
                    onChange={(e) => setSyncToken(e.target.value)}
                    placeholder="Optional GitHub PAT for private sync"
                    className="w-full rounded-lg border border-[#DDEBE3] bg-white px-2.5 py-2 text-xs outline-none focus:border-[#159B59]"
                  />
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleSyncRepository}
            disabled={
              !activeProjectId ||
              (!repoConnected && !repoUrl.trim()) ||
              syncStatus === "loading"
            }
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
            disabled={!activeProjectId}
            className="mt-7 flex min-h-44 w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-[#BBD9C7] bg-[#F7FCF8] px-5 py-7 text-center transition hover:border-[#159B59] hover:bg-[#F0FBF4] disabled:opacity-50"
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
            disabled={!activeProjectId || fileStatus === "loading" || files.length === 0}
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
              disabled={!activeProjectId || taskStatus === "loading"}
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
              disabled={!activeProjectId || !taskFile || taskStatus === "loading"}
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
      {activeProjectId && (
        <section className="mt-6 rounded-2xl border border-[#DDEBE3] bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <FolderOpen size={19} className="text-[#159B59]" />
              <div>
                <h2 className="text-lg font-bold text-[#001E2B]">Stored Documents (ImageKit)</h2>
                <p className="text-xs text-[#64756F]">
                  Persisted under /sanchaya/{activeProjectId}/ in cloud storage
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setDocsRefreshTick((t) => t + 1)}
              disabled={docsLoading}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#087A3D] hover:underline disabled:opacity-50"
            >
              <RefreshCw size={12} className={docsLoading ? "animate-spin" : ""} />
              {docsLoading ? "Refreshing..." : "Refresh"}
            </button>
          </div>

          {docsError && (
            <div className="mt-4 flex items-start gap-2 rounded-xl bg-red-50 p-3 text-xs text-red-700">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              <span>{docsError}</span>
            </div>
          )}

          {docsLoading && documents.length === 0 ? (
            <p className="mt-4 text-xs text-[#64756F]">Loading stored documents...</p>
          ) : documents.length === 0 && !docsError ? (
            <p className="mt-4 rounded-xl bg-[#F7FAF8] p-4 text-xs text-[#64756F]">
              No meeting note files stored in ImageKit for this project yet.
            </p>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {documents.map((doc) => (
                <div key={doc.fileId || doc.name} className="flex items-center justify-between rounded-xl border border-[#E4EDE7] p-3 text-xs">
                  <div className="min-w-0 pr-2">
                    <p className="truncate font-semibold text-[#001E2B]">{doc.name}</p>
                    <p className="text-[#64756F]">{doc.size ? formatSize(doc.size) : "Cloud document"}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {doc.fileId && (
                      <button
                        type="button"
                        onClick={() => handleInspectDocument(doc.fileId)}
                        disabled={docDetailStatus === "loading"}
                        className="inline-flex items-center gap-1 font-semibold text-[#00665D] hover:underline disabled:opacity-50"
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
                        <Download size={12} /> Open <ExternalLink size={11} />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {docDetailStatus === "loading" && (
            <p className="mt-4 text-xs text-[#64756F]">Loading document metadata...</p>
          )}
          {docDetailStatus === "error" && docDetailError && (
            <div className="mt-4 rounded-xl bg-red-50 p-3 text-xs text-red-700">
              {docDetailError}
            </div>
          )}

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
              onClick={() => setSourcesRefreshTick((t) => t + 1)}
              disabled={!activeProjectId || sourcesLoading}
              className="flex items-center gap-1.5 rounded-xl bg-[#001E2B] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              <RefreshCw size={13} className={sourcesLoading ? "animate-spin" : ""} />
              {sourcesLoading ? "Loading..." : "Refresh Sources"}
            </button>
          </div>
        </div>

        {sourcesError && (
          <div className={`mt-4 rounded-xl p-3 text-sm ${statusStyle("error")}`}>
            {sourcesError}
          </div>
        )}

        {activeProjectId && !sourcesLoading && !sourcesError && (
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
                      <span className="rounded-full bg-[#EAF8EF] px-2 py-0.5 text-[11px] font-semibold uppercase text-[#087A3D]">
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
            <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-[#E1ECE6] bg-white p-3 font-mono text-xs leading-5 text-[#33443C]">
              {selectedSource.redacted_content || "No redacted content returned."}
            </pre>
          </div>
        )}
      </section>

      {/* Stage 1 -> Stage 2 Handover Transition */}
      {activeProjectId && (
        <section className="mt-6 rounded-2xl border border-[#CDE9D8] bg-gradient-to-br from-[#EAF8EF] via-[#F4FBF6] to-white p-6 shadow-sm">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#159B59]">
                NEXT · STAGE 2 RECONSTRUCTION
              </p>
              <h2 className="mt-1 text-lg font-bold text-[#001E2B]">
                {user?.role === "leader"
                  ? "Ready to reconstruct project knowledge?"
                  : "Finished adding Stage 1 sources?"}
              </h2>
              <p className="mt-1 text-sm text-[#4A5F5B]">
                {user?.role === "leader"
                  ? "Run Stage 2 AI extraction, 4-state deterministic verification, and gap detection on your ingested sources."
                  : "Return to your workspace to inspect the Contribution Concentration Risk Map and answer gap questions."}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {user?.role === "leader" && (
                <button
                  type="button"
                  onClick={handleTriggerStage2}
                  disabled={reconstructStatus === "loading" || sources.length === 0}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#159B59] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#087A3D] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {reconstructStatus === "loading" ? (
                    <>
                      <LoaderCircle size={17} className="animate-spin" />
                      Reconstructing...
                    </>
                  ) : (
                    <>
                      <Sparkles size={17} />
                      Run Stage 2 Reconstruction
                    </>
                  )}
                </button>
              )}

              <button
                type="button"
                onClick={() => onNavigate?.("dashboard", activeProjectId)}
                className="inline-flex items-center gap-2 rounded-xl border border-[#159B59] bg-white px-5 py-3 text-sm font-semibold text-[#087A3D] transition hover:bg-[#F0FBF4]"
              >
                Go to Dashboard
                <ArrowRight size={16} />
              </button>
            </div>
          </div>

          {reconstructMessage && (
            <div className={`mt-4 rounded-xl p-3 text-sm ${statusStyle(reconstructStatus)}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {reconstructStatus === "success" ? (
                    <CheckCircle2 size={18} className="shrink-0" />
                  ) : (
                    <AlertCircle size={18} className="shrink-0" />
                  )}
                  <span>{reconstructMessage}</span>
                </div>

                {reconstructStatus === "success" && (
                  <button
                    type="button"
                    onClick={() => onNavigate?.("findings", activeProjectId)}
                    className="inline-flex items-center gap-1 rounded-lg bg-[#087A3D] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#065E2E]"
                  >
                    Review Findings <ArrowRight size={13} />
                  </button>
                )}
              </div>

              {reconstructData && (
                <p className="mt-2 text-xs text-[#29483B]">
                  Sources processed: <strong>{reconstructData.sourcesUsed ?? 0}</strong> · Findings extracted:{" "}
                  <strong>{reconstructData.findingsCount ?? 0}</strong> · Supported:{" "}
                  <strong>{reconstructData.supportedCount ?? 0}</strong> · Gap questions:{" "}
                  <strong>{reconstructData.gapsGenerated ?? 0}</strong>
                </p>
              )}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
