
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getDashboardData } from "@/services/dashboardApi";
import {
  getProjects,
  createProject,
  getProjectById,
  assignMembers,
} from "@/api/projectsApi";
import { reconstructProject, getProjectRiskMap } from "@/api/reconstructionApi";
import { getFindings, scanFreshness } from "@/api/findingsApi";
import {
  getUnresolvedGaps,
  getGapQuestions,
  getReadiness,
  evaluateReadiness,
  signOffReadiness,
} from "@/api/gapsApi";
import { getProjectSources } from "@/api/sourcesApi";
import { getHandoverHistory, downloadHandoverPdf } from "@/api/handoverApi";
import { updateUserRole } from "@/api/usersApi";

import StatsCard from "@/components/dashboard/StatsCard";
import FindingChart from "@/components/dashboard/FindingChart";
import ContributionChart from "@/components/dashboard/ContributionChart";
import RiskMapPanel from "@/components/dashboard/RiskMapPanel";
import Stage2ReconstructionPanel from "@/components/dashboard/Stage2ReconstructionPanel";
import RecentActivity from "@/components/dashboard/RecentActivity";
import ReadinessPanel from "@/components/dashboard/ReadinessPanel";
import KnowledgeGapRadar from "@/components/dashboard/KnowledgeGapRadar";
import SourceManagement from "@/components/dashboard/SourceManagement";

import { Button } from "@/components/ui/button";

import {
  RefreshCw,
  FolderKanban,
  CalendarDays,
  ShieldCheck,
  ClipboardCheck,
  ArrowUpRight,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Clock3,
  Sparkles,
  Plus,
  X,
  GitBranch,
  ExternalLink,
  Loader2,
  ArrowLeft,
  Users,
  Download,
  FileText,
} from "lucide-react";

