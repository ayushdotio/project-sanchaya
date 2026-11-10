// Findings API for the review screen.
// Uses synthetic mock data until the backend is ready. When it is, set USE_MOCK to
// false and agree the response shapes below with the backend team.
//
// Source:  { id, type, title, createdAt, updatedAt, importedAt }
// Finding: { id, category, claim, status, evidence: [{ sourceId, excerpt }],
//            recheck, recheckReason, review, edited }
//   status: "supported" | "needs_review" | "conflicting" | "unknown"
//   review: "pending" | "approved" | "rejected"

const USE_MOCK = true;
const BASE_URL = "http://localhost:5000/api";

const mockSources = [
  {
    id: "SRC-DOC-003",
    type: "Meeting notes",
    title: "Team meeting, 2 Mar",
    createdAt: "2026-03-02T10:00:00Z",
    updatedAt: "2026-03-02T10:00:00Z",
    importedAt: "2026-11-09T08:30:00Z",
  },
  {
    id: "SRC-DOC-005",
    type: "Meeting notes",
    title: "Team meeting, 16 Mar",
    createdAt: "2026-03-16T10:00:00Z",
    updatedAt: "2026-03-16T10:00:00Z",
    importedAt: "2026-11-09T08:30:00Z",
  },
  {
    id: "SRC-GH-014",
    type: "GitHub pull request",
    title: "PR #12: Add token validation middleware",
    createdAt: "2026-03-20T14:12:00Z",
    updatedAt: "2026-03-22T09:40:00Z",
    importedAt: "2026-11-09T08:31:00Z",
  },
  {
    id: "SRC-GH-021",
    type: "GitHub issue",
    title: "Issue #18: Payment webhook fails on retry",
    createdAt: "2026-03-25T16:05:00Z",
    updatedAt: "2026-03-26T11:20:00Z",
    importedAt: "2026-11-09T08:31:00Z",
  },
  {
    id: "SRC-CSV-002",
    type: "Task board export",
    title: "Task board, 30 Mar",
    createdAt: "2026-03-30T18:00:00Z",
    updatedAt: "2026-03-30T18:00:00Z",
    importedAt: "2026-11-09T08:32:00Z",
  },
];

const mockFindings = [
  {
    id: "F-001",
    category: "Decision",
    claim: "MongoDB was chosen as the project database for flexible document storage.",
    status: "supported",
    evidence: [
      {
        sourceId: "SRC-DOC-003",
        excerpt: "We agreed to use MongoDB because the event data has no fixed schema.",
      },
    ],
    recheck: false,
    recheckReason: "",
    review: "pending",
    edited: false,
  },
  {
    id: "F-002",
    category: "Task status",
    claim: "The authentication API is implemented and merged.",
    status: "supported",
    evidence: [
      {
        sourceId: "SRC-GH-014",
        excerpt: "Adds JWT validation middleware for all /api routes. Merged into main.",
      },
    ],
    recheck: false,
    recheckReason: "",
    review: "pending",
    edited: false,
  },
  {
    id: "F-003",
    category: "Blocker",
    claim: "The payment integration is incomplete.",
    status: "needs_review",
    evidence: [
      {
        sourceId: "SRC-DOC-005",
        excerpt: "Payments are still pending. Someone needs to check the gateway docs.",
      },
    ],
    recheck: false,
    recheckReason: "",
    review: "pending",
    edited: false,
  },
  {
    id: "F-004",
    category: "Task status",
    claim: "The database migration is complete.",
    status: "conflicting",
    evidence: [
      {
        sourceId: "SRC-DOC-005",
        excerpt: "Migration done on staging.",
      },
      {
        sourceId: "SRC-CSV-002",
        excerpt: "Migrate event collection | Status: In progress",
      },
    ],
    recheck: false,
    recheckReason: "",
    review: "pending",
    edited: false,
  },
  {
    id: "F-005",
    category: "Known problem",
    claim: "Issue #18, the payment webhook failing on retry, is still open.",
    status: "supported",
    evidence: [
      {
        sourceId: "SRC-GH-021",
        excerpt: "Webhook handler returns 500 when the gateway retries a delivery.",
      },
    ],
    recheck: true,
    recheckReason:
      "This evidence is older than recent code activity that may relate to the issue.",
    review: "pending",
    edited: false,
  },
  {
    id: "F-006",
    category: "Ownership",
    claim: "No source names an owner for the notification service.",
    status: "unknown",
    evidence: [],
    recheck: false,
    recheckReason: "",
    review: "pending",
    edited: false,
  },
];

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(path) {
  const response = await fetch(`${BASE_URL}${path}`);
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json();
}

export async function getFindings() {
  if (USE_MOCK) {
    await delay(300);
    return structuredClone(mockFindings);
  }
  return request("/findings");
}

export async function getSources() {
  if (USE_MOCK) {
    await delay(300);
    return structuredClone(mockSources);
  }
  return request("/sources");
}
