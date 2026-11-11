
import { useEffect, useState } from "react";

import TeamMemberDashboard from "./pages/TeamMemberDashboard";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import OutgoingDashboard from "./pages/OutgoingDashboard";
import IncomingDashboard from "./pages/IncomingDashboard";
import FindingsReview from "./pages/FindingsReview";
import ExitQuestions from "./pages/ExitQuestions";
import MyHandover from "./pages/MyHandover";
import SourceUpload from "./pages/SourceUpload";

import Nav from "./components/Nav";
import Guide from "./components/Guide";

import { ROLE_LABEL, getCurrentUser, logout } from "./api/authApi";

const STEPS = {
  leader: [
    "Read each finding next to its source",
    "Approve it, edit it, or reject it",
    "When all are checked, share the handover",
  ],

  outgoing: [
    "Read the questions below",
    "Answer what you can, skip the rest",
    "Send your answers to your team leader",
  ],

  member: [
    "Check whether the handover has been shared",
    "Read the confirmed points",
    "Ask your team leader about anything unclear",
  ],

  incoming: [
    "Read what is confirmed",
    "Check the points marked for follow-up",
    "Open the source behind anything important",
  ],
};

// Animated handover completion screen
function HandoverCompletion({
  approvedCount,
  rejectedCount,
  totalReviewed,
  onDashboard,
}) {
  return (
    <main className="completion-page mx-auto flex min-h-[80vh] max-w-4xl items-center justify-center px-5 py-12 sm:px-8">
      <div className="completion-card w-full max-w-2xl rounded-3xl border border-[#DDEBE3] bg-white p-8 text-center shadow-xl sm:p-12">

        <div className="completion-icon mx-auto flex h-28 w-28 items-center justify-center rounded-full bg-[#E8F8EF]">
          <svg
            width="64"
            height="64"
            viewBox="0 0 64 64"
            fill="none"
            aria-hidden="true"
          >
            <circle
              cx="32"
              cy="32"
              r="27"
              stroke="#159B59"
              strokeWidth="3"
              className="completion-circle"
            />

            <path
              d="M18 32L27 41L46 22"
              stroke="#159B59"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="completion-check"
            />
          </svg>
        </div>

        <p className="mt-8 text-sm font-bold uppercase tracking-[0.2em] text-[#159B59]">
          Handover completed
        </p>

        <h1 className="mt-3 text-3xl font-bold tracking-tight text-[#001E2B] sm:text-4xl">
          Knowledge preserved.
        </h1>

        <p className="mx-auto mt-4 max-w-lg leading-7 text-[#64756F]">
          The Team Leader has completed the review. The approved findings
          are now available in the handover for the incoming member.
        </p>

        <div className="mt-10">
          <div className="mb-2 flex justify-between text-sm font-semibold text-[#001E2B]">
            <span>Review progress</span>
            <span>{totalReviewed} / {totalReviewed}</span>
          </div>

          <div className="h-3 overflow-hidden rounded-full bg-[#E8F0EB]">
            <div className="completion-progress h-full w-full rounded-full bg-[#159B59]" />
          </div>

          <p className="mt-2 text-xs text-[#64756F]">
            All findings have been reviewed
          </p>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-4">
          <div className="rounded-2xl border border-[#CDEBD8] bg-[#F0FBF4] p-5">
            <p className="text-3xl font-bold tabular-nums text-[#087A3D]">
              {approvedCount}
            </p>
            <p className="mt-1 text-sm font-medium text-[#4A5F5B]">
              Approved findings
            </p>
          </div>

          <div className="rounded-2xl border border-[#F1D7D7] bg-[#FFF5F5] p-5">
            <p className="text-3xl font-bold tabular-nums text-[#C62828]">
              {rejectedCount}
            </p>
            <p className="mt-1 text-sm font-medium text-[#4A5F5B]">
              Rejected findings
            </p>
          </div>
        </div>

        <div className="mt-8 rounded-xl border border-[#DDEBE3] bg-[#F8FBFA] p-4 text-left">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#E8F8EF] text-[#159B59]">
              ✓
            </span>

            <div>
              <p className="font-semibold text-[#001E2B]">
                Handover ready
              </p>
              <p className="text-sm text-[#64756F]">
                Rejected findings are excluded from the shared handover.
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onDashboard}
          className="mt-9 w-full rounded-xl bg-[#001E2B] px-6 py-4 font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-[#023D35] sm:w-auto"
        >
          Return to Team Leader Dashboard →
        </button>
      </div>

      <style>{`
        .completion-card {
          animation: completionEnter 700ms ease-out both;
        }

        .completion-icon {
          animation: completionPop 700ms cubic-bezier(.17,.67,.35,1.3) both;
        }

        .completion-circle {
          stroke-dasharray: 170;
          stroke-dashoffset: 170;
          animation: circleDraw 900ms ease-out 200ms forwards;
        }

        .completion-check {
          stroke-dasharray: 45;
          stroke-dashoffset: 45;
          animation: checkDraw 550ms ease-out 850ms forwards;
        }

        .completion-progress {
          transform-origin: left;
          animation: progressFill 1200ms ease-out 500ms both;
        }

        @keyframes completionEnter {
          from {
            opacity: 0;
            transform: translateY(25px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes completionPop {
          0% { transform: scale(0); }
          70% { transform: scale(1.15); }
          100% { transform: scale(1); }
        }

        @keyframes circleDraw {
          to { stroke-dashoffset: 0; }
        }

        @keyframes checkDraw {
          to { stroke-dashoffset: 0; }
        }

        @keyframes progressFill {
          from { transform: scaleX(0); }
          to { transform: scaleX(1); }
        }

        @media (prefers-reduced-motion: reduce) {
          .completion-card,
          .completion-icon,
          .completion-circle,
          .completion-check,
          .completion-progress {
            animation: none !important;
          }

          .completion-circle,
          .completion-check {
            stroke-dashoffset: 0;
          }

          .completion-progress {
            transform: scaleX(1);
          }
        }
      `}</style>
    </main>
  );
}

