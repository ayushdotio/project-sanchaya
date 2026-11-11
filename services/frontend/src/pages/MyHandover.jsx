import { useEffect, useState } from "react";
import { getSources, normalizeStatus } from "../api/findingsApi";
import { getProjects } from "../api/projectsApi";
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
  AlertCircle,
  Loader2,
  Activity,
} from "lucide-react";

const RISK_TIER_STYLES = {
  High: "border-[#F1C9C3] bg-[#FFF1EE] text-[#A33F32]",
  Medium: "border-[#F2DFBE] bg-[#FFF7EA] text-[#9A681D]",
  Low: "border-[#CDE9D8] bg-[#EAF8EF] text-[#087A3D]",
  "Insufficient data": "border-[#DCE6E1] bg-[#F4F8F6] text-[#5C6F68]",
};

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
          {f.source_id && (
            <span className="mr-1.5 font-semibold text-[#001E2B]">
              {sources[f.source_id]?.title || f.source_id}:
            </span>
          )}
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
  const [projects, setProjects] = useState([]);
  const [overrideProjectId, setOverrideProjectId] = useState("");
  const [sources, setSources] = useState({});
  const [liveFindings, setLiveFindings] = useState([]);
  const [gapAnswers, setGapAnswers] = useState([]);
  const [riskMaps, setRiskMaps] = useState([]);
  const [projectData, setProjectData] = useState(null);
  const [historyList, setHistoryList] = useState([]);
  const [loadedKey, setLoadedKey] = useState("");
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [acknowledging, setAcknowledging] = useState(false);
  const [acknowledgedReceipt, setAcknowledgedReceipt] = useState(null);

  const activeProjectId =
    overrideProjectId || projectId || projects[0]?._id || projects[0]?.id || "";
  const loading = Boolean(activeProjectId) && loadedKey !== activeProjectId;
  const isLeader = user?.role === "leader";
  const isIncoming = user?.role === "incoming";

  useEffect(() => {
    let active = true;
    getProjects()
      .then((list) => {
        if (!active) return;
        setProjects(Array.isArray(list) ? list : []);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    if (!activeProjectId) {
      return () => {
        active = false;
      };
    }

    const sourcePromise = isLeader
      ? getSources(activeProjectId).catch(() => [])
      : Promise.resolve([]);

    Promise.all([
      sourcePromise,
      getHandoverReport(activeProjectId),
      getHandoverHistory(activeProjectId).catch(() => []),
    ])
      .then(([sourceList, handoverData, history]) => {
        if (!active) return;

        setError("");
        setActionError("");
        setSources(Object.fromEntries(sourceList.map((s) => [s.id, s])));
        setHistoryList(Array.isArray(history) ? history : []);
        setProjectData(handoverData?.project || null);
        setLiveFindings(Array.isArray(handoverData?.findings) ? handoverData.findings : []);
        setGapAnswers(Array.isArray(handoverData?.gapAnswers) ? handoverData.gapAnswers : []);
        setRiskMaps(Array.isArray(handoverData?.riskMaps) ? handoverData.riskMaps : []);
      })
      .catch((err) => {
        console.error("Handover report load failed:", err);
        if (active) {
          setError(
            err.message ||
              "Could not load official handover. Ensure the project is approved by your Team Leader."
          );
        }
      })
      .finally(() => {
        if (active) setLoadedKey(activeProjectId);
      });

    return () => {
      active = false;
    };
  }, [activeProjectId, isLeader]);

  async function handleDownloadPdf() {
    if (!activeProjectId) return;
    setDownloading(true);
    setActionError("");
    try {
      const isDraft =
        isLeader && projectData?.readinessStatus !== "Approved for Sharing";
      await downloadHandoverPdf(
        activeProjectId,
        `sanchaya-handover-${projectData?.name || activeProjectId}.pdf`,
        { draft: isDraft }
      );
      const updatedHistory = await getHandoverHistory(activeProjectId).catch(() => null);
      if (Array.isArray(updatedHistory)) {
        setHistoryList(updatedHistory);
      }
    } catch (err) {
      console.error("PDF download failed:", err);
      setActionError(err.message || "Failed to download handover PDF.");
    } finally {
      setDownloading(false);
    }
  }

  async function handleAcknowledge() {
    if (!activeProjectId) return;
    setAcknowledging(true);
    setActionError("");
    try {
      const rec = await acknowledgeHandover(activeProjectId);
      setAcknowledgedReceipt(rec || { acknowledgedAt: new Date().toISOString() });
      const updatedHistory = await getHandoverHistory(activeProjectId).catch(() => null);
      if (Array.isArray(updatedHistory)) {
        setHistoryList(updatedHistory);
      }
    } catch (err) {
      console.error("Acknowledgment failed:", err);
      setActionError(err.message || "Failed to acknowledge handover.");
    } finally {
      setAcknowledging(false);
    }
  }

  const allFindings = liveFindings.length > 0 ? liveFindings : approved;
  const isApproved = projectData?.readinessStatus === "Approved for Sharing";
  const canViewPackage = isApproved || isLeader || allFindings.length > 0;

  const userId = user?.id || user?._id || user?.userId || "";
  const existingAck = historyList.find((rec) => {
    if (!rec?.acknowledgedBy) return false;
    const ackId = rec.acknowledgedBy._id || rec.acknowledgedBy.id || rec.acknowledgedBy;
    return userId ? String(ackId) === String(userId) : Boolean(rec.acknowledgedAt);
  });
  const isAcknowledged = Boolean(acknowledgedReceipt || existingAck);

  if (loading) {
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-3xl items-center justify-center px-5 py-16 text-[#4A5F5B]">
        <Loader2 className="mr-2 animate-spin" />
        Loading verified handover package...
      </main>
    );
  }

  if (error || !canViewPackage) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-16 sm:px-8">
        <div className="rounded-3xl border border-[#DDEBE3] bg-white p-8 text-center shadow-sm sm:p-12">
          <Clock size={48} className="mx-auto text-amber-600" />
          <h1 className="mt-4 text-3xl font-bold text-[#001E2B]">
            {title} is not ready yet
          </h1>
          <p className="mx-auto mt-3 max-w-lg leading-7 text-[#4A5F5B]">
            Your Team Leader has not finalized the 7-Point Readiness Checklist and signed off on this project.
            You will gain access once the status reaches <strong>&quot;Approved for Sharing&quot;</strong>.
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
          <p className="mb-1 text-xs font-bold uppercase tracking-[0.16em] text-[#159B59]">
            Stage 5 · Handover Delivery & Acknowledgement
          </p>
          <div className="flex items-center gap-2">
            <ShieldCheck size={24} className="text-[#159B59]" />
            <h1 className="text-3xl font-bold text-[#001E2B] sm:text-4xl">
              {projectData?.name || title}
            </h1>
          </div>
          <p className="mt-1 text-sm text-[#4A5F5B]">
            Evidence-backed knowledge handover continuation package
            {projectData?.approvedSnapshotHash && (
              <span className="ml-2 inline-block rounded-full border border-[#CDE9D8] bg-[#EAF8EF] px-2.5 py-0.5 font-mono text-[11px] font-semibold text-[#087A3D]">
                Snapshot {String(projectData.approvedSnapshotHash).slice(0, 12)}
              </span>
            )}
          </p>
          {isIncoming &&
            Array.isArray(projectData?.recipientScope) &&
            projectData.recipientScope.length > 0 &&
            !projectData.recipientScope.some((s) =>
              ["project", "all", "*"].includes(String(s).toLowerCase())
            ) && (
              <p className="mt-1.5 text-xs text-[#64756F]">
                Visible sections scoped to:{" "}
                <strong className="text-[#29483B]">
                  {projectData.recipientScope.join(", ")}
                </strong>
              </p>
            )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {projects.length > 1 && (
            <select
              aria-label="Select project"
              value={activeProjectId}
              onChange={(e) => {
                setOverrideProjectId(e.target.value);
                setLiveFindings([]);
                setGapAnswers([]);
                setRiskMaps([]);
                setProjectData(null);
                setHistoryList([]);
                setSources({});
                setAcknowledgedReceipt(null);
                setError("");
                setActionError("");
              }}
              className="rounded-full border border-[#D8E7DF] bg-white px-3.5 py-2 text-xs font-semibold text-[#29483B] outline-none"
            >
              {projects.map((p) => (
                <option key={p._id || p.id} value={p._id || p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={downloading}
            className="flex items-center gap-2 rounded-full border border-[#001E2B] bg-white px-5 py-2.5 text-xs font-semibold text-[#001E2B] hover:bg-[#F5F8F7] disabled:opacity-50"
          >
            {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            {downloading
              ? "Generating PDF..."
              : isLeader && !isApproved
                ? "Download Draft PDF"
                : "Download Official PDF"}
          </button>

          {isIncoming &&
            (!isAcknowledged ? (
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
            ))}
        </div>
      </div>

      {isLeader && !isApproved && (
        <div className="mt-6 flex items-start gap-3 rounded-2xl border border-[#F2DFBE] bg-[#FFF8EC] p-4 text-xs text-[#7A5214]">
          <AlertCircle size={18} className="mt-0.5 shrink-0 text-[#C47A17]" />
          <span>
            <strong>Draft Preview:</strong> This workspace is currently{" "}
            <strong>{projectData?.readinessStatus || "Needs Attention"}</strong>. Incoming
            members cannot access Stage 5 routes until you sign off on the 7-Point Readiness Checklist
            (status <strong>&quot;Approved for Sharing&quot;</strong>).
          </span>
        </div>
      )}

      {actionError && (
        <div className="mt-6 flex items-start gap-2 rounded-2xl border border-[#F1D7D2] bg-[#FFF5F3] p-4 text-xs text-[#A33F32]">
          <AlertCircle size={17} className="mt-0.5 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {isAcknowledged && (
        <div className="mt-6 flex items-center gap-3 rounded-2xl border border-green-200 bg-green-50 p-4 text-xs text-green-900">
          <CheckCircle size={18} className="shrink-0 text-green-600" />
          <span>
            Formal receipt confirmed in MongoDB Handover History
            {(acknowledgedReceipt?.acknowledgedAt || existingAck?.acknowledgedAt) &&
              ` on ${new Date(
                acknowledgedReceipt?.acknowledgedAt || existingAck?.acknowledgedAt
              ).toLocaleString()}`}
            .
          </span>
        </div>
      )}

      {/* 1. Confirmed Points */}
      <section className="mt-8">
        <h2 className="text-2xl font-bold text-[#001E2B]">
          1. Confirmed Knowledge & Decisions ({sure.length})
        </h2>
        <p className="mt-1 text-xs text-[#71817B]">
          Deterministic exact-substring evidence found in authorized GitHub or document sources.
        </p>

        {sure.length === 0 ? (
          <p className="mt-4 text-sm text-[#71817B]">No confirmed items approved yet.</p>
        ) : (
          <ul className="m-0 mt-4 list-none space-y-4 p-0">
            {sure.map((f, i) => (
              <HandoverFindingItem key={f._id || f.id || i} f={f} sources={sources} />
            ))}
          </ul>
        )}
      </section>

      {/* 2. Points requiring follow-up */}
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
              <HandoverFindingItem key={f._id || f.id || i} f={f} sources={sources} />
            ))}
          </ul>
        </section>
      )}

      {/* 3. Departing member self-reported context */}
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
                key={item._id || idx}
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
                  <p className="mb-1 text-xs font-medium text-[#0369A1]">
                    Departing Engineer Answer:
                  </p>
                  <p className="whitespace-pre-wrap leading-6">{item.answer}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 4. Contribution Concentration Risk Areas */}
      {riskMaps.length > 0 && (
        <section className="mt-12">
          <div className="flex items-center gap-2">
            <Activity size={20} className="text-[#159B59]" />
            <h2 className="text-2xl font-bold text-[#001E2B]">
              4. Knowledge Concentration Risk Areas ({riskMaps.length})
            </h2>
          </div>
          <p className="mt-1 text-xs text-[#71817B]">
            Modules flagged by Analytics Service for concentrated ownership or bus-factor attention.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {riskMaps.map((rm, idx) => {
              const tierStyle =
                RISK_TIER_STYLES[rm.riskTier] || RISK_TIER_STYLES["Insufficient data"];
              return (
                <div
                  key={rm._id || rm.modulePath || idx}
                  className="rounded-xl border border-[#E1E8E5] bg-white p-4 shadow-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-bold text-[#001E2B]">
                      {rm.modulePath}
                    </span>
                    <span
                      className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${tierStyle}`}
                    >
                      {rm.riskTier}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-[#4A5F5B]">
                    Primary contributor:{" "}
                    <strong className="text-[#001E2B]">{rm.primaryContributor}</strong>{" "}
                    ({Math.round(rm.contributionPercentage ?? 0)}% · {rm.totalCommits ?? 0} changes)
                  </p>
                  {Array.isArray(rm.notes) && rm.notes.length > 0 && (
                    <p className="mt-1 text-[11px] text-[#71817B]">{rm.notes.join(" · ")}</p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 5. Handover History & Audit Log */}
      {historyList.length > 0 && (
        <section className="mt-12">
          <div className="flex items-center gap-2">
            <Clock size={20} className="text-[#159B59]" />
            <h2 className="text-2xl font-bold text-[#001E2B]">
              Handover History & Acknowledgement Log
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
                    Approved:{" "}
                    {rec.approvedSnapshot?.approvedAt
                      ? new Date(rec.approvedSnapshot.approvedAt).toLocaleString()
                      : "Date unavailable"}
                    {rec.approvedSnapshot?.approvedFindingsCount !== undefined &&
                      ` · ${rec.approvedSnapshot.approvedFindingsCount} findings`}
                    {rec.approvedSnapshot?.snapshotHash &&
                      ` · Hash ${String(rec.approvedSnapshot.snapshotHash).slice(0, 10)}`}
                    {rec.pdfExportedAt &&
                      ` · PDF exported ${new Date(rec.pdfExportedAt).toLocaleString()}`}
                  </p>
                </div>

                <div className="text-right">
                  {rec.acknowledgedBy ? (
                    <div className="text-xs">
                      <span className="font-semibold text-green-700">✓ Acknowledged</span>
                      <p className="text-[#71817B]">
                        by {rec.acknowledgedBy.name || rec.acknowledgedBy.email}
                      </p>
                      {rec.acknowledgedAt && (
                        <p className="text-[11px] text-[#84918B]">
                          {new Date(rec.acknowledgedAt).toLocaleString()}
                        </p>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs font-medium text-amber-600">
                      Pending Acknowledgment
                    </span>
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
