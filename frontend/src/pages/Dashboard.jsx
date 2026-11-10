import { useEffect, useState } from "react";
import { getDashboardData } from "@/services/dashboardApi";

import StatsCard from "@/components/dashboard/StatsCard";
import FindingChart from "@/components/dashboard/FindingChart";
import ContributionChart from "@/components/dashboard/ContributionChart";
import RecentActivity from "@/components/dashboard/RecentActivity";
import ReadinessPanel from "@/components/dashboard/ReadinessPanel";
import KnowledgeGapRadar from "@/components/dashboard/KnowledgeGapRadar";
import SourceManagement from "@/components/dashboard/SourceManagement";

import { Button } from "@/components/ui/button";
import {
  RefreshCw,
  FolderKanban,
  CalendarDays,
  ShieldCheck,
  ClipboardCheck,
  ArrowUpRight,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Clock3,
  Sparkles,
} from "lucide-react";

export default function Dashboard({
  user,
  onNavigate,
  shared,
  approvedCount,
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  async function loadDashboard() {
    setLoading(true);

    try {
      const result = await getDashboardData();
      setData(result);
      setRefreshKey((prev) => prev + 1);
    } catch (error) {
      console.error("Dashboard loading failed:", error);
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  if (loading && !data) {
    return (
      <main className="min-h-[70vh] bg-[#F6FAF8] px-5 py-20">
        <div className="mx-auto max-w-7xl rounded-3xl border border-[#E1ECE6] bg-white px-6 py-16 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#E8F8EF]">
            <RefreshCw className="animate-spin text-[#159B59]" size={25} />
          </div>
          <h2 className="text-lg font-semibold text-[#001E2B]">
            Preparing your workspace
          </h2>
          <p className="mt-2 text-sm text-[#71817B]">
            Loading Team Leader Dashboard...
          </p>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="min-h-[70vh] bg-[#F6FAF8] px-5 py-16">
        <div className="mx-auto max-w-xl rounded-3xl border border-[#E1ECE6] bg-white p-10 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FFF3E8]">
            <AlertTriangle className="text-[#C47732]" size={25} />
          </div>
          <h2 className="mt-4 text-xl font-bold text-[#001E2B]">
            Dashboard data unavailable
          </h2>
          <p className="mt-2 text-sm leading-6 text-[#71817B]">
            We could not load the workspace information. Please try again.
          </p>
          <Button
            onClick={loadDashboard}
            className="mt-6 gap-2 rounded-xl bg-[#159B59] px-5 text-white hover:bg-[#087A3D]"
          >
            <RefreshCw size={16} />
            Try Again
          </Button>
        </div>
      </main>
    );
  }

  if (user?.role !== "leader") {
    return (
      <main className="min-h-[70vh] bg-[#F6FAF8] px-5 py-16 sm:px-8">
        <section className="mx-auto max-w-3xl rounded-3xl border border-[#E1ECE6] bg-white p-10 text-center shadow-sm">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#E8F8EF]">
            <FolderKanban size={30} className="text-[#159B59]" />
          </div>
          <h1 className="mt-5 text-2xl font-bold tracking-tight text-[#001E2B]">
            Your Role Dashboard
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[#71817B]">
            Your workspace will show information and actions based on your
            role in the Sanchaya project.
          </p>
        </section>
      </main>
    );
  }

  const stats = [
    {
      title: "Total Findings",
      value: data.stats.total,
      description: "All reconstructed findings",
      type: "total",
    },
    {
      title: "Supported",
      value: data.stats.supported,
      description: "Evidence-backed findings",
      type: "supported",
    },
    {
      title: "Needs Review",
      value: data.stats.needsReview,
      description: "Awaiting verification",
      type: "review",
    },
    {
      title: "Conflicting",
      value: data.stats.conflicting,
      description: "Conflicting evidence",
      type: "conflicting",
    },
  ];

  return (
    <main className="dashboard-page min-h-screen bg-[#F6FAF8]">
      <div className="mx-auto max-w-[1440px] px-4 py-7 sm:px-7 lg:px-10 lg:py-9">
        {/* Page heading */}
        <header className="dashboard-enter mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#D8EEE1] bg-white px-3 py-1.5 text-[11px] font-bold tracking-[0.16em] text-[#12834B] shadow-sm">
              <span className="h-2 w-2 rounded-full bg-[#159B59]" />
              SANCHAYA WORKSPACE
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-[#001E2B] sm:text-[2.35rem]">
              Team Leader Dashboard
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#71817B] sm:text-[15px]">
              Welcome back, {user?.name || "Team Leader"}. Monitor project
              knowledge, verify findings, and prepare the team handover.
            </p>
          </div>

          <Button
            variant="outline"
            onClick={loadDashboard}
            disabled={loading}
            className="h-10 gap-2 self-start rounded-xl border-[#D8E7DF] bg-white px-4 text-[#24483A] shadow-sm transition hover:border-[#159B59] hover:bg-[#F1FAF5] md:self-auto"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
            {loading ? "Refreshing..." : "Refresh data"}
          </Button>
        </header>

        {/* Project summary */}
        <section className="dashboard-enter dashboard-delay-1 relative mb-8 overflow-hidden rounded-3xl border border-[#D8EADF] bg-white shadow-[0_12px_40px_rgba(15,75,48,0.06)]">
          <div className="absolute right-0 top-0 h-48 w-48 translate-x-16 -translate-y-20 rounded-full bg-[#E8F8EF] blur-2xl" />
          <div className="absolute bottom-0 right-24 h-28 w-28 translate-y-14 rounded-full bg-[#DDF3E6] blur-2xl" />

          <div className="relative p-6 sm:p-8">
            <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
              <div>
                <div className="mb-3 flex items-center gap-2 text-xs font-bold tracking-[0.15em] text-[#159B59]">
                  <Sparkles size={15} />
                  ACTIVE PROJECT
                </div>
                <h2 className="text-2xl font-bold tracking-tight text-[#001E2B] sm:text-3xl">
                  Sanchaya
                </h2>
                <p className="mt-2 text-sm text-[#71817B]">
                  Preserving Knowledge. Connecting People. Continuing Projects.
                </p>
              </div>

              <div
                className={`inline-flex w-fit items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold ${
                  shared
                    ? "border-[#CDE9D8] bg-[#EAF8EF] text-[#087A3D]"
                    : "border-[#F1E2C7] bg-[#FFF8EC] text-[#9A681D]"
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    shared ? "bg-[#159B59]" : "bg-[#D99A35]"
                  }`}
                />
                {shared ? "Handover Shared" : "Handover In Progress"}
              </div>
            </div>

            <div className="mt-7 flex flex-col justify-between gap-4 border-t border-[#EAF1ED] pt-5 sm:flex-row sm:items-center">
              <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm text-[#64756F]">
                <span className="inline-flex items-center gap-2">
                  <FolderKanban size={15} className="text-[#159B59]" />
                  Team: <strong className="font-semibold text-[#29483B]">Epsilum</strong>
                </span>
                <span className="inline-flex items-center gap-2">
                  <ShieldCheck size={15} className="text-[#159B59]" />
                  Role: <strong className="font-semibold text-[#29483B]">Team Leader</strong>
                </span>
                <span className="inline-flex items-center gap-2">
                  <CalendarDays size={15} className="text-[#159B59]" />
                  Project Workspace
                </span>
              </div>

              <Button
                onClick={() => onNavigate("sources")}
                className="h-10 gap-2 rounded-xl bg-[#159B59] px-5 text-white shadow-sm transition hover:bg-[#087A3D]"
              >
                <FolderKanban size={16} />
                Add Project Sources
                <ArrowUpRight size={15} />
              </Button>
            </div>
          </div>
        </section>

        {/* Sources */}
        <section className="dashboard-enter dashboard-delay-1 mb-9">
          <div className="mb-4 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#E5F6EC] text-[#159B59]">
              <FolderKanban size={16} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#001E2B]">Project Sources</h2>
              <p className="text-xs text-[#82918B]">
                Manage the material used to reconstruct project knowledge.
              </p>
            </div>
          </div>
          <SourceManagement />
        </section>

        {/* Findings statistics */}
        <section className="dashboard-enter dashboard-delay-2 mb-9">
          <div className="mb-5 flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
            <div>
              <p className="mb-1 text-[11px] font-bold tracking-[0.16em] text-[#159B59]">
                EVIDENCE SNAPSHOT
              </p>
              <h2 className="text-xl font-bold tracking-tight text-[#001E2B] sm:text-2xl">
                Findings Overview
              </h2>
              <p className="mt-1 text-sm text-[#71817B]">
                Monitor reconstructed information and its verification status.
              </p>
            </div>
            <div className="inline-flex items-center gap-2 text-xs font-medium text-[#82918B]">
              <Activity size={14} />
              Workspace summary
            </div>
          </div>

          <div
            key={refreshKey}
            className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
          >
            {stats.map((item, index) => (
              <div
                key={item.type}
                className="dashboard-enter"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <StatsCard {...item} />
              </div>
            ))}
          </div>
        </section>

        {/* Analytics */}
        <section className="dashboard-enter dashboard-delay-3 mb-9">
          <div className="mb-5">
            <p className="mb-1 text-[11px] font-bold tracking-[0.16em] text-[#159B59]">
              PROJECT INSIGHTS
            </p>
            <h2 className="text-xl font-bold tracking-tight text-[#001E2B] sm:text-2xl">
              Project Analytics
            </h2>
            <p className="mt-1 text-sm text-[#71817B]">
              Review evidence status and recorded contribution distribution.
            </p>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <div className="dashboard-enter dashboard-delay-1 min-w-0">
              <FindingChart />
            </div>
            <div className="dashboard-enter dashboard-delay-2 min-w-0">
              <ContributionChart />
            </div>
          </div>

          <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-[#82918B]">
            <ShieldCheck size={14} className="mt-0.5 shrink-0" />
            Contribution data represents recorded activity, not proof of
            expertise or individual performance.
          </p>
        </section>

        {/* Progress */}
        <section className="dashboard-enter dashboard-delay-4 mb-9">
          <div className="mb-5">
            <p className="mb-1 text-[11px] font-bold tracking-[0.16em] text-[#159B59]">
              HANDOVER TRACKER
            </p>
            <h2 className="text-xl font-bold tracking-tight text-[#001E2B] sm:text-2xl">
              Project Progress
            </h2>
            <p className="mt-1 text-sm text-[#71817B]">
              Follow recent activity and overall handover readiness.
            </p>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <RecentActivity />
            <ReadinessPanel />
          </div>
        </section>

        {/* Knowledge gaps */}
        <section className="dashboard-enter dashboard-delay-5 mb-9">
          <div className="mb-5">
            <p className="mb-1 text-[11px] font-bold tracking-[0.16em] text-[#159B59]">
              WHAT NEEDS ATTENTION
            </p>
            <h2 className="text-xl font-bold tracking-tight text-[#001E2B] sm:text-2xl">
              Knowledge Gaps
            </h2>
            <p className="mt-1 text-sm text-[#71817B]">
              Identify areas where project knowledge may be incomplete.
            </p>
          </div>
          <KnowledgeGapRadar />
        </section>

        {/* Leader action */}
        <section className="dashboard-enter dashboard-delay-5 relative overflow-hidden rounded-3xl border border-[#CDE9D8] bg-gradient-to-br from-[#EAF8EF] via-[#F4FBF6] to-white p-6 shadow-[0_10px_30px_rgba(15,75,48,0.05)] sm:p-8">
          <div className="absolute -right-10 -top-14 h-44 w-44 rounded-full bg-white/70 blur-2xl" />
          <div className="relative flex flex-col justify-between gap-6 md:flex-row md:items-center">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#D7EDE0] bg-white shadow-sm">
                <ShieldCheck size={23} className="text-[#159B59]" />
              </div>
              <div>
                <p className="mb-1 text-[11px] font-bold tracking-[0.16em] text-[#159B59]">
                  NEXT STEP
                </p>
                <h2 className="text-xl font-bold text-[#001E2B]">
                  Team Leader Actions
                </h2>
                <p className="mt-2 max-w-xl text-sm leading-6 text-[#64756F]">
                  Review reconstructed findings, verify supporting evidence,
                  and approve information before sharing the team handover.
                </p>
              </div>
            </div>

            {!shared ? (
              <Button
                onClick={() => onNavigate("findings")}
                className="h-11 shrink-0 gap-2 rounded-xl bg-[#159B59] px-5 text-white shadow-sm transition hover:bg-[#087A3D]"
              >
                <ClipboardCheck size={17} />
                Review Findings
                <ArrowUpRight size={15} />
              </Button>
            ) : (
              <div className="dashboard-success min-w-[230px] rounded-2xl border border-[#CDE9D8] bg-white p-4 shadow-sm">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#087A3D]">
                  <CheckCircle2 size={17} />
                  Handover marked as shared
                </div>
                <p className="mt-2 text-sm text-[#64756F]">
                  {approvedCount} approved findings have been shared.
                </p>
              </div>
            )}
          </div>
        </section>

        <footer className="mt-8 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-[11px] text-[#91A099]">
          <Clock3 size={12} />
          Demonstration dashboard
          <span>·</span>
          Sample data
          <span>·</span>
          Backend integration pending
        </footer>
      </div>
    </main>
  );
}
