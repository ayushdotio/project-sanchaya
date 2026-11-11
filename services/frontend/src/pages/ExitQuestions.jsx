import { useEffect, useState } from "react";
import { getGapQuestions, answerGapQuestion } from "../api/gapsApi";
import { getFindings } from "../api/findingsApi";
import { SelfReportedBadge } from "../components/Badges";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

export default function ExitQuestions({ projectId = "", onComplete = null }) {
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [additionalInfo, setAdditionalInfo] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [answeredCount, setAnsweredCount] = useState(0);

  useEffect(() => {
    let active = true;

    async function loadQuestions() {
      setLoading(true);
      setError("");

      try {
        if (!projectId) {
          // If no specific project ID, return empty state
          setQuestions([]);
          setLoading(false);
          return;
        }

        // 1. First fetch real Gap Questions from backend Stage 4 engine
        const gapList = await getGapQuestions(projectId);

        if (!active) return;

        if (gapList && gapList.length > 0) {
          setQuestions(
            gapList.map((q) => ({
              id: q._id || q.id,
              question: q.question,
              category: q.category || "General",
              relatedFinding: q.relatedFindingId,
              status: q.status || "pending",
              existingAnswer: q.answer || "",
            }))
          );

          // Populate existing answers if any
          const initial = {};
          gapList.forEach((q) => {
            if (q.answer) {
              initial[q._id || q.id] = q.answer;
            }
          });
          setAnswers(initial);
        } else {
          // 2. If no gap questions generated yet, check non-supported findings as candidates
          const allFindings = await getFindings(projectId);
          if (!active) return;

          const candidateItems = allFindings
            .filter((f) => f.status !== "supported")
            .map((f) => ({
              id: f.id,
              question: `Clarify finding: ${f.claim}`,
              category: f.category || "Verification Gap",
              relatedFinding: f,
              status: "pending",
              existingAnswer: "",
            }));

          setQuestions(candidateItems);
        }
      } catch (err) {
        console.error("Failed to load gap questions:", err);
        if (active) {
          setError(err.message || "Failed to load gap questions from backend.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    loadQuestions();

    return () => {
      active = false;
    };
  }, [projectId]);

  async function handleSubmit() {
    setError("");
    setSubmitting(true);

    let submitted = 0;
    try {
      // Submit each answered question to POST /gap-questions/:questionId/answer
      for (const q of questions) {
        const ans = answers[q.id]?.trim();
        if (ans && ans.length >= 2) {
          if (projectId) {
            await answerGapQuestion(projectId, q.id, ans);
          }
          submitted++;
        }
      }

      setAnsweredCount(submitted);
      setSent(true);
      if (onComplete) {
        onComplete({ answeredCount: submitted, additionalInfo });
      }
    } catch (err) {
      console.error("Error submitting handover answers:", err);
      setError(err.message || "Failed to submit answers. Please try again.");
    } finally {
      setSubmitting(false);
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
            {answeredCount > 0
              ? `Successfully submitted ${answeredCount} self-reported answer(s) to the backend database. They are now linked with 'Self-reported' badges for your Team Leader and incoming engineers.`
              : "Your handover responses have been recorded."}
          </p>

          <p className="mt-2 text-xs text-[#71817B]">
            Deterministic Verification Rule: Answers from departing members are transparently badged and never disguise as system-verified evidence.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-5 py-10 sm:px-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-[#001E2B] sm:text-4xl">
            What only you know
          </h1>
          <p className="mt-2 text-[#4A5F5B]">
            Answer the targeted knowledge-gap questions below before your departure.
          </p>
        </div>

        <div className="pt-2">
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
        <div className="mt-8 rounded-2xl border border-dashed border-[#DCE9E3] bg-[#FAFCFA] p-8 text-center">
          <p className="text-base font-semibold text-[#001E2B]">
            No open gap questions for this project.
          </p>
          <p className="mt-1 text-sm text-[#71817B]">
            Either knowledge reconstruction has not identified any missing evidence, or all questions are already answered.
          </p>
        </div>
      ) : (
        <>
          <h2 className="mt-8 text-xl font-bold text-[#001E2B]">
            Targeted Gap Questions ({questions.length})
          </h2>

          <ul className="m-0 mt-5 list-none space-y-6 p-0">
            {questions.map((q, i) => (
              <li
                key={q.id}
                className="rounded-2xl border border-[#E1E8E5] bg-white p-6 shadow-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[#159B59]">
                    Question {i + 1} • {q.category}
                  </span>
                  {q.status === "answered" && (
                    <span className="rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-semibold text-green-700">
                      Answered
                    </span>
                  )}
                </div>

                <label
                  htmlFor={q.id}
                  className="mt-2 block text-base font-semibold text-[#001E2B]"
                >
                  {q.question}
                </label>

                <p className="mt-1 text-xs text-[#71817B]">
                  Provide technical context, undocumented details, or ownership clarifications.
                </p>

                <textarea
                  id={q.id}
                  rows={3}
                  value={answers[q.id] ?? ""}
                  onChange={(e) =>
                    setAnswers({
                      ...answers,
                      [q.id]: e.target.value,
                    })
                  }
                  placeholder="Enter your answer (min 2 characters)..."
                  className="mt-3 w-full rounded-lg border border-[#C9CFDC] p-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#001E2B]"
                />
              </li>
            ))}
          </ul>
        </>
      )}

      {/* Member-added information */}
      <section className="mt-10 rounded-2xl border border-[#CDE9D8] bg-[#F0F8F4] p-6">
        <h2 className="text-lg font-bold text-[#001E2B]">
          Additional Project Context
        </h2>

        <p className="mt-1 text-sm text-[#4A5F5B]">
          Is there anything important about the project architecture, credentials, or unfinished work that the system has not asked?
        </p>

        <textarea
          rows={5}
          value={additionalInfo}
          onChange={(e) => setAdditionalInfo(e.target.value)}
          placeholder="Add unrecorded decisions, pending tasks, blockers, or continuation advice for the incoming team..."
          className="mt-4 w-full rounded-lg border border-[#C9CFDC] bg-white p-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#001E2B]"
        />
      </section>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting}
        className="mt-8 flex items-center justify-center gap-2 rounded-full bg-[#00ED64] px-8 py-3.5 text-sm font-semibold text-[#001E2B] transition-all hover:bg-[#00D75B] disabled:opacity-50"
      >
        {submitting && <Loader2 className="animate-spin" size={16} />}
        {submitting ? "Submitting to Backend..." : "Submit My Handover Answers"}
      </button>
    </main>
  );
}
