import { useEffect, useState } from "react";
import {
  Activity,
  CheckCircle2,
  Clock,
  FileText,
  ArrowRight,
  ArrowUpRight,
  Users,
  BookOpen,
  FolderKanban,
  ShieldCheck,
  Sparkles,
  ListChecks,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import RecentActivity from "@/components/dashboard/RecentActivity";
import { getProjects } from "@/services/projectsApi";
import { getFindings } from "@/api/findingsApi";
import { getProjectSources } from "@/api/sourcesApi";
import { getHandoverHistory } from "@/api/handoverApi";

export default function TeamMemberDashboard({
  user,
  approved = [],
  shared,
  onNavigate,
}) {
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [projectFindings, setProjectFindings] = useState([]);
  const [projectSources, setProjectSources] = useState([]);
  const [historyData, setHistoryData] = useState([]);

  useEffect(() => {
    getProjects()
      .then((list) => {
        setProjects(list || []);
        if (list && list.length > 0) {
          setSelectedProjectId(list[0]._id || list[0].id);
        }
      })
      .catch((err) => console.warn("Could not load member projects:", err));
  }, []);

  useEffect(() => {
    if (selectedProjectId) {
      Promise.all([
        getFindings(selectedProjectId).catch(() => []),
        getProjectSources(selectedProjectId).catch(() => []),
        getHandoverHistory(selectedProjectId).catch(() => []),
      ]).then(([findings, sources, history]) => {
        if (Array.isArray(findings)) setProjectFindings(findings);
        if (Array.isArray(sources)) setProjectSources(sources);
        if (Array.isArray(history)) setHistoryData(history);
      });
    }
  }, [selectedProjectId]);

  const activeProject =
    projects.find((p) => (p._id || p.id) === selectedProjectId) || projects[0];

  const hasApprovedProject = projects.some(
    (p) => p.readinessStatus === "Approved for Sharing"
  );

  const effectiveApproved =
    approved.length > 0
      ? approved
      : projectFindings.filter(
          (f) =>
            (f.status || f.verification_status || "").toLowerCase() ===
              "supported" || f.review === "approved"
        );

  const confirmed = effectiveApproved.filter(
    (f) => (f.status || f.verification_status || "").toLowerCase() === "supported"
  );

  const followUp = effectiveApproved.filter(
    (f) => (f.status || f.verification_status || "").toLowerCase() !== "supported"
  );

  const isShared = shared || hasApprovedProject;

  const cards = [
    {
      title: "Shared Findings",
      value: effectiveApproved.length,
      description: "Information approved by the leader",
      icon: FileText,
      color: "blue",
    },
    {
      title: "Confirmed",
      value: confirmed.length,
      description: "Supported project information",
      icon: CheckCircle2,
      color: "green",
    },
    {
      title: "Needs Attention",
      value: followUp.length,
      description: "Points requiring follow-up",
      icon: Clock,
      color: "orange",
    },
  ];

  return (
    <main className="team-dashboard min-h-screen bg-[#F6FAF8]">
      <div className="mx-auto max-w-[1440px] px-4 py-7 sm:px-7 lg:px-10 lg:py-9">
        {/* Header */}
        <header className="dashboard-enter mb-8">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#D8EEE1] bg-white px-3 py-1.5 text-[11px] font-bold tracking-[0.16em] text-[#12834B] shadow-sm">
            <Users size={14} />
            TEAM MEMBER WORKSPACE
          </div>

          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-[#001E2B] sm:text-[2.35rem]">
                Team Dashboard
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#71817B] sm:text-[15px]">
                Welcome, {user?.name || "Team Member"}. Stay updated with your
                team's project knowledge and progress.
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
              {shared ? "Handover Shared" : "Awaiting Handover"}
            </div>
          </div>
        </header>

        {/* Project summary */}
        <section className="dashboard-enter animation-delay-100 relative mb-8 overflow-hidden rounded-3xl border border-[#D8EADF] bg-white shadow-[0_12px_40px_rgba(15,75,48,0.06)]">
          <div className="absolute right-0 top-0 h-48 w-48 translate-x-16 -translate-y-20 rounded-full bg-[#E8F8EF] blur-2xl" />
          <div className="relative p-6 sm:p-8">
            <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
              <div>
                <div className="mb-3 flex items-center gap-2 text-xs font-bold tracking-[0.15em] text-[#159B59]">
                  <Sparkles size={15} />
                  ACTIVE PROJECT
                </div>
                <h2 className="text-2xl font-bold tracking-tight text-[#001E2B] sm:text-3xl">
                  {activeProject?.name || "Sanchaya"}
                </h2>
                <p className="mt-2 text-sm text-[#71817B]">
                  {activeProject?.description || "Preserving Knowledge. Connecting People. Continuing Projects."}
                </p>
              </div>

              <div className="flex items-center gap-3">
                {projects.length > 1 && (
                  <select
                    value={selectedProjectId}
                    onChange={(e) => setSelectedProjectId(e.target.value)}
                    className="rounded-xl border border-[#D8E7DF] bg-[#F8FCF9] px-3 py-2 text-xs font-semibold text-[#29483B] outline-none"
                  >
                    {projects.map((p) => (
                      <option key={p._id || p.id} value={p._id || p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                )}
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[#D8EEE1] bg-[#EFF9F3] text-[#159B59]">
                  <FolderKanban size={26} />
                </div>
              </div>
            </div>

            <div className="mt-7 flex flex-wrap gap-x-7 gap-y-3 border-t border-[#EAF1ED] pt-5 text-sm text-[#64756F]">
              <span>
                Team: <strong className="font-semibold text-[#29483B]">Epsilum</strong>
              </span>
              <span>
                Role: <strong className="font-semibold text-[#29483B]">Team Member</strong>
              </span>
              <span className="inline-flex items-center gap-2">
                <span
                  className={`h-2 w-2 rounded-full ${
                    isShared ? "bg-[#159B59]" : "bg-[#D99A35]"
                  }`}
                />
                {isShared ? "Handover available" : "Waiting for team leader"}
              </span>
            </div>
          </div>
        </section>

        {/* Statistics */}
        <section className="dashboard-enter animation-delay-200 mb-9">
          <div className="mb-5">
            <p className="mb-1 text-[11px] font-bold tracking-[0.16em] text-[#159B59]">
              TEAM KNOWLEDGE
            </p>
            <h2 className="text-xl font-bold tracking-tight text-[#001E2B] sm:text-2xl">
              Project Overview
            </h2>
            <p className="mt-1 text-sm text-[#71817B]">
              A quick view of the information shared with your team.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((card, index) => {
              const Icon = card.icon;
              const iconStyles = {
                green: "bg-[#EAF8EF] text-[#159B59]",
                orange: "bg-[#FFF5E5] text-[#C47A17]",
                blue: "bg-[#EAF2FF] text-[#3973C8]",
              };

              return (
                <div
                  key={card.title}
                  style={{ animationDelay: `${index * 120}ms` }}
                  className="dashboard-enter rounded-2xl border border-[#E1ECE6] bg-white p-5 shadow-[0_5px_20px_rgba(15,75,48,0.035)] transition duration-200 hover:-translate-y-1 hover:border-[#C8E5D4] hover:shadow-[0_12px_28px_rgba(15,75,48,0.08)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium text-[#64756F]">
                      {card.title}
                    </p>
                    <div className={`rounded-xl p-3 ${iconStyles[card.color]}`}>
                      <Icon size={20} />
                    </div>
                  </div>

                  <p className="mt-4 text-3xl font-bold tracking-tight text-[#001E2B]">
                    {card.value}
                  </p>
                  <p className="mt-2 text-xs text-[#84918B]">
                    {card.description}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        {/* Shared findings */}
        <section className="dashboard-enter animation-delay-300 mb-9 overflow-hidden rounded-3xl border border-[#DCE9E3] bg-white shadow-[0_8px_30px_rgba(15,75,48,0.04)]">
          <div className="flex items-start gap-4 border-b border-[#EAF1ED] bg-gradient-to-r from-[#F0F9F3] to-white px-6 py-5 sm:px-7">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#E2F5E9] text-[#159B59]">
              <BookOpen size={23} />
            </div>
            <div>
              <p className="mb-1 text-[11px] font-bold tracking-[0.15em] text-[#159B59]">
                APPROVED KNOWLEDGE
              </p>
              <h2 className="text-xl font-bold text-[#001E2B]">
                Team Knowledge
              </h2>
              <p className="mt-2 text-sm leading-6 text-[#71817B]">
                Read information verified by your Team Leader.
              </p>
            </div>
          </div>

          <div className="p-6 sm:p-7">
            {isShared ? (
              <>
                <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-[#DCEFE3] bg-[#F4FAF6] p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-[#29483B]">
                      {effectiveApproved.length} findings have been shared with the team.
                    </p>
                    <p className="mt-1 text-xs text-[#82918B]">
                      Open the handover to review the project information.
                    </p>
                  </div>
                  <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#087A3D]">
                    <CheckCircle2 size={13} />
                    Available
                  </span>
                </div>

                <Button
                  onClick={() => onNavigate("handover", selectedProjectId)}
                  className="h-11 gap-2 rounded-xl bg-[#159B59] px-5 text-white shadow-sm transition hover:bg-[#087A3D]"
                >
                  Read Team Handover
                  <ArrowRight size={17} />
                  <ArrowUpRight size={14} />
                </Button>
              </>
            ) : (
              <div className="flex items-start gap-3 rounded-2xl border border-[#F1E6D4] bg-[#FFFBF4] p-5">
                <div className="rounded-xl bg-[#FFF0D7] p-2.5 text-[#C47A17]">
                  <Clock size={19} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#29483B]">
                    Handover is not shared yet
                  </p>
                  <p className="mt-1 text-sm leading-6 text-[#82918B]">
                    Your Team Leader has not shared the handover yet.
                    Approved project information will appear here.
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Recent activity */}
        <section className="dashboard-enter animation-delay-400 mb-9">
          <div className="mb-5">
            <p className="mb-1 text-[11px] font-bold tracking-[0.16em] text-[#159B59]">
              TEAM UPDATES
            </p>
            <h2 className="flex items-center gap-2 text-xl font-bold tracking-tight text-[#001E2B] sm:text-2xl">
              <Activity size={20} className="text-[#159B59]" />
              Recent Team Activity
            </h2>
            <p className="mt-1 text-sm text-[#71817B]">
              Keep track of recent project activity and updates.
            </p>
          </div>
          <RecentActivity
            findings={projectFindings}
            sources={projectSources}
            history={historyData}
          />
        </section>

        {/* Next actions */}
        <section className="dashboard-enter animation-delay-500 relative overflow-hidden rounded-3xl border border-[#CDE9D8] bg-gradient-to-br from-[#EAF8EF] via-[#F4FBF6] to-white p-6 shadow-[0_10px_30px_rgba(15,75,48,0.05)] sm:p-8">
          <div className="absolute -right-10 -top-14 h-44 w-44 rounded-full bg-white/70 blur-2xl" />
          <div className="relative">
            <div className="flex flex-col justify-between gap-5 md:flex-row md:items-start">
              <div>
                <p className="mb-1 text-[11px] font-bold tracking-[0.16em] text-[#159B59]">
                  STAY ALIGNED
                </p>
                <h2 className="text-xl font-bold text-[#001E2B] sm:text-2xl">
                  What to Do Next
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[#64756F]">
                  Use the shared knowledge to stay aligned with your team's
                  decisions, responsibilities, and next steps.
                </p>
              </div>
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#D7EDE0] bg-white text-[#159B59] shadow-sm">
                <ShieldCheck size={23} />
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                "Check the latest shared project information.",
                "Read important technical decisions and evidence.",
                "Follow up on unresolved project points.",
                "Coordinate your work with the team.",
              ].map((step, index) => (
                <div
                  key={step}
                  className="flex items-start gap-3 rounded-2xl border border-white/90 bg-white/75 p-4"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#E8F8EF] text-xs font-bold text-[#12834B]">
                    {index + 1}
                  </span>
                  <p className="text-sm leading-5 text-[#4A5F5B]">{step}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <footer className="mt-8 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-[11px] text-[#91A099]">
          <ListChecks size={12} />
          Team Member Workspace
          <span>·</span>
          Connected to Sanchaya backend
        </footer>
      </div>

      {/* Dashboard animations */}
      <style>{`
        @keyframes dashboardFadeUp {
          from {
            opacity: 0;
            transform: translateY(18px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .dashboard-enter {
          animation: dashboardFadeUp 650ms ease-out both;
        }

        .animation-delay-100 { animation-delay: 100ms; }
        .animation-delay-200 { animation-delay: 200ms; }
        .animation-delay-300 { animation-delay: 300ms; }
        .animation-delay-400 { animation-delay: 400ms; }
        .animation-delay-500 { animation-delay: 500ms; }

        @media (prefers-reduced-motion: reduce) {
          .team-dashboard *,
          .team-dashboard *::before,
          .team-dashboard *::after {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>
    </main>
  );
}