export default function Dashboard({
  user,
  onNavigate,
  shared,
  approvedCount,
}) {
  const [data, setData] = useState({
    stats: { total: 0, supported: 0, needsReview: 0, conflicting: 0, unknown: 0 },
    activities: [],
    contribution: [],
  });
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  // Real project state
  const [projects, setProjects] = useState([]);
  const [projectLoading, setProjectLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [githubRepo, setGithubRepo] = useState("");
  const [projectError, setProjectError] = useState("");
  const [creatingProject, setCreatingProject] = useState(false);

  // Active & selected project state
  const [activeOverviewProjectId, setActiveOverviewProjectId] = useState("");
  const [selectedProject, setSelectedProject] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState("");
  const [reconstructing, setReconstructing] = useState(false);
  const [reconstructSourceTypes, setReconstructSourceTypes] = useState([]);
  const [selectedSourceIds, setSelectedSourceIds] = useState([]);
  const [reconstructionResult, setReconstructionResult] = useState(null);
  const [reconstructionMessage, setReconstructionMessage] = useState("");
  const [reconstructionError, setReconstructionError] = useState("");
  const [riskMapLoading, setRiskMapLoading] = useState(false);
  const [riskMapData, setRiskMapData] = useState(null);
  const [riskMapError, setRiskMapError] = useState("");

  // Live subresource state for opened project
  const [projectFindings, setProjectFindings] = useState([]);
  const [projectSources, setProjectSources] = useState([]);
  const [historyData, setHistoryData] = useState([]);
  const [readinessData, setReadinessData] = useState(null);
  const [readinessEvaluation, setReadinessEvaluation] = useState(null);
  const [readinessActionError, setReadinessActionError] = useState("");
  const [readinessActionMessage, setReadinessActionMessage] = useState("");
  const [gapsData, setGapsData] = useState(null);
  const [gapQuestions, setGapQuestions] = useState([]);
  const [evaluatingReadiness, setEvaluatingReadiness] = useState(false);
  const [signingOff, setSigningOff] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [pdfExportError, setPdfExportError] = useState("");
  const [freshnessScanning, setFreshnessScanning] = useState(false);
  const [freshnessReport, setFreshnessReport] = useState(null);
  const [freshnessError, setFreshnessError] = useState("");
  const [showMemberManagement, setShowMemberManagement] = useState(false);
  const [outgoingInput, setOutgoingInput] = useState("");
  const [incomingInput, setIncomingInput] = useState("");
  const [assigningMembers, setAssigningMembers] = useState(false);
  const [memberActionMessage, setMemberActionMessage] = useState("");
  const [memberActionError, setMemberActionError] = useState("");
  const [updatingRoleId, setUpdatingRoleId] = useState("");

  const activeOverviewProject = useMemo(() => {
    if (!projects || projects.length === 0) return null;
    if (activeOverviewProjectId) {
      const match = projects.find((p) => (p._id || p.id) === activeOverviewProjectId);
      if (match) return match;
    }
    return projects[0];
  }, [projects, activeOverviewProjectId]);

  const activeProject = selectedProject || activeOverviewProject;
  const activeProjectId = activeProject?._id || activeProject?.id || "";

  const computedStats = useMemo(() => {
    if (activeProjectId) {
      const counts = { total: projectFindings.length, supported: 0, needsReview: 0, conflicting: 0, unknown: 0 };
      projectFindings.forEach((f) => {
        const s = (f.status || f.verification_status || "").toLowerCase();
        if (s === "supported") counts.supported++;
        else if (s === "needs_review" || s === "needsreview") counts.needsReview++;
        else if (s === "conflicting") counts.conflicting++;
        else counts.unknown++;
      });
      return counts;
    }
    return data?.stats || { total: 0, supported: 0, needsReview: 0, conflicting: 0, unknown: 0 };
  }, [activeProjectId, projectFindings, data]);

  const stats = [
    {
      title: "Total Findings",
      value: computedStats.total,
      description: "All reconstructed findings",
      type: "total",
    },
    {
      title: "Supported",
      value: computedStats.supported,
      description: "Evidence-backed findings",
      type: "supported",
    },
    {
      title: "Needs Review",
      value: computedStats.needsReview,
      description: "Awaiting verification",
      type: "review",
    },
    {
      title: "Conflicting",
      value: computedStats.conflicting,
      description: "Conflicting evidence",
      type: "conflicting",
    },
  ];

  function resetStage2Feedback() {
    setReconstructionMessage("");
    setReconstructionError("");
    setReconstructionResult(null);
    setRiskMapError("");
    setFreshnessReport(null);
    setFreshnessError("");
    setReadinessEvaluation(null);
    setReadinessActionError("");
    setReadinessActionMessage("");
    setPdfExportError("");
  }

  const activeOverviewProjectIdRef = useRef("");

  const loadProjectSubresources = useCallback(async (projectId) => {
    if (!projectId) return;
    try {
      const [
        findingsRes,
        riskMapRes,
        readinessRes,
        gapsRes,
        questionsRes,
        sourcesRes,
        historyRes,
      ] = await Promise.allSettled([
        getFindings(projectId),
        getProjectRiskMap(projectId),
        getReadiness(projectId),
        getUnresolvedGaps(projectId),
        getGapQuestions(projectId),
        getProjectSources(projectId),
        getHandoverHistory(projectId),
      ]);

      setProjectFindings(
        findingsRes.status === "fulfilled" && Array.isArray(findingsRes.value)
          ? findingsRes.value
          : []
      );
      setProjectSources(
        sourcesRes.status === "fulfilled" && Array.isArray(sourcesRes.value)
          ? sourcesRes.value
          : []
      );
      setHistoryData(
        historyRes.status === "fulfilled" && Array.isArray(historyRes.value)
          ? historyRes.value
          : []
      );

      if (riskMapRes.status === "fulfilled") {
        setRiskMapData(riskMapRes.value || null);
        setRiskMapError("");
      } else {
        setRiskMapData(null);
        setRiskMapError(
          riskMapRes.reason?.message || "Unable to load the risk map."
        );
      }

      setReadinessData(
        readinessRes.status === "fulfilled" ? readinessRes.value || null : null
      );
      setGapsData(
        gapsRes.status === "fulfilled" ? gapsRes.value || null : null
      );
      setGapQuestions(
        questionsRes.status === "fulfilled" && Array.isArray(questionsRes.value)
          ? questionsRes.value
          : []
      );
    } catch (err) {
      console.warn("Could not load all project subresources:", err);
    }
  }, []);

  async function handleSelectOverviewProject(projectId) {
    activeOverviewProjectIdRef.current = projectId;
    setActiveOverviewProjectId(projectId);
    setSelectedSourceIds([]);
    resetStage2Feedback();
    setRiskMapData(null);
    if (projectId) {
      await loadProjectSubresources(projectId);
    }
  }

  function handleToggleSourceType(type) {
    setReconstructSourceTypes((prev) =>
      prev.includes(type) ? prev.filter((item) => item !== type) : [...prev, type]
    );
    setSelectedSourceIds([]);
  }

  function handleToggleSourceId(sourceId) {
    setSelectedSourceIds((prev) =>
      prev.includes(sourceId)
        ? prev.filter((item) => item !== sourceId)
        : [...prev, sourceId]
    );
  }

  async function handleExportHandoverPdf() {
    const projectId = activeProjectId;
    if (!projectId) return;
    setExportingPdf(true);
    setPdfExportError("");
    try {
      const currentStatus =
        readinessData?.readinessStatus || activeProject?.readinessStatus;
      const isDraft = currentStatus !== "Approved for Sharing";
      await downloadHandoverPdf(
        projectId,
        `sanchaya-handover-${activeProject?.name || projectId}.pdf`,
        { draft: isDraft }
      );
      await loadProjectSubresources(projectId);
    } catch (err) {
      console.error("PDF export failed:", err);
      setPdfExportError(err.message || "Failed to export handover PDF.");
    } finally {
      setExportingPdf(false);
    }
  }

  async function handleScanFreshness() {
    const projectId = activeProjectId;
    if (!projectId) return;
    setFreshnessScanning(true);
    setFreshnessError("");
    setFreshnessReport(null);
    try {
      const report = await scanFreshness(projectId);
      setFreshnessReport(report?.data || report);
      await loadProjectSubresources(projectId);
    } catch (err) {
      console.error("Freshness scan failed:", err);
      setFreshnessError(err.message || "Freshness scan failed.");
    } finally {
      setFreshnessScanning(false);
    }
  }

  async function handleAssignMembers(e) {
    e?.preventDefault();
    const projectId = selectedProject?._id || selectedProject?.id;
    if (!projectId) return;

    setAssigningMembers(true);
    setMemberActionMessage("");
    setMemberActionError("");

    const outgoingIds = outgoingInput
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const incomingIds = incomingInput
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      const updated = await assignMembers(projectId, {
        outgoingIds: outgoingIds.length > 0 ? outgoingIds : undefined,
        incomingIds: incomingIds.length > 0 ? incomingIds : undefined,
      });
      setSelectedProject(updated);
      setMemberActionMessage("Project members successfully updated.");
      setOutgoingInput("");
      setIncomingInput("");
      await loadProjectSubresources(projectId);
    } catch (err) {
      console.error("Assign members failed:", err);
      setMemberActionError(err.message || "Failed to assign project members.");
    } finally {
      setAssigningMembers(false);
    }
  }

  async function handleUpdateMemberRole(userId, newRole) {
    if (!userId || !newRole) return;
    setUpdatingRoleId(userId);
    setMemberActionMessage("");
    setMemberActionError("");
    try {
      await updateUserRole(userId, newRole);
      setMemberActionMessage(`User role updated to '${newRole}'.`);
      const projectId = selectedProject?._id || selectedProject?.id;
      if (projectId) {
        const details = await getProjectById(projectId);
        setSelectedProject(details);
      }
    } catch (err) {
      console.error("Role update failed:", err);
      setMemberActionError(err.message || "Failed to update user role.");
    } finally {
      setUpdatingRoleId("");
    }
  }

  async function handleEvaluateReadiness() {
    const projectId = activeProjectId;
    if (!projectId) return;
    setEvaluatingReadiness(true);
    setReadinessActionError("");
    setReadinessActionMessage("");
    try {
      const evaluated = await evaluateReadiness(projectId);
      setReadinessEvaluation(evaluated || null);
      if (evaluated?.checklist || evaluated?.readinessStatus) {
        setReadinessData((prev) => ({
          ...(prev || {}),
          ...(evaluated.readinessStatus ? { readinessStatus: evaluated.readinessStatus } : {}),
          ...(evaluated.checklist ? { checklist: evaluated.checklist } : {}),
        }));
      }
      setReadinessActionMessage(
        `Readiness evaluated: ${evaluated?.readinessStatus || "updated"}.`
      );
      await loadProjectSubresources(projectId);
    } catch (err) {
      console.error("Evaluate readiness failed:", err);
      setReadinessActionError(err.message || "Failed to evaluate readiness.");
    } finally {
      setEvaluatingReadiness(false);
    }
  }

  async function handleSignOff(options = {}) {
    const projectId = activeProjectId;
    if (!projectId) return;
    setSigningOff(true);
    setReadinessActionError("");
    setReadinessActionMessage("");
    try {
      const updated = await signOffReadiness(projectId, options);
      if (updated) {
        if (selectedProject) {
          setSelectedProject((prev) =>
            prev ? { ...prev, readinessStatus: "Approved for Sharing" } : prev
          );
        }
        setProjects((prev) =>
          prev.map((p) =>
            (p._id || p.id) === projectId
              ? { ...p, readinessStatus: "Approved for Sharing" }
              : p
          )
        );
        setReadinessActionMessage(
          `Handover signed off and Approved for Sharing${
            updated.version ? ` (Snapshot v${updated.version})` : ""
          }.`
        );
      }
      await loadProjectSubresources(projectId);
    } catch (err) {
      console.error("Sign-off failed:", err);
      const failingList = Array.isArray(err?.data?.failingCriteria)
        ? ` Failing criteria: ${err.data.failingCriteria.join(", ")}.`
        : "";
      setReadinessActionError(
        `${err.message || "Failed to sign-off readiness."}${failingList}`
      );
      await loadProjectSubresources(projectId);
    } finally {
      setSigningOff(false);
    }
  }

  async function handleOpenProject(project) {
    const projectId = project?._id || project?.id;

    if (!projectId) {
      setDetailsError("This project does not contain a valid project ID.");
      return;
    }

    setDetailsLoading(true);
    setDetailsError("");
    setSelectedProject(null);
    activeOverviewProjectIdRef.current = projectId;
    setActiveOverviewProjectId(projectId);
    setSelectedSourceIds([]);
    resetStage2Feedback();
    setRiskMapData(null);

    try {
      const details = await getProjectById(projectId);
      setSelectedProject(details);
      await loadProjectSubresources(projectId);
    } catch (error) {
      console.error("Project details loading failed:", error);
      setDetailsError(
        error.message || "Unable to load project details. Please try again."
      );
    } finally {
      setDetailsLoading(false);
    }
  }

  async function handleReconstructProject(explicitSourceIds) {
    const projectId = activeProjectId;
    if (!projectId) {
      setReconstructionError("A valid project ID is required.");
      return;
    }

    setReconstructing(true);
    setReconstructionMessage("");
    setReconstructionError("");
    setReconstructionResult(null);

    try {
      const options = {};
      if (reconstructSourceTypes.length > 0) {
        options.sourceTypes = reconstructSourceTypes;
      }
      const effectiveSourceIds = Array.isArray(explicitSourceIds)
        ? explicitSourceIds
        : selectedSourceIds;
      if (effectiveSourceIds.length > 0) {
        options.sourceIds = effectiveSourceIds;
      }
      const result = await reconstructProject(projectId, options);
      setReconstructionResult(result?.data || null);
      setReconstructionMessage(
        result?.message || "Knowledge reconstruction was triggered successfully."
      );
      await loadProjectSubresources(projectId);
    } catch (error) {
      setReconstructionError(
        error.message || "Unable to start knowledge reconstruction."
      );
    } finally {
      setReconstructing(false);
    }
  }

  async function handleLoadRiskMap() {
    const projectId = activeProjectId;
    if (!projectId) {
      setRiskMapError("A valid project ID is required.");
      return;
    }

    setRiskMapLoading(true);
    setRiskMapError("");

    try {
      const result = await getProjectRiskMap(projectId);
      setRiskMapData(result);
    } catch (error) {
      setRiskMapError(error.message || "Unable to load the risk map.");
    } finally {
      setRiskMapLoading(false);
    }
  }

  // Load dashboard and projects
  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setProjectLoading(true);
    setProjectError("");

    const [dashboardResult, projectsResult] =
      await Promise.allSettled([
        getDashboardData(),
        getProjects(),
      ]);

    if (dashboardResult.status === "fulfilled") {
      setData(dashboardResult.value);
      setRefreshKey((prev) => prev + 1);
    } else {
      console.error(
        "Dashboard loading failed:",
        dashboardResult.reason
      );
      setData(null);
    }

    if (projectsResult.status === "fulfilled") {
      const projs = projectsResult.value || [];
      setProjects(projs);
      if (projs.length > 0) {
        const currentPreferred = activeOverviewProjectIdRef.current;
        const targetId =
          (currentPreferred &&
            projs.some((p) => (p._id || p.id) === currentPreferred) &&
            currentPreferred) ||
          projs[0]._id ||
          projs[0].id;
        activeOverviewProjectIdRef.current = targetId;
        setActiveOverviewProjectId(targetId);
        loadProjectSubresources(targetId);
      }
    } else {
      console.error(
        "Project loading failed:",
        projectsResult.reason
      );
      setProjects([]);
      setProjectError(
        projectsResult.reason?.message ||
          "Unable to load projects. Please try again."
      );
    }

    setLoading(false);
    setProjectLoading(false);
  }, [loadProjectSubresources]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadDashboard();
  }, [loadDashboard]);

  // Create a new project
  async function handleCreateProject(event) {
    event.preventDefault();

    setProjectError("");

    if (projectName.trim().length < 2) {
      setProjectError(
        "Project name must contain at least 2 characters."
      );
      return;
    }

    try {
      setCreatingProject(true);

      const newProject = await createProject({
        name: projectName.trim(),
        description: projectDescription.trim(),
        githubRepo: githubRepo.trim(),
      });

      setProjects((prev) => [newProject, ...prev]);
      const newId = newProject?._id || newProject?.id;
      if (newId) {
        setActiveOverviewProjectId(newId);
        resetStage2Feedback();
        setRiskMapData(null);
        loadProjectSubresources(newId);
      }

      setProjectName("");
      setProjectDescription("");
      setGithubRepo("");
      setShowCreateForm(false);
    } catch (error) {
      console.error("Project creation failed:", error);
      setProjectError(
        error.message || "Unable to create project."
      );
    } finally {
      setCreatingProject(false);
    }
  }

  if (user?.role !== "leader") {
    return (
      <main className="min-h-[70vh] bg-[#F6FAF8] px-5 py-16 sm:px-8">
        <section className="mx-auto max-w-3xl rounded-3xl border border-[#E1ECE6] bg-white p-10 text-center shadow-sm">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#E8F8EF]">
            <FolderKanban
              size={30}
              className="text-[#159B59]"
            />
          </div>

          <h1 className="mt-5 text-2xl font-bold tracking-tight text-[#001E2B]">
            Your Role Dashboard
          </h1>

          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[#71817B]">
            Your workspace will show information and actions
            based on your role in the Sanchaya project.
          </p>
        </section>
      </main>
    );
  }

  // Project details view. Data is loaded from GET /api/projects/:projectId.
  if (detailsLoading || selectedProject || detailsError) {
    const project = selectedProject;
    const members = project?.members || {};
    const incomingMembers = Array.isArray(members.incomingIds)
      ? members.incomingIds
      : [];
    const outgoingMembers = Array.isArray(members.outgoingIds)
      ? members.outgoingIds
      : [];
    const leader = members.leaderId;
    const displayMember = (member) => {
      if (typeof member === "string") return member;
      return (
        member?.name ||
        member?.fullName ||
        member?.email ||
        member?._id ||
        member?.id ||
        "Member"
      );
    };

    return (
      <main className="min-h-screen bg-[#F6FAF8] px-4 py-8 sm:px-7 lg:px-10">
        <div className="mx-auto max-w-5xl">
          <Button
            variant="outline"
            onClick={() => {
              setSelectedProject(null);
              setDetailsError("");
            }}
            className="mb-6 gap-2 rounded-xl border-[#D8E7DF] bg-white text-[#24483A]"
          >
            <ArrowLeft size={16} />
            Back to My Projects
          </Button>

          {detailsLoading ? (
            <section className="rounded-3xl border border-[#D8EADF] bg-white p-12 text-center">
              <RefreshCw className="mx-auto mb-3 animate-spin text-[#159B59]" size={25} />
              <p className="text-sm text-[#71817B]">Loading project details...</p>
            </section>
          ) : detailsError ? (
            <section className="rounded-3xl border border-[#F1D7D2] bg-white p-8">
              <div className="flex items-start gap-3 text-[#A33F32]">
                <AlertTriangle size={20} className="mt-0.5 shrink-0" />
                <p className="text-sm">{detailsError}</p>
              </div>
            </section>
          ) : project ? (
            <div className="space-y-6">
              <section className="rounded-3xl border border-[#D8EADF] bg-white p-6 shadow-sm sm:p-8">
                <div className="mb-3 flex items-center gap-2 text-xs font-bold tracking-[0.15em] text-[#159B59]">
                  <FolderKanban size={16} />
                  PROJECT WORKSPACE
                </div>
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                  <div>
                    <h1 className="text-3xl font-bold tracking-tight text-[#001E2B]">
                      {project.name || "Project"}
                    </h1>
                    <p className="mt-2 text-sm leading-6 text-[#71817B]">
                      {project.description || "No project description provided."}
                    </p>
                  </div>
                  <span className="w-fit rounded-full border border-[#F1E2C7] bg-[#FFF8EC] px-3 py-1.5 text-xs font-semibold text-[#9A681D]">
                    {project.readinessStatus || "Needs Attention"}
                  </span>
                </div>
                {project.githubRepo && (
                  <a
                    href={project.githubRepo}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-5 inline-flex items-center gap-2 break-all text-sm font-medium text-[#159B59] hover:underline"
                  >
                    <GitBranch size={16} />
                    Open GitHub Repository
                    <ExternalLink size={14} />
                  </a>
                )}
              </section>

              <section className="rounded-3xl border border-[#D8EADF] bg-white p-6 shadow-sm sm:p-8">
                <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                  <div className="flex items-center gap-2">
                    <Users size={19} className="text-[#159B59]" />
                    <h2 className="text-xl font-bold text-[#001E2B]">Project Members</h2>
                  </div>
                  {user?.role === "leader" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowMemberManagement((prev) => !prev)}
                      className="gap-1.5 rounded-xl border-[#D8E7DF] bg-white text-xs font-semibold text-[#24483A] hover:border-[#159B59]"
                    >
                      <Users size={14} />
                      {showMemberManagement ? "Hide Member Controls" : "Manage Members & Roles"}
                    </Button>
                  )}
                </div>

                {memberActionMessage && (
                  <div className="mb-4 flex items-center gap-2 rounded-xl border border-[#CDE9D8] bg-[#EAF8EF] p-3 text-sm text-[#087A3D]">
                    <CheckCircle2 size={16} className="shrink-0" />
                    <span>{memberActionMessage}</span>
                  </div>
                )}

                {memberActionError && (
                  <div className="mb-4 flex items-start gap-2 rounded-xl border border-[#F1D7D2] bg-[#FFF5F3] p-3 text-sm text-[#A33F32]">
                    <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                    <span>{memberActionError}</span>
                  </div>
                )}

                {/* Member Assignment Form for Team Leader */}
                {showMemberManagement && user?.role === "leader" && (
                  <form
                    onSubmit={handleAssignMembers}
                    className="mb-6 rounded-2xl border border-[#D8EADF] bg-[#F8FCF9] p-5 text-sm"
                  >
                    <h3 className="mb-3 text-sm font-bold text-[#001E2B]">
                      Assign Team Members to Project
                    </h3>
                    <p className="mb-4 text-xs text-[#71817B]">
                      Provide user IDs to assign outgoing and incoming handover participants.
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-[#29483B]">
                          Outgoing Member User IDs (comma-separated)
                        </label>
                        <input
                          type="text"
                          value={outgoingInput}
                          onChange={(e) => setOutgoingInput(e.target.value)}
                          placeholder="e.g. 660f..., 660e..."
                          className="h-10 w-full rounded-xl border border-[#D8E7DF] bg-white px-3 text-xs outline-none focus:border-[#159B59]"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-[#29483B]">
                          Incoming Member User IDs (comma-separated)
                        </label>
                        <input
                          type="text"
                          value={incomingInput}
                          onChange={(e) => setIncomingInput(e.target.value)}
                          placeholder="e.g. 660d..., 660c..."
                          className="h-10 w-full rounded-xl border border-[#D8E7DF] bg-white px-3 text-xs outline-none focus:border-[#159B59]"
                        />
                      </div>
                    </div>
                    <div className="mt-4 flex gap-2">
                      <Button
                        type="submit"
                        disabled={assigningMembers || (!outgoingInput.trim() && !incomingInput.trim())}
                        className="gap-2 rounded-xl bg-[#159B59] text-xs text-white hover:bg-[#087A3D]"
                      >
                        {assigningMembers ? (
                          <>
                            <Loader2 size={14} className="animate-spin" /> Saving...
                          </>
                        ) : (
                          <>
                            <Users size={14} /> Assign Members
                          </>
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setOutgoingInput("");
                          setIncomingInput("");
                          setShowMemberManagement(false);
                        }}
                        className="rounded-xl border-[#D8E7DF] text-xs text-[#71817B]"
                      >
                        Cancel
                      </Button>
                    </div>
                  </form>
                )}

                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="rounded-2xl bg-[#F8FCF9] p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[#82918B]">Team Leader</p>
                    <p className="mt-2 break-all text-sm font-semibold text-[#29483B]">
                      {leader ? displayMember(leader) : "Not available"}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-[#F8FCF9] p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[#82918B]">Outgoing Members</p>
                    <p className="mt-2 text-2xl font-bold text-[#001E2B]">{outgoingMembers.length}</p>
                    {outgoingMembers.length > 0 && (
                      <ul className="mt-3 space-y-2 text-sm text-[#64756F]">
                        {outgoingMembers.map((member, index) => {
                          const mId = typeof member === "string" ? member : member?._id || member?.id;
                          return (
                            <li key={mId || index} className="rounded-xl border border-[#E1ECE6] bg-white p-2.5">
                              <p className="break-all font-medium text-[#29483B]">{displayMember(member)}</p>
                              {user?.role === "leader" && mId && (
                                <div className="mt-2 flex items-center justify-between gap-2 border-t border-[#F0F5F2] pt-2 text-xs">
                                  <span className="text-[11px] text-[#82918B]">Role:</span>
                                  <select
                                    value={member?.role || "outgoing"}
                                    onChange={(e) => handleUpdateMemberRole(mId, e.target.value)}
                                    disabled={updatingRoleId === mId || mId === user?.id || mId === user?.userId}
                                    className="rounded-lg border border-[#D8E7DF] bg-[#F8FCF9] px-2 py-0.5 text-xs text-[#29483B] outline-none"
                                  >
                                    <option value="outgoing">Outgoing</option>
                                    <option value="incoming">Incoming</option>
                                    <option value="member">Member</option>
                                    <option value="leader">Leader</option>
                                  </select>
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                  <div className="rounded-2xl bg-[#F8FCF9] p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[#82918B]">Incoming Members</p>
                    <p className="mt-2 text-2xl font-bold text-[#001E2B]">{incomingMembers.length}</p>
                    {incomingMembers.length > 0 && (
                      <ul className="mt-3 space-y-2 text-sm text-[#64756F]">
                        {incomingMembers.map((member, index) => {
                          const mId = typeof member === "string" ? member : member?._id || member?.id;
                          return (
                            <li key={mId || index} className="rounded-xl border border-[#E1ECE6] bg-white p-2.5">
                              <p className="break-all font-medium text-[#29483B]">{displayMember(member)}</p>
                              {user?.role === "leader" && mId && (
                                <div className="mt-2 flex items-center justify-between gap-2 border-t border-[#F0F5F2] pt-2 text-xs">
                                  <span className="text-[11px] text-[#82918B]">Role:</span>
                                  <select
                                    value={member?.role || "incoming"}
                                    onChange={(e) => handleUpdateMemberRole(mId, e.target.value)}
                                    disabled={updatingRoleId === mId || mId === user?.id || mId === user?.userId}
                                    className="rounded-lg border border-[#D8E7DF] bg-[#F8FCF9] px-2 py-0.5 text-xs text-[#29483B] outline-none"
                                  >
                                    <option value="incoming">Incoming</option>
                                    <option value="outgoing">Outgoing</option>
                                    <option value="member">Member</option>
                                    <option value="leader">Leader</option>
                                  </select>
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </div>
              </section>

              <section className="rounded-3xl border border-[#D8EADF] bg-white p-6 shadow-sm sm:p-8">
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                  <div>
                    <h2 className="text-xl font-bold text-[#001E2B]">Project Sources</h2>
                    <p className="mt-1 text-sm text-[#71817B]">Connect GitHub and add project knowledge sources.</p>
                  </div>
                  <Button
                    onClick={() => onNavigate("sources", project._id || project.id)}
                    className="gap-2 rounded-xl bg-[#159B59] text-white hover:bg-[#087A3D]"
                  >
                    <GitBranch size={16} />
                    Connect GitHub
                    <ArrowUpRight size={15} />
                  </Button>
                </div>
              </section>

              <Stage2ReconstructionPanel
                projectId={project._id || project.id}
                sources={projectSources}
                onGoToSources={() => onNavigate("sources", project._id || project.id)}
                onReconstruct={handleReconstructProject}
                reconstructing={reconstructing}
                reconstructSourceTypes={reconstructSourceTypes}
                onToggleSourceType={handleToggleSourceType}
                onResetSourceTypes={() => {
                  setReconstructSourceTypes([]);
                  setSelectedSourceIds([]);
                }}
                selectedSourceIds={selectedSourceIds}
                onToggleSourceId={handleToggleSourceId}
                onClearSourceIds={() => setSelectedSourceIds([])}
                reconstructionResult={reconstructionResult}
                reconstructionMessage={reconstructionMessage}
                reconstructionError={reconstructionError}
                onLoadRiskMap={handleLoadRiskMap}
                riskMapLoading={riskMapLoading}
                riskMapData={riskMapData}
                riskMapError={riskMapError}
                onScanFreshness={handleScanFreshness}
                freshnessScanning={freshnessScanning}
                freshnessReport={freshnessReport}
                freshnessError={freshnessError}
                onReviewFindings={() => onNavigate?.("findings", project._id || project.id)}
                includeChart
              />

              {/* Stage 4: Knowledge Gaps & Readiness Sign-Off */}
              <div className="grid gap-6 lg:grid-cols-2">
                <KnowledgeGapRadar
                  gapsData={gapsData}
                  gapQuestions={gapQuestions}
                  onReviewGaps={() => onNavigate?.("findings", project._id || project.id)}
                />
                <ReadinessPanel
                  key={project._id || project.id}
                  readiness={
                    readinessData || {
                      readinessStatus: project.readinessStatus,
                      checklist: project.readinessChecklist,
                    }
                  }
                  evaluationResult={readinessEvaluation}
                  onEvaluate={handleEvaluateReadiness}
                  onSignOff={handleSignOff}
                  isLeader={user?.role === "leader"}
                  evaluating={evaluatingReadiness}
                  signingOff={signingOff}
                  actionError={readinessActionError}
                  actionMessage={readinessActionMessage}
                />
              </div>

              {/* Stage 5: Final Handover Package, PDF Export & History */}
              <section className="rounded-3xl border border-[#D8EADF] bg-white p-6 shadow-sm sm:p-8">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="mb-1 flex items-center gap-2 text-xs font-bold tracking-[0.15em] text-[#159B59]">
                      <Clock3 size={16} />
                      STAGE 5 · HANDOVER PACKAGE & HISTORY
                    </div>
                    <h2 className="text-xl font-bold text-[#001E2B]">Handover History & Version Snapshots</h2>
                    <p className="mt-1 text-sm text-[#71817B]">
                      Inspect the compiled handover report, export the ReportLab PDF, and track incoming member acknowledgements.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      onClick={() => onNavigate?.("handover", project._id || project.id)}
                      className="gap-2 rounded-xl border-[#D8E7DF] bg-white text-[#24483A] hover:border-[#159B59]"
                    >
                      <FileText size={15} />
                      Inspect Handover Report
                    </Button>

                    <Button
                      onClick={handleExportHandoverPdf}
                      disabled={exportingPdf}
                      className="gap-2 rounded-xl bg-[#001E2B] text-white hover:bg-[#023D35]"
                    >
                      {exportingPdf ? (
                        <><Loader2 size={15} className="animate-spin" /> Exporting...</>
                      ) : (
                        <>
                          <Download size={15} />
                          {(readinessData?.readinessStatus || project.readinessStatus) === "Approved for Sharing"
                            ? "Export Official PDF"
                            : "Export Draft PDF"}
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {pdfExportError && (
                  <div className="mb-4 flex items-start gap-2 rounded-xl border border-[#F1D7D2] bg-[#FFF5F3] p-3 text-xs text-[#A33F32]">
                    <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                    <span>{pdfExportError}</span>
                  </div>
                )}

                {historyData.length === 0 ? (
                  <div className="mt-4 rounded-2xl border border-dashed border-[#D8EADF] bg-[#F8FCF9] p-6 text-center text-sm text-[#71817B]">
                    No handover versions or receipts recorded yet. Sign off readiness in Stage 4 to generate Snapshot v1.
                  </div>
                ) : (
                  <div className="mt-4 overflow-hidden rounded-2xl border border-[#E1ECE6]">
                    <table className="w-full text-left text-sm text-[#29483B]">
                      <thead className="bg-[#F8FCF9] text-xs font-semibold uppercase text-[#82918B]">
                        <tr>
                          <th className="px-4 py-3">Version / Snapshot</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3">Timestamp</th>
                          <th className="px-4 py-3">Recipient Acknowledgement</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#EAF1ED]">
                        {historyData.map((item, idx) => (
                          <tr key={item._id || item.id || idx} className="hover:bg-[#F9FCFA]">
                            <td className="px-4 py-3 font-medium text-[#001E2B]">
                              Version {item.version ?? idx + 1}
                              {item.approvedSnapshot?.approvedFindingsCount !== undefined && (
                                <span className="ml-2 text-xs font-normal text-[#71817B]">
                                  ({item.approvedSnapshot.approvedFindingsCount} findings)
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <span className="rounded-full bg-[#E8F8EF] px-2.5 py-1 text-xs font-semibold text-[#159B59]">
                                {item.approvedSnapshot?.readinessStatus ||
                                  item.status ||
                                  "Approved for Sharing"}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-xs text-[#71817B]">
                              {item.acknowledgedAt || item.createdAt || item.approvedSnapshot?.approvedAt
                                ? new Date(
                                    item.acknowledgedAt ||
                                      item.createdAt ||
                                      item.approvedSnapshot?.approvedAt
                                  ).toLocaleString()
                                : "N/A"}
                            </td>
                            <td className="px-4 py-3 text-xs text-[#64756F]">
                              {item.acknowledgedBy
                                ? `✓ ${item.acknowledgedBy.name || item.acknowledgedBy.email || item.acknowledgedBy}`
                                : "Pending acknowledgement"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section className="rounded-3xl border border-[#D8EADF] bg-white p-6 shadow-sm sm:p-8">
                <h2 className="text-xl font-bold text-[#001E2B]">Workspace Information</h2>
                <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-[#82918B]">Project ID</dt>
                    <dd className="mt-1 break-all text-sm text-[#29483B]">{project._id || project.id || "Not returned"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-[#82918B]">Readiness Status</dt>
                    <dd className="mt-1 text-sm font-semibold text-[#29483B]">{project.readinessStatus || "Needs Attention"}</dd>
                  </div>
                </dl>
              </section>
            </div>
          ) : null}
        </div>
      </main>
    );
  }

  return (
    <main className="dashboard-page min-h-screen bg-[#F6FAF8]">
      <div className="mx-auto max-w-[1440px] px-4 py-7 sm:px-7 lg:px-10 lg:py-9">

        {/* Page heading */}
        <header className="dashboard-enter mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#D8EEE1] bg-white px-3 py-1.5 text-[11px] font-bold tracking-[0.16em] text-[#12834B] shadow-sm">
              <span className="h-2 w-2 rounded-full bg-[#159B59]" />
              SANCHAYA WORKSPACE
            </div>

            <h1 className="text-3xl font-bold tracking-tight text-[#001E2B] sm:text-[2.35rem]">
              Team Leader Dashboard
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#71817B] sm:text-[15px]">
              Welcome back, {user?.name || "Team Leader"}.
              Monitor project knowledge, verify findings,
              and prepare the team handover.
            </p>
          </div>

          <Button
            variant="outline"
            onClick={loadDashboard}
            disabled={loading || projectLoading}
            className="h-10 gap-2 self-start rounded-xl border-[#D8E7DF] bg-white px-4 text-[#24483A] shadow-sm transition hover:border-[#159B59] hover:bg-[#F1FAF5] md:self-auto"
          >
            <RefreshCw
              size={15}
              className={
                loading || projectLoading ? "animate-spin" : ""
              }
            />
            {loading || projectLoading
              ? "Refreshing..."
              : "Refresh data"}
          </Button>
        </header>

        {/* Real projects section */}
        <section className="dashboard-enter dashboard-delay-1 mb-8 rounded-3xl border border-[#D8EADF] bg-white p-6 shadow-[0_12px_40px_rgba(15,75,48,0.06)] sm:p-8">

          <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-bold tracking-[0.15em] text-[#159B59]">
                <FolderKanban size={16} />
                YOUR WORKSPACES
              </div>

              <h2 className="text-2xl font-bold tracking-tight text-[#001E2B]">
                My Projects
              </h2>

              <p className="mt-2 text-sm text-[#71817B]">
                Manage your projects and preserve their knowledge.
              </p>
            </div>

            <Button
              onClick={() => {
                setProjectError("");
                setShowCreateForm((prev) => !prev);
              }}
              className="h-10 gap-2 rounded-xl bg-[#159B59] px-5 text-white hover:bg-[#087A3D]"
            >
              {showCreateForm ? (
                <X size={16} />
              ) : (
                <Plus size={17} />
              )}
              {showCreateForm ? "Cancel" : "Create Project"}
            </Button>
          </div>

          {/* Project error */}
          {projectError && (
            <div className="mb-5 flex items-start gap-2 rounded-xl border border-[#F1D7D2] bg-[#FFF5F3] p-4 text-sm text-[#A33F32]">
              <AlertTriangle
                size={17}
                className="mt-0.5 shrink-0"
              />
              <p>{projectError}</p>
            </div>
          )}

          {/* Create project form */}
          {showCreateForm && (
            <form
              onSubmit={handleCreateProject}
              className="mb-7 rounded-2xl border border-[#D8EADF] bg-[#F8FCF9] p-5 sm:p-6"
            >
              <h3 className="mb-5 text-lg font-bold text-[#001E2B]">
                Create New Project
              </h3>

              <div className="grid gap-4">
                <div>
                  <label
                    htmlFor="projectName"
                    className="mb-2 block text-sm font-semibold text-[#29483B]"
                  >
                    Project Name *
                  </label>

                  <input
                    id="projectName"
                    type="text"
                    required
                    minLength={2}
                    value={projectName}
                    onChange={(e) =>
                      setProjectName(e.target.value)
                    }
                    placeholder="Enter your project name"
                    className="h-11 w-full rounded-xl border border-[#D8E7DF] bg-white px-4 text-sm outline-none transition focus:border-[#159B59] focus:ring-2 focus:ring-[#159B59]/10"
                  />
                </div>

                <div>
                  <label
                    htmlFor="projectDescription"
                    className="mb-2 block text-sm font-semibold text-[#29483B]"
                  >
                    Description
                  </label>

                  <textarea
                    id="projectDescription"
                    rows={3}
                    value={projectDescription}
                    onChange={(e) =>
                      setProjectDescription(e.target.value)
                    }
                    placeholder="Describe your project..."
                    className="w-full resize-none rounded-xl border border-[#D8E7DF] bg-white p-4 text-sm outline-none transition focus:border-[#159B59] focus:ring-2 focus:ring-[#159B59]/10"
                  />
                </div>

                <div>
                  <label
                    htmlFor="githubRepo"
                    className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#29483B]"
                  >
                    <GitBranch size={16} />
                    GitHub Repository URL
                  </label>

                  <input
                    id="githubRepo"
                    type="url"
                    value={githubRepo}
                    onChange={(e) =>
                      setGithubRepo(e.target.value)
                    }
                    placeholder="https://github.com/username/repository"
                    className="h-11 w-full rounded-xl border border-[#D8E7DF] bg-white px-4 text-sm outline-none transition focus:border-[#159B59] focus:ring-2 focus:ring-[#159B59]/10"
                  />
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <Button
                  type="submit"
                  disabled={creatingProject}
                  className="h-10 gap-2 rounded-xl bg-[#159B59] px-5 text-white hover:bg-[#087A3D]"
                >
                  {creatingProject ? (
                    <>
                      <Loader2
                        size={16}
                        className="animate-spin"
                      />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Plus size={16} />
                      Create Project
                    </>
                  )}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  disabled={creatingProject}
                  onClick={() => {
                    setShowCreateForm(false);
                    setProjectError("");
                  }}
                  className="h-10 rounded-xl border-[#D8E7DF] bg-white px-5 text-[#29483B]"
                >
                  Cancel
                </Button>
              </div>
            </form>
          )}

          {/* Loading projects */}
          {projectLoading ? (
            <div className="flex items-center justify-center gap-3 py-12 text-sm text-[#71817B]">
              <RefreshCw
                size={19}
                className="animate-spin text-[#159B59]"
              />
              Loading your projects...
            </div>
          ) : projects.length === 0 ? (
            /* Empty state */
            <div className="rounded-2xl border border-dashed border-[#CDE4D5] bg-[#F8FCF9] px-5 py-12 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#E8F8EF]">
                <FolderKanban
                  size={27}
                  className="text-[#159B59]"
                />
              </div>

              <h3 className="text-lg font-bold text-[#001E2B]">
                No projects yet
              </h3>

              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#71817B]">
                Create your first project workspace to start
                preserving knowledge and managing your team handover.
              </p>

              {!showCreateForm && (
                <Button
                  onClick={() => setShowCreateForm(true)}
                  className="mt-5 gap-2 rounded-xl bg-[#159B59] px-5 text-white hover:bg-[#087A3D]"
                >
                  <Plus size={16} />
                  Create Your First Project
                </Button>
              )}
            </div>
          ) : (
            /* Actual projects from backend */
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {projects.map((project) => (
                <div
                  key={project._id || project.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleOpenProject(project)}
                  onKeyDown={(event) => {
                    if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
                      event.preventDefault();
                      handleOpenProject(project);
                    }
                  }}
                  className="group w-full cursor-pointer rounded-2xl border border-[#E1ECE6] bg-white p-5 text-left transition hover:-translate-y-1 hover:border-[#A8D7B9] hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-[#159B59]/30"
                >
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#E8F8EF] text-[#159B59]">
                      <FolderKanban size={21} />
                    </div>

                    <span className="rounded-full border border-[#F1E2C7] bg-[#FFF8EC] px-3 py-1 text-[11px] font-semibold text-[#9A681D]">
                      {project.readinessStatus || "Needs Attention"}
                    </span>
                  </div>

                  <h3 className="text-lg font-bold text-[#001E2B]">
                    {project.name}
                  </h3>

                  <p className="mt-2 min-h-10 text-sm leading-5 text-[#71817B]">
                    {project.description ||
                      "No project description provided."}
                  </p>

                  {project.githubRepo && (
                    <a
                      href={project.githubRepo}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-4 inline-flex items-center gap-2 break-all text-xs font-medium text-[#159B59] hover:underline"
                    >
                      <GitBranch size={14} />
                      GitHub Repository
                      <ExternalLink size={12} />
                    </a>
                  )}

                  <div className="mt-5 flex items-center justify-between border-t border-[#EAF1ED] pt-4">
                    <span className="text-xs text-[#82918B]">
                      Project Workspace
                    </span>

                    <span className="text-xs font-semibold text-[#159B59]">
                      {project.members?.incomingIds?.length || 0} Incoming
                    </span>
                  </div>
                  <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#159B59]">
                    View project details <ArrowUpRight size={13} />
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Project summary */}
        <section className="dashboard-enter dashboard-delay-1 relative mb-8 overflow-hidden rounded-3xl border border-[#D8EADF] bg-white shadow-[0_12px_40px_rgba(15,75,48,0.06)]">
          <div className="absolute right-0 top-0 h-48 w-48 translate-x-16 -translate-y-20 rounded-full bg-[#E8F8EF] blur-2xl" />
          <div className="absolute bottom-0 right-24 h-28 w-28 translate-y-14 rounded-full bg-[#DDF3E6] blur-2xl" />

          <div className="relative p-6 sm:p-8">
            <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
              <div>
                <div className="mb-3 flex items-center gap-2 text-xs font-bold tracking-[0.15em] text-[#159B59]">
                  <Sparkles size={15} />
                  ACTIVE PROJECT
                </div>

                <h2 className="text-2xl font-bold tracking-tight text-[#001E2B] sm:text-3xl">
                  {activeProject?.name || "Sanchaya"}
                </h2>

                <p className="mt-2 text-sm text-[#71817B]">
                  {activeProject?.description ||
                    "Preserving Knowledge. Connecting People. Continuing Projects."}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {projects.length > 1 && (
                  <select
                    aria-label="Select active project"
                    value={activeProjectId}
                    onChange={(e) => handleSelectOverviewProject(e.target.value)}
                    className="rounded-xl border border-[#D8E7DF] bg-[#F8FCF9] px-3 py-2 text-xs font-semibold text-[#29483B] outline-none focus:border-[#159B59]"
                  >
                    {projects.map((p) => (
                      <option key={p._id || p.id} value={p._id || p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                )}

                <div
                  className={`inline-flex w-fit items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold ${
                    shared || activeProject?.readinessStatus === "Approved for Sharing"
                      ? "border-[#CDE9D8] bg-[#EAF8EF] text-[#087A3D]"
                      : "border-[#F1E2C7] bg-[#FFF8EC] text-[#9A681D]"
                  }`}
                >
                  <span
                    className={`h-2 w-2 rounded-full ${
                      shared || activeProject?.readinessStatus === "Approved for Sharing"
                        ? "bg-[#159B59]"
                        : "bg-[#D99A35]"
                    }`}
                  />
                  {shared
                    ? "Handover Shared"
                    : activeProject?.readinessStatus || "Handover In Progress"}
                </div>
              </div>
            </div>

            <div className="mt-7 flex flex-col justify-between gap-4 border-t border-[#EAF1ED] pt-5 sm:flex-row sm:items-center">
              <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm text-[#64756F]">
                <span className="inline-flex items-center gap-2">
                  <FolderKanban
                    size={15}
                    className="text-[#159B59]"
                  />
                  Team:{" "}
                  <strong className="font-semibold text-[#29483B]">
                    Epsilum
                  </strong>
                </span>

                <span className="inline-flex items-center gap-2">
                  <ShieldCheck
                    size={15}
                    className="text-[#159B59]"
                  />
                  Role:{" "}
                  <strong className="font-semibold text-[#29483B]">
                    Team Leader
                  </strong>
                </span>

                <span className="inline-flex items-center gap-2">
                  <CalendarDays
                    size={15}
                    className="text-[#159B59]"
                  />
                  Project Workspace
                </span>
              </div>

              <Button
                onClick={() => onNavigate("sources", activeProjectId)}
                disabled={!activeProjectId}
                className="h-10 gap-2 rounded-xl bg-[#159B59] px-5 text-white shadow-sm transition hover:bg-[#087A3D]"
              >
                <FolderKanban size={16} />
                Add Project Sources
                <ArrowUpRight size={15} />
              </Button>
            </div>
          </div>
        </section>

        {/* Sources */}
        <section className="dashboard-enter dashboard-delay-1 mb-9">
          <div className="mb-4 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#E5F6EC] text-[#159B59]">
              <FolderKanban size={16} />
            </div>

            <div>
              <h2 className="text-lg font-bold text-[#001E2B]">
                Project Sources
              </h2>

              <p className="text-xs text-[#82918B]">
                Manage the material used to reconstruct project knowledge.
              </p>
            </div>
          </div>

          <SourceManagement
            projectId={activeProjectId}
            onUploadSources={() =>
              onNavigate?.("sources", activeProjectId)
            }
          />
        </section>

        {/* Stage 2: Knowledge Reconstruction & Risk Map */}
        {activeProjectId && (
          <section className="dashboard-enter dashboard-delay-2 mb-9">
            <Stage2ReconstructionPanel
              projectId={activeProjectId}
              sources={projectSources}
              onGoToSources={() => onNavigate?.("sources", activeProjectId)}
              onReconstruct={handleReconstructProject}
              reconstructing={reconstructing}
              reconstructSourceTypes={reconstructSourceTypes}
              onToggleSourceType={handleToggleSourceType}
              onResetSourceTypes={() => {
                setReconstructSourceTypes([]);
                setSelectedSourceIds([]);
              }}
              selectedSourceIds={selectedSourceIds}
              onToggleSourceId={handleToggleSourceId}
              onClearSourceIds={() => setSelectedSourceIds([])}
              reconstructionResult={reconstructionResult}
              reconstructionMessage={reconstructionMessage}
              reconstructionError={reconstructionError}
              onLoadRiskMap={handleLoadRiskMap}
              riskMapLoading={riskMapLoading}
              riskMapData={riskMapData}
              riskMapError={riskMapError}
              onScanFreshness={handleScanFreshness}
              freshnessScanning={freshnessScanning}
              freshnessReport={freshnessReport}
              freshnessError={freshnessError}
              onReviewFindings={() => onNavigate?.("findings", activeProjectId)}
              showRiskMap={false}
            />
          </section>
        )}

        {/* Findings statistics */}
        <section className="dashboard-enter dashboard-delay-2 mb-9">
          <div className="mb-5 flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
            <div>
              <p className="mb-1 text-[11px] font-bold tracking-[0.16em] text-[#159B59]">
                EVIDENCE SNAPSHOT
              </p>

              <h2 className="text-xl font-bold tracking-tight text-[#001E2B] sm:text-2xl">
                Findings Overview
              </h2>

              <p className="mt-1 text-sm text-[#71817B]">
                Monitor reconstructed information and its verification status.
              </p>
            </div>

            <div className="inline-flex items-center gap-2 text-xs font-medium text-[#82918B]">
              <Activity size={14} />
              Workspace summary
            </div>
          </div>

          <div
            key={refreshKey}
            className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
          >
            {stats.map((item, index) => (
              <div
                key={item.type}
                className="dashboard-enter"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <StatsCard {...item} />
              </div>
            ))}
          </div>
        </section>

        {/* Analytics */}
        <section className="dashboard-enter dashboard-delay-3 mb-9">
          <div className="mb-5">
            <p className="mb-1 text-[11px] font-bold tracking-[0.16em] text-[#159B59]">
              PROJECT INSIGHTS
            </p>

            <h2 className="text-xl font-bold tracking-tight text-[#001E2B] sm:text-2xl">
              Project Analytics
            </h2>

            <p className="mt-1 text-sm text-[#71817B]">
              Review evidence status and recorded contribution distribution.
            </p>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <div className="dashboard-enter dashboard-delay-1 min-w-0">
              <FindingChart findings={projectFindings} />
            </div>

            <div className="dashboard-enter dashboard-delay-2 min-w-0">
              <ContributionChart riskMapData={riskMapData} />
            </div>
          </div>

          {activeProjectId && (
            <div className="mt-5">
              <RiskMapPanel
                riskMapData={riskMapData}
                loading={riskMapLoading}
                error={riskMapError}
                onRefresh={handleLoadRiskMap}
              />
            </div>
          )}

          <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-[#82918B]">
            <ShieldCheck size={14} className="mt-0.5 shrink-0" />
            Contribution data represents recorded activity, not proof of
            expertise or individual performance.
          </p>
        </section>

        {/* Progress */}
        <section className="dashboard-enter dashboard-delay-4 mb-9">
          <div className="mb-5">
            <p className="mb-1 text-[11px] font-bold tracking-[0.16em] text-[#159B59]">
              HANDOVER TRACKER
            </p>

            <h2 className="text-xl font-bold tracking-tight text-[#001E2B] sm:text-2xl">
              Project Progress
            </h2>

            <p className="mt-1 text-sm text-[#71817B]">
              Follow recent activity and overall handover readiness.
            </p>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <RecentActivity
              findings={projectFindings}
              sources={projectSources}
              history={historyData}
            />
            <ReadinessPanel
              key={activeProjectId}
              readiness={
                readinessData || {
                  readinessStatus: activeProject?.readinessStatus,
                  checklist: activeProject?.readinessChecklist,
                }
              }
              evaluationResult={readinessEvaluation}
              onEvaluate={handleEvaluateReadiness}
              onSignOff={handleSignOff}
              isLeader={user?.role === "leader"}
              evaluating={evaluatingReadiness}
              signingOff={signingOff}
              actionError={readinessActionError}
              actionMessage={readinessActionMessage}
            />
          </div>
        </section>

        {/* Knowledge gaps */}
        <section className="dashboard-enter dashboard-delay-5 mb-9">
          <div className="mb-5">
            <p className="mb-1 text-[11px] font-bold tracking-[0.16em] text-[#159B59]">
              WHAT NEEDS ATTENTION
            </p>

            <h2 className="text-xl font-bold tracking-tight text-[#001E2B] sm:text-2xl">
              Knowledge Gaps
            </h2>

            <p className="mt-1 text-sm text-[#71817B]">
              Identify areas where project knowledge may be incomplete.
            </p>
          </div>

          <KnowledgeGapRadar
            gapsData={gapsData}
            gapQuestions={gapQuestions}
            onReviewGaps={() =>
              onNavigate?.("findings", activeProjectId)
            }
          />
        </section>

        {/* Leader action */}
        <section className="dashboard-enter dashboard-delay-5 relative overflow-hidden rounded-3xl border border-[#CDE9D8] bg-gradient-to-br from-[#EAF8EF] via-[#F4FBF6] to-white p-6 shadow-[0_10px_30px_rgba(15,75,48,0.05)] sm:p-8">
          <div className="absolute -right-10 -top-14 h-44 w-44 rounded-full bg-white/70 blur-2xl" />

          <div className="relative flex flex-col justify-between gap-6 md:flex-row md:items-center">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#D7EDE0] bg-white shadow-sm">
                <ShieldCheck
                  size={23}
                  className="text-[#159B59]"
                />
              </div>

              <div>
                <p className="mb-1 text-[11px] font-bold tracking-[0.16em] text-[#159B59]">
                  NEXT STEP
                </p>

                <h2 className="text-xl font-bold text-[#001E2B]">
                  Team Leader Actions
                </h2>

                <p className="mt-2 max-w-xl text-sm leading-6 text-[#64756F]">
                  Review reconstructed findings, verify supporting evidence,
                  and approve information before sharing the team handover.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {!shared ? (
                <Button
                  onClick={() =>
                    onNavigate("findings", activeProjectId)
                  }
                  disabled={!activeProjectId}
                  className="h-11 shrink-0 gap-2 rounded-xl bg-[#159B59] px-5 text-white shadow-sm transition hover:bg-[#087A3D]"
                >
                  <ClipboardCheck size={17} />
                  Review Findings
                  <ArrowUpRight size={15} />
                </Button>
              ) : (
                <div className="dashboard-success min-w-[230px] rounded-2xl border border-[#CDE9D8] bg-white p-4 shadow-sm">
                  <div className="flex items-center gap-2 text-sm font-semibold text-[#087A3D]">
                    <CheckCircle2 size={17} />
                    Handover marked as shared
                  </div>

                  <p className="mt-2 text-sm text-[#64756F]">
                    {approvedCount} approved findings have been shared.
                  </p>
                </div>
              )}

              <Button
                variant="outline"
                onClick={() => onNavigate("handover", activeProjectId)}
                disabled={!activeProjectId}
                className="h-11 shrink-0 gap-2 rounded-xl border-[#D8E7DF] bg-white px-4 text-[#24483A] hover:border-[#159B59]"
              >
                <FileText size={16} />
                View Handover Package
              </Button>

              <Button
                variant="outline"
                onClick={handleExportHandoverPdf}
                disabled={!activeProjectId || exportingPdf}
                className="h-11 shrink-0 gap-2 rounded-xl border-[#D8E7DF] bg-white px-4 text-[#001E2B] hover:border-[#001E2B]"
              >
                {exportingPdf ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Download size={16} />
                )}
                {exportingPdf
                  ? "Exporting..."
                  : (readinessData?.readinessStatus || activeProject?.readinessStatus) ===
                      "Approved for Sharing"
                    ? "Export Official PDF"
                    : "Export Draft PDF"}
              </Button>
            </div>
          </div>

          {pdfExportError && (
            <div className="relative mt-4 flex items-start gap-2 rounded-xl border border-[#F1D7D2] bg-[#FFF5F3] p-3 text-xs text-[#A33F32]">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>{pdfExportError}</span>
            </div>
          )}
        </section>

        <footer className="mt-8 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-[11px] text-[#91A099]">
          <Clock3 size={12} />
          Demonstration dashboard
          <span>·</span>
          Project list connected to backend
        </footer>

      </div>
    </main>
  );
}
