import { useEffect, useMemo, useState } from "react";
import {
  getFindings,
  getSources,
  approveFinding,
  rejectFinding,
  editFinding,
  reverifyFinding,
} from "../api/findingsApi";
import {
  StatusBadge,
  FreshnessBadge,
  ReviewBadge,
  SelfReportedBadge,
  STATUS,
  REVIEW_LABEL,
  normalizeStatusKey,
} from "../components/Badges";

const FILTERS = ["all", "supported", "needs_review", "conflicting", "unknown"];

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

  const approved = notice.type === "approved";

  return (
    <div
      key={`${notice.id}-${notice.type}`}
      role="status"
      aria-live="polite"
      className="verification-toast fixed right-5 top-20 z-50 flex max-w-sm items-center gap-3 rounded-2xl border border-[#E1E8E5] bg-white p-4 shadow-xl"
    >
      <div
        className={`success-check-circle flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${
          approved ? "bg-[#E8F8EF]" : "bg-[#FCEAEA]"
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
              approved
                ? "M7 15.5L12.5 21L23 9"
                : "M9 9L21 21M21 9L9 21"
            }
            stroke={approved ? "#159B59" : "#D93025"}
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
            approved ? "text-[#087A3D]" : "text-[#C62828]"
          }`}
        >
          {approved ? "Finding approved!" : "Finding rejected!"}
        </p>

        <p className="mt-1 text-xs text-[#64756F]">
          {approved
            ? "Team Leader review marked as approved."
            : "Team Leader review marked as rejected."}
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

export default function FindingsReview({ projectId = "", onContinue }) {
  const [findings, setFindings] = useState([]);
  const [sources, setSources] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [filter, setFilter] = useState("all");
  const [selectedId, setSelectedId] = useState(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [verificationNotice, setVerificationNotice] = useState(null);

  useEffect(() => {
    let active = true;

    Promise.all([getFindings(projectId), getSources(projectId)])
      .then(([loadedFindings, loadedSources]) => {
        if (!active) return;

        setFindings(loadedFindings);
        setSources(
          Object.fromEntries(loadedSources.map((s) => [s.id, s]))
        );
        setSelectedId(loadedFindings[0]?.id ?? null);
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
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [projectId]);

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

  const visible =
    filter === "all"
      ? findings
      : findings.filter((f) => f.status === filter);

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
      if (projectId) {
        await approveFinding(projectId, id);
      }
      update(id, { review: "approved" });
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
      if (projectId) {
        await rejectFinding(projectId, id);
      }
      update(id, { review: "rejected" });
    } catch (err) {
      console.error("Reject failed:", err);
      setActionError(err.message || "Failed to reject finding.");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleReverify(id) {
    setActionError("");
    setActionLoading(true);
    try {
      if (projectId) {
        const verified = await reverifyFinding(projectId, id);
        update(id, {
          status: verified.status,
          rawStatus: verified.rawStatus,
          recheck: false,
        });
      }
    } catch (err) {
      console.error("Re-verify failed:", err);
      setActionError(err.message || "Failed to re-verify finding evidence.");
    } finally {
      setActionLoading(false);
    }
  }

  function select(id) {
    setSelectedId(id);
    setEditing(false);
    setActionError("");
  }

  function startEdit() {
    setDraft(selected?.claim || "");
    setEditing(true);
  }

  async function saveEdit() {
    const text = draft.trim();
    if (!text) return;

    setActionError("");
    setActionLoading(true);
    try {
      if (projectId && selected?.id) {
        await editFinding(projectId, selected.id, text, false);
      }
      update(selected.id, { claim: text, edited: true });
      setEditing(false);
    } catch (err) {
      console.error("Edit failed:", err);
      setActionError(err.message || "Failed to save edited claim.");
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
          <h1 className="text-4xl font-bold text-[#001E2B]">
            Review findings
          </h1>

          <p className="mt-2 text-[#4A5F5B]">
            Check each finding against the exact text in its source, then
            approve, edit or reject it. Nothing is shared with the incoming
            member until you finish.
          </p>
        </div>

        <button
          type="button"
          disabled={!allReviewed}
          onClick={() => onContinue?.(findings)}
          className={`rounded-lg bg-[#001E2B] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#023430] disabled:bg-[#C9CFDC] disabled:text-[#4A5F5B] ${focusRing}`}
        >
          Continue to readiness check
        </button>
      </header>

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
        className="mb-6 flex flex-wrap gap-x-6 gap-y-2 border-b border-[#E1E8E5]"
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

      <div className="grid gap-8 lg:grid-cols-5">
        <section aria-label="Findings list" className="lg:col-span-2">
          {visible.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[#C9CFDC] p-6 text-[#4A5F5B]">
              No findings with this status.
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
                      <p className="mb-1 text-xs font-semibold text-[#4A5F5B]">
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

                <p className="mb-1 text-sm font-semibold text-[#4A5F5B]">
                  {selected.category}
                </p>

                {editing ? (
                  <div className="space-y-3">
                    <label htmlFor="claim-edit" className="sr-only">
                      Edit claim
                    </label>

                    <textarea
                      id="claim-edit"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      rows={3}
                      className={`w-full rounded-lg border border-[#C9CFDC] p-3 text-lg text-[#001E2B] ${focusRing}`}
                    />

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={saveEdit}
                        disabled={!draft.trim()}
                        className={`rounded-lg bg-[#001E2B] px-4 py-2 text-sm font-semibold text-white hover:bg-[#023430] disabled:bg-[#C9CFDC] disabled:text-[#4A5F5B] ${focusRing}`}
                      >
                        Save claim
                      </button>

                      <button
                        type="button"
                        onClick={() => setEditing(false)}
                        className={`rounded-lg border border-[#C9CFDC] bg-white px-4 py-2 text-sm font-semibold text-[#001E2B] hover:bg-[#F5F8F7] ${focusRing}`}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <h2 className="text-2xl font-bold leading-tight text-[#001E2B]">
                    {selected.claim}
                  </h2>
                )}
              </div>

              {selected.recheck && (
                <p className="rounded-r-lg border-l-4 border-[#D9650F] bg-[#FDEBDD] px-4 py-3 text-sm text-[#99480F]">
                  {selected.recheckReason} Confirm that this is still accurate
                  before approving.
                </p>
              )}

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
                  Edit claim
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
                    onClick={() =>
                      update(selected.id, { review: "pending" })
                    }
                    className={`rounded-lg bg-transparent px-3 py-2.5 text-sm text-[#4A5F5B] underline underline-offset-4 ${focusRing}`}
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