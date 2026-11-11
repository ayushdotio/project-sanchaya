
import { useRef, useState } from "react";
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
} from "lucide-react";

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
  const [sourcesStatus, setSourcesStatus] = useState("idle");
  const [sourcesMessage, setSourcesMessage] = useState("");
  const [selectedSource, setSelectedSource] = useState(null);
  const [detailStatus, setDetailStatus] = useState("idle");
  const taskInputRef = useRef(null);
  const fileInputRef = useRef(null);

  // Connect GitHub repository using the backend API
  async function connectRepository(e) {
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
      setRepoMessage("Enter a valid GitHub repository URL.");
      return;
    }

    setRepoStatus("loading");

    try {
      const response = await fetch(
        `http://localhost:5000/api/projects/${encodeURIComponent(projectId)}/github/connect`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            repo: repoUrl.trim().replace(/\.git$/i, ""),
            ...(accessToken.trim() ? { accessToken: accessToken.trim() } : {}),
          }),
        }
      );

      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.success !== true) {
        throw new Error(result.error || result.message || `GitHub connection failed (${response.status}).`);
      }

      setRepoStatus("success");
      setRepoConnected(true);
      setVerifiedCommits(result.data?.verifiedCommitsCount ?? 0);
      setRepoMessage(result.message || "GitHub repository connected successfully.");
      setAccessToken("");
    } catch (error) {
      console.error("GitHub connection failed:", error);
      setRepoStatus("error");
      setRepoMessage(error.message || "Unable to connect GitHub repository.");
    }
  }

  // Sync commits, pull requests, and issues from the connected repository
  async function syncRepository() {
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
      const response = await fetch(
        `http://localhost:5000/api/projects/${encodeURIComponent(projectId)}/github/sync`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          // The backend uses the repository saved by GitHub Connect
          // and its configured GITHUB_GLOBAL_PAT when no token is supplied.
          body: JSON.stringify({}),
        }
      );

      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.success !== true) {
        throw new Error(result.error || result.message || `GitHub sync failed (${response.status}).`);
      }

      const insertedCount = result.data?.insertedCount ?? 0;
      const totalRedactions = result.data?.totalRedactions ?? 0;
      const syncedRepo = result.data?.repo || repoUrl.trim();

      setSyncStatus("success");
      setSyncMessage(
        `${result.message || "GitHub sync completed."} Repository: ${syncedRepo}. Processed records: ${insertedCount}. Redactions: ${totalRedactions}.`
      );
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
        (item, index) =>
          combined.findIndex((other) => other.id === item.id) === index
      );
    });

    setFileStatus("idle");
    setFileMessage(errors.join(" "));
    event.target.value = "";
  }

  // Remove selected file
  function removeFile(id) {
    setFiles((previous) => previous.filter((item) => item.id !== id));
    setFileStatus("idle");
    setFileMessage("");
  }

  // Upload each meeting-notes file using the backend multipart field "file".
  async function uploadFiles() {
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
          const formData = new FormData();
          formData.append("file", item.file);

          const response = await fetch(
            `http://localhost:5000/api/projects/${encodeURIComponent(projectId)}/uploads/notes`,
            {
              method: "POST",
              credentials: "include",
              body: formData,
            }
          );

          const result = await response.json().catch(() => ({}));
          if (!response.ok || result.success !== true) {
            throw new Error(
              result.error || result.message || `Upload failed (${response.status}).`
            );
          }

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
    }

    if (failed.length === 0) {
      setFileStatus("success");
      const redactions = successful.reduce(
        (total, result) => total + (result.data.redactionCount || 0),
        0
      );
      setFileMessage(
        `${successful.length} meeting note file(s) uploaded successfully. Redactions: ${redactions}.`
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

  // Select one CSV task tracker file
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

  // Upload CSV using the backend multipart field "file"
  async function uploadTaskFile() {
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
      const formData = new FormData();
      formData.append("file", taskFile);
      const response = await fetch(
        `http://localhost:5000/api/projects/${encodeURIComponent(projectId)}/uploads/tasks`,
        { method: "POST", credentials: "include", body: formData }
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.success !== true) {
        throw new Error(result.error || result.message || `Task upload failed (${response.status}).`);
      }

      const taskCount = result.data?.taskCount ?? 0;
      const sourceId = result.data?.source_id || "Source ID unavailable";
      const redactions = result.data?.redactionCount ?? 0;
      setTaskStatus("success");
      setTaskMessage(`${result.message || "Task tracker uploaded successfully."} Source ID: ${sourceId}. Tasks: ${taskCount}. Redactions: ${redactions}.`);
      setTaskFile(null);
    } catch (error) {
      setTaskStatus("error");
      setTaskMessage(error.message || "Unable to upload task tracker.");
    }
  }

  // Fetch the project source list from the backend.
  async function loadSources() {
    if (!projectId) {
      setSourcesStatus("error");
      setSourcesMessage("No project selected. Return to My Projects and open a project first.");
      return;
    }
    setSourcesStatus("loading");
    setSourcesMessage("");
    try {
      const response = await fetch(
        `http://localhost:5000/api/projects/${encodeURIComponent(projectId)}/sources`,
        { method: "GET", credentials: "include" }
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.success !== true) {
        throw new Error(result.error || result.message || `Could not load sources (${response.status}).`);
      }
      setSources(Array.isArray(result.data) ? result.data : []);
      setSourcesStatus("success");
      setSourcesMessage("");
    } catch (error) {
      setSourcesStatus("error");
      setSourcesMessage(error.message || "Unable to load project sources.");
    }
  }

  // Fetch one source's redacted content using its canonical source_id.
  async function openSource(sourceId) {
    setDetailStatus("loading");
    setSelectedSource(null);
    try {
      const response = await fetch(
        `http://localhost:5000/api/projects/${encodeURIComponent(projectId)}/sources/${encodeURIComponent(sourceId)}`,
        { method: "GET", credentials: "include" }
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.success !== true) {
        throw new Error(result.error || result.message || `Could not load source details (${response.status}).`);
      }
      setSelectedSource(result.data);
      setDetailStatus("success");
    } catch (error) {
      setDetailStatus("error");
      setSourcesMessage(error.message || "Unable to load source details.");
    }
  }

  // Format file size
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
              Knowledge sources
            </p>

            <h1 className="mt-2 text-3xl font-bold text-[#001E2B]">
              Add project sources
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#64756F]">
              Connect your project repository and add meeting notes to prepare
              the knowledge handover.
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-full border border-[#CDEBD8] bg-[#F0FBF4] px-4 py-2 text-xs font-semibold text-[#087A3D]">
            <ShieldCheck size={15} />
            Backend upload mode
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
                Connect your project's source code
              </p>
            </div>
          </div>

          <form onSubmit={connectRepository} className="mt-7">
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
              placeholder="Enter token if repository requires authentication"
              className="w-full rounded-xl border border-[#DDEBE3] px-3 py-3 text-sm outline-none focus:border-[#159B59] focus:ring-2 focus:ring-[#159B59]/10"
            />
            <p className="mt-2 text-xs leading-5 text-[#7A8C84]">
              Optional. If left blank, the backend uses its configured GitHub token. Your entered token is sent only with this request and is not saved in the browser.
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
            onClick={syncRepository}
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
                Sync GitHub Repository
              </>
            )}
          </button>

          {syncMessage && (
            <div
              className={`mt-4 flex items-start gap-2 rounded-xl p-3 text-sm ${statusStyle(syncStatus)}`}
            >
              {syncStatus === "success" ? (
                <CheckCircle2 size={18} className="shrink-0" />
              ) : (
                <AlertCircle size={18} className="shrink-0" />
              )}
              <span>{syncMessage}</span>
            </div>
          )}

          {repoMessage && (
            <div
              className={`mt-4 flex items-start gap-2 rounded-xl p-3 text-sm ${statusStyle(repoStatus)}`}
            >
              {repoStatus === "success" ? (
                <CheckCircle2 size={18} className="shrink-0" />
              ) : (
                <AlertCircle size={18} className="shrink-0" />
              )}

              {repoMessage}
            </div>
          )}

          {repoStatus === "success" && verifiedCommits !== null && (
            <p className="mt-3 text-sm font-semibold text-[#087A3D]">
              Verified commits: {verifiedCommits}
            </p>
          )}

          <div className="mt-7 rounded-xl bg-[#F7FAF8] p-4">
            <p className="text-sm font-semibold text-[#001E2B]">
              What happens next?
            </p>

            <p className="mt-1 text-xs leading-5 text-[#64756F]">
              After backend integration, the repository will be processed to
              identify project files, code structure, and technical context.
            </p>
          </div>
        </section>

        {/* Meeting Notes Upload */}
        <section className="rounded-2xl border border-[#DDEBE3] bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#E8F8EF] text-[#087A3D]">
              <FileText size={24} />
            </div>

            <div>
              <h2 className="text-lg font-bold text-[#001E2B]">
                Meeting Notes
              </h2>

              <p className="text-sm text-[#64756F]">
                Add project discussions and documentation
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
            onClick={uploadFiles}
            disabled={fileStatus === "loading" || files.length === 0}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#159B59] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#087A3D] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {fileStatus === "loading" ? (
              <>
                <LoaderCircle size={17} className="animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload size={17} />
                Upload Meeting Notes
              </>
            )}
          </button>

          {fileMessage && (
            <div
              className={`mt-4 flex items-start gap-2 rounded-xl p-3 text-sm ${statusStyle(fileStatus)}`}
            >
              {fileStatus === "success" ? (
                <CheckCircle2 size={18} className="shrink-0" />
              ) : (
                <AlertCircle size={18} className="shrink-0" />
              )}

              {fileMessage}
            </div>
          )}
        </section>

        {/* Task Tracker CSV Upload */}
        <section className="rounded-2xl border border-[#DDEBE3] bg-white p-6 shadow-sm lg:col-span-2">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#E8F8EF] text-[#087A3D]">
              <FileText size={24} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#001E2B]">Task Tracker</h2>
              <p className="text-sm text-[#64756F]">Upload your project tasks as a CSV file</p>
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
              onClick={uploadTaskFile}
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

      {/* Project Sources: list and inspect source records */}
      <section className="mt-6 rounded-2xl border border-[#DDEBE3] bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-[#001E2B]">Project Sources</h2>
            <p className="mt-1 text-sm text-[#64756F]">View imported GitHub records, meeting notes and task trackers.</p>
          </div>
          <button type="button" onClick={loadSources} disabled={sourcesStatus === "loading"} className="rounded-xl bg-[#001E2B] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
            {sourcesStatus === "loading" ? "Loading..." : "Load Project Sources"}
          </button>
        </div>
        {sourcesMessage && <div className={`mt-4 rounded-xl p-3 text-sm ${statusStyle("error")}`}>{sourcesMessage}</div>}
        {sourcesStatus === "success" && (
          <div className="mt-4 space-y-2">
            {sources.length === 0 ? <p className="rounded-xl bg-[#F7FAF8] p-4 text-sm text-[#64756F]">No sources found for this project yet.</p> : sources.map((source) => (
              <div key={source.source_id || source._id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E4EDE7] p-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[#001E2B]">{source.raw_filename || source.origin || source.source_id || "Project source"}</p>
                  <p className="mt-1 text-xs text-[#64756F]">{source.source_type || "source"} · {source.source_id || "ID unavailable"} · {source.imported_at ? new Date(source.imported_at).toLocaleString() : "Date unavailable"}</p>
                </div>
                <button type="button" onClick={() => openSource(source.source_id)} disabled={!source.source_id || detailStatus === "loading"} className="rounded-lg border border-[#159B59] px-3 py-2 text-sm font-semibold text-[#087A3D] disabled:opacity-50">View details</button>
              </div>
            ))}
          </div>
        )}
        {detailStatus === "loading" && <p className="mt-4 text-sm text-[#64756F]">Loading source details...</p>}
        {selectedSource && (
          <div className="mt-5 rounded-xl border border-[#CDEBD8] bg-[#F7FCF8] p-4">
            <div className="flex items-center justify-between gap-3">
              <div><h3 className="font-bold text-[#001E2B]">Source details</h3><p className="mt-1 text-xs text-[#64756F]">{selectedSource.source_id} · {selectedSource.source_type}</p></div>
              <button type="button" onClick={() => setSelectedSource(null)} className="text-sm font-semibold text-[#087A3D]">Close</button>
            </div>
            <p className="mt-3 text-sm font-semibold text-[#001E2B]">{selectedSource.raw_filename || selectedSource.origin || "Source content"}</p>
            <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-white p-3 text-xs leading-5 text-[#33443C]">{selectedSource.redacted_content || "No redacted content returned."}</pre>
          </div>
        )}
      </section>

      {/* Backend Integration Notice */}
      <div className="mt-6 flex items-start gap-3 rounded-2xl border border-[#DDEBE3] bg-[#F7FAF8] p-5">
        <FolderOpen size={21} className="mt-0.5 shrink-0 text-[#159B59]" />

        <div>
          <p className="text-sm font-semibold text-[#001E2B]">
            GitHub connection is connected to the backend
          </p>

          <p className="mt-1 text-xs leading-5 text-[#64756F]">
            GitHub connection, GitHub sync, meeting notes, and task tracker uploads use authenticated backend APIs. Uploaded content is redacted and stored as project sources.
          </p>
        </div>
      </div>
    </main>
  );
}
