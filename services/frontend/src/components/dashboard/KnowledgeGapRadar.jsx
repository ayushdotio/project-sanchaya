
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

import {
  AlertTriangle,
  CircleHelp,
  ArrowRight,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

const gapData = [
  { subject: "Decisions", completeness: 85 },
  { subject: "Tasks", completeness: 90 },
  { subject: "Dependencies", completeness: 55 },
  { subject: "Blockers", completeness: 65 },
  { subject: "Documentation", completeness: 45 },
  { subject: "Ownership", completeness: 70 },
];

const questions = [
  {
    id: 1,
    question: "Who is responsible for the pending API integration?",
    category: "Ownership",
  },
  {
    id: 2,
    question: "Is the database migration decision finalized?",
    category: "Technical decision",
  },
  {
    id: 3,
    question: "What is blocking the authentication module?",
    category: "Blocker",
  },
];

export default function KnowledgeGapRadar() {
  return (
    <Card className="border-[#E1EAE5] bg-white shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg text-[#001E2B]">
          <AlertTriangle size={20} className="text-amber-600" />
          Knowledge Gap Radar
        </CardTitle>

        <CardDescription>
          Areas where project information may be incomplete
        </CardDescription>
      </CardHeader>

      <CardContent>
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart
              data={gapData}
              outerRadius="72%"
            >
              <PolarGrid stroke="#E5EEE9" />

              <PolarAngleAxis
                dataKey="subject"
                tick={{
                  fill: "#64756F",
                  fontSize: 11,
                }}
              />

              <PolarRadiusAxis
                angle={90}
                domain={[0, 100]}
                tick={false}
                axisLine={false}
              />

              <Radar
                name="Information completeness"
                dataKey="completeness"
                stroke="#159B59"
                fill="#159B59"
                fillOpacity={0.25}
                strokeWidth={2}
              />

              <Tooltip
                formatter={(value) => [
                  `${value}%`,
                  "Information completeness",
                ]}
                contentStyle={{
                  borderRadius: "12px",
                  border: "1px solid #E1EAE5",
                }}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[#001E2B]">
              Unresolved Questions
            </h3>

            <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
              {questions.length} Open
            </span>
          </div>

          <div className="space-y-3">
            {questions.map((item) => (
              <div
                key={item.id}
                className="flex gap-3 rounded-lg border border-[#E5EEE9] p-3"
              >
                <CircleHelp
                  size={18}
                  className="mt-0.5 shrink-0 text-amber-600"
                />

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-5 text-[#001E2B]">
                    {item.question}
                  </p>

                  <span className="mt-2 inline-block rounded-full bg-[#F0F8F4] px-2 py-1 text-xs text-[#4A5F5B]">
                    {item.category}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <button
          type="button"
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-[#DCE9E3] py-3 text-sm font-semibold text-[#087A3D] transition hover:bg-[#F0F8F4]"
        >
          Review Knowledge Gaps
          <ArrowRight size={16} />
        </button>
      </CardContent>
    </Card>
  );
}

