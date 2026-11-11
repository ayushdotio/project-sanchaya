import { useEffect, useState } from "react";
import { getSources, normalizeStatus } from "../api/findingsApi";
import {
  getHandoverReport,
  downloadHandoverPdf,
  acknowledgeHandover,
  getHandoverHistory,
} from "../api/handoverApi";
import { StatusBadge, SelfReportedBadge } from "../components/Badges";
import {
  Download,
  CheckCircle,
  Clock,
  ShieldCheck,
  FileText,
  AlertCircle,
  Loader2,
} from "lucide-react";

function HandoverFindingItem({ f, sources }) {
  const isSelfReported =
    f.evidence_origin === "self_reported" ||
    f.evidence_badge === "Self-reported";

  const evidenceList = Array.isArray(f.evidence) ? f.evidence : [];

  return (
    <li className="rounded-2xl border border-[#E1E8E5] bg-white p-6 shadow-sm">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <StatusBadge status={f.status || f.verification_status} />
        <span className="text-xs font-semibold uppercase tracking-wider text-[#4A5F5B]">
          {f.category}
        </span>
        {isSelfReported && <SelfReportedBadge />}
      </div>

      <p className="text-lg font-semibold text-[#001E2B]">{f.claim}</p>

      {evidenceList.length > 0 ? (
        <div className="mt-3 space-y-2">
          {evidenceList.map((e, idx) => (
            <div
              key={idx}
              className="rounded-lg border border-[#E8F0EC] bg-[#F8FBFA] p-3 text-xs leading-5 text-[#4A5F5B]"
            >
              <span className="font-semibold text-[#001E2B]">
                {sources[e.sourceId]?.title || e.sourceId || "Source"}:
              </span>{" "}
              <span className="rounded bg-[#CFF8E0] px-1 text-[#001E2B]">
                {e.excerpt || f.verbatim_excerpt}
              </span>
            </div>
          ))}
        </div>
      ) : f.verbatim_excerpt ? (
        <div className="mt-3 rounded-lg border border-[#E8F0EC] bg-[#F8FBFA] p-3 text-xs leading-5 text-[#4A5F5B]">
          <span className="rounded bg-[#CFF8E0] px-1 text-[#001E2B]">
            {f.verbatim_excerpt}
          </span>
        </div>
      ) : null}
    </li>
  );
}

