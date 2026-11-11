import { useEffect, useMemo, useState } from "react";
import {
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  ShieldCheck,
} from "lucide-react";
import {
  getFindings,
  getSources,
  approveFinding,
  rejectFinding,
  editFinding,
  reverifyFinding,
  scanFreshness,
} from "../api/findingsApi";
import { getProjects } from "../api/projectsApi";
import {
  StatusBadge,
  FreshnessBadge,
  ReviewBadge,
  SelfReportedBadge,
  STATUS,
  REVIEW_LABEL,
} from "../components/Badges";

const FILTERS = ["all", "supported", "needs_review", "conflicting", "unknown"];
const CATEGORY_FILTERS = ["all", "decision", "task", "blocker", "dependency"];

const focusRing =
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#001E2B] focus-visible:ring-offset-2";

function formatDate(iso) {
  if (!iso) return "Not available";

  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function StatusStrip({ findings, selectedId, onSelect }) {
  return (
    <div className="flex gap-1" role="group" aria-label="All findings by status">
      {findings.map((f, i) => (
        <button
          key={f.id}
          type="button"
          onClick={() => onSelect(f.id)}
          title={`${f.claim} (${STATUS[f.status].label}, ${REVIEW_LABEL[f.review]})`}
          aria-label={`Finding ${i + 1}: ${STATUS[f.status].label}. ${REVIEW_LABEL[f.review]}`}
          className={`flex h-8 min-w-[10px] flex-1 items-center justify-center rounded text-xs font-bold text-white transition-transform ${STATUS[f.status].bar} ${focusRing} ${
            f.id === selectedId
              ? "-translate-y-0.5 ring-2 ring-[#001E2B] ring-offset-2"
              : ""
          }`}
        >
          {f.review === "approved" ? "✓" : f.review === "rejected" ? "✕" : ""}
        </button>
      ))}
    </div>
  );
}

function SourceSlip({ item, source }) {
  const isSelfReported =
    item.evidence_origin === "self_reported" ||
    item.sourceId?.startsWith("SRC-GAP") ||
    source?.origin === "self_reported";

  return (
    <figure className="source-slip m-0 rounded-xl border border-[#E1E8E5] bg-[#F8FBFA] p-4">
      <figcaption className="mb-3 flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-[#001E2B]">
            {source ? source.type : isSelfReported ? "Outgoing Member" : "Source not found"}
          </p>

          <p className="text-sm text-[#4A5F5B]">
            {source ? source.title : item.sourceId}
          </p>

          <p className="mt-0.5 text-xs font-medium tabular-nums text-[#4A5F5B]">
            {item.sourceId}
          </p>
        </div>

        {isSelfReported && <SelfReportedBadge />}
      </figcaption>

      <blockquote className="m-0 text-[17px] leading-8 text-[#001E2B]">
        <span className="rounded-sm bg-[#CFF8E0] px-1 py-0.5 [box-decoration-break:clone] [-webkit-box-decoration-break:clone]">
          {item.excerpt}
        </span>
      </blockquote>

      {source && (
        <dl className="mt-4 flex flex-wrap gap-x-5 gap-y-1 border-t border-[#E1E8E5] pt-3 text-xs text-[#4A5F5B]">
          <div className="flex gap-1">
            <dt>Created</dt>
            <dd className="m-0 font-semibold text-[#001E2B]">
              {formatDate(source.createdAt)}
            </dd>
          </div>

          <div className="flex gap-1">
            <dt>Updated</dt>
            <dd className="m-0 font-semibold text-[#001E2B]">
              {formatDate(source.updatedAt)}
            </dd>
          </div>

          <div className="flex gap-1">
            <dt>Imported</dt>
            <dd className="m-0 font-semibold text-[#001E2B]">
              {formatDate(source.importedAt)}
            </dd>
          </div>
        </dl>
      )}
    </figure>
  );
}

function ReviewNotification({ notice, onDismiss }) {
  if (!notice) return null;

  const isNegative = notice.type === "rejected";
  const titles = {
    approved: "Finding approved!",
    rejected: "Finding rejected!",
    reverified: "Finding re-verified!",
    edited: "Finding updated!",
  };
  const subtitles = {
    approved: "Team Leader review marked as approved.",
    rejected: "Team Leader review marked as rejected.",
    reverified: "Deterministic evidence check completed against source records.",
    edited: "Candidate finding details were saved.",
  };

  return (
    <div
      key={`${notice.id}-${notice.type}`}
      role="status"
      aria-live="polite"
      className="verification-toast fixed right-5 top-20 z-50 flex max-w-sm items-center gap-3 rounded-2xl border border-[#E1E8E5] bg-white p-4 shadow-xl"
    >
      <div
        className={`success-check-circle flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${
          isNegative ? "bg-[#FCEAEA]" : "bg-[#E8F8EF]"
        }`}
      >
        <svg
          width="30"
          height="30"
          viewBox="0 0 30 30"
          fill="none"
          aria-hidden="true"
        >
          <path
            d={
              isNegative
                ? "M9 9L21 21M21 9L9 21"
                : "M7 15.5L12.5 21L23 9"
            }
            stroke={isNegative ? "#D93025" : "#159B59"}
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="success-check-path"
          />
        </svg>
      </div>

      <div>
        <p
          className={`font-bold ${
            isNegative ? "text-[#C62828]" : "text-[#087A3D]"
          }`}
        >
          {titles[notice.type] || "Finding updated!"}
        </p>

        <p className="mt-1 text-xs text-[#64756F]">
          {notice.detail || subtitles[notice.type] || ""}
        </p>
      </div>

      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className="ml-auto self-start text-lg text-[#84918B] hover:text-[#001E2B]"
      >
        ×
      </button>
    </div>
  );
}

function ConflictComparison({ conflictDetails, conflictingSourceId }) {
  if (!conflictDetails && !conflictingSourceId) return null;

  const versions = Array.isArray(conflictDetails?.all_versions) && conflictDetails.all_versions.length > 0
    ? conflictDetails.all_versions
    : [conflictDetails?.earlier_version, conflictDetails?.newer_version].filter(Boolean);

  return (
    <div className="rounded-xl border border-[#F1D7D2] bg-[#FFF8F7] p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-wider text-[#9B2D22]">
          Conflicting Source Versions
          {conflictDetails?.topic ? ` · ${conflictDetails.topic}` : ""}
        </p>
        {conflictingSourceId && (
          <span className="rounded-full bg-white px-2.5 py-0.5 font-mono text-[11px] font-semibold text-[#9B2D22] border border-[#F1D7D2]">
            Conflicts with: {conflictingSourceId}
          </span>
        )}
      </div>

      {versions.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {versions.map((ver, idx) => (
            <div
              key={`${ver.source_id || "ver"}-${idx}`}
              className="rounded-lg border border-[#F1D7D2] bg-white p-3 text-xs space-y-1.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono font-bold text-[#001E2B]">
                  {ver.source_id || "Unknown source"}
                </span>
                {ver.recorded_at && (
                  <span className="text-[11px] text-[#71817B]">
                    {formatDate(ver.recorded_at)}
                  </span>
                )}
              </div>
              {ver.claim && (
                <p className="font-medium text-[#29483B]">{ver.claim}</p>
              )}
              {ver.verbatim_excerpt && (
                <blockquote className="m-0 rounded bg-[#FFF1EE] p-2 text-[#5E231B]">
                  {ver.verbatim_excerpt}
                </blockquote>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function FindingsReview({ projectId = "", onContinue }) {
  const [projects, setProjects] = useState([]);
  const [overrideProjectId, setOverrideProjectId] = useState("");
  const [findings, setFindings] = useState([]);
  const [sources, setSources] = useState({});
  const [loadedKey, setLoadedKey] = useState("");
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [filter, setFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [reviewFilter, setReviewFilter] = useState("all");
  const [onlyRecheck, setOnlyRecheck] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    claim: "",
    category: "decision",
    topic: "",
    owner: "",
    deadline: "",
    rationale: "",
    reverify: false,
  });
  const [verificationNotice, setVerificationNotice] = useState(null);
  const [freshnessScanning, setFreshnessScanning] = useState(false);
  const [freshnessResult, setFreshnessResult] = useState(null);
  const [freshnessError, setFreshnessError] = useState("");
  const [refreshTick, setRefreshTick] = useState(0);

  const activeProjectId =
    overrideProjectId || projectId || projects[0]?._id || projects[0]?.id || "";
  const currentLoadKey = activeProjectId ? `${activeProjectId}:${refreshTick}` : "";
  const loading = Boolean(activeProjectId) && loadedKey !== currentLoadKey;

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

  useEffect(() => {
    let active = true;

    if (!activeProjectId) {
      return () => {
        active = false;
      };
    }

    const requestKey = `${activeProjectId}:${refreshTick}`;

    Promise.all([getFindings(activeProjectId), getSources(activeProjectId)])
      .then(([loadedFindings, loadedSources]) => {
        if (!active) return;

        setError("");
        setFindings(loadedFindings);
        setSources(
          Object.fromEntries(loadedSources.map((s) => [s.id, s]))
        );
        setSelectedId((prev) =>
          prev && loadedFindings.some((f) => f.id === prev)
            ? prev
            : loadedFindings[0]?.id ?? null
        );
      })
      .catch((err) => {
        if (active) {
          setError(
            err.message ||
              "Could not load findings. Check that the backend is running, then reload."
          );
        }
      })
      .finally(() => {
        if (active) setLoadedKey(requestKey);
      });

    return () => {
      active = false;
    };
  }, [activeProjectId, refreshTick]);

  // Automatically hide approval/rejection notification after 4 seconds.
  useEffect(() => {
    if (!verificationNotice) return;

    const timer = setTimeout(() => {
      setVerificationNotice(null);
    }, 4000);

    return () => clearTimeout(timer);
  }, [verificationNotice]);

  const counts = useMemo(() => {
    const result = { all: findings.length };

    FILTERS.slice(1).forEach((key) => {
      result[key] = findings.filter((f) => f.status === key).length;
    });

    return result;
  }, [findings]);

  const visible = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return findings.filter((f) => {
      const matchesStatus = filter === "all" || f.status === filter;
      const matchesCategory =
        categoryFilter === "all" ||
        (f.category || "").toLowerCase() === categoryFilter;
      const matchesReview =
        reviewFilter === "all" || (f.review || "pending") === reviewFilter;
      const matchesRecheck = !onlyRecheck || Boolean(f.recheck);
      const matchesSearch =
        !q ||
        (f.claim || "").toLowerCase().includes(q) ||
        (f.owner || "").toLowerCase().includes(q) ||
        (f.topic || "").toLowerCase().includes(q) ||
        (f.source_id || "").toLowerCase().includes(q);
      return (
        matchesStatus &&
        matchesCategory &&
        matchesReview &&
        matchesRecheck &&
        matchesSearch
      );
    });
  }, [findings, filter, categoryFilter, reviewFilter, onlyRecheck, searchQuery]);

  const selected = findings.find((f) => f.id === selectedId) ?? null;

  const reviewedCount = findings.filter(
    (f) => f.review !== "pending"
  ).length;

  const allReviewed =
    findings.length > 0 && reviewedCount === findings.length;

  function update(id, patch) {
    const finding = findings.find((f) => f.id === id);

    setFindings((prev) =>
      prev.map((f) => (f.id === id ? { ...f, ...patch } : f))
    );

    if (patch.review === "approved") {
      setVerificationNotice({
        id,
        type: "approved",
        claim: finding?.claim ?? "Finding",
      });
    } else if (patch.review === "rejected") {
      setVerificationNotice({
        id,
        type: "rejected",
        claim: finding?.claim ?? "Finding",
      });
    } else if (patch.review === "pending") {
      setVerificationNotice(null);
    }
  }

  async function handleApprove(id) {
    setActionError("");
    setActionLoading(true);
    try {
      let updated = null;
      if (activeProjectId) {
        updated = await approveFinding(activeProjectId, id);
      }
      update(id, { ...(updated || {}), review: "approved" });
    } catch (err) {
      console.error("Approve failed:", err);
      setActionError(err.message || "Failed to approve finding.");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleReject(id) {
    setActionError("");
    setActionLoading(true);
    try {
      let updated = null;
      if (activeProjectId) {
        updated = await rejectFinding(activeProjectId, id);
      }
      update(id, { ...(updated || {}), review: "rejected" });
    } catch (err) {
      console.error("Reject failed:", err);
      setActionError(err.message || "Failed to reject finding.");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleUndoReview(id) {
    setActionError("");
    setActionLoading(true);
    try {
      let updated = null;
      if (activeProjectId) {
        updated = await editFinding(activeProjectId, id, {
          review_status: "pending",
        });
      }
      update(id, { ...(updated || {}), review: "pending" });
    } catch (err) {
      console.error("Undo review failed:", err);
      setActionError(err.message || "Failed to reset finding review status.");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleReverify(id) {
    setActionError("");
    setActionLoading(true);
    try {
      if (activeProjectId) {
        const verified = await reverifyFinding(activeProjectId, id);
        if (verified) {
          update(id, verified);
          setVerificationNotice({
            id,
            type: "reverified",
            detail: `Status: ${STATUS[verified.status]?.label || verified.rawStatus || "Checked"}`,
          });
        }
      }
    } catch (err) {
      console.error("Re-verify failed:", err);
      setActionError(err.message || "Failed to re-verify finding evidence.");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleScanFreshness() {
    if (!activeProjectId) return;
    setFreshnessScanning(true);
    setFreshnessError("");
    setFreshnessResult(null);
    try {
      const res = await scanFreshness(activeProjectId);
      setFreshnessResult(res?.data || res);
      setRefreshTick((t) => t + 1);
    } catch (err) {
      console.error("Freshness scan failed:", err);
      setFreshnessError(err.message || "Failed to scan findings freshness.");
    } finally {
      setFreshnessScanning(false);
    }
  }

  function select(id) {
    setSelectedId(id);
    setEditing(false);
    setActionError("");
  }

  function startEdit() {
    if (!selected) return;
    const validCategories = ["decision", "task", "blocker", "dependency"];
    const currentCat = (selected.category || "").toLowerCase();
    setEditForm({
      claim: selected.claim || "",
      category: validCategories.includes(currentCat) ? currentCat : "decision",
      topic: selected.topic || "",
      owner: selected.owner || "",
      deadline: selected.deadline || "",
      rationale: selected.rationale || "",
      reverify: false,
    });
    setEditing(true);
  }

  async function saveEdit() {
    const text = editForm.claim.trim();
    if (!text) return;

    const payload = {
      claim: text,
      category: editForm.category,
      topic: editForm.topic.trim() ? editForm.topic.trim() : null,
      owner: editForm.owner.trim() ? editForm.owner.trim() : null,
      deadline: editForm.deadline.trim() ? editForm.deadline.trim() : null,
      rationale: editForm.rationale.trim() ? editForm.rationale.trim() : null,
      reverify: Boolean(editForm.reverify),
    };

    setActionError("");
    setActionLoading(true);
    try {
      let updated = null;
      if (activeProjectId && selected?.id) {
        updated = await editFinding(activeProjectId, selected.id, payload);
      }
      update(selected.id, {
        ...(updated || {}),
        claim: payload.claim,
        category: payload.category,
        topic: payload.topic,
        owner: payload.owner,
        deadline: payload.deadline,
        rationale: payload.rationale,
        edited: true,
      });
      setVerificationNotice({
        id: selected.id,
        type: "edited",
        detail: payload.reverify
          ? "Edits saved and evidence re-verified against sources."
          : "Edits saved to candidate finding.",
      });
      setEditing(false);
    } catch (err) {
      console.error("Edit failed:", err);
      setActionError(err.message || "Failed to save edited finding.");
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) {
    return <p className="p-8 text-[#4A5F5B]">Loading findings…</p>;
  }

  if (error) {
    return (
      <p
        role="alert"
        className="m-8 rounded-xl border border-[#C0392B] bg-[#FBE9E7] p-4 text-[#9B2D22]"
      >
        {error}
      </p>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
      <ReviewNotification
        notice={verificationNotice}
        onDismiss={() => setVerificationNotice(null)}
      />

      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-xl">
          <p className="mb-1 text-xs font-bold uppercase tracking-[0.16em] text-[#159B59]">
            Stage 3 · Deterministic Verification & Review
          </p>
          <h1 className="text-4xl font-bold text-[#001E2B]">
            Review findings
          </h1>

          <p className="mt-2 text-[#4A5F5B]">
            Check each finding against the exact text in its source, then
            approve, edit, re-verify, or reject it. Nothing is shared with the incoming
            member until you finish.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {projects.length > 0 && (
            <select
              aria-label="Select project for findings review"
              value={activeProjectId}
              onChange={(e) => {
                setOverrideProjectId(e.target.value);
                setError("");
                setActionError("");
                setEditing(false);
                setVerificationNotice(null);
                setFreshnessResult(null);
                setFreshnessError("");
                setFilter("all");
                setCategoryFilter("all");
                setReviewFilter("all");
                setOnlyRecheck(false);
                setSearchQuery("");
              }}
              className={`rounded-lg border border-[#D8E7DF] bg-white px-3 py-2.5 text-sm font-semibold text-[#29483B] ${focusRing}`}
            >
              {projects.map((p) => (
                <option key={p._id || p.id} value={p._id || p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            disabled={!activeProjectId || freshnessScanning}
            onClick={handleScanFreshness}
            className={`inline-flex items-center gap-2 rounded-lg border border-[#D8E7DF] bg-white px-4 py-2.5 text-sm font-semibold text-[#24483A] transition hover:border-[#159B59] disabled:opacity-50 ${focusRing}`}
          >
            <RefreshCw size={15} className={freshnessScanning ? "animate-spin" : ""} />
            {freshnessScanning ? "Scanning..." : "Scan Freshness"}
          </button>

          <button
            type="button"
            disabled={!allReviewed}
            onClick={() => onContinue?.(findings)}
            className={`rounded-lg bg-[#001E2B] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#023430] disabled:bg-[#C9CFDC] disabled:text-[#4A5F5B] ${focusRing}`}
          >
            Continue to readiness check
          </button>
        </div>
      </header>

      {freshnessResult && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#CDE9D8] bg-[#EAF8EF] p-4 text-sm text-[#087A3D]">
          <div className="flex items-center gap-2 font-semibold">
            <CheckCircle2 size={17} />
            <span>
              Freshness scan complete: {freshnessResult.scanned ?? 0} scanned ·{" "}
              {freshnessResult.current_count ?? 0} current ·{" "}
              {freshnessResult.stale_count ?? 0} stale
              {freshnessResult.invalid_date_count > 0 &&
                ` · ${freshnessResult.invalid_date_count} invalid dates`}
            </span>
          </div>
          {freshnessResult.checked_at && (
            <span className="text-xs text-[#24483A]">
              Checked {new Date(freshnessResult.checked_at).toLocaleString()}
            </span>
          )}
        </div>
      )}

      {freshnessError && (
        <div className="mb-6 flex items-start gap-2 rounded-xl border border-[#F1D7D2] bg-[#FFF5F3] p-4 text-sm text-[#A33F32]">
          <AlertTriangle size={17} className="mt-0.5 shrink-0" />
          <span>{freshnessError}</span>
        </div>
      )}

      <section aria-label="Review progress" className="mb-6">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <p className="text-sm font-semibold text-[#001E2B]">
            {reviewedCount} of {findings.length} reviewed
          </p>

          <p className="text-xs text-[#4A5F5B]">
            Select a block to open that finding
          </p>
        </div>

        <StatusStrip
          findings={findings}
          selectedId={selectedId}
          onSelect={select}
        />
      </section>

      <div
        className="mb-4 flex flex-wrap gap-x-6 gap-y-2 border-b border-[#E1E8E5]"
        role="group"
        aria-label="Filter by status"
      >
        {FILTERS.map((key) => {
          const active = filter === key;

          return (
            <button
              key={key}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter(key)}
              className={`-mb-px flex items-center gap-2 border-b-2 bg-transparent px-0.5 pb-3 pt-1 text-sm font-semibold ${focusRing} ${
                active
                  ? "border-[#001E2B] text-[#001E2B]"
                  : "border-transparent text-[#4A5F5B] hover:text-[#001E2B]"
              }`}
            >
              {key !== "all" && (
                <span
                  aria-hidden="true"
                  className={`h-2 w-2 rounded-full ${STATUS[key].dot}`}
                />
              )}

              {key === "all" ? "All" : STATUS[key].label}

              <span className="font-medium tabular-nums text-[#4A5F5B]">
                {counts[key]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Category, Review Status, Stale Toggle & Search Bar */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="flex flex-wrap items-center gap-1.5"
            role="group"
            aria-label="Filter by category"
          >
            <span className="text-xs font-semibold text-[#4A5F5B]">Category:</span>
            {CATEGORY_FILTERS.map((cat) => {
              const active = categoryFilter === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setCategoryFilter(cat)}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold capitalize transition ${focusRing} ${
                    active
                      ? "border-[#001E2B] bg-[#001E2B] text-white"
                      : "border-[#DCE9E3] bg-white text-[#4A5F5B] hover:border-[#001E2B]"
                  }`}
                >
                  {cat}
                </button>
              );
            })}
          </div>

          <div
            className="flex flex-wrap items-center gap-1.5"
            role="group"
            aria-label="Filter by review status"
          >
            <span className="ml-2 text-xs font-semibold text-[#4A5F5B]">Review:</span>
            {["all", "pending", "approved", "rejected"].map((rev) => {
              const active = reviewFilter === rev;
              return (
                <button
                  key={rev}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setReviewFilter(rev)}
                  className={`rounded-full border px-2.5 py-1 text-xs font-semibold capitalize transition ${focusRing} ${
                    active
                      ? "border-[#159B59] bg-[#EAF8EF] text-[#087A3D]"
                      : "border-[#DCE9E3] bg-white text-[#4A5F5B] hover:border-[#159B59]"
                  }`}
                >
                  {rev}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            aria-pressed={onlyRecheck}
            onClick={() => setOnlyRecheck((prev) => !prev)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${focusRing} ${
              onlyRecheck
                ? "border-[#D9650F] bg-[#FDEBDD] text-[#99480F]"
                : "border-[#DCE9E3] bg-white text-[#4A5F5B] hover:border-[#D9650F]"
            }`}
          >
            Needs re-check ({findings.filter((f) => f.recheck).length})
          </button>
        </div>

        <input
          type="search"
          aria-label="Search findings"
          placeholder="Search claim, owner, topic, source..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className={`w-full rounded-lg border border-[#D8E7DF] bg-white px-3 py-1.5 text-xs text-[#001E2B] placeholder:text-[#84918B] sm:w-64 ${focusRing}`}
        />
      </div>

      <div className="grid gap-8 lg:grid-cols-5">
        <section aria-label="Findings list" className="lg:col-span-2">
          {findings.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[#C9CFDC] bg-[#F8FBFA] p-6 text-sm text-[#4A5F5B]">
              No candidate findings exist for this project yet. Run Stage 2 Knowledge Reconstruction first.
            </p>
          ) : visible.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[#C9CFDC] p-6 text-[#4A5F5B]">
              No findings match the current filters.
            </p>
          ) : (
            <ul className="m-0 list-none space-y-2 p-0">
              {visible.map((f) => {
                const isSelected = f.id === selectedId;

                return (
                  <li key={f.id}>
                    <button
                      type="button"
                      onClick={() => select(f.id)}
                      aria-current={isSelected ? "true" : undefined}
                      className={`finding-list-card w-full rounded-r-xl border-l-4 px-4 py-3 text-left transition-colors ${STATUS[f.status].edge} ${focusRing} ${
                        isSelected
                          ? "bg-white shadow-[0_1px_0_#E1E8E5,0_0_0_1px_#E1E8E5]"
                          : "bg-transparent hover:bg-white/70"
                      }`}
                    >
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#4A5F5B]">
                        {f.category}
                      </p>

                      <p className="mb-2 text-[15px] font-medium leading-snug text-[#001E2B]">
                        {f.claim}
                      </p>

                      <div className="flex flex-wrap gap-1.5">
                        <StatusBadge status={f.status} />
                        <FreshnessBadge
                          recheck={f.recheck}
                          reason={f.recheckReason}
                        />
                        <ReviewBadge
                          review={f.review}
                          edited={f.edited}
                        />
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section
          aria-label="Finding detail"
          className="self-start rounded-2xl border border-[#E1E8E5] bg-white p-6 shadow-[0_8px_30px_-12px_rgba(27,37,64,0.18)] sm:p-8 lg:sticky lg:top-6 lg:col-span-3"
        >
          {!selected ? (
            <p className="text-[#4A5F5B]">
              Select a finding to see its evidence.
            </p>
          ) : (
            <div key={selected.id} className="finding-detail-enter space-y-6">
              <div>
                <div className="mb-3 flex flex-wrap items-center gap-1.5">
                  <StatusBadge status={selected.status} />
                  <FreshnessBadge
                    recheck={selected.recheck}
                    reason={selected.recheckReason}
                  />
                  <ReviewBadge
                    review={selected.review}
                    edited={selected.edited}
                  />
                  {(selected.evidence_origin === "self_reported" ||
                    selected.evidence_badge === "Self-reported") && (
                    <SelfReportedBadge />
                  )}
                </div>

                <p className="mb-1 text-xs font-bold uppercase tracking-wider text-[#4A5F5B]">
                  {selected.category}
                  {selected.topic ? ` · ${selected.topic}` : ""}
                </p>

                {editing ? (
                  <div className="mt-2 space-y-3 rounded-xl border border-[#DCE9E3] bg-[#F8FBFA] p-4">
                    <div>
                      <label htmlFor="claim-edit" className="mb-1 block text-xs font-semibold text-[#29483B]">
                        Claim *
                      </label>
                      <textarea
                        id="claim-edit"
                        value={editForm.claim}
                        onChange={(e) =>
                          setEditForm((prev) => ({ ...prev, claim: e.target.value }))
                        }
                        rows={3}
                        className={`w-full rounded-lg border border-[#C9CFDC] bg-white p-3 text-base text-[#001E2B] ${focusRing}`}
                      />
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <div>
                        <label htmlFor="category-edit" className="mb-1 block text-xs font-semibold text-[#29483B]">
                          Category
                        </label>
                        <select
                          id="category-edit"
                          value={editForm.category}
                          onChange={(e) =>
                            setEditForm((prev) => ({ ...prev, category: e.target.value }))
                          }
                          className={`w-full rounded-lg border border-[#C9CFDC] bg-white px-2.5 py-2 text-xs text-[#001E2B] ${focusRing}`}
                        >
                          <option value="decision">decision</option>
                          <option value="task">task</option>
                          <option value="blocker">blocker</option>
                          <option value="dependency">dependency</option>
                        </select>
                      </div>

                      <div>
                        <label htmlFor="topic-edit" className="mb-1 block text-xs font-semibold text-[#29483B]">
                          Topic
                        </label>
                        <input
                          id="topic-edit"
                          type="text"
                          value={editForm.topic}
                          onChange={(e) =>
                            setEditForm((prev) => ({ ...prev, topic: e.target.value }))
                          }
                          placeholder="e.g. authentication"
                          className={`w-full rounded-lg border border-[#C9CFDC] bg-white px-2.5 py-2 text-xs text-[#001E2B] ${focusRing}`}
                        />
                      </div>

                      <div>
                        <label htmlFor="owner-edit" className="mb-1 block text-xs font-semibold text-[#29483B]">
                          Owner
                        </label>
                        <input
                          id="owner-edit"
                          type="text"
                          value={editForm.owner}
                          onChange={(e) =>
                            setEditForm((prev) => ({ ...prev, owner: e.target.value }))
                          }
                          placeholder="e.g. Alice"
                          className={`w-full rounded-lg border border-[#C9CFDC] bg-white px-2.5 py-2 text-xs text-[#001E2B] ${focusRing}`}
                        />
                      </div>

                      <div>
                        <label htmlFor="deadline-edit" className="mb-1 block text-xs font-semibold text-[#29483B]">
                          Deadline
                        </label>
                        <input
                          id="deadline-edit"
                          type="text"
                          value={editForm.deadline}
                          onChange={(e) =>
                            setEditForm((prev) => ({ ...prev, deadline: e.target.value }))
                          }
                          placeholder="e.g. 2026-11-30"
                          className={`w-full rounded-lg border border-[#C9CFDC] bg-white px-2.5 py-2 text-xs text-[#001E2B] ${focusRing}`}
                        />
                      </div>
                    </div>

                    <div>
                      <label htmlFor="rationale-edit" className="mb-1 block text-xs font-semibold text-[#29483B]">
                        Rationale
                      </label>
                      <textarea
                        id="rationale-edit"
                        rows={2}
                        value={editForm.rationale}
                        onChange={(e) =>
                          setEditForm((prev) => ({ ...prev, rationale: e.target.value }))
                        }
                        placeholder="Context or technical rationale..."
                        className={`w-full rounded-lg border border-[#C9CFDC] bg-white p-2.5 text-xs text-[#001E2B] ${focusRing}`}
                      />
                    </div>

                    <label className="flex items-center gap-2 text-xs font-medium text-[#29483B]">
                      <input
                        type="checkbox"
                        checked={editForm.reverify}
                        onChange={(e) =>
                          setEditForm((prev) => ({ ...prev, reverify: e.target.checked }))
                        }
                        className="h-4 w-4 rounded border-[#C9CFDC]"
                      />
                      Re-verify evidence deterministically against source records on save
                    </label>

                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        onClick={saveEdit}
                        disabled={!editForm.claim.trim() || actionLoading}
                        className={`rounded-lg bg-[#001E2B] px-4 py-2 text-sm font-semibold text-white hover:bg-[#023430] disabled:bg-[#C9CFDC] disabled:text-[#4A5F5B] ${focusRing}`}
                      >
                        {actionLoading ? "Saving..." : "Save changes"}
                      </button>

                      <button
                        type="button"
                        onClick={() => setEditing(false)}
                        disabled={actionLoading}
                        className={`rounded-lg border border-[#C9CFDC] bg-white px-4 py-2 text-sm font-semibold text-[#001E2B] hover:bg-[#F5F8F7] ${focusRing}`}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <h2 className="text-2xl font-bold leading-tight text-[#001E2B]">
                      {selected.claim}
                    </h2>

                    {(selected.owner || selected.deadline || selected.rationale) && (
                      <dl className="mt-3 grid gap-2 rounded-xl border border-[#E8F0EC] bg-[#F8FBFA] p-3 text-xs sm:grid-cols-2">
                        {selected.owner && (
                          <div>
                            <dt className="text-[#71817B]">Owner</dt>
                            <dd className="m-0 font-semibold text-[#001E2B]">{selected.owner}</dd>
                          </div>
                        )}
                        {selected.deadline && (
                          <div>
                            <dt className="text-[#71817B]">Deadline</dt>
                            <dd className="m-0 font-semibold text-[#001E2B]">{selected.deadline}</dd>
                          </div>
                        )}
                        {selected.rationale && (
                          <div className="sm:col-span-2">
                            <dt className="text-[#71817B]">Rationale</dt>
                            <dd className="m-0 text-[#29483B]">{selected.rationale}</dd>
                          </div>
                        )}
                      </dl>
                    )}
                  </>
                )}
              </div>

              {selected.explanation && (
                <div className="flex items-start gap-2.5 rounded-xl border border-[#DCE9E3] bg-[#F4FAF6] p-3.5 text-xs leading-5 text-[#29483B]">
                  <ShieldCheck size={16} className="mt-0.5 shrink-0 text-[#159B59]" />
                  <div>
                    <p className="font-semibold text-[#087A3D]">Deterministic Verification Note</p>
                    <p className="mt-0.5">{selected.explanation}</p>
                  </div>
                </div>
              )}

              {selected.recheck && (
                <p className="rounded-r-lg border-l-4 border-[#D9650F] bg-[#FDEBDD] px-4 py-3 text-sm text-[#99480F]">
                  {selected.recheckReason} Confirm that this is still accurate
                  before approving.
                </p>
              )}

              <ConflictComparison
                conflictDetails={selected.conflict_details}
                conflictingSourceId={selected.conflicting_source_id}
              />

              <div>
                <h3 className="mb-3 text-base font-bold text-[#001E2B]">
                  {selected.evidence.length > 1
                    ? "These sources disagree"
                    : "What the source says"}
                </h3>

                {selected.evidence.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-[#C9CFDC] bg-[#F8FBFA] p-4 text-sm text-[#4A5F5B]">
                    No source supports this finding. Treat it as a gap that
                    needs an answer.
                  </p>
                ) : (
                  <div
                    className={`grid gap-4 ${
                      selected.evidence.length > 1 ? "sm:grid-cols-2" : ""
                    }`}
                  >
                    {selected.evidence.map((item) => (
                      <SourceSlip
                        key={`${selected.id}-${item.sourceId}`}
                        item={item}
                        source={sources[item.sourceId]}
                      />
                    ))}
                  </div>
                )}
              </div>

              {selected.status !== "supported" &&
                selected.review === "pending" && (
                  <p className="text-sm text-[#4A5F5B]">
                    Approving records your confirmation. The system status
                    stays “{STATUS[selected.status].label}”.
                  </p>
                )}

              {actionError && (
                <p className="rounded-lg bg-red-50 p-3 text-xs text-red-700">
                  {actionError}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-3 border-t border-[#E1E8E5] pt-5">
                <button
                  type="button"
                  onClick={() => handleApprove(selected.id)}
                  disabled={selected.review === "approved" || actionLoading}
                  className={`rounded-lg bg-[#001E2B] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#023430] disabled:bg-[#C9CFDC] disabled:text-[#4A5F5B] ${focusRing}`}
                >
                  {actionLoading ? "Processing..." : "Approve"}
                </button>

                <button
                  type="button"
                  onClick={() => handleReject(selected.id)}
                  disabled={selected.review === "rejected" || actionLoading}
                  className={`rounded-lg border border-[#001E2B] bg-white px-5 py-2.5 text-sm font-semibold text-[#001E2B] transition-colors hover:bg-[#F5F8F7] disabled:border-[#C9CFDC] disabled:text-[#8A92A6] ${focusRing}`}
                >
                  {actionLoading ? "Processing..." : "Reject"}
                </button>

                <button
                  type="button"
                  onClick={startEdit}
                  disabled={editing || actionLoading}
                  className={`rounded-lg bg-transparent px-3 py-2.5 text-sm font-semibold text-[#001E2B] underline underline-offset-4 disabled:text-[#8A92A6] ${focusRing}`}
                >
                  Edit finding
                </button>

                <button
                  type="button"
                  onClick={() => handleReverify(selected.id)}
                  disabled={actionLoading}
                  className={`rounded-lg border border-[#DCE9E3] bg-[#F7FAF8] px-3.5 py-2.5 text-sm font-semibold text-[#087A3D] transition hover:bg-[#EAF8EF] disabled:opacity-50 ${focusRing}`}
                >
                  {actionLoading ? "Checking..." : "Re-verify Evidence"}
                </button>

                {selected.review !== "pending" && (
                  <button
                    type="button"
                    onClick={() => handleUndoReview(selected.id)}
                    disabled={actionLoading}
                    className={`rounded-lg bg-transparent px-3 py-2.5 text-sm text-[#4A5F5B] underline underline-offset-4 disabled:opacity-50 ${focusRing}`}
                  >
                    Undo review
                  </button>
                )}
              </div>
            </div>
          )}
        </section>
      </div>

      <style>{`
        .verification-toast {
          animation: toastEnter 450ms cubic-bezier(.2,.8,.2,1) both;
        }

        .success-check-circle {
          animation: checkPop 500ms cubic-bezier(.17,.67,.35,1.4) both;
        }

        .success-check-path {
          stroke-dasharray: 30;
          stroke-dashoffset: 30;
          animation: drawCheck 550ms ease-out 250ms forwards;
        }

        @keyframes toastEnter {
          from {
            opacity: 0;
            transform: translateX(35px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        @keyframes checkPop {
          0% {
            transform: scale(0);
          }
          70% {
            transform: scale(1.18);
          }
          100% {
            transform: scale(1);
          }
        }

        @keyframes drawCheck {
          to {
            stroke-dashoffset: 0;
          }
        }

        .finding-list-card {
          transition:
            transform 250ms ease,
            box-shadow 250ms ease,
            background-color 250ms ease;
        }

        .finding-list-card:hover {
          transform: translateX(4px);
          box-shadow: 0 5px 15px rgba(0, 30, 43, 0.06);
        }

        .finding-detail-enter {
          animation: findingDetailEnter 350ms ease-out both;
        }

        .source-slip {
          animation: sourceSlipEnter 400ms ease-out both;
        }

        @keyframes findingDetailEnter {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes sourceSlipEnter {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .verification-toast,
          .success-check-circle,
          .success-check-path,
          .finding-detail-enter,
          .source-slip {
            animation: none !important;
          }

          .success-check-path {
            stroke-dashoffset: 0;
          }

          .finding-list-card {
            transition: none;
          }

          .finding-list-card:hover {
            transform: none;
          }
        }
      `}</style>
    </main>
  );
}