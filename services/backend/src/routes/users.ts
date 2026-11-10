import { Router } from "express";
import { z } from "zod";
import { authenticateToken, requireRoles } from "../middlewares/authMiddleware.js";
import { validateBody } from "../middlewares/validate.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { promoteUserController } from "../controllers/user.controller.js";

const router = Router();

// Validation schema — only the three known roles are accepted
const promoteUserSchema = z.object({
  role: z.enum(["leader", "outgoing", "incoming"], {
    error: "Role must be one of: leader, outgoing, incoming",
  }),
});

/**
 * PUT /api/users/:id/role
 * Promote or demote a user's role.
 * Access: leader only
 */
router.put(
  "/:id/role",
  authenticateToken,
  requireRoles(["leader"]),
  validateBody(promoteUserSchema),
  asyncHandler(promoteUserController)
);

export default router;

