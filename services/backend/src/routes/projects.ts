import { Router, Request, Response } from "express";
import { z } from "zod";
import { Project } from "../models/Project.js";
import { authenticateToken, requireRoles } from "../middlewares/authMiddleware.js";
import { validateBody } from "../middlewares/validate.js";

const router = Router();

const createProjectSchema = z.object({
  name: z.string().min(2, "Project name must be at least 2 characters"),
  description: z.string().optional().default(""),
  githubRepo: z.string().optional().default(""),
});

const assignMembersSchema = z.object({
  outgoingIds: z.array(z.string()).optional(),
  incomingIds: z.array(z.string()).optional(),
});

/**
 * POST /api/projects - Leader only
 */
router.post(
  "/",
  authenticateToken,
  requireRoles(["leader"]),
  validateBody(createProjectSchema),
  async (req: Request, res: Response): Promise<void> => {
    const { name, description, githubRepo } = req.body;

    const project = await Project.create({
      name,
      description,
      githubRepo,
      members: {
        leaderId: req.user!.userId,
        outgoingIds: [],
        incomingIds: [],
      },
      readinessChecklist: {
        sourcesVerified: false,
        decisionsBackedByEvidence: false,
        unfinishedTasksAssignedOrUnknown: false,
        blockersIdentified: false,
        conflictsDisclosed: false,
        recipientPermissionsChecked: false,
        leaderApprovalRecorded: false,
      },
      readinessStatus: "Needs Attention",
    });

    res.status(201).json({
      success: true,
      message: "Project workspace created successfully",
      data: project,
    });
  }
);

/**
 * GET /api/projects - List user projects
 */
router.get("/", authenticateToken, async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.userId;

  const projects = await Project.find({
    $or: [
      { "members.leaderId": userId },
      { "members.outgoingIds": userId },
      { "members.incomingIds": userId },
    ],
  }).sort({ updatedAt: -1 });

  res.status(200).json({
    success: true,
    data: projects,
  });
});

/**
 * GET /api/projects/:projectId
 */
router.get("/:projectId", authenticateToken, async (req: Request, res: Response): Promise<void> => {
  const project = await Project.findById(req.params.projectId)
    .populate("members.leaderId", "name email role")
    .populate("members.outgoingIds", "name email role")
    .populate("members.incomingIds", "name email role");

  if (!project) {
    res.status(404).json({ success: false, error: "Project not found" });
    return;
  }

  res.status(200).json({
    success: true,
    data: project,
  });
});

/**
 * POST /api/projects/:projectId/members - Leader only
 */
router.post(
  "/:projectId/members",
  authenticateToken,
  requireRoles(["leader"]),
  validateBody(assignMembersSchema),
  async (req: Request, res: Response): Promise<void> => {
    const { outgoingIds, incomingIds } = req.body;

    const project = await Project.findById(req.params.projectId);
    if (!project) {
      res.status(404).json({ success: false, error: "Project not found" });
      return;
    }

    if (outgoingIds) {
      project.members.outgoingIds = outgoingIds as any;
    }
    if (incomingIds) {
      project.members.incomingIds = incomingIds as any;
    }

    await project.save();

    res.status(200).json({
      success: true,
      message: "Project members updated successfully",
      data: project,
    });
  }
);

export default router;

