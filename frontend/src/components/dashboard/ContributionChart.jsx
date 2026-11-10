
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

const contributionData = [
  { member: "Member A", contribution: 45 },
  { member: "Member B", contribution: 30 },
  { member: "Member C", contribution: 15 },
  { member: "Member D", contribution: 10 },
];

export default function ContributionChart() {
  const highestContribution = Math.max(
    ...contributionData.map((item) => item.contribution)
  );

  return (
    <Card className="border-[#E1EAE5] bg-white shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg text-[#001E2B]">
          Contribution Concentration
        </CardTitle>

        <CardDescription>
          Distribution of recorded project contributions
        </CardDescription>
      </CardHeader>

      <CardContent>
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={contributionData}
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
                width={75}
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
        </div>

        <div className="mt-4 rounded-lg bg-[#F0F8F4] p-3">
          <p className="text-sm font-semibold text-[#001E2B]">
            Highest recorded contribution: {highestContribution}%
          </p>

          <p className="mt-1 text-xs leading-5 text-[#64756F]">
            This is a distribution of recorded activity, not a
            measurement of individual expertise or performance.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
