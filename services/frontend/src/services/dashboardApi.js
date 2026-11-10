
const dashboardData = {
  stats: {
    total: 24,
    supported: 14,
    needsReview: 7,
    conflicting: 3,
  },

  activities: [
    {
      id: 1,
      title: "GitHub repository connected",
      description: "Project repository activity imported.",
      time: "Today, 10:30 AM",
      type: "github",
    },
    {
      id: 2,
      title: "Meeting notes uploaded",
      description: "Project meeting notes added.",
      time: "Today, 11:15 AM",
      type: "upload",
    },
    {
      id: 3,
      title: "Finding approved",
      description: "A finding was approved by the team leader.",
      time: "Today, 12:20 PM",
      type: "approved",
    },
  ],

  contribution: [
    { member: "Member A", contribution: 45 },
    { member: "Member B", contribution: 30 },
    { member: "Member C", contribution: 15 },
    { member: "Member D", contribution: 10 },
  ],
};

/** Return the shared sample dashboard data object. */
export async function getDashboardData() {
  return dashboardData;
}