export default function App() {
  const [started, setStarted] = useState(false);
  const [user, setUser] = useState(null);
  const [activePage, setActivePage] = useState("dashboard");
  const [selectedProjectId, setSelectedProjectId] = useState("");

  // Restore authenticated session and project context on browser refresh (WR-04)
  useEffect(() => {
    async function restoreSession() {
      try {
        const activeUser = await getCurrentUser();
        if (activeUser) {
          setUser(activeUser);
          setStarted(true);
          const savedProjectId = localStorage.getItem("sanchaya_last_project_id");
          if (savedProjectId) {
            setSelectedProjectId(savedProjectId);
          }
        }
      } catch (err) {
        console.warn("Could not restore session:", err);
      }
    }

    restoreSession();
  }, []);

  function handleNavigate(page, projectId) {
    if (projectId) {
      setSelectedProjectId(projectId);
      try {
        localStorage.setItem("sanchaya_last_project_id", projectId);
      } catch (err) {
        console.warn("Could not persist active project ID:", err);
      }
    }
    setActivePage(page);
  }

  const [approved, setApproved] = useState([]);
  const [shared, setShared] = useState(false);

  const [reviewSummary, setReviewSummary] = useState({
    approved: 0,
    rejected: 0,
    total: 0,
  });

  function handleLogin(loggedInUser) {
    setUser(loggedInUser);
    setActivePage("dashboard");
  }

  function signOut() {
    logout();
    setUser(null);
    setSelectedProjectId("");
    setActivePage("dashboard");
  }

  // Landing Page
  if (!started) {
    return <Landing onStart={() => setStarted(true)} />;
  }

  return (
    <>
      {/* Navigation */}
      <Nav onHome={() => setStarted(false)}>
        {user && (
          <span className="hidden sm:inline">
            {user.name} ({ROLE_LABEL[user.role]})
          </span>
        )}

        {user && (
          <button
            type="button"
            onClick={signOut}
            className="bg-transparent p-0 text-[#00ED64] underline underline-offset-4"
          >
            Sign out
          </button>
        )}
      </Nav>

      {/* Login */}
      {!user && <Login onLogin={handleLogin} />}

      {/* Back to Dashboard */}
      {user &&
        activePage !== "dashboard" &&
        activePage !== "completion" && (
          <div className="mx-auto max-w-6xl px-5 pt-5 sm:px-8">
            <button
              type="button"
              onClick={() => setActivePage("dashboard")}
              className="text-sm font-semibold text-[#087A3D] underline underline-offset-4"
            >
              ← Back to Dashboard
            </button>
          </div>
        )}

      {/* TEAM LEADER DASHBOARD */}
      {user?.role === "leader" && activePage === "dashboard" && (
        <Dashboard
          user={user}
          onNavigate={handleNavigate}
          shared={shared}
          approvedCount={approved.length}
        />
      )}

      {/* OUTGOING MEMBER DASHBOARD */}
      {user?.role === "outgoing" && activePage === "dashboard" && (
        <OutgoingDashboard
          user={user}
          onNavigate={handleNavigate}
        />
      )}

      {/* INCOMING MEMBER DASHBOARD */}
      {user?.role === "incoming" && activePage === "dashboard" && (
        <IncomingDashboard
          user={user}
          approved={approved}
          shared={shared}
          onNavigate={handleNavigate}
        />
      )}

      {/* TEAM MEMBER DASHBOARD */}
      {user?.role === "member" && activePage === "dashboard" && (
        <TeamMemberDashboard
          user={user}
          approved={approved}
          shared={shared}
          onNavigate={handleNavigate}
        />
      )}

      {/* Page Instructions */}
      {user &&
        activePage !== "dashboard" &&
        activePage !== "completion" &&
        activePage !== "sources" && (
          <Guide
            title="What to do on this page"
            steps={STEPS[user.role] || []}
          />
        )}

      {/* TEAM LEADER FINDINGS REVIEW */}
      {user?.role === "leader" && activePage === "findings" && (
        <FindingsReview
          projectId={selectedProjectId}
          onContinue={(all) => {
            const approvedFindings = all.filter(
              (f) => f.review === "approved"
            );

            const rejectedFindings = all.filter(
              (f) => f.review === "rejected"
            );

            setApproved(approvedFindings);

            setReviewSummary({
              approved: approvedFindings.length,
              rejected: rejectedFindings.length,
              total: all.length,
            });

            setShared(true);
            setActivePage("completion");
          }}
        />
      )}

      {/* ANIMATED HANDOVER COMPLETION */}
      {user?.role === "leader" &&
        activePage === "completion" && (
          <HandoverCompletion
            approvedCount={reviewSummary.approved}
            rejectedCount={reviewSummary.rejected}
            totalReviewed={reviewSummary.total}
            onDashboard={() => setActivePage("dashboard")}
          />
        )}

      {/* OUTGOING MEMBER QUESTIONS */}
      {user?.role === "outgoing" && activePage === "questions" && (
        <ExitQuestions
          projectId={selectedProjectId}
          onComplete={() => setActivePage("dashboard")}
        />
      )}

      {/* INCOMING MEMBER HANDOVER */}
      {user?.role === "incoming" && activePage === "handover" && (
        <MyHandover
          projectId={selectedProjectId}
          approved={approved}
          title="Your Handover Report"
          user={user}
        />
      )}

      {/* TEAM MEMBER HANDOVER */}
      {user?.role === "member" && activePage === "handover" && (
        <MyHandover
          projectId={selectedProjectId}
          approved={approved}
          title="Team Handover Report"
          user={user}
        />
      )}

      {/* SOURCE UPLOAD PAGE */}
      {user?.role === "leader" && activePage === "sources" && (
        <SourceUpload
          onNavigate={handleNavigate}
          projectId={selectedProjectId}
        />
      )}
    </>
  );
}
