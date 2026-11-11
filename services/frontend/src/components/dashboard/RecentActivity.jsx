import { useMemo } from "react";
import {
  GitBranch,
  FileUp,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  Award,
  FileText,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

export default function RecentActivity({
  findings = [],
  sources = [],
  history = [],
  activities: propActivities = null,
}) {
  const dynamicActivities = useMemo(() => {
    if (propActivities && propActivities.length > 0) {
      return propActivities;
    }

    const items = [];

    // History snapshots
    if (Array.isArray(history)) {
      history.slice(0, 3).forEach((h) => {
        items.push({
          id: `history-${h._id || h.id || Math.random()}`,
          title: `Handover Snapshot v${h.version || 1}`,
          description: h.acknowledgedBy
            ? `Acknowledged by incoming custodian (${h.acknowledgedBy.name || h.acknowledgedBy.email}).`
            : "Handover signed off and approved for sharing.",
          time: h.createdAt || h.acknowledgedAt || new Date().toISOString(),
          icon: Award,
          color: "bg-green-50 text-green-600",
        });
      });
    }

    // Findings reviews
    if (Array.isArray(findings)) {
      findings
        .filter((f) => f.review === "approved" || f.review_status === "approved")
        .slice(0, 3)
        .forEach((f) => {
          items.push({
            id: `finding-app-${f.id || f._id}`,
            title: "Finding Approved",
            description: `"${f.claim ? f.claim.slice(0, 60) + (f.claim.length > 60 ? "..." : "") : "Finding"}"`,
            time: f.reviewedAt || f.updatedAt || f.createdAt,
            icon: CheckCircle2,
            color: "bg-emerald-50 text-emerald-600",
          });
        });

      findings
        .filter((f) => (f.status || f.verification_status) === "Needs review" || (f.status || f.verification_status) === "needs_review")
        .slice(0, 2)
        .forEach((f) => {
          items.push({
            id: `finding-rev-${f.id || f._id}`,
            title: "Evidence Needs Review",
            description: `Candidate claim requires verification: ${f.claim ? f.claim.slice(0, 50) + "..." : "Claim"}`,
            time: f.createdAt,
            icon: AlertCircle,
            color: "bg-amber-50 text-amber-600",
          });
        });
    }

    // Sources ingested
    if (Array.isArray(sources)) {
      sources.slice(0, 3).forEach((s) => {
        const isGithub = (s.type || s.source_type || "").toLowerCase().includes("git");
        items.push({
          id: `source-${s.id || s.source_id || Math.random()}`,
          title: isGithub ? "GitHub Activity Synced" : "Source Document Ingested",
          description: `${s.title || s.raw_filename || s.source_id} (${s.type || s.source_type || "Source"})`,
          time: s.importedAt || s.createdAt,
          icon: isGithub ? GitBranch : FileUp,
          color: isGithub ? "bg-blue-50 text-blue-600" : "bg-purple-50 text-purple-600",
        });
      });
    }

    // Sort by timestamp descending
    items.sort((a, b) => new Date(b.time || 0).getTime() - new Date(a.time || 0).getTime());

    if (items.length > 0) {
      return items.slice(0, 5);
    }

    // Default placeholder events if workspace is newly created
    return [
      {
        id: "default-1",
        title: "Workspace Initialized",
        description: "Deterministic 5-stage handover environment created.",
        time: new Date().toISOString(),
        icon: Sparkles,
        color: "bg-emerald-50 text-emerald-600",
      },
      {
        id: "default-2",
        title: "Stage 1 Connect Ready",
        description: "Connect GitHub repo or upload meeting notes to begin.",
        time: new Date().toISOString(),
        icon: GitBranch,
        color: "bg-blue-50 text-blue-600",
      },
    ];
  }, [findings, sources, history, propActivities]);

  function formatTime(iso) {
    if (!iso) return "Recently";
    try {
      const date = new Date(iso);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffMins < 1) return "Just now";
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays === 1) return "Yesterday";
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
    } catch {
      return "Recently";
    }
  }

  return (
    <Card className="border-[#E1EAE5] bg-white shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg text-[#001E2B]">
          Recent Activity
        </CardTitle>

        <CardDescription>
          Live updates and evidence events from your project workspace
        </CardDescription>
      </CardHeader>

      <CardContent>
        <div className="space-y-5">
          {dynamicActivities.map((activity, index) => {
            const Icon = activity.icon;

            return (
              <div key={activity.id} className="relative flex gap-4">
                {index !== dynamicActivities.length - 1 && (
                  <div className="absolute left-[19px] top-11 h-full w-px bg-[#E5EEE9]" />
                )}

                <div
                  className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${activity.color}`}
                >
                  <Icon size={18} />
                </div>

                <div className="min-w-0 flex-1 pb-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold text-[#001E2B]">
                      {activity.title}
                    </h3>

                    <span className="flex items-center gap-1 text-xs text-[#84918B]">
                      <Clock size={12} />
                      {formatTime(activity.time)}
                    </span>
                  </div>

                  <p className="mt-1 text-sm leading-5 text-[#64756F]">
                    {activity.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
