
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

const chartData = [
  { name: "Supported", value: 14, color: "#16A36A" },
  { name: "Needs Review", value: 7, color: "#E5A23B" },
  { name: "Conflicting", value: 3, color: "#D65C50" },
];

export default function FindingChart() {
  const total = chartData.reduce(
    (sum, item) => sum + item.value,
    0
  );

  return (
    <Card className="border-[#E1EAE5] bg-white shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg text-[#001E2B]">
          Finding Analytics
        </CardTitle>

        <CardDescription>
          Distribution of project findings by review status
        </CardDescription>
      </CardHeader>

      <CardContent>
        <div className="relative h-[280px] w-full">
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
                  <Cell
                    key={entry.name}
                    fill={entry.color}
                  />
                ))}
              </Pie>

              <Tooltip
                formatter={(value, name) => [
                  `${value} findings`,
                  name,
                ]}
                contentStyle={{
                  borderRadius: "12px",
                  border: "1px solid #E1EAE5",
                }}
              />

              <Legend
                verticalAlign="bottom"
                iconType="circle"
                iconSize={9}
              />
            </PieChart>
          </ResponsiveContainer>

          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pb-8">
            <span className="text-3xl font-bold text-[#001E2B]">
              {total}
            </span>

            <span className="text-xs text-[#71817B]">
              Total Findings
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
