import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import ContributionChart from "@/components/dashboard/ContributionChart";
import RiskMapPanel from "@/components/dashboard/RiskMapPanel";

const SOURCE_TYPE_OPTIONS = [
  { key: "github", label: "GitHub" },
  { key: "document", label: "Meeting Notes" },
  { key: "task", label: "Task CSV" },
];

export default function Stage2ReconstructionPanel({
  projectId = "",
  sources = null,
  onGoToSources = null,
  onReconstruct,
  reconstructing = false,
  reconstructSourceTypes = [],
  onToggleSourceType,
  onResetSourceTypes,
  selectedSourceIds = [],
  onToggleSourceId = null,
  onClearSourceIds = null,
  reconstructionResult = null,
  reconstructionMessage = "",
  reconstructionError = "",
  onLoadRiskMap,
  riskMapLoading = false,
  riskMapData = null,
  riskMapError = "",
  onScanFreshness,
  freshnessScanning = false,
  freshnessReport = null,
  freshnessError = "",
  onReviewFindings = null,
  includeChart = false,
  showRiskMap = true,
}) {
  const isAllSelected = reconstructSourceTypes.length === 0;
  const hasSourceList = Array.isArray(sources);
  const matchingSources = hasSourceList
    ? isAllSelected
      ? sources
      : sources.filter((s) => reconstructSourceTypes.includes(s.source_type))
    : [];
  const noIngestedSources = hasSourceList && sources.length === 0;
  const noMatchingFilteredSources =
    hasSourceList && sources.length > 0 && matchingSources.length === 0;
  const effectiveDisabledBySources =
    hasSourceList && matchingSources.length === 0;

  return (
    <section className="rounded-3xl border border-[#D8EADF] bg-white p-6 shadow-sm sm:p-8">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-bold tracking-[0.15em] text-[#159B59]">
            <Sparkles size={16} />
            STAGE 2 · KNOWLEDGE RECONSTRUCTION & RISK MAP
          </div>
          <h2 className="text-xl font-bold text-[#001E2B]">
            Reconstruct Project Knowledge
          </h2>
          <p className="mt-1 text-sm leading-6 text-[#71817B]">
            Trigger AI extraction with deterministic 4-state verification and compute the
            Contribution Concentration Risk Map from Analytics Service.
          </p>
        </div>

        {hasSourceList && (
          <div className="rounded-xl border border-[#DCE9E3] bg-[#F7FBF9] px-3 py-1.5 text-xs font-semibold text-[#24483A]">
            {matchingSources.length} of {sources.length} ingested source
            {sources.length === 1 ? "" : "s"} in scope
          </div>
        )}
      </div>

      {/* Empty sources or empty filter warning */}
      {noIngestedSources && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#F2DFBE] bg-[#FFF8EB] px-4 py-3 text-xs text-[#8A5A12]">
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-[#B7791F]" />
            <span>
              No Stage 1 source records have been ingested yet. Connect a GitHub repository, upload meeting notes, or import a task CSV before running reconstruction.
            </span>
          </div>
          {onGoToSources && (
            <button
              type="button"
              onClick={onGoToSources}
              className="rounded-lg bg-[#9A681D] px-3 py-1.5 font-semibold text-white transition hover:bg-[#7D5315]"
            >
              Go to Stage 1 Sources
            </button>
          )}
        </div>
      )}

      {noMatchingFilteredSources && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#F2DFBE] bg-[#FFF8EB] px-4 py-3 text-xs text-[#8A5A12]">
          <span>
            No ingested source records match the currently selected source type filter.
          </span>
          {onResetSourceTypes && (
            <button
              type="button"
              onClick={onResetSourceTypes}
              className="rounded-lg border border-[#D8B474] bg-white px-3 py-1 font-semibold text-[#8A5A12] transition hover:bg-[#FFF3DC]"
            >
              Reset Filter
            </button>
          )}
        </div>
      )}

      {/* Source scope selector (optional filter passed to POST /reconstruct) */}
      {onToggleSourceType && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-[#4A5F5B]">
            Source scope:
          </span>
          <button
            type="button"
            onClick={onResetSourceTypes}
            disabled={reconstructing}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
              isAllSelected
                ? "border-[#159B59] bg-[#EAF8EF] text-[#087A3D]"
                : "border-[#DCE9E3] bg-white text-[#64756F] hover:border-[#159B59]"
            }`}
          >
            All Sources
          </button>
          {SOURCE_TYPE_OPTIONS.map((opt) => {
            const active = reconstructSourceTypes.includes(opt.key);
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => onToggleSourceType(opt.key)}
                disabled={reconstructing}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                  active
                    ? "border-[#159B59] bg-[#EAF8EF] text-[#087A3D]"
                    : "border-[#DCE9E3] bg-white text-[#64756F] hover:border-[#159B59]"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Optional specific sourceIds multi-select */}
      {hasSourceList && matchingSources.length > 0 && onToggleSourceId && (
        <div className="mb-5 rounded-2xl border border-[#E5EFEA] bg-[#FAFDFB] p-3.5">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-[#4A5F5B]">
              Target specific source records (optional —{" "}
              {selectedSourceIds.length > 0
                ? `${selectedSourceIds.length} selected`
                : `all ${matchingSources.length} matching`}
              ):
            </span>
            {selectedSourceIds.length > 0 && onClearSourceIds && (
              <button
                type="button"
                onClick={onClearSourceIds}
                disabled={reconstructing}
                className="text-xs font-semibold text-[#159B59] hover:underline"
              >
                Clear selection
              </button>
            )}
          </div>
          <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
            {matchingSources.map((src) => {
              const id = src.source_id;
              const selected = selectedSourceIds.includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onToggleSourceId(id)}
                  disabled={reconstructing}
                  title={src.raw_filename || src.origin || id}
                  className={`rounded-lg border px-2.5 py-1 font-mono text-[11px] font-medium transition ${
                    selected
                      ? "border-[#159B59] bg-[#EAF8EF] text-[#087A3D]"
                      : "border-[#DCE9E3] bg-white text-[#4A5F5B] hover:border-[#159B59]"
                  }`}
                >
                  {id}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <Button
          onClick={() =>
            onReconstruct?.(
              selectedSourceIds.length > 0 ? selectedSourceIds : undefined
            )
          }
          disabled={
            !projectId ||
            reconstructing ||
            riskMapLoading ||
            freshnessScanning ||
            effectiveDisabledBySources
          }
          className="gap-2 rounded-xl bg-[#159B59] text-white hover:bg-[#087A3D]"
        >
          {reconstructing ? (
            <>
              <Loader2 size={16} className="animate-spin" /> Reconstructing...
            </>
          ) : (
            <>
              <Sparkles size={16} /> Run Knowledge Reconstruction
            </>
          )}
        </Button>

        <Button
          variant="outline"
          onClick={onLoadRiskMap}
          disabled={!projectId || riskMapLoading || reconstructing || freshnessScanning}
          className="gap-2 rounded-xl border-[#D8E7DF] bg-white text-[#24483A]"
        >
          {riskMapLoading ? (
            <>
              <Loader2 size={16} className="animate-spin" /> Loading Risk Map...
            </>
          ) : (
            <>
              <Activity size={16} /> Load Risk Map
            </>
          )}
        </Button>

        {onScanFreshness && (
          <Button
            variant="outline"
            onClick={onScanFreshness}
            disabled={!projectId || freshnessScanning || reconstructing || riskMapLoading}
            className="gap-2 rounded-xl border-[#D8E7DF] bg-white text-[#24483A]"
          >
            {freshnessScanning ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Scanning Freshness...
              </>
            ) : (
              <>
                <RefreshCw size={16} /> Scan Freshness
              </>
            )}
          </Button>
        )}
      </div>

      {/* Freshness scan result */}
      {freshnessReport && (
        <div className="mt-4 rounded-xl border border-[#CDE9D8] bg-[#EAF8EF] p-4 text-sm text-[#087A3D]">
          <div className="flex items-center gap-2 font-semibold">
            <CheckCircle2 size={16} />
            <span>Freshness scan complete</span>
          </div>
          <p className="mt-1 text-xs text-[#24483A]">
            {freshnessReport.message || "Freshness scanned across project findings."}
            {(freshnessReport.stale_count ?? freshnessReport.staleCount) !== undefined &&
              ` Stale findings: ${freshnessReport.stale_count ?? freshnessReport.staleCount}.`}
            {(freshnessReport.checked_at || freshnessReport.scannedAt) &&
              ` Checked: ${new Date(
                freshnessReport.checked_at || freshnessReport.scannedAt
              ).toLocaleString()}.`}
          </p>
        </div>
      )}
      {freshnessError && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-[#F1D7D2] bg-[#FFF5F3] p-3 text-sm text-[#A33F32]">
          <AlertTriangle size={17} className="mt-0.5 shrink-0" />
          <span>{freshnessError}</span>
        </div>
      )}

      {/* Reconstruction summary */}
      {(reconstructionMessage || reconstructionResult) && (
        <div className="mt-4 rounded-2xl border border-[#CDE9D8] bg-[#EAF8EF] p-4 text-sm text-[#087A3D]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-semibold">
              <CheckCircle2 size={17} />
              <span>
                {reconstructionMessage ||
                  "Knowledge reconstruction completed successfully."}
              </span>
            </div>
            {onReviewFindings && (
              <button
                type="button"
                onClick={onReviewFindings}
                className="inline-flex items-center gap-1 rounded-lg bg-[#087A3D] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#065E2E]"
              >
                Review Findings <ArrowUpRight size={13} />
              </button>
            )}
          </div>

          {reconstructionResult && (
            <div className="mt-3 grid gap-2 sm:grid-cols-4">
              <div className="rounded-xl bg-white/85 px-3 py-2 text-xs">
                <span className="text-[#64756F]">Sources Used</span>
                <p className="mt-0.5 text-base font-bold text-[#001E2B]">
                  {reconstructionResult.sourcesUsed ??
                    reconstructionResult.sourceIds?.length ??
                    0}
                </p>
              </div>
              <div className="rounded-xl bg-white/85 px-3 py-2 text-xs">
                <span className="text-[#64756F]">Findings Extracted</span>
                <p className="mt-0.5 text-base font-bold text-[#001E2B]">
                  {reconstructionResult.findingsCount ?? 0}
                </p>
              </div>
              <div className="rounded-xl bg-white/85 px-3 py-2 text-xs">
                <span className="text-[#64756F]">Supported Claims</span>
                <p className="mt-0.5 text-base font-bold text-[#087A3D]">
                  {reconstructionResult.supportedCount ?? 0}
                </p>
              </div>
              <div className="rounded-xl bg-white/85 px-3 py-2 text-xs">
                <span className="text-[#64756F]">Gap Questions</span>
                <p className="mt-0.5 text-base font-bold text-[#9A681D]">
                  {reconstructionResult.gapsGenerated ?? 0}
                </p>
              </div>
            </div>
          )}

          {Array.isArray(reconstructionResult?.sourceIds) &&
            reconstructionResult.sourceIds.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-[#24483A]">
                <span className="font-semibold">Processed source IDs:</span>
                {reconstructionResult.sourceIds.map((id) => (
                  <span
                    key={id}
                    className="rounded-md border border-[#BFE4CE] bg-white px-2 py-0.5 font-mono text-[11px] font-semibold text-[#087A3D]"
                  >
                    {id}
                  </span>
                ))}
              </div>
            )}
        </div>
      )}

      {reconstructionError && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-[#F1D7D2] bg-[#FFF5F3] p-3 text-sm text-[#A33F32]">
          <AlertTriangle size={17} className="mt-0.5 shrink-0" />
          <span>{reconstructionError}</span>
        </div>
      )}

      {/* Risk Map visual output */}
      {showRiskMap && (riskMapData !== null || riskMapError) && (
        <div className="mt-5 space-y-5">
          {includeChart && riskMapData !== null && (
            <ContributionChart riskMapData={riskMapData} />
          )}
          <RiskMapPanel
            riskMapData={riskMapData}
            loading={riskMapLoading}
            error={riskMapError}
            onRefresh={onLoadRiskMap}
          />
        </div>
      )}
    </section>
  );
}
