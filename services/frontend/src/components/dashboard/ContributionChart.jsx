import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

export default function ContributionChart({ riskMapData = null }) {
  const chartData = useMemo(() => {
    if (!riskMapData) {
      return [];
    }

    // Format 1: author_shares list
    if (Array.isArray(riskMapData.author_shares) && riskMapData.author_shares.length > 0) {
      return riskMapData.author_shares.map((item) => ({
        member: item.author || item.contributor || "Unknown",
        contribution: Math.round(item.commit_percentage ?? item.percentage ?? 0),
      }));
    }

    // Format 2: units breakdown from Analytics Service
    if (Array.isArray(riskMapData.units) && riskMapData.units.length > 0) {
      const contributorStats = {};
      let totalChanges = 0;

      riskMapData.units.forEach((u) => {
        const author = u.top_contributor || "Other";
        const changes = u.total_changes || 1;
        contributorStats[author] = (contributorStats[author] || 0) + changes;
        totalChanges += changes;
      });

      if (totalChanges > 0) {
        return Object.entries(contributorStats)
          .map(([member, changes]) => ({
            member,
            contribution: Math.round((changes / totalChanges) * 100),
          }))
          .sort((a, b) => b.contribution - a.contribution);
      }
    }

    // Format 3: Array of raw RiskMap documents
    if (Array.isArray(riskMapData) && riskMapData.length > 0) {
      const contributorShares = {};
      riskMapData.forEach((r) => {
        const c = r.primaryContributor || "Unknown";
        const p = r.contributionPercentage || 0;
        if (!contributorShares[c] || p > contributorShares[c]) {
          contributorShares[c] = p;
        }
      });
      return Object.entries(contributorShares)
        .map(([member, contribution]) => ({
          member,
          contribution: Math.round(contribution),
        }))
        .sort((a, b) => b.contribution - a.contribution);
    }

    return [];
  }, [riskMapData]);

  const highestContribution = chartData.length > 0
    ? Math.max(...chartData.map((item) => item.contribution))
    : 0;

  return (
    <Card className="border-[#E1EAE5] bg-white shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg text-[#001E2B]">
          Contribution Concentration
        </CardTitle>

        <CardDescription>
          Distribution of recorded project contributions (Bus-Factor Risk)
        </CardDescription>
      </CardHeader>

      <CardContent>
        <div className="h-[280px] w-full">
          {chartData.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <p className="text-sm font-medium text-[#71817B]">
                No contribution risk data available.
              </p>
              <p className="mt-1 text-xs text-[#9AA5A0]">
                Connect GitHub commits or task trackers to calculate contribution concentration.
              </p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{
                  top: 5,
                  right: 25,
                  left: 10,
                  bottom: 5,
                }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  horizontal={false}
                  stroke="#E5EEE9"
                />

                <XAxis
                  type="number"
                  domain={[0, 100]}
                  tickFormatter={(value) => `${value}%`}
                  tick={{ fill: "#71817B", fontSize: 12 }}
                />

                <YAxis
                  type="category"
                  dataKey="member"
                  width={85}
                  tick={{ fill: "#4A5F5B", fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />

                <Tooltip
                  formatter={(value) => [
                    `${value}%`,
                    "Recorded contribution",
                  ]}
                  contentStyle={{
                    borderRadius: "12px",
                    border: "1px solid #E1EAE5",
                  }}
                />

                <Bar
                  dataKey="contribution"
                  fill="#159B59"
                  radius={[0, 6, 6, 0]}
                  barSize={22}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {chartData.length > 0 && (
          <div className="mt-4 rounded-lg bg-[#F0F8F4] p-3">
            <p className="text-sm font-semibold text-[#001E2B]">
              Highest recorded contribution: {highestContribution}%
            </p>

            <p className="mt-1 text-xs leading-5 text-[#64756F]">
              This is a deterministic distribution of recorded activity, not a
              measurement of individual performance or expertise.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
