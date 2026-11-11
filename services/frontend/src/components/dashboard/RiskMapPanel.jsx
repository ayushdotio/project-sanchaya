import {
  Activity,
  AlertTriangle,
  FileCode2,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Users,
  ListChecks,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const LEVEL_STYLES = {
  High: "border-[#F1C9C3] bg-[#FFF1EE] text-[#A33F32]",
  Medium: "border-[#F2DFBE] bg-[#FFF7EA] text-[#9A681D]",
  Low: "border-[#CDE9D8] bg-[#EAF8EF] text-[#087A3D]",
  "Insufficient data": "border-[#DCE6E1] bg-[#F4F8F6] text-[#5C6F68]",
};

function RiskBadge({ level }) {
  const style = LEVEL_STYLES[level] || LEVEL_STYLES["Insufficient data"];
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${style}`}
    >
      {level || "Insufficient data"}
    </span>
  );
}

function formatShare(share) {
  if (typeof share !== "number" || Number.isNaN(share)) return "N/A";
  const pct = share <= 1 ? share * 100 : share;
  return `${Math.round(pct)}%`;
}

export default function RiskMapPanel({
  riskMapData = null,
  loading = false,
  error = "",
  onRefresh = null,
  title = "Contribution Concentration Risk Map",
}) {
  const units = Array.isArray(riskMapData?.units) ? riskMapData.units : [];
  const hotspots = Array.isArray(riskMapData?.hotspot_files)
    ? riskMapData.hotspot_files
    : [];
  const taskGroups = Array.isArray(riskMapData?.task_groups)
    ? riskMapData.task_groups
    : [];
  const contributors = Array.isArray(riskMapData?.contributors)
    ? riskMapData.contributors
    : [];
  const departingRiskUnits = Array.isArray(riskMapData?.departing_member_risk_units)
    ? riskMapData.departing_member_risk_units
    : [];
  const taskRisk = riskMapData?.task_risk || null;

  const highOrMediumCount = units.filter(
    (u) => u.level === "High" || u.level === "Medium"
  ).length;

  const hasData =
    Boolean(riskMapData) &&
    (units.length > 0 ||
      hotspots.length > 0 ||
      taskGroups.length > 0 ||
      contributors.length > 0 ||
      Boolean(taskRisk));

  const asOfLabel = riskMapData?.as_of
    ? new Date(riskMapData.as_of).toLocaleString()
    : "";
  const departingMember = riskMapData?.departing_member || "";

  return (
    <Card className="border-[#E1EAE5] bg-white shadow-sm">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg text-[#001E2B]">
            <Activity size={19} className="text-[#159B59]" />
            {title}
          </CardTitle>
          <CardDescription>
            Deterministic bus-factor and contribution concentration analysis from Analytics Service
          </CardDescription>
          {(asOfLabel || departingMember) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-[#5C6F68]">
              {departingMember && (
                <span className="rounded-full border border-[#DCE6E1] bg-[#F4F8F6] px-2.5 py-0.5 font-medium text-[#24483A]">
                  Departing focus: {departingMember}
                </span>
              )}
              {asOfLabel && (
                <span className="rounded-full border border-[#DCE6E1] bg-white px-2.5 py-0.5">
                  As of: {asOfLabel}
                </span>
              )}
            </div>
          )}
        </div>

        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="inline-flex w-fit items-center gap-1.5 rounded-xl border border-[#DCE9E3] bg-white px-3.5 py-2 text-xs font-semibold text-[#24483A] transition hover:border-[#159B59] hover:bg-[#F5FAF7] disabled:opacity-50"
          >
            {loading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <RefreshCw size={14} />
            )}
            {loading ? "Analyzing..." : "Refresh Risk Map"}
          </button>
        )}
      </CardHeader>

      <CardContent className="space-y-5">
        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-[#F1D7D2] bg-[#FFF5F3] p-3 text-sm text-[#A33F32]">
            <AlertTriangle size={17} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {loading && !riskMapData ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-[#71817B]">
            <Loader2 size={18} className="animate-spin text-[#159B59]" />
            Computing contribution concentration risk map...
          </div>
        ) : !hasData ? (
          <div className="rounded-2xl border border-dashed border-[#D8EADF] bg-[#F8FCF9] p-6 text-center">
            <p className="text-sm font-semibold text-[#29483B]">
              No risk map data computed yet.
            </p>
            <p className="mt-1 text-xs text-[#71817B]">
              Connect GitHub commits or upload task trackers in Stage 1, then load the Risk Map.
            </p>
          </div>
        ) : (
          <>
            {/* Summary Metrics */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-[#E6EFEA] bg-[#F9FCFA] p-3.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[#64756F]">
                  <Users size={14} className="text-[#159B59]" />
                  Contributors
                </div>
                <p className="mt-1.5 text-2xl font-bold text-[#001E2B]">
                  {contributors.length}
                </p>
              </div>

              <div className="rounded-xl border border-[#E6EFEA] bg-[#F9FCFA] p-3.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[#64756F]">
                  <Activity size={14} className="text-[#159B59]" />
                  Modules Analyzed
                </div>
                <p className="mt-1.5 text-2xl font-bold text-[#001E2B]">
                  {units.length}
                </p>
              </div>

              <div className="rounded-xl border border-[#E6EFEA] bg-[#F9FCFA] p-3.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[#64756F]">
                  <AlertTriangle size={14} className="text-[#C47A17]" />
                  Elevated Risk Areas
                </div>
                <p className="mt-1.5 text-2xl font-bold text-[#001E2B]">
                  {highOrMediumCount}
                </p>
              </div>

              <div className="rounded-xl border border-[#E6EFEA] bg-[#F9FCFA] p-3.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[#64756F]">
                  <FileCode2 size={14} className="text-[#3973C8]" />
                  Hotspot Files
                </div>
                <p className="mt-1.5 text-2xl font-bold text-[#001E2B]">
                  {riskMapData.total_hotspots ?? hotspots.length}
                </p>
              </div>
            </div>

            {/* Departing Member Concentration Alert */}
            {departingRiskUnits.length > 0 && (
              <div className="flex items-start gap-3 rounded-xl border border-[#F2DFBE] bg-[#FFF8EC] p-4 text-sm text-[#7A5214]">
                <AlertTriangle size={18} className="mt-0.5 shrink-0 text-[#C47A17]" />
                <div>
                  <p className="font-semibold">
                    Knowledge concentration detected for{" "}
                    {riskMapData.departing_member || "departing member"}
                  </p>
                  <p className="mt-1 text-xs leading-5">
                    High/Medium concentration modules:{" "}
                    <span className="font-mono font-semibold">
                      {departingRiskUnits.join(", ")}
                    </span>
                  </p>
                </div>
              </div>
            )}

            {/* Module / Unit Risk Breakdown */}
            {units.length > 0 && (
              <div>
                <h3 className="mb-2.5 text-sm font-bold text-[#001E2B]">
                  Module & Area Risk Breakdown
                </h3>
                <div className="overflow-x-auto rounded-xl border border-[#E1ECE6]">
                  <table className="w-full text-left text-xs sm:text-sm">
                    <thead className="border-b border-[#E8F0EC] bg-[#F8FCF9] text-[11px] font-semibold uppercase tracking-wide text-[#71817B]">
                      <tr>
                        <th className="px-4 py-2.5">Module / Unit</th>
                        <th className="px-4 py-2.5">Risk Tier</th>
                        <th className="px-4 py-2.5">Primary Contributor</th>
                        <th className="px-4 py-2.5">Share</th>
                        <th className="px-4 py-2.5">Changes</th>
                        <th className="px-4 py-2.5">50% Cover</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EEF3F0]">
                      {units.map((u, idx) => (
                        <tr key={`${u.unit}-${idx}`} className="hover:bg-[#FAFDFB]">
                          <td className="px-4 py-2.5 font-mono text-xs font-semibold text-[#001E2B]">
                            <div>{u.unit}</div>
                            {Array.isArray(u.notes) && u.notes.length > 0 && (
                              <p className="mt-0.5 font-sans text-[11px] font-normal text-[#71817B]">
                                {u.notes.join(" · ")}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-2.5">
                            <RiskBadge level={u.level} />
                          </td>
                          <td className="px-4 py-2.5 text-xs font-medium text-[#29483B]">
                            {u.top_contributor || "Unknown"}
                          </td>
                          <td className="px-4 py-2.5 text-xs font-semibold text-[#001E2B]">
                            {formatShare(u.top_commit_share)}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-[#64756F]">
                            {u.total_changes ?? 0}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-[#64756F]">
                            {u.contributors_to_cover_50pct ?? 1}{" "}
                            {u.contributors_to_cover_50pct === 1 ? "person" : "people"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Hotspot Files */}
            {hotspots.length > 0 && (
              <div>
                <h3 className="mb-2.5 text-sm font-bold text-[#001E2B]">
                  Hotspot Files ({riskMapData.total_hotspots ?? hotspots.length})
                </h3>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {hotspots.map((file, idx) => (
                    <div
                      key={`${file.file}-${idx}`}
                      className="flex items-center justify-between gap-3 rounded-xl border border-[#E6EFEA] bg-[#FAFDFB] p-3 text-xs"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-mono font-semibold text-[#001E2B]">
                          {file.file}
                        </p>
                        <p className="mt-0.5 text-[#64756F]">
                          {file.top_contributor || "Unknown"} ·{" "}
                          {formatShare(file.top_commit_share)} ({file.total_changes ?? 0} changes)
                        </p>
                      </div>
                      <RiskBadge level={file.level} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Task Risk & Task Groups */}
            {taskRisk && (
              <div className="rounded-xl border border-[#E6EFEA] bg-[#F8FCF9] p-4">
                <div className="mb-2.5 flex items-center gap-2 text-sm font-bold text-[#001E2B]">
                  <ListChecks size={16} className="text-[#159B59]" />
                  Task & Ownership Risk Signals
                </div>
                <div className="grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-lg bg-white p-2.5 border border-[#EAF1ED]">
                    <span className="text-[#71817B]">Open / Blocked Tasks:</span>{" "}
                    <strong className="text-[#001E2B]">
                      {taskRisk.open_or_blocked ?? 0}
                    </strong>
                  </div>
                  <div className="rounded-lg bg-white p-2.5 border border-[#EAF1ED]">
                    <span className="text-[#71817B]">Unowned Open Tasks:</span>{" "}
                    <strong className="text-[#001E2B]">
                      {taskRisk.unowned?.length ?? 0}
                    </strong>
                  </div>
                  <div className="rounded-lg bg-white p-2.5 border border-[#EAF1ED]">
                    <span className="text-[#71817B]">Departing Member Open:</span>{" "}
                    <strong className="text-[#001E2B]">
                      {taskRisk.departing_member_open_tasks?.length ?? 0}
                    </strong>
                  </div>
                  <div className="rounded-lg bg-white p-2.5 border border-[#EAF1ED]">
                    <span className="text-[#71817B]">Single-Contributor Tasks:</span>{" "}
                    <strong className="text-[#001E2B]">
                      {taskRisk.single_contributor_tasks?.length ?? 0}
                    </strong>
                  </div>
                </div>
              </div>
            )}

            {taskGroups.length > 0 && (
              <div>
                <h3 className="mb-2.5 flex items-center gap-2 text-sm font-bold text-[#001E2B]">
                  <ListChecks size={15} className="text-[#159B59]" />
                  Task Group Concentration ({taskGroups.length})
                </h3>
                <div className="overflow-x-auto rounded-xl border border-[#E6EFEA]">
                  <table className="w-full min-w-[540px] border-collapse text-left text-sm">
                    <thead className="bg-[#F6FAF7] text-xs uppercase tracking-wider text-[#64756F]">
                      <tr>
                        <th className="px-4 py-2.5 font-semibold">Task Group</th>
                        <th className="px-4 py-2.5 font-semibold">Risk</th>
                        <th className="px-4 py-2.5 font-semibold">Top Contributor</th>
                        <th className="px-4 py-2.5 font-semibold">Share</th>
                        <th className="px-4 py-2.5 font-semibold">Total Tasks</th>
                        <th className="px-4 py-2.5 font-semibold">Open / Blocked</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EEF3F0]">
                      {taskGroups.map((group, idx) => (
                        <tr
                          key={`${group.task_group}-${idx}`}
                          className="hover:bg-[#FAFDFB]"
                        >
                          <td className="px-4 py-2.5 font-mono text-xs font-semibold text-[#001E2B]">
                            <div>{group.task_group || "Uncategorized"}</div>
                            {Array.isArray(group.notes) && group.notes.length > 0 && (
                              <p className="mt-0.5 font-sans text-[11px] font-normal text-[#71817B]">
                                {group.notes.join(" · ")}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-2.5">
                            <RiskBadge level={group.level} />
                          </td>
                          <td className="px-4 py-2.5 text-xs font-medium text-[#29483B]">
                            {group.top_contributor || "Unknown"}
                          </td>
                          <td className="px-4 py-2.5 text-xs font-semibold text-[#001E2B]">
                            {formatShare(group.top_task_share)}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-[#64756F]">
                            {group.total_tasks ?? 0}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-[#64756F]">
                            {group.open_or_blocked ?? 0}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Disclaimer */}
            <p className="flex items-start gap-2 rounded-lg bg-[#F4FAF6] px-3 py-2 text-xs leading-5 text-[#5C6F68]">
              <ShieldCheck size={14} className="mt-0.5 shrink-0 text-[#159B59]" />
              <span>
                {riskMapData.disclaimer ||
                  "Potential knowledge-risk areas only. Not a measure of individual performance."}
              </span>
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

