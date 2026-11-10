
import { useState } from "react";
import {
  CheckCircle2,
  Circle,
  ClipboardCheck,
  AlertCircle,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

const initialChecks = [
  { id: 1, title: "Project sources connected", done: true },
  { id: 2, title: "Project decisions reconstructed", done: true },
  { id: 3, title: "Pending tasks identified", done: true },
  { id: 4, title: "Blockers and dependencies reviewed", done: true },
  { id: 5, title: "Evidence verified", done: true },
  { id: 6, title: "Knowledge gaps resolved", done: false },
  { id: 7, title: "Team leader approval completed", done: false },
];

export default function ReadinessPanel() {
  const [checks, setChecks] = useState(initialChecks);

  const completed = checks.filter((item) => item.done).length;
  const percentage = Math.round((completed / checks.length) * 100);

  const status =
    completed === 7
      ? "Ready for Review"
      : completed >= 4
      ? "Needs Attention"
      : "In Progress";

  function toggleCheck(id) {
    setChecks((previous) =>
      previous.map((item) =>
        item.id === id
          ? { ...item, done: !item.done }
          : item
      )
    );
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
              Seven-point project handover checklist
            </CardDescription>
          </div>

          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              completed === 7
                ? "bg-green-50 text-green-700"
                : "bg-amber-50 text-amber-700"
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
              Completion progress
            </span>

            <span className="text-sm font-bold text-[#001E2B]">
              {completed}/7 ({percentage}%)
            </span>
          </div>

          <div className="h-2.5 overflow-hidden rounded-full bg-[#E8F0EB]">
            <div
              className="h-full rounded-full bg-[#159B59] transition-all duration-300"
              style={{ width: `${percentage}%` }}
            />
          </div>
        </div>

        <div className="space-y-3">
          {checks.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => toggleCheck(item.id)}
              className="flex w-full items-center gap-3 rounded-lg border border-transparent p-2 text-left transition hover:border-[#DCE9E3] hover:bg-[#F5F9F6]"
            >
              {item.done ? (
                <CheckCircle2
                  size={20}
                  className="shrink-0 text-[#159B59]"
                />
              ) : (
                <Circle
                  size={20}
                  className="shrink-0 text-[#A0ACA6]"
                />
              )}

              <span
                className={`flex-1 text-sm ${
                  item.done
                    ? "text-[#71817B]"
                    : "font-medium text-[#001E2B]"
                }`}
              >
                {item.title}
              </span>

              {item.done && (
                <span className="text-xs text-[#159B59]">
                  Done
                </span>
              )}
            </button>
          ))}
        </div>

        {completed < 7 && (
          <div className="mt-5 flex gap-2 rounded-lg bg-amber-50 p-3">
            <AlertCircle
              size={18}
              className="shrink-0 text-amber-600"
            />

            <p className="text-xs leading-5 text-amber-800">
              Complete the remaining checks before submitting
              the handover for approval.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
