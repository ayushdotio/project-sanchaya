
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

import {
  saveRepository,
  saveUploadedFiles,
} from "@/services/sourceStorage";

const ACCEPTED_TYPES = [".pdf", ".docx", ".txt",".csv"];
const MAX_FILE_SIZE = 10 * 1024 * 1024;

export default function SourceUpload() {
  const [repoUrl, setRepoUrl] = useState("");
  const [repoStatus, setRepoStatus] = useState("idle");
  const [repoMessage, setRepoMessage] = useState("");

  const [files, setFiles] = useState([]);
  const [fileStatus, setFileStatus] = useState("idle");
  const [fileMessage, setFileMessage] = useState("");

  const fileInputRef = useRef(null);

  // GitHub repository connection (demo only)
  function connectRepository(e) {
    e.preventDefault();
    setRepoMessage("");

    const validGithubUrl =
      /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/?$/.test(
        repoUrl.trim()
      );

    if (!validGithubUrl) {
      setRepoStatus("error");
      setRepoMessage("Enter a valid GitHub repository URL.");
      return;
    }

    setRepoStatus("loading");

    setTimeout(() => {
      saveRepository(repoUrl.trim());
      setRepoStatus("success");
      setRepoMessage("Repository connected in demo mode.");
    }, 1500);
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

  async function uploadFiles() {
  if (files.length === 0) {
    setFileStatus("error");
    setFileMessage("Select at least one file before uploading.");
    return;
  }

  setFileStatus("loading");
  setFileMessage("");

  try {
    const filesWithPreview = await Promise.all(
      files.map(async (item) => {
        const isPreviewable = [".csv", ".txt"].includes(
          "." + item.name.split(".").pop().toLowerCase()
        );

        if (!isPreviewable) {
          return {
            ...item,
            previewContent: "",
            previewTruncated: false,
          };
        }

        const content = await item.file.text();
        const limit = 50000;

        return {
          ...item,
          previewContent: content.slice(0, limit),
          previewTruncated: content.length > limit,
        };
      })
    );

    saveUploadedFiles(filesWithPreview);

    setFileStatus("success");
    setFileMessage(
      `${files.length} file${files.length > 1 ? "s" : ""} uploaded in demo mode.`
    );
  } catch (error) {
    console.error("File processing failed:", error);
    setFileStatus("error");
    setFileMessage("Unable to process the selected files.");
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
            Demo upload mode
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
              PDF, DOCX, TXT or CSV · Maximum 10 MB per file
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
      </div>

      {/* Backend Integration Notice */}
      <div className="mt-6 flex items-start gap-3 rounded-2xl border border-[#DDEBE3] bg-[#F7FAF8] p-5">
        <FolderOpen size={21} className="mt-0.5 shrink-0 text-[#159B59]" />

        <div>
          <p className="text-sm font-semibold text-[#001E2B]">
            Backend integration pending
          </p>

          <p className="mt-1 text-xs leading-5 text-[#64756F]">
            This screen currently demonstrates the upload experience only.
            Repository details and document metadata are saved in this browser.
            Actual files and repository data are not sent to a server or
            processed yet.
          </p>
        </div>
      </div>
    </main>
  );
}
