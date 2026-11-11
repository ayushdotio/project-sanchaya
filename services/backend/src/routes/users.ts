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
 * @name : Update User Role API
 * @route : PUT /api/users/:id/role
 * @access : Protected (requires valid JWT via `authenticateToken` and `"leader"` role via `requireRoles`; body validated via `promoteUserSchema`)
 * @description : Promotes or demotes another user's RBAC role across the three supported roles.
 *   1. Request body (`role`: `"leader" | "outgoing" | "incoming"`) is validated by
 *      `validateBody(promoteUserSchema)` (returns `400` with field-level `errors` if invalid).
 *   2. Enforces a self-modification guard: if `req.user?.userId === req.params.id`, returns `403 Forbidden`
 *      so a leader cannot demote or modify their own role.
 *   3. Validates `mongoose.Types.ObjectId.isValid(id)` before querying MongoDB; returns `400 Bad Request`
 *      if the identifier format is invalid.
 *   4. Updates the user via `User.findByIdAndUpdate(id, { role }, { new: true, runValidators: true })`;
 *      returns `404 Not Found` if no user exists for `id` (or delegates DB errors to `next(err)`).
 *   5. Responds with `200 OK` containing `{ success: true, message, data: { id, name, email, role } }`.
 */
router.put(
  "/:id/role",
  authenticateToken,
  requireRoles(["leader"]),
  validateBody(promoteUserSchema),
  asyncHandler(promoteUserController)
);

export default router;

