import { useEffect, useState } from "react";
import { getFindings } from "../api/findingsApi";
import { Button } from "@/components/ui/button";
import {
  ClipboardList,
  CheckCircle2,
  Clock,
  ArrowRight,
  ArrowUpRight,
  UserRound,
  ListTodo,
  FolderKanban,
  ShieldCheck,
  Sparkles,
  RefreshCw,
  AlertTriangle,
  Check,
} from "lucide-react";

export default function OutgoingDashboard({ user, onNavigate }) {
  const [findings, setFindings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function loadFindings() {
      try {
        const result = await getFindings();
        setFindings(result);
      } catch (err) {
        console.error("Could not load findings:", err);
        setError(true);
      } finally {
        setLoading(false);
      }
    }

    loadFindings();
  }, []);

  const pendingFindings = findings.filter(
    (finding) => finding.status !== "supported"
  );

  const supportedFindings = findings.filter(
    (finding) => finding.status === "supported"
  );

  const stats = [
    {
      title: "Pending Questions",
      value: pendingFindings.length,
      description: "Need your knowledge and input",
      icon: Clock,
      theme: "amber",
    },
    {
      title: "Supported Findings",
      value: supportedFindings.length,
      description: "Already supported by evidence",
      icon: CheckCircle2,
      theme: "green",
    },
    {
      title: "Total Findings",
      value: findings.length,
      description: "Reconstructed project findings",
      icon: ClipboardList,
      theme: "blue",
    },
  ];

  return (
    <main className="min-h-screen bg-[#F6FAF8]">
      <div className="mx-auto max-w-[1440px] px-4 py-7 sm:px-7 lg:px-10 lg:py-9">
        {/* Header */}
        <header className="dashboard-enter mb-8">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#D8EEE1] bg-white px-3 py-1.5 text-[11px] font-bold tracking-[0.16em] text-[#12834B] shadow-sm">
            <UserRound size={14} />
            OUTGOING MEMBER WORKSPACE
          </div>

          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-[#001E2B] sm:text-[2.35rem]">
                Your Handover Dashboard
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#71817B] sm:text-[15px]">
                Welcome, {user?.name || "Team Member"}. Share your knowledge
                to help your team continue the project smoothly.
              </p>
            </div>

            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[#F1E2C7] bg-[#FFF8EC] px-4 py-2 text-sm font-semibold text-[#9A681D]">
              <span className="h-2 w-2 rounded-full bg-[#D99A35]" />
              Handover in progress
            </div>
          </div>
        </header>

        {/* Project summary */}
        <section className="dashboard-enter dashboard-delay-1 relative mb-8 overflow-hidden rounded-3xl border border-[#D8EADF] bg-white shadow-[0_12px_40px_rgba(15,75,48,0.06)]">
          <div className="absolute right-0 top-0 h-48 w-48 translate-x-16 -translate-y-20 rounded-full bg-[#E8F8EF] blur-2xl" />
          <div className="relative p-6 sm:p-8">
            <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
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

              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[#D8EEE1] bg-[#EFF9F3] text-[#159B59]">
                <FolderKanban size={26} />
              </div>
            </div>

            <div className="mt-7 flex flex-wrap gap-x-7 gap-y-3 border-t border-[#EAF1ED] pt-5 text-sm text-[#64756F]">
              <span>
                Team: <strong className="font-semibold text-[#29483B]">Epsilum</strong>
              </span>
              <span>
                Role: <strong className="font-semibold text-[#29483B]">Outgoing Member</strong>
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[#D99A35]" />
                Handover: In Progress
              </span>
            </div>
          </div>
        </section>

        {/* Progress statistics */}
        <section className="dashboard-enter dashboard-delay-2 mb-9">
          <div className="mb-5">
            <p className="mb-1 text-[11px] font-bold tracking-[0.16em] text-[#159B59]">
              YOUR CONTRIBUTION
            </p>
            <h2 className="text-xl font-bold tracking-tight text-[#001E2B] sm:text-2xl">
              Handover Progress
            </h2>
            <p className="mt-1 text-sm text-[#71817B]">
              Track findings that need your input and those already supported.
            </p>
          </div>

          {loading ? (
            <div className="rounded-2xl border border-[#E1ECE6] bg-white px-5 py-8 text-center shadow-sm">
              <RefreshCw className="mx-auto mb-3 animate-spin text-[#159B59]" size={22} />
              <p className="text-sm text-[#71817B]">Loading your findings...</p>
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-[#F0D9D5] bg-white p-6 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-[#FFF0ED] p-2.5 text-[#C65B49]">
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <h3 className="font-semibold text-[#001E2B]">
                    Unable to load findings
                  </h3>
                  <p className="mt-1 text-sm text-[#71817B]">
                    Please refresh the page and try again.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {stats.map((item, index) => {
                const Icon = item.icon;
                const styles = {
                  amber: "bg-[#FFF5E5] text-[#C47A17]",
                  green: "bg-[#EAF8EF] text-[#159B59]",
                  blue: "bg-[#EAF2FF] text-[#3973C8]",
                };

                return (
                  <div
                    key={item.title}
                    className="dashboard-enter rounded-2xl border border-[#E1ECE6] bg-white p-5 shadow-[0_5px_20px_rgba(15,75,48,0.035)] transition duration-200 hover:-translate-y-1 hover:border-[#C8E5D4] hover:shadow-[0_12px_28px_rgba(15,75,48,0.08)]"
                    style={{ animationDelay: `${index * 100}ms` }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-medium text-[#64756F]">
                        {item.title}
                      </p>
                      <div className={`rounded-xl p-3 ${styles[item.theme]}`}>
                        <Icon size={20} />
                      </div>
                    </div>
                    <p className="mt-4 text-3xl font-bold tracking-tight text-[#001E2B]">
                      {item.value}
                    </p>
                    <p className="mt-2 text-xs text-[#84918B]">
                      {item.description}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Answer questions */}
        <section className="dashboard-enter dashboard-delay-3 mb-8 overflow-hidden rounded-3xl border border-[#F0E2C8] bg-white shadow-[0_8px_30px_rgba(120,80,20,0.04)]">
          <div className="border-b border-[#F4EADB] bg-gradient-to-r from-[#FFF9EF] to-white px-6 py-5 sm:px-7">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#FFF0D7] text-[#C47A17]">
                <ClipboardList size={23} />
              </div>
              <div>
                <p className="mb-1 text-[11px] font-bold tracking-[0.15em] text-[#B87920]">
                  KNOWLEDGE FROM YOU
                </p>
                <h2 className="text-xl font-bold text-[#001E2B]">
                  Questions Only You Can Answer
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[#71817B]">
                  Help your team understand unresolved decisions, blockers,
                  responsibilities, and important project details.
                </p>
              </div>
            </div>
          </div>

          <div className="p-6 sm:p-7">
            {!loading && !error && (
              <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-[#F1E6D4] bg-[#FFFBF4] p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-[#29483B]">
                    {pendingFindings.length} findings need additional review
                    or clarification.
                  </p>
                  <p className="mt-1 text-xs text-[#82918B]">
                    Your answers help preserve context that may not exist in project files.
                  </p>
                </div>
                <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#A66D18]">
                  <Clock size={13} />
                  Input needed
                </span>
              </div>
            )}

            <Button
              onClick={() => onNavigate("questions")}
              className="h-11 gap-2 rounded-xl bg-[#159B59] px-5 text-white shadow-sm transition hover:bg-[#087A3D]"
            >
              Answer Handover Questions
              <ArrowRight size={17} />
            </Button>
          </div>
        </section>

        {/* Responsibilities */}
        <section className="dashboard-enter dashboard-delay-4 mb-8 rounded-3xl border border-[#DCE9E3] bg-white p-6 shadow-[0_8px_30px_rgba(15,75,48,0.04)] sm:p-7">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#EAF2FF] text-[#3973C8]">
              <ListTodo size={23} />
            </div>
            <div>
              <p className="mb-1 text-[11px] font-bold tracking-[0.15em] text-[#3973C8]">
                TASK OWNERSHIP
              </p>
              <h2 className="text-xl font-bold text-[#001E2B]">
                Your Responsibilities
              </h2>
              <p className="mt-2 text-sm leading-6 text-[#71817B]">
                Tasks and ownership information for the handover.
              </p>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-dashed border-[#DCE9E3] bg-[#F8FAF9] p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-white p-2.5 text-[#82918B] shadow-sm">
                <ListTodo size={18} />
              </div>
              <div>
                <p className="text-sm font-semibold text-[#29483B]">
                  Task information is not connected yet.
                </p>
                <p className="mt-1 text-sm leading-6 text-[#82918B]">
                  Your assigned tasks and responsibilities will appear here
                  after task records are connected to Sanchaya.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Handover steps */}
        <section className="dashboard-enter dashboard-delay-5 relative overflow-hidden rounded-3xl border border-[#CDE9D8] bg-gradient-to-br from-[#EAF8EF] via-[#F4FBF6] to-white p-6 shadow-[0_10px_30px_rgba(15,75,48,0.05)] sm:p-8">
          <div className="absolute -right-10 -top-14 h-44 w-44 rounded-full bg-white/70 blur-2xl" />
          <div className="relative">
            <div className="flex flex-col justify-between gap-5 md:flex-row md:items-start">
              <div>
                <p className="mb-1 text-[11px] font-bold tracking-[0.16em] text-[#159B59]">
                  YOUR NEXT STEP
                </p>
                <h2 className="text-xl font-bold text-[#001E2B] sm:text-2xl">
                  Complete Your Handover
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[#64756F]">
                  Share the context your teammates need to continue the project
                  with confidence.
                </p>
              </div>
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#D7EDE0] bg-white text-[#159B59] shadow-sm">
                <ShieldCheck size={23} />
              </div>
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-3">
              {[
                "Review unresolved project questions.",
                "Explain what you know and what should happen next.",
                "Submit your answers for the Team Leader to review.",
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

            <Button
              onClick={() => onNavigate("questions")}
              className="mt-6 h-11 gap-2 rounded-xl bg-[#159B59] px-5 text-white shadow-sm transition hover:bg-[#087A3D]"
            >
              Start Handover
              <ArrowRight size={17} />
              <ArrowUpRight size={14} />
            </Button>
          </div>
        </section>

        <footer className="mt-8 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-[11px] text-[#91A099]">
          <Check size={12} />
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
