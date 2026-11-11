import { useState } from "react";
import {
  CheckCircle2,
  Circle,
  ClipboardCheck,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  Award,
  SlidersHorizontal,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

const CHECKLIST_ITEMS = [
  { id: 1, key: "sourcesVerified", title: "Project sources imported & verified" },
  { id: 2, key: "decisionsBackedByEvidence", title: "Technical decisions backed by evidence" },
  { id: 3, key: "unfinishedTasksAssignedOrUnknown", title: "Unfinished tasks assigned or marked unknown" },
  { id: 4, key: "blockersIdentified", title: "Blockers and dependencies identified" },
  { id: 5, key: "conflictsDisclosed", title: "Conflicts and uncertainties disclosed" },
  { id: 6, key: "recipientPermissionsChecked", title: "Recipient permissions checked" },
  { id: 7, key: "leaderApprovalRecorded", title: "Team leader approval recorded" },
];

export default function ReadinessPanel({
  readiness = null,
  evaluationResult = null,
  onEvaluate = null,
  onSignOff = null,
  isLeader = true,
  evaluating = false,
  signingOff = false,
  actionError = "",
  actionMessage = "",
}) {
  const [showOverrides, setShowOverrides] = useState(false);
  const [manualOverrides, setManualOverrides] = useState({});
  const [evaluateBeforeSignOff, setEvaluateBeforeSignOff] = useState(false);

  const checklist = readiness?.checklist || {};
  const status = readiness?.readinessStatus || "Needs Attention";
  const approvedBy = readiness?.approvedBy;
  const approvedAt = readiness?.approvedAt;
  const approvedSnapshotHash = readiness?.approvedSnapshotHash || "";

  const rulesById = {};
  const rulesList = evaluationResult?.riskSummary?.rules;
  if (Array.isArray(rulesList)) {
    rulesList.forEach((rule) => {
      if (rule?.id !== undefined) {
        rulesById[rule.id] = rule;
      }
    });
  }

  const completedCount = CHECKLIST_ITEMS.filter((item) => Boolean(checklist[item.key])).length;
  const percentage = Math.round((completedCount / CHECKLIST_ITEMS.length) * 100);

  const isApproved = status === "Approved for Sharing";

  function handleToggleOverride(key, currentValue) {
    setManualOverrides((prev) => {
      const nextVal =
        prev[key] !== undefined ? !prev[key] : !currentValue;
      return { ...prev, [key]: nextVal };
    });
  }

  function handleSignOffClick() {
    if (!onSignOff) return;
    const hasOverrides = Object.keys(manualOverrides).length > 0;
    const options = {};
    if (evaluateBeforeSignOff) {
      options.evaluateWithAnalytics = true;
    }
    if (hasOverrides) {
      options.checklistUpdates = manualOverrides;
    }
    onSignOff(options);
  }

  return (
    <Card className="border-[#E1EAE5] bg-white shadow-sm">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg text-[#001E2B]">
              <ClipboardCheck size={20} className="text-[#159B59]" />
              Handover Readiness
            </CardTitle>

            <CardDescription className="mt-1">
              7-Point Deterministic Readiness Checklist
            </CardDescription>
          </div>

          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              isApproved
                ? "bg-green-100 text-green-800"
                : status === "Ready for Review"
                ? "bg-blue-100 text-blue-800"
                : "bg-amber-100 text-amber-800"
            }`}
          >
            {status}
          </span>
        </div>
      </CardHeader>

      <CardContent>
        <div className="mb-6">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-[#4A5F5B]">
              Deterministic verification progress
            </span>

            <span className="text-sm font-bold text-[#001E2B]">
              {completedCount}/7 ({percentage}%)
            </span>
          </div>

          <div className="h-2.5 overflow-hidden rounded-full bg-[#E8F0EB]">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                isApproved ? "bg-[#159B59]" : percentage >= 70 ? "bg-blue-600" : "bg-amber-500"
              }`}
              style={{ width: `${percentage}%` }}
            />
          </div>
        </div>

        {/* 7-Point Checklist */}
        <div className="space-y-2.5">
          {CHECKLIST_ITEMS.map((item) => {
            const isDone = Boolean(checklist[item.key]);
            const ruleMeta = rulesById[item.id];
            const reasons = Array.isArray(ruleMeta?.reasons) ? ruleMeta.reasons : [];
            const overrideVal =
              manualOverrides[item.key] !== undefined
                ? manualOverrides[item.key]
                : isDone;

            return (
              <div
                key={item.key}
                className="rounded-lg border border-[#F0F4F2] bg-[#FAFCFA] p-2.5 text-left"
              >
                <div className="flex items-center gap-3">
                  {isDone ? (
                    <CheckCircle2 size={18} className="shrink-0 text-[#159B59]" />
                  ) : (
                    <Circle size={18} className="shrink-0 text-[#A0ACA6]" />
                  )}

                  <span
                    className={`flex-1 text-xs sm:text-sm ${
                      isDone ? "font-medium text-[#2B3A36]" : "text-[#71817B]"
                    }`}
                  >
                    {item.title}
                  </span>

                  {showOverrides && item.key !== "leaderApprovalRecorded" ? (
                    <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-[#001E2B]">
                      <input
                        type="checkbox"
                        checked={Boolean(overrideVal)}
                        onChange={() => handleToggleOverride(item.key, isDone)}
                        className="h-3.5 w-3.5 rounded border-[#C9CFDC]"
                      />
                      Confirm
                    </label>
                  ) : (
                    <span
                      className={`text-xs font-semibold ${
                        isDone ? "text-[#159B59]" : "text-[#8E9B95]"
                      }`}
                    >
                      {isDone ? "Verified" : "Pending"}
                    </span>
                  )}
                </div>

                {!isDone && reasons.length > 0 && (
                  <ul className="mt-1.5 ml-7 list-disc space-y-0.5 pl-2 text-[11px] text-[#9A681D]">
                    {reasons.slice(0, 3).map((reason, rIdx) => (
                      <li key={rIdx}>{reason}</li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>

        {/* Informational banner */}
        {!isApproved && (
          <div className="mt-4 flex gap-2 rounded-lg bg-amber-50 p-3">
            <AlertCircle size={18} className="shrink-0 text-amber-600" />
            <p className="text-xs leading-5 text-amber-800">
              Checklist criteria are evaluated deterministically by the Analytics Service.
              Run Evaluate Readiness to inspect failing rule details before Team Leader sign-off.
            </p>
          </div>
        )}

        {isApproved && (
          <div className="mt-4 flex gap-2 rounded-lg bg-green-50 p-3">
            <Award size={18} className="shrink-0 text-green-600" />
            <div className="text-xs leading-5 text-green-800">
              <p className="font-semibold">
                Project is signed off and approved for sharing with incoming engineers.
              </p>
              {(approvedBy || approvedAt || approvedSnapshotHash) && (
                <p className="mt-0.5 text-green-700">
                  {approvedBy ? `Approved by ${approvedBy.name || approvedBy.email}` : "Approved"}
                  {approvedAt ? ` on ${new Date(approvedAt).toLocaleString()}` : ""}
                  {approvedSnapshotHash
                    ? ` · Snapshot ${String(approvedSnapshotHash).slice(0, 12)}`
                    : ""}
                </p>
              )}
            </div>
          </div>
        )}

        {actionMessage && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-[#CDE9D8] bg-[#EAF8EF] p-3 text-xs text-[#087A3D]">
            <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
            <span>{actionMessage}</span>
          </div>
        )}

        {actionError && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-[#F1D7D2] bg-[#FFF5F3] p-3 text-xs text-[#A33F32]">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            <span>{actionError}</span>
          </div>
        )}

        {isLeader && !isApproved && showOverrides && (
          <label className="mt-3 flex items-center gap-2 text-xs text-[#4A5F5B]">
            <input
              type="checkbox"
              checked={evaluateBeforeSignOff}
              onChange={(e) => setEvaluateBeforeSignOff(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-[#C9CFDC]"
            />
            Re-evaluate via Analytics Service during sign-off
          </label>
        )}

        {/* Action Buttons */}
        {isLeader && (
          <div className="mt-5 flex flex-wrap items-center gap-2">
            {onEvaluate && (
              <button
                type="button"
                onClick={onEvaluate}
                disabled={evaluating || signingOff}
                className="flex items-center gap-2 rounded-lg border border-[#DCE9E3] bg-white px-3.5 py-2 text-xs font-semibold text-[#001E2B] transition hover:bg-[#F5F9F6] disabled:opacity-50"
              >
                <RefreshCw size={14} className={evaluating ? "animate-spin" : ""} />
                {evaluating ? "Evaluating..." : "Evaluate Readiness"}
              </button>
            )}

            {onSignOff && !isApproved && (
              <>
                <button
                  type="button"
                  onClick={handleSignOffClick}
                  disabled={signingOff || evaluating}
                  className="flex items-center gap-2 rounded-lg bg-[#001E2B] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#023D35] disabled:opacity-50"
                >
                  <Award size={14} />
                  {signingOff ? "Signing Off..." : "Sign-Off Handover"}
                </button>

                <button
                  type="button"
                  onClick={() => setShowOverrides((prev) => !prev)}
                  className="flex items-center gap-1.5 rounded-lg border border-[#DCE9E3] bg-[#F8FCF9] px-3 py-2 text-xs font-semibold text-[#4A5F5B] transition hover:text-[#001E2B]"
                >
                  <SlidersHorizontal size={13} />
                  {showOverrides ? "Hide Confirmations" : "Checklist Overrides"}
                </button>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
