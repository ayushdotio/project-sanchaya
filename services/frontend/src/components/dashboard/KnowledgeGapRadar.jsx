import { useMemo, useState } from "react";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

import { AlertTriangle, CircleHelp, ArrowRight, CheckCircle2, MessageSquare } from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { SelfReportedBadge } from "../Badges";

const RADAR_CATEGORIES = [
  { subject: "Decisions", key: "decision" },
  { subject: "Tasks", key: "task" },
  { subject: "Dependencies", key: "dependency" },
  { subject: "Blockers", key: "blocker" },
  { subject: "Ownership", key: "ownership" },
];

function resolveQuestionCategory(q) {
  const relCat = (q?.relatedFindingId?.category || q?.category || "").toLowerCase();
  if (relCat) return relCat;
  if (q?.gap_category === "missing_owner") return "ownership";
  if (q?.gap_category === "missing_rationale") return "decision";
  return "";
}

function buildRadarData(gapsData, gapQuestions) {
  const unresolved = Array.isArray(gapsData?.unresolvedFindings)
    ? gapsData.unresolvedFindings
    : [];
  const pendingFromGaps = Array.isArray(gapsData?.pendingQuestions)
    ? gapsData.pendingQuestions
    : [];
  const pendingQuestions =
    pendingFromGaps.length > 0
      ? pendingFromGaps
      : (Array.isArray(gapQuestions) ? gapQuestions : []).filter(
          (q) => q.status === "pending"
        );

  return RADAR_CATEGORIES.map((cat) => {
    const findingCount = unresolved.filter((f) => {
      const fCat = (f.category || "").toLowerCase();
      if (cat.key === "ownership") {
        return !f.owner && (fCat === "task" || fCat === "blocker");
      }
      return fCat === cat.key;
    }).length;

    const questionCount = pendingQuestions.filter(
      (q) => resolveQuestionCategory(q) === cat.key
    ).length;

    const gapCount = findingCount + questionCount;
    const score = Math.max(20, Math.min(100, 100 - gapCount * 15));
    return {
      subject: cat.subject,
      completeness: score,
    };
  });
}

function formatGapCategoryLabel(gapCategory) {
  if (!gapCategory) return "";
  return gapCategory.replace(/_/g, " ");
}

