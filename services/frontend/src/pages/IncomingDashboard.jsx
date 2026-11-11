import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Clock,
  FileText,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  AlertCircle,
  FolderKanban,
  ShieldCheck,
  Sparkles,
  Eye,
  ListChecks,
  RefreshCw,
  Download,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import ReadinessPanel from "@/components/dashboard/ReadinessPanel";
import { getProjects } from "@/services/projectsApi";
import { getReadiness } from "@/api/gapsApi";
import {
  getHandoverReport,
  getHandoverHistory,
  downloadHandoverPdf,
} from "@/api/handoverApi";

export default function IncomingDashboard({
  user,
  approved = [],
  shared,
  onNavigate,
}) {
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [projectFindings, setProjectFindings] = useState([]);
  const [readinessData, setReadinessData] = useState(null);
  const [handoverHistory, setHandoverHistory] = useState([]);
  const [pollingReadiness, setPollingReadiness] = useState(false);
  const [pollError, setPollError] = useState("");
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [pdfError, setPdfError] = useState("");

  useEffect(() => {
    getProjects()
      .then((list) => {
        setProjects(list || []);
        if (list && list.length > 0) {
          setSelectedProjectId(list[0]._id || list[0].id);
        }
      })
      .catch((err) => console.warn("Could not load incoming projects:", err));
  }, []);

  useEffect(() => {
    let active = true;
    if (!selectedProjectId) return () => { active = false; };

    getReadiness(selectedProjectId)
      .then(async (readiness) => {
        if (!active) return;
        setReadinessData(readiness || null);
        if (readiness?.readinessStatus === "Approved for Sharing") {
          const [handover, history] = await Promise.all([
            getHandoverReport(selectedProjectId).catch(() => null),
            getHandoverHistory(selectedProjectId).catch(() => []),
          ]);
          if (active) {
            setProjectFindings(Array.isArray(handover?.findings) ? handover.findings : []);
            setHandoverHistory(Array.isArray(history) ? history : []);
          }
        } else {
          setProjectFindings([]);
          setHandoverHistory([]);
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [selectedProjectId]);

  async function handlePollReadiness() {
    if (!selectedProjectId) return;
    setPollingReadiness(true);
    setPollError("");
    try {
      const readiness = await getReadiness(selectedProjectId);
      setReadinessData(readiness || null);
      if (readiness?.readinessStatus === "Approved for Sharing") {
        const [handover, history] = await Promise.all([
          getHandoverReport(selectedProjectId).catch(() => null),
          getHandoverHistory(selectedProjectId).catch(() => []),
        ]);
        setProjectFindings(Array.isArray(handover?.findings) ? handover.findings : []);
        setHandoverHistory(Array.isArray(history) ? history : []);
      }
    } catch (err) {
      console.warn("Readiness poll failed:", err);
      setPollError(err.message || "Unable to check readiness status.");
    } finally {
      setPollingReadiness(false);
    }
  }

  async function handleDownloadPdf() {
    if (!selectedProjectId) return;
    setDownloadingPdf(true);
    setPdfError("");
    try {
      await downloadHandoverPdf(
        selectedProjectId,
        `sanchaya-handover-${activeProject?.name || selectedProjectId}.pdf`
      );
    } catch (err) {
      console.warn("PDF download failed:", err);
      setPdfError(err.message || "Failed to download official PDF.");
    } finally {
      setDownloadingPdf(false);
    }
  }

  const activeProject =
    projects.find((p) => (p._id || p.id) === selectedProjectId) || projects[0];

  const isSelectedProjectApproved =
    (readinessData?.readinessStatus || activeProject?.readinessStatus) ===
    "Approved for Sharing";

  // If approved items passed from parent, use them; otherwise use Stage 5 handover findings
  const effectiveApproved =
    approved.length > 0
      ? approved
      : projectFindings;

  const confirmed = effectiveApproved.filter(
    (finding) => (finding.status || finding.verification_status || "").toLowerCase() === "supported"
  );

  const followUp = effectiveApproved.filter(
    (finding) => (finding.status || finding.verification_status || "").toLowerCase() !== "supported"
  );

  const ready = (shared && effectiveApproved.length > 0) || isSelectedProjectApproved;

  const stats = [
    {
      title: "Approved Findings",
      value: effectiveApproved.length,
      description: "Information shared by your team leader",
      icon: FileText,
      theme: "blue",
    },
    {
      title: "Confirmed",
      value: confirmed.length,
      description: "Supported by available evidence",
      icon: CheckCircle2,
      theme: "green",
    },
    {
      title: "Needs Follow-up",
      value: followUp.length,
      description: "Review before relying on these points",
      icon: Clock,
      theme: "amber",
    },
  ];

  return (
    <main className="min-h-screen bg-[#F6FAF8]">
      <div className="mx-auto max-w-[1440px] px-4 py-7 sm:px-7 lg:px-10 lg:py-9">
        {/* Header */}
        <header className="dashboard-enter mb-8">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#D8EEE1] bg-white px-3 py-1.5 text-[11px] font-bold tracking-[0.16em] text-[#12834B] shadow-sm">
            <BookOpen size={14} />
            INCOMING MEMBER WORKSPACE
          </div>

          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-[#001E2B] sm:text-[2.35rem]">
                Your Project Handover
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#71817B] sm:text-[15px]">
                Welcome, {user?.name || "Team Member"}. Understand the project,
                review its evidence, and continue the work confidently.
              </p>
            </div>

            <div
              className={`inline-flex w-fit items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold ${
                ready
                  ? "border-[#CDE9D8] bg-[#EAF8EF] text-[#087A3D]"
                  : "border-[#F1E2C7] bg-[#FFF8EC] text-[#9A681D]"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  ready ? "bg-[#159B59]" : "bg-[#D99A35]"
                }`}
              />
              {ready ? "Handover Shared" : "Awaiting Handover"}
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
                  PROJECT WORKSPACE
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
                Role: <strong className="font-semibold text-[#29483B]">Incoming Member</strong>
              </span>
              <span className="inline-flex items-center gap-2">
                <span
                  className={`h-2 w-2 rounded-full ${
                    ready ? "bg-[#159B59]" : "bg-[#D99A35]"
                  }`}
                />
                {ready ? "Handover available" : "Waiting for team leader"}
              </span>
            </div>
          </div>
        </section>

        {/* Handover overview */}
        <section className="dashboard-enter dashboard-delay-2 mb-9">
          <div className="mb-5">
            <p className="mb-1 text-[11px] font-bold tracking-[0.16em] text-[#159B59]">
              KNOWLEDGE TRANSFER
            </p>
            <h2 className="text-xl font-bold tracking-tight text-[#001E2B] sm:text-2xl">
              Handover Overview
            </h2>
            <p className="mt-1 text-sm text-[#71817B]">
              See what has been shared and what still needs attention.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {stats.map((item, index) => {
              const Icon = item.icon;
              const styles = {
                blue: "bg-[#EAF2FF] text-[#3973C8]",
                green: "bg-[#EAF8EF] text-[#159B59]",
                amber: "bg-[#FFF5E5] text-[#C47A17]",
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
        </section>

        {/* Handover waiting state */}
        {!ready && (
          <section className="dashboard-enter dashboard-delay-3 mb-8 overflow-hidden rounded-3xl border border-[#F0E2C8] bg-white shadow-[0_8px_30px_rgba(120,80,20,0.04)]">
            <div className="flex items-start gap-4 border-b border-[#F4EADB] bg-gradient-to-r from-[#FFF9EF] to-white px-6 py-5 sm:px-7">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#FFF0D7] text-[#C47A17]">
                <AlertCircle size={23} />
              </div>
              <div>
                <p className="mb-1 text-[11px] font-bold tracking-[0.15em] text-[#B87920]">
                  NOT AVAILABLE YET
                </p>
                <h2 className="text-xl font-bold text-[#001E2B]">
                  Handover is not available yet
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[#71817B]">
                  Your Team Leader has not shared any approved findings in this
                  session. Once the handover is shared, its information and
                  evidence will appear here.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 text-xs text-[#82918B] sm:px-7">
              <span className="inline-flex items-center gap-2">
                <Clock size={14} />
                Current status: {readinessData?.readinessStatus || activeProject?.readinessStatus || "Needs Attention"}
              </span>
              {selectedProjectId && (
                <button
                  type="button"
                  onClick={handlePollReadiness}
                  disabled={pollingReadiness}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#DCE9E3] bg-white px-3 py-1.5 text-xs font-semibold text-[#24483A] hover:border-[#159B59] disabled:opacity-50"
                >
                  <RefreshCw size={12} className={pollingReadiness ? "animate-spin" : ""} />
                  {pollingReadiness ? "Checking..." : "Check Readiness Status"}
                </button>
              )}
            </div>
          </section>
        )}

        {/* Stage 4: Read-Only Readiness Status Polling */}
        {selectedProjectId && readinessData && (
          <section className="dashboard-enter dashboard-delay-3 mb-8">
            <ReadinessPanel readiness={readinessData} isLeader={false} />
          </section>
        )}

        {/* Confirmed information */}
        {ready && (
          <section className="dashboard-enter dashboard-delay-3 mb-8 rounded-3xl border border-[#DCE9E3] bg-white p-6 shadow-[0_8px_30px_rgba(15,75,48,0.04)] sm:p-7">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#EAF8EF] text-[#159B59]">
                  <CheckCircle2 size={22} />
                </div>
                <div>
                  <p className="mb-0.5 text-[11px] font-bold tracking-[0.15em] text-[#159B59]">
                    EVIDENCE-BACKED
                  </p>
                  <h2 className="text-xl font-bold text-[#001E2B]">
                    Confirmed Project Information
                  </h2>
                </div>
              </div>
              <span className="w-fit rounded-full bg-[#EAF8EF] px-3 py-1.5 text-xs font-semibold text-[#087A3D]">
                {confirmed.length} supported
              </span>
            </div>

            {confirmed.length === 0 ? (
              <p className="mt-5 rounded-2xl bg-[#F7FAF8] p-4 text-sm text-[#71817B]">
                No findings are currently marked as supported.
              </p>
            ) : (
              <ul className="mt-5 space-y-3">
                {confirmed.slice(0, 3).map((finding) => (
                  <li
                    key={finding.id}
                    className="flex items-start gap-3 rounded-2xl border border-[#E2F0E7] bg-[#F4FAF6] p-4 text-sm leading-6 text-[#29483B]"
                  >
                    <CheckCircle2
                      size={17}
                      className="mt-0.5 shrink-0 text-[#159B59]"
                    />
                    {finding.claim}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* Follow-up items */}
        {ready && followUp.length > 0 && (
          <section className="dashboard-enter dashboard-delay-4 mb-8 rounded-3xl border border-[#F0E2C8] bg-white p-6 shadow-[0_8px_30px_rgba(120,80,20,0.04)] sm:p-7">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#FFF5E5] text-[#C47A17]">
                  <Clock size={22} />
                </div>
                <div>
                  <p className="mb-0.5 text-[11px] font-bold tracking-[0.15em] text-[#B87920]">
                    REVIEW CAREFULLY
                  </p>
                  <h2 className="text-xl font-bold text-[#001E2B]">
                    Points Requiring Follow-up
                  </h2>
                </div>
              </div>
              <span className="w-fit rounded-full bg-[#FFF5E5] px-3 py-1.5 text-xs font-semibold text-[#A66D18]">
                {followUp.length} to review
              </span>
            </div>

            <ul className="mt-5 space-y-3">
              {followUp.slice(0, 3).map((finding) => (
                <li
                  key={finding.id}
                  className="flex items-start gap-3 rounded-2xl border border-[#F2E8D8] bg-[#FFFBF4] p-4 text-sm leading-6 text-[#4A463B]"
                >
                  <AlertCircle
                    size={17}
                    className="mt-0.5 shrink-0 text-[#C47A17]"
                  />
                  {finding.claim}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Next actions */}
        <section className="dashboard-enter dashboard-delay-5 relative overflow-hidden rounded-3xl border border-[#CDE9D8] bg-gradient-to-br from-[#EAF8EF] via-[#F4FBF6] to-white p-6 shadow-[0_10px_30px_rgba(15,75,48,0.05)] sm:p-8">
          <div className="absolute -right-10 -top-14 h-44 w-44 rounded-full bg-white/70 blur-2xl" />
          <div className="relative">
            <div className="flex flex-col justify-between gap-5 md:flex-row md:items-start">
              <div>
                <p className="mb-1 text-[11px] font-bold tracking-[0.16em] text-[#159B59]">
                  YOUR NEXT STEP
                </p>
                <h2 className="text-xl font-bold text-[#001E2B] sm:text-2xl">
                  Your Next Actions
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[#64756F]">
                  Use the handover to understand the project context and plan
                  your next work with the team.
                </p>
              </div>
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#D7EDE0] bg-white text-[#159B59] shadow-sm">
                <ShieldCheck size={23} />
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                "Read the approved project findings.",
                "Open the evidence behind important decisions.",
                "Review unclear or disputed information.",
                "Plan the next tasks with your team leader.",
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

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Button
                onClick={() => onNavigate("handover", selectedProjectId)}
                disabled={!ready}
                className="h-11 gap-2 rounded-xl bg-[#159B59] px-5 text-white shadow-sm transition hover:bg-[#087A3D] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Eye size={17} />
                Read Complete Handover
                <ArrowRight size={17} />
                <ArrowUpRight size={14} />
              </Button>

              {ready && (
                <Button
                  variant="outline"
                  onClick={handleDownloadPdf}
                  disabled={downloadingPdf}
                  className="h-11 gap-2 rounded-xl border-[#D8E7DF] bg-white px-5 text-[#001E2B] hover:border-[#159B59]"
                >
                  <Download size={16} />
                  {downloadingPdf ? "Downloading PDF..." : "Download Official PDF"}
                </Button>
              )}

              {handoverHistory.some((h) => {
                if (!h?.acknowledgedBy) return false;
                const uid = user?.id || user?._id || user?.userId;
                const ackId = h.acknowledgedBy._id || h.acknowledgedBy.id || h.acknowledgedBy;
                return uid ? String(ackId) === String(uid) : true;
              }) && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-2 text-xs font-semibold text-[#087A3D] border border-[#CDE9D8]">
                  <CheckCircle2 size={14} />
                  Receipt Acknowledged
                </span>
              )}
            </div>

            {(pdfError || pollError) && (
              <p className="mt-3 rounded-xl border border-[#F1D7D2] bg-[#FFF5F3] px-3.5 py-2 text-xs text-[#A33F32]">
                {pdfError || pollError}
              </p>
            )}
          </div>
        </section>

        <footer className="mt-8 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-[11px] text-[#91A099]">
          <ListChecks size={12} />
          Incoming Member Workspace
          <span>·</span>
          Connected to Sanchaya backend
        </footer>
      </div>
    </main>
  );
}
