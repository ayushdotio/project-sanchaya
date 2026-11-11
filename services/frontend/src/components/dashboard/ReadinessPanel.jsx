import { useState } from "react";
import {
  CheckCircle2,
  Circle,
  ClipboardCheck,
  AlertCircle,
  RefreshCw,
  Award,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

const CHECKLIST_ITEMS = [
  { key: "sourcesVerified", title: "Project sources imported & verified" },
  { key: "decisionsBackedByEvidence", title: "Technical decisions backed by evidence" },
  { key: "unfinishedTasksAssignedOrUnknown", title: "Unfinished tasks assigned or marked unknown" },
  { key: "blockersIdentified", title: "Blockers and dependencies identified" },
  { key: "conflictsDisclosed", title: "Conflicts and uncertainties disclosed" },
  { key: "recipientPermissionsChecked", title: "Recipient permissions checked" },
  { key: "leaderApprovalRecorded", title: "Team leader approval recorded" },
];

export default function ReadinessPanel({
  readiness = null,
  onEvaluate = null,
  onSignOff = null,
  isLeader = true,
  evaluating = false,
  signingOff = false,
}) {
  const checklist = readiness?.checklist || {};
  const status = readiness?.readinessStatus || "Needs Attention";

  const completedCount = CHECKLIST_ITEMS.filter((item) => Boolean(checklist[item.key])).length;
  const percentage = Math.round((completedCount / CHECKLIST_ITEMS.length) * 100);

  const isApproved = status === "Approved for Sharing";
  const canSignOff = completedCount >= 6 && !checklist.leaderApprovalRecorded;

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

        {/* Read-only checklist items: NO client-side clicking to ensure deterministic verification */}
        <div className="space-y-2.5">
          {CHECKLIST_ITEMS.map((item) => {
            const isDone = Boolean(checklist[item.key]);
            return (
              <div
                key={item.key}
                className="flex items-center gap-3 rounded-lg border border-[#F0F4F2] bg-[#FAFCFA] p-2.5 text-left"
              >
                {isDone ? (
                  <CheckCircle2 size={18} className="shrink-0 text-[#159B59]" />
                ) : (
                  <Circle size={18} className="shrink-0 text-[#A0ACA6]" />
                )}

                <span
                  className={`flex-1 text-xs sm:text-sm ${
                    isDone ? "text-[#2B3A36] font-medium" : "text-[#71817B]"
                  }`}
                >
                  {item.title}
                </span>

                <span
                  className={`text-xs font-semibold ${
                    isDone ? "text-[#159B59]" : "text-[#8E9B95]"
                  }`}
                >
                  {isDone ? "Verified" : "Pending"}
                </span>
              </div>
            );
          })}
        </div>

        {/* Informational banner */}
        {!isApproved && (
          <div className="mt-4 flex gap-2 rounded-lg bg-amber-50 p-3">
            <AlertCircle size={18} className="shrink-0 text-amber-600" />
            <p className="text-xs leading-5 text-amber-800">
              Checklist criteria are verified deterministically by the Analytics Service.
              Re-evaluating recalculates scores directly from current MongoDB evidence.
            </p>
          </div>
        )}

        {isApproved && (
          <div className="mt-4 flex gap-2 rounded-lg bg-green-50 p-3">
            <Award size={18} className="shrink-0 text-green-600" />
            <p className="text-xs leading-5 text-green-800">
              Project is signed off and approved for sharing with incoming engineers.
            </p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="mt-5 flex flex-wrap gap-2">
          {onEvaluate && (
            <button
              type="button"
              onClick={onEvaluate}
              disabled={evaluating}
              className="flex items-center gap-2 rounded-lg border border-[#DCE9E3] bg-white px-3.5 py-2 text-xs font-semibold text-[#001E2B] transition hover:bg-[#F5F9F6] disabled:opacity-50"
            >
              <RefreshCw size={14} className={evaluating ? "animate-spin" : ""} />
              {evaluating ? "Evaluating..." : "Evaluate Readiness"}
            </button>
          )}

          {isLeader && onSignOff && canSignOff && (
            <button
              type="button"
              onClick={onSignOff}
              disabled={signingOff}
              className="flex items-center gap-2 rounded-lg bg-[#001E2B] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#023D35] disabled:opacity-50"
            >
              <Award size={14} />
              {signingOff ? "Signing Off..." : "Sign-Off Handover"}
            </button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