export default function KnowledgeGapRadar({
  gapsData = null,
  gapQuestions = [],
  onReviewGaps = null,
  onOpenGapLoop = null,
}) {
  const [activeTab, setActiveTab] = useState("pending");
  const [showAll, setShowAll] = useState(false);

  const radarData = useMemo(
    () => buildRadarData(gapsData, gapQuestions),
    [gapsData, gapQuestions]
  );

  const unresolvedFindings = Array.isArray(gapsData?.unresolvedFindings)
    ? gapsData.unresolvedFindings
    : [];
  const pendingFromGaps = Array.isArray(gapsData?.pendingQuestions)
    ? gapsData.pendingQuestions
    : [];
  const allQuestions = Array.isArray(gapQuestions) ? gapQuestions : [];

  const pendingQuestions =
    pendingFromGaps.length > 0
      ? pendingFromGaps
      : allQuestions.filter((q) => q.status === "pending");

  const answeredQuestions = allQuestions.filter(
    (q) => q.status === "answered" || q.status === "approved"
  );

  const openCount =
    gapsData?.totalGapsCount ??
    pendingQuestions.length + unresolvedFindings.length;

  return (
    <Card className="border-[#E1EAE5] bg-white shadow-sm">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg text-[#001E2B]">
              <AlertTriangle size={20} className="text-amber-600" />
              Knowledge Gap Radar
            </CardTitle>

            <CardDescription className="mt-1">
              Areas where evidence is missing, conflicting, or awaiting clarification in the Stage 4 Gap Loop
            </CardDescription>
          </div>

          <div className="flex items-center gap-2">
            <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
              {openCount} Open Gaps
            </span>
            {answeredQuestions.length > 0 && (
              <span className="rounded-full bg-[#E0F2FE] px-3 py-1 text-xs font-semibold text-[#0369A1]">
                {answeredQuestions.length} Answered
              </span>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <div className="h-[260px] w-full">
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <RadarChart data={radarData} outerRadius="72%">
              <PolarGrid stroke="#E5EEE9" />

              <PolarAngleAxis
                dataKey="subject"
                tick={{
                  fill: "#64756F",
                  fontSize: 11,
                }}
              />

              <PolarRadiusAxis
                angle={90}
                domain={[0, 100]}
                tick={false}
                axisLine={false}
              />

              <Radar
                name="Information completeness"
                dataKey="completeness"
                stroke="#159B59"
                fill="#159B59"
                fillOpacity={0.25}
                strokeWidth={2}
              />

              <Tooltip
                formatter={(value) => [`${value}%`, "Information completeness"]}
                contentStyle={{
                  borderRadius: "12px",
                  border: "1px solid #E1EAE5",
                }}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* Switch between Open Gaps & All Gap-Loop Answers */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-b border-[#E5EEE9] pb-2.5">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setActiveTab("pending");
                setShowAll(false);
              }}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                activeTab === "pending"
                  ? "bg-[#001E2B] text-white"
                  : "bg-[#F4FAF6] text-[#4A5F5B] hover:bg-[#EAF8EF]"
              }`}
            >
              Pending Questions ({pendingQuestions.length})
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab("all");
                setShowAll(false);
              }}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                activeTab === "all"
                  ? "bg-[#001E2B] text-white"
                  : "bg-[#F4FAF6] text-[#4A5F5B] hover:bg-[#EAF8EF]"
              }`}
            >
              All Questions & Answers ({allQuestions.length})
            </button>
            {unresolvedFindings.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setActiveTab("findings");
                  setShowAll(false);
                }}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  activeTab === "findings"
                    ? "bg-[#001E2B] text-white"
                    : "bg-[#F4FAF6] text-[#4A5F5B] hover:bg-[#EAF8EF]"
                }`}
              >
                Unresolved Findings ({unresolvedFindings.length})
              </button>
            )}
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {activeTab === "pending" && (
            <>
              {pendingQuestions.length === 0 ? (
                <p className="text-xs text-[#71817B]">
                  No pending gap questions. All generated gap questions have been answered or all findings have verifiable evidence.
                </p>
              ) : (
                <>
                  {(showAll ? pendingQuestions : pendingQuestions.slice(0, 5)).map((q, idx) => {
                    const categoryLabel =
                      q.relatedFindingId?.category ||
                      formatGapCategoryLabel(q.gap_category) ||
                      q.category ||
                      "General";
                    return (
                      <div
                        key={q._id || q.id || idx}
                        className="flex gap-3 rounded-xl border border-[#E5EEE9] p-3.5"
                      >
                        <CircleHelp
                          size={18}
                          className="mt-0.5 shrink-0 text-amber-600"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium leading-5 text-[#001E2B]">
                            {q.question}
                          </p>
                          {q.relatedFindingId?.claim && (
                            <p className="mt-1 text-xs text-[#64756F]">
                              Related claim: {q.relatedFindingId.claim}
                            </p>
                          )}
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <span className="inline-block rounded-full bg-[#F0F8F4] px-2.5 py-0.5 text-[11px] font-semibold capitalize text-[#4A5F5B]">
                              {categoryLabel}
                            </span>
                            {q.relatedFindingId?.source_id && (
                              <span className="font-mono text-[11px] text-[#71817B]">
                                {q.relatedFindingId.source_id}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {pendingQuestions.length > 5 && (
                    <button
                      type="button"
                      onClick={() => setShowAll((prev) => !prev)}
                      className="text-xs font-semibold text-[#159B59] hover:underline"
                    >
                      {showAll
                        ? "Show fewer pending questions"
                        : `Show all ${pendingQuestions.length} pending questions`}
                    </button>
                  )}
                </>
              )}
            </>
          )}

          {activeTab === "all" && (
            <>
              {allQuestions.length === 0 ? (
                <p className="text-xs text-[#71817B]">
                  No gap questions generated yet. Run Stage 2 reconstruction to detect knowledge gaps.
                </p>
              ) : (
                <>
                  {(showAll ? allQuestions : allQuestions.slice(0, 8)).map((q, idx) => {
                    const isAnswered = q.status === "answered" || q.status === "approved";
                    return (
                      <div
                        key={q._id || q.id || idx}
                        className={`rounded-xl border p-3.5 ${
                          isAnswered
                            ? "border-[#BAE6FD] bg-[#F4FAFD]"
                            : "border-[#E5EEE9] bg-white"
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#001E2B]">
                            {isAnswered ? (
                              <CheckCircle2 size={14} className="text-[#0284C7]" />
                            ) : (
                              <MessageSquare size={14} className="text-amber-600" />
                            )}
                            {isAnswered ? "Answered" : "Pending"}
                          </span>
                          {isAnswered && <SelfReportedBadge />}
                        </div>

                        <p className="mt-1.5 text-sm font-medium text-[#001E2B]">
                          {q.question}
                        </p>

                        {isAnswered && q.answer && (
                          <div className="mt-2.5 rounded-lg border border-[#D5EBF8] bg-white p-3 text-xs text-[#29483B]">
                            <p className="font-semibold text-[#0369A1]">
                              Outgoing member response:
                            </p>
                            <p className="mt-1 whitespace-pre-wrap leading-5">{q.answer}</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {allQuestions.length > 8 && (
                    <button
                      type="button"
                      onClick={() => setShowAll((prev) => !prev)}
                      className="text-xs font-semibold text-[#159B59] hover:underline"
                    >
                      {showAll
                        ? "Show fewer questions"
                        : `Show all ${allQuestions.length} questions`}
                    </button>
                  )}
                </>
              )}
            </>
          )}

          {activeTab === "findings" && (
            <>
              {(showAll ? unresolvedFindings : unresolvedFindings.slice(0, 6)).map((f, idx) => (
                <div
                  key={f._id || f.id || idx}
                  className="rounded-xl border border-[#F1E2C7] bg-[#FFFDF8] p-3.5 text-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold uppercase tracking-wide text-[#9A681D]">
                      {f.category} · {f.verification_status}
                    </span>
                    {f.source_id && (
                      <span className="font-mono text-[#71817B]">{f.source_id}</span>
                    )}
                  </div>
                  <p className="mt-1 text-sm font-medium text-[#001E2B]">{f.claim}</p>
                  {(f.owner || f.explanation) && (
                    <p className="mt-1 text-[#64756F]">
                      {f.owner ? `Owner: ${f.owner}` : ""}
                      {f.owner && f.explanation ? " · " : ""}
                      {f.explanation || ""}
                    </p>
                  )}
                </div>
              ))}
              {unresolvedFindings.length > 6 && (
                <button
                  type="button"
                  onClick={() => setShowAll((prev) => !prev)}
                  className="text-xs font-semibold text-[#159B59] hover:underline"
                >
                  {showAll
                    ? "Show fewer unresolved findings"
                    : `Show all ${unresolvedFindings.length} unresolved findings`}
                </button>
              )}
            </>
          )}
        </div>

        {(onReviewGaps || onOpenGapLoop) && (
          <div className="mt-4 flex flex-wrap gap-2">
            {onReviewGaps && (
              <button
                type="button"
                onClick={onReviewGaps}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-[#DCE9E3] py-2.5 px-4 text-sm font-semibold text-[#087A3D] transition hover:bg-[#F0F8F4]"
              >
                Review Knowledge Gaps
                <ArrowRight size={16} />
              </button>
            )}
            {onOpenGapLoop && (
              <button
                type="button"
                onClick={onOpenGapLoop}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#159B59] py-2.5 px-4 text-sm font-semibold text-white transition hover:bg-[#087A3D]"
              >
                Answer Gap Questions
                <ArrowRight size={16} />
              </button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
