import { getFindings } from "../api/findingsApi.js";
import { getProjects } from "../api/projectsApi.js";
import { getReadiness } from "../api/gapsApi.js";
import { normalizeStatusKey } from "../components/Badges.jsx";

/**
 * Fetch and aggregate real dashboard data for a project.
 */
export async function getDashboardData(projectId = null) {
  let targetProjectId = projectId;

  if (!targetProjectId) {
    try {
      const projects = await getProjects();
      if (Array.isArray(projects) && projects.length > 0) {
        targetProjectId = projects[0]._id || projects[0].id;
      }
    } catch {
      // Continue without project
    }
  }

  if (!targetProjectId) {
    return {
      stats: {
        total: 0,
        supported: 0,
        needsReview: 0,
        conflicting: 0,
        unknown: 0,
      },
      activities: [],
      contribution: [],
    };
  }

  try {
    const findings = await getFindings(targetProjectId).catch(() => []);
    const counts = {
      total: findings.length,
      supported: 0,
      needsReview: 0,
      conflicting: 0,
      unknown: 0,
    };

    findings.forEach((f) => {
      const key = normalizeStatusKey(f.status || f.verification_status);
      if (key === "supported") counts.supported++;
      else if (key === "needs_review") counts.needsReview++;
      else if (key === "conflicting") counts.conflicting++;
      else counts.unknown++;
    });

    return {
      stats: counts,
      findings,
      projectId: targetProjectId,
    };
  } catch (err) {
    console.warn("Could not calculate live dashboard data:", err);
    return {
      stats: {
        total: 0,
        supported: 0,
        needsReview: 0,
        conflicting: 0,
        unknown: 0,
      },
      findings: [],
      projectId: targetProjectId,
    };
  }
}