export default function MyHandover({
  projectId = "",
  approved = [],
  title = "Your Handover Report",
  user = null,
}) {
  const [sources, setSources] = useState({});
  const [liveFindings, setLiveFindings] = useState([]);
  const [gapAnswers, setGapAnswers] = useState([]);
  const [projectData, setProjectData] = useState(null);
  const [historyList, setHistoryList] = useState([]);
  const [loading, setLoading] = useState(Boolean(projectId));
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [acknowledging, setAcknowledging] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [receipt, setReceipt] = useState(null);

  useEffect(() => {
    let active = true;

    async function loadData() {
      if (!projectId) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");

      try {
        const [sourceList, handoverData, history] = await Promise.all([
          getSources(projectId).catch(() => []),
          getHandoverReport(projectId),
          getHandoverHistory(projectId).catch(() => []),
        ]);

        if (!active) return;

        setSources(Object.fromEntries(sourceList.map((s) => [s.id, s])));
        setHistoryList(history || []);
        if (handoverData) {
          setProjectData(handoverData.project || null);
          setLiveFindings(handoverData.findings || []);
          setGapAnswers(handoverData.gapAnswers || []);
        }
      } catch (err) {
        console.error("Handover report load failed:", err);
        if (active) {
          setError(
            err.message ||
              "Could not load official handover. Ensure the project is approved by your Team Leader."
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    loadData();

    return () => {
      active = false;
    };
  }, [projectId]);

  async function handleDownloadPdf() {
    if (!projectId) return;
    setDownloading(true);
    try {
      await downloadHandoverPdf(
        projectId,
        `sanchaya-handover-${projectData?.name || projectId}.pdf`
      );
    } catch (err) {
      console.error("PDF download failed:", err);
      alert(err.message || "Failed to download handover PDF.");
    } finally {
      setDownloading(false);
    }
  }

  async function handleAcknowledge() {
    if (!projectId) return;
    setAcknowledging(true);
    try {
      const rec = await acknowledgeHandover(projectId);
      setAcknowledged(true);
      setReceipt(rec);
    } catch (err) {
      console.error("Acknowledgment failed:", err);
      alert(err.message || "Failed to acknowledge handover.");
    } finally {
      setAcknowledging(false);
    }
  }

  // Combine live findings from backend with any passed via props
  const allFindings = liveFindings.length > 0 ? liveFindings : approved;

  const isApproved =
    projectData?.readinessStatus === "Approved for Sharing" || allFindings.length > 0;

  if (loading) {
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-3xl items-center justify-center px-5 py-16 text-[#4A5F5B]">
        <Loader2 className="mr-2 animate-spin" />
        Loading verified handover package...
      </main>
    );
  }

  if (error || !isApproved) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-16 sm:px-8">
        <div className="rounded-3xl border border-[#DDEBE3] bg-white p-8 text-center shadow-sm sm:p-12">
          <Clock size={48} className="mx-auto text-amber-600" />
          <h1 className="mt-4 text-3xl font-bold text-[#001E2B]">
            {title} is not ready yet
          </h1>
          <p className="mx-auto mt-3 max-w-lg leading-7 text-[#4A5F5B]">
            Your Team Leader has not finalized the 7-Point Readiness Checklist and signed off on this project.
            You will gain access once the status reaches <strong>"Approved for Sharing"</strong>.
          </p>
          {error && (
            <p className="mt-4 rounded-lg bg-red-50 p-3 text-xs text-red-700">
              {error}
            </p>
          )}
        </div>
      </main>
    );
  }

  const sure = allFindings.filter(
    (f) => normalizeStatus(f.verification_status || f.status) === "supported"
  );
  const follow = allFindings.filter(
    (f) => normalizeStatus(f.verification_status || f.status) !== "supported"
  );

  return (
    <main className="mx-auto max-w-4xl px-5 py-10 sm:px-8">
      {/* Header and Action Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E1E8E5] pb-6">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck size={24} className="text-[#159B59]" />
            <h1 className="text-3xl font-bold text-[#001E2B] sm:text-4xl">
              {projectData?.name || title}
            </h1>
          </div>
          <p className="mt-1 text-sm text-[#4A5F5B]">
            Evidence-backed knowledge handover continuation package
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={downloading}
            className="flex items-center gap-2 rounded-full border border-[#001E2B] bg-white px-5 py-2.5 text-xs font-semibold text-[#001E2B] hover:bg-[#F5F8F7] disabled:opacity-50"
          >
            {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            {downloading ? "Generating PDF..." : "Download Official PDF"}
          </button>

          {!acknowledged ? (
            <button
              type="button"
              onClick={handleAcknowledge}
              disabled={acknowledging}
              className="flex items-center gap-2 rounded-full bg-[#00ED64] px-5 py-2.5 text-xs font-semibold text-[#001E2B] hover:bg-[#00D75B] disabled:opacity-50"
            >
              {acknowledging ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
              {acknowledging ? "Acknowledging..." : "Acknowledge Receipt"}
            </button>
          ) : (
            <span className="flex items-center gap-1.5 rounded-full bg-green-100 px-4 py-2 text-xs font-semibold text-green-800">
              <CheckCircle size={14} />
              Handover Acknowledged
            </span>
          )}
        </div>
      </div>

      {acknowledged && (
        <div className="mt-6 flex items-center gap-3 rounded-2xl border border-green-200 bg-green-50 p-4 text-xs text-green-900">
          <CheckCircle size={18} className="shrink-0 text-green-600" />
          <span>
            Formal receipt confirmed in MongoDB Handover History. You are now the active custodian of this project's continuation plan.
          </span>
        </div>
      )}

      {/* Confirmed Points */}
      <section className="mt-8">
        <h2 className="text-2xl font-bold text-[#001E2B]">
          1. Confirmed Knowledge & Decisions ({sure.length})
        </h2>
        <p className="mt-1 text-xs text-[#71817B]">
          Deterministic exact-substring evidence found in authorized GitHub or document sources.
        </p>

        {sure.length === 0 ? (
          <p className="mt-4 text-sm text-[#71817B]">No confirmed items.</p>
        ) : (
          <ul className="m-0 mt-4 list-none space-y-4 p-0">
            {sure.map((f, i) => (
              <HandoverFindingItem key={f.id || i} f={f} sources={sources} />
            ))}
          </ul>
        )}
      </section>

      {/* Points requiring follow-up */}
      {follow.length > 0 && (
        <section className="mt-12">
          <h2 className="text-2xl font-bold text-[#001E2B]">
            2. Items Requiring Follow-Up ({follow.length})
          </h2>
          <p className="mt-1 text-xs text-[#71817B]">
            These points were reviewed by your Team Leader but carry disputed, unowned, or partial evidence.
          </p>

          <ul className="m-0 mt-4 list-none space-y-4 p-0">
            {follow.map((f, i) => (
              <HandoverFindingItem key={f.id || i} f={f} sources={sources} />
            ))}
          </ul>
        </section>
      )}

      {/* Departing member self-reported context */}
      {gapAnswers.length > 0 && (
        <section className="mt-12">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-[#001E2B]">
              3. Departing Member Context ({gapAnswers.length})
            </h2>
            <SelfReportedBadge />
          </div>
          <p className="mt-1 text-xs text-[#71817B]">
            Self-reported answers submitted via the Stage 4 Gap Loop (Invariant 5).
          </p>

          <ul className="m-0 mt-4 list-none space-y-4 p-0">
            {gapAnswers.map((item, idx) => (
              <li
                key={idx}
                className="rounded-2xl border border-[#CCE8F8] bg-[#F4FAFD] p-6 shadow-sm"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#0369A1]">
                    Question / Gap
                  </span>
                  <SelfReportedBadge />
                </div>
                <p className="text-base font-semibold text-[#001E2B]">
                  {item.question}
                </p>
                <div className="mt-3 rounded-lg border border-[#D5EBF8] bg-white p-3.5 text-sm text-[#001E2B]">
                  <p className="font-medium text-[#0369A1] text-xs mb-1">
                    Departing Engineer Answer:
                  </p>
                  <p className="leading-6 whitespace-pre-wrap">{item.answer}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      {/* Handover History & Audit Log */}
      {historyList.length > 0 && (
        <section className="mt-12">
          <div className="flex items-center gap-2">
            <Clock size={20} className="text-[#159B59]" />
            <h2 className="text-2xl font-bold text-[#001E2B]">
              4. Handover History & Acknowledgement Log
            </h2>
          </div>
          <p className="mt-1 text-xs text-[#71817B]">
            Immutable handover snapshot versions recorded in MongoDB with custodian receipts.
          </p>

          <div className="mt-4 space-y-3">
            {historyList.map((rec) => (
              <div
                key={rec._id || rec.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E1E8E5] bg-white p-4 shadow-sm"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-[#001E2B]">
                      Version {rec.version}
                    </span>
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-800">
                      {rec.approvedSnapshot?.readinessStatus || "Approved for Sharing"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[#4A5F5B]">
                    Approved: {rec.approvedSnapshot?.approvedAt ? new Date(rec.approvedSnapshot.approvedAt).toLocaleString() : "Date unavailable"}
                    {rec.approvedSnapshot?.approvedFindingsCount !== undefined && ` · ${rec.approvedSnapshot.approvedFindingsCount} findings`}
                  </p>
                </div>

                <div className="text-right">
                  {rec.acknowledgedBy ? (
                    <div className="text-xs">
                      <span className="font-semibold text-green-700">✓ Acknowledged</span>
                      <p className="text-[#71817B]">
                        by {rec.acknowledgedBy.name || rec.acknowledgedBy.email}
                      </p>
                    </div>
                  ) : (
                    <span className="text-xs text-amber-600 font-medium">Pending Acknowledgment</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
