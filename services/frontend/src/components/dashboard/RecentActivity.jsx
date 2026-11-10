
import {
  GitBranch,
  FileUp,
  CheckCircle2,
  AlertCircle,
  Clock,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

const activities = [
  {
    id: 1,
    title: "GitHub repository connected",
    description: "Project repository activity imported.",
    time: "Today, 10:30 AM",
    icon: GitBranch,
    color: "bg-blue-50 text-blue-600",
  },
  {
    id: 2,
    title: "Meeting notes uploaded",
    description: "Project meeting notes added for analysis.",
    time: "Today, 11:15 AM",
    icon: FileUp,
    color: "bg-purple-50 text-purple-600",
  },
  {
    id: 3,
    title: "Finding approved",
    description: "A project finding was approved by the team leader.",
    time: "Today, 12:20 PM",
    icon: CheckCircle2,
    color: "bg-green-50 text-green-600",
  },
  {
    id: 4,
    title: "Evidence needs review",
    description: "One finding requires additional verification.",
    time: "Today, 01:00 PM",
    icon: AlertCircle,
    color: "bg-amber-50 text-amber-600",
  },
];

export default function RecentActivity() {
  return (
    <Card className="border-[#E1EAE5] bg-white shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg text-[#001E2B]">
          Recent Activity
        </CardTitle>

        <CardDescription>
          Latest updates from your project workspace
        </CardDescription>
      </CardHeader>

      <CardContent>
        <div className="space-y-5">
          {activities.map((activity, index) => {
            const Icon = activity.icon;

            return (
              <div key={activity.id} className="relative flex gap-4">
                {index !== activities.length - 1 && (
                  <div className="absolute left-[19px] top-11 h-full w-px bg-[#E5EEE9]" />
                )}

                <div
                  className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${activity.color}`}
                >
                  <Icon size={18} />
                </div>

                <div className="min-w-0 flex-1 pb-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold text-[#001E2B]">
                      {activity.title}
                    </h3>

                    <span className="flex items-center gap-1 text-xs text-[#84918B]">
                      <Clock size={12} />
                      {activity.time}
                    </span>
                  </div>

                  <p className="mt-1 text-sm leading-5 text-[#64756F]">
                    {activity.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
