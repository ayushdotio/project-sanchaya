import { useMemo } from "react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { normalizeStatusKey } from "../Badges";

const COLOR_MAP = {
  supported: "#16A36A",
  needs_review: "#E5A23B",
  conflicting: "#D65C50",
  unknown: "#64748B",
};

export default function FindingChart({ findings = [], stats = null }) {
  const chartData = useMemo(() => {
    if (stats) {
      return [
        { name: "Supported", value: stats.supported || 0, color: COLOR_MAP.supported },
        { name: "Needs Review", value: stats.needs_review || stats.needsReview || 0, color: COLOR_MAP.needs_review },
        { name: "Conflicting", value: stats.conflicting || 0, color: COLOR_MAP.conflicting },
        { name: "Unknown", value: stats.unknown || 0, color: COLOR_MAP.unknown },
      ];
    }

    const counts = {
      supported: 0,
      needs_review: 0,
      conflicting: 0,
      unknown: 0,
    };

    if (Array.isArray(findings)) {
      findings.forEach((f) => {
        const key = normalizeStatusKey(f.verification_status || f.status);
        counts[key] = (counts[key] || 0) + 1;
      });
    }

    return [
      { name: "Supported", value: counts.supported, color: COLOR_MAP.supported },
      { name: "Needs Review", value: counts.needs_review, color: COLOR_MAP.needs_review },
      { name: "Conflicting", value: counts.conflicting, color: COLOR_MAP.conflicting },
      { name: "Unknown", value: counts.unknown, color: COLOR_MAP.unknown },
    ];
  }, [findings, stats]);

  const total = chartData.reduce((sum, item) => sum + item.value, 0);

  return (
    <Card className="border-[#E1EAE5] bg-white shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg text-[#001E2B]">
          Finding Analytics
        </CardTitle>

        <CardDescription>
          Distribution of candidate findings across 4 deterministic verification states
        </CardDescription>
      </CardHeader>

      <CardContent>
        <div className="relative h-[280px] w-full">
          {total === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <p className="text-sm font-medium text-[#71817B]">
                No findings reconstructed yet.
              </p>
              <p className="mt-1 text-xs text-[#9AA5A0]">
                Ingest sources and click Reconstruct Knowledge to extract findings.
              </p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="48%"
                  innerRadius={72}
                  outerRadius={105}
                  paddingAngle={4}
                  dataKey="value"
                  nameKey="name"
                  stroke="none"
                >
                  {chartData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>

                <Tooltip
                  formatter={(value, name) => [`${value} findings`, name]}
                  contentStyle={{
                    borderRadius: "12px",
                    border: "1px solid #E1EAE5",
                  }}
                />

                <Legend verticalAlign="bottom" iconType="circle" iconSize={9} />
              </PieChart>
            </ResponsiveContainer>
          )}

          {total > 0 && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pb-8">
              <span className="text-3xl font-bold text-[#001E2B]">{total}</span>
              <span className="text-xs text-[#71817B]">Total Findings</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
