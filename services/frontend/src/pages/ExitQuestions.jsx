import { useEffect, useState } from "react";
import {
  getGapQuestions,
  getUnresolvedGaps,
  answerGapQuestion,
} from "../api/gapsApi";
import { getProjects } from "../api/projectsApi";
import { SelfReportedBadge } from "../components/Badges";
import { CheckCircle2, AlertCircle, Loader2, ArrowLeft } from "lucide-react";

function formatGapCategory(cat) {
  if (!cat) return "";
  return cat.replace(/_/g, " ");
}

export default function ExitQuestions({ projectId = "", onComplete = null }) {
  const [projects, setProjects] = useState([]);
  const [overrideProjectId, setOverrideProjectId] = useState("");
  const [questions, setQuestions] = useState([]);
  const [unresolvedFindings, setUnresolvedFindings] = useState([]);
  const [answers, setAnswers] = useState({});
  const [loadedKey, setLoadedKey] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [submittingId, setSubmittingId] = useState("");
  const [lastSavedId, setLastSavedId] = useState("");
  const [submittingAll, setSubmittingAll] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [answeredCount, setAnsweredCount] = useState(0);

  const activeProjectId =
    overrideProjectId || projectId || projects[0]?._id || projects[0]?.id || "";
  const loading = Boolean(activeProjectId) && loadedKey !== activeProjectId;

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

    Promise.all([
      getGapQuestions(activeProjectId),
      getUnresolvedGaps(activeProjectId).catch(() => ({ unresolvedFindings: [] })),
    ])
      .then(([gapList, gapsSummary]) => {
        if (!active) return;

        setError("");
        const safeQuestions = Array.isArray(gapList) ? gapList : [];
        setQuestions(
          safeQuestions.map((q) => ({
            id: q._id || q.id,
            question: q.question,
            gapCategory: q.gap_category || "",
            relatedFinding: q.relatedFindingId || null,
            status: q.status || "pending",
            existingAnswer: q.answer || "",
            answeredAt: q.answeredAt || null,
            evidenceBadge: q.evidence_badge || "Self-reported",
          }))
        );

        const initial = {};
        safeQuestions.forEach((q) => {
          if (q.answer) {
            initial[q._id || q.id] = q.answer;
          }
        });
        setAnswers(initial);
        setUnresolvedFindings(
          Array.isArray(gapsSummary?.unresolvedFindings)
            ? gapsSummary.unresolvedFindings
            : []
        );
      })
      .catch((err) => {
        console.error("Failed to load gap questions:", err);
        if (active) {
          setError(err.message || "Failed to load gap questions from backend.");
        }
      })
      .finally(() => {
        if (active) setLoadedKey(activeProjectId);
      });

    return () => {
      active = false;
    };
  }, [activeProjectId]);

  async function handleAnswerSingle(question) {
    const ans = (answers[question.id] || "").trim();
    if (ans.length < 2) {
      setError("Answer must contain at least 2 characters.");
      return;
    }

    setError("");
    setLastSavedId("");
    setSubmittingId(question.id);
    try {
      const saved = await answerGapQuestion(activeProjectId, question.id, ans);
      setQuestions((prev) =>
        prev.map((q) =>
          q.id === question.id
            ? {
                ...q,
                status: saved?.status || "answered",
                existingAnswer: saved?.answer || ans,
                answeredAt: saved?.answeredAt || new Date().toISOString(),
                evidenceBadge: saved?.evidence_badge || "Self-reported",
              }
            : q
        )
      );
      setLastSavedId(question.id);
    } catch (err) {
      console.error("Error submitting answer:", err);
      setError(err.message || "Failed to submit answer.");
    } finally {
      setSubmittingId("");
    }
  }

  async function handleSubmitAll() {
    setError("");
    const toSubmit = questions.filter((q) => {
      const draft = (answers[q.id] || "").trim();
      return draft.length >= 2 && draft !== (q.existingAnswer || "").trim();
    });

    if (toSubmit.length === 0) {
      setError("Enter or update at least one answer (min 2 characters) before submitting.");
      return;
    }

    setSubmittingAll(true);
    let submitted = 0;

    try {
      for (const q of toSubmit) {
        const ans = (answers[q.id] || "").trim();
        const saved = await answerGapQuestion(activeProjectId, q.id, ans);
        submitted++;
        setQuestions((prev) =>
          prev.map((item) =>
            item.id === q.id
              ? {
                  ...item,
                  status: saved?.status || "answered",
                  existingAnswer: saved?.answer || ans,
                  answeredAt: saved?.answeredAt || new Date().toISOString(),
                  evidenceBadge: saved?.evidence_badge || "Self-reported",
                }
              : item
          )
        );
      }

      setAnsweredCount(submitted);
      setSent(true);
    } catch (err) {
      console.error("Error submitting handover answers:", err);
      setError(err.message || "Failed to submit answers. Please try again.");
    } finally {
      setSubmittingAll(false);
    }
  }

  if (sent) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-16 sm:px-8">
        <div className="rounded-3xl border border-[#DDEBE3] bg-white p-8 text-center shadow-lg sm:p-12">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[#E8F8EF] text-[#159B59]">
            <CheckCircle2 size={48} />
          </div>

          <h1 className="mt-6 text-3xl font-bold text-[#001E2B]">
            Handover Recorded
          </h1>

          <div className="mt-3 flex justify-center">
            <SelfReportedBadge />
          </div>

          <p className="mx-auto mt-4 max-w-lg leading-7 text-[#4A5F5B]">
            Successfully submitted {answeredCount} self-reported answer(s) to the backend database.
            They are now linked with &apos;Self-reported&apos; badges for your Team Leader and incoming engineers.
          </p>

          <p className="mt-2 text-xs text-[#71817B]">
            Deterministic Verification Rule: Answers from departing members are transparently badged and never disguised as system-verified evidence.
          </p>

          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => setSent(false)}
              className="rounded-xl border border-[#DCE9E3] bg-white px-5 py-2.5 text-sm font-semibold text-[#001E2B] hover:bg-[#F5F9F6]"
            >
              Review My Answers
            </button>
            {onComplete && (
              <button
                type="button"
                onClick={() => onComplete({ answeredCount })}
                className="inline-flex items-center gap-2 rounded-xl bg-[#001E2B] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#023D35]"
              >
                <ArrowLeft size={15} />
                Return to Dashboard
              </button>
            )}
          </div>
        </div>
      </main>
    );
  }

  const pendingCount = questions.filter((q) => q.status === "pending").length;
  const answeredTotal = questions.filter(
    (q) => q.status === "answered" || q.status === "approved"
  ).length;

  return (
    <main className="mx-auto max-w-3xl px-5 py-10 sm:px-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-1 text-xs font-bold uppercase tracking-[0.16em] text-[#159B59]">
            Stage 4 · Gap-to-Question Loop
          </p>
          <h1 className="text-3xl font-bold text-[#001E2B] sm:text-4xl">
            What only you know
          </h1>
          <p className="mt-2 text-[#4A5F5B]">
            Answer the targeted knowledge-gap questions below before your departure.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          {projects.length > 1 && (
            <select
              aria-label="Select project"
              value={activeProjectId}
              onChange={(e) => {
                setOverrideProjectId(e.target.value);
                setQuestions([]);
                setUnresolvedFindings([]);
                setAnswers({});
                setStatusFilter("all");
                setLastSavedId("");
                setAnsweredCount(0);
                setError("");
                setSent(false);
              }}
              className="rounded-xl border border-[#D8E7DF] bg-white px-3 py-2 text-xs font-semibold text-[#29483B] outline-none"
            >
              {projects.map((p) => (
                <option key={p._id || p.id} value={p._id || p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
          <SelfReportedBadge />
        </div>
      </div>

      {error && (
        <div className="mt-5 flex gap-2 rounded-xl bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle size={18} className="mt-0.5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-[#4A5F5B]">
          <Loader2 className="mr-2 animate-spin" />
          Loading project gap questions...
        </div>
      ) : questions.length === 0 ? (
        <div className="mt-8 space-y-5">
          <div className="rounded-2xl border border-dashed border-[#DCE9E3] bg-[#FAFCFA] p-8 text-center">
            <p className="text-base font-semibold text-[#001E2B]">
              No targeted gap questions generated for this project yet.
            </p>
            <p className="mt-1 text-sm text-[#71817B]">
              Ask your Team Leader to run Stage 2 Knowledge Reconstruction to generate targeted gap questions from unresolved findings.
            </p>
          </div>

          {unresolvedFindings.length > 0 && (
            <section className="rounded-2xl border border-[#F1E2C7] bg-[#FFFDF8] p-5">
              <h2 className="text-sm font-bold text-[#001E2B]">
                Unresolved Findings Detected ({unresolvedFindings.length})
              </h2>
              <p className="mt-1 text-xs text-[#71817B]">
                These findings currently carry Unknown, Conflicting, or Blocker status.
              </p>
              <ul className="mt-3 space-y-2">
                {unresolvedFindings.slice(0, 6).map((f) => (
                  <li
                    key={f._id || f.id}
                    className="rounded-xl border border-[#F1E2C7] bg-white p-3 text-xs text-[#29483B]"
                  >
                    <span className="font-semibold uppercase text-[#9A681D]">
                      {f.category} · {f.verification_status}
                    </span>
                    <p className="mt-1 font-medium text-[#001E2B]">{f.claim}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      ) : (
        <>
          <div className="mt-8 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xl font-bold text-[#001E2B]">
              Targeted Gap Questions ({questions.length})
            </h2>
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
              {[
                { key: "all", label: `All (${questions.length})` },
                { key: "pending", label: `${pendingCount} Pending` },
                { key: "answered", label: `${answeredTotal} Answered` },
              ].map((tab) => {
                const active = statusFilter === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setStatusFilter(tab.key)}
                    className={`rounded-full border px-3 py-1 transition ${
                      active
                        ? "border-[#001E2B] bg-[#001E2B] text-white"
                        : "border-[#DCE9E3] bg-white text-[#4A5F5B] hover:border-[#159B59]"
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          <ul className="m-0 mt-5 list-none space-y-6 p-0">
            {questions
              .filter((q) => {
                if (statusFilter === "pending") return q.status === "pending";
                if (statusFilter === "answered") {
                  return q.status === "answered" || q.status === "approved";
                }
                return true;
              })
              .map((q, i) => {
              const isAnswered = q.status === "answered" || q.status === "approved";
              const draft = answers[q.id] ?? "";
              const isDirty = draft.trim() !== (q.existingAnswer || "").trim();
              const isSavingThis = submittingId === q.id;

              return (
                <li
                  key={q.id}
                  className="rounded-2xl border border-[#E1E8E5] bg-white p-6 shadow-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-[#159B59]">
                      Question {i + 1}
                      {q.gapCategory ? ` • ${formatGapCategory(q.gapCategory)}` : ""}
                      {q.relatedFinding?.category ? ` • ${q.relatedFinding.category}` : ""}
                    </span>
                    <div className="flex items-center gap-2">
                      {isAnswered && (
                        <>
                          <SelfReportedBadge />
                          <span className="rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-semibold text-green-700">
                            {q.status === "approved" ? "Approved" : "Answered"}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <label
                    htmlFor={q.id}
                    className="mt-2 block text-base font-semibold text-[#001E2B]"
                  >
                    {q.question}
                  </label>

                  {q.relatedFinding?.claim && (
                    <div className="mt-2.5 rounded-lg border border-[#E8F0EC] bg-[#F8FBFA] px-3 py-2 text-xs text-[#4A5F5B]">
                      <span className="font-semibold text-[#001E2B]">Linked finding:</span>{" "}
                      {q.relatedFinding.claim}
                      {q.relatedFinding.source_id && (
                        <span className="ml-2 font-mono text-[#71817B]">
                          ({q.relatedFinding.source_id})
                        </span>
                      )}
                    </div>
                  )}

                  <textarea
                    id={q.id}
                    rows={3}
                    value={draft}
                    onChange={(e) =>
                      setAnswers((prev) => ({
                        ...prev,
                        [q.id]: e.target.value,
                      }))
                    }
                    placeholder="Enter your answer (min 2 characters)..."
                    className="mt-3 w-full rounded-lg border border-[#C9CFDC] p-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#001E2B]"
                  />

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] text-[#71817B]">
                      {lastSavedId === q.id ? (
                        <strong className="text-[#087A3D]">
                          Saved with Self-reported badge.
                        </strong>
                      ) : q.answeredAt ? (
                        `Last recorded ${new Date(q.answeredAt).toLocaleString()}`
                      ) : (
                        "Submitted answers receive a 'Self-reported' badge."
                      )}
                    </span>

                    <button
                      type="button"
                      onClick={() => handleAnswerSingle(q)}
                      disabled={
                        isSavingThis ||
                        submittingAll ||
                        draft.trim().length < 2 ||
                        (!isDirty && isAnswered)
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#001E2B] px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-[#023D35] disabled:bg-[#C9CFDC] disabled:text-[#4A5F5B]"
                    >
                      {isSavingThis && <Loader2 size={13} className="animate-spin" />}
                      {isSavingThis
                        ? "Saving..."
                        : isAnswered
                          ? "Update Answer"
                          : "Save Answer"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>

          <button
            type="button"
            onClick={handleSubmitAll}
            disabled={submittingAll || Boolean(submittingId)}
            className="mt-8 flex items-center justify-center gap-2 rounded-full bg-[#00ED64] px-8 py-3.5 text-sm font-semibold text-[#001E2B] transition-all hover:bg-[#00D75B] disabled:opacity-50"
          >
            {submittingAll && <Loader2 className="animate-spin" size={16} />}
            {submittingAll ? "Submitting to Backend..." : "Submit All Modified Answers"}
          </button>
        </>
      )}
    </main>
  );
}
