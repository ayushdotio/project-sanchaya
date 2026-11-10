import { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import { User } from "../models/User.js";
import { UserRole } from "../types/auth.types.js";

/**
 * PUT /api/users/:id/role
 * Promote or demote a user's role.
 * Protected: authenticateToken + requireRoles(["leader"])
 *
 * Body: { role: "leader" | "outgoing" | "incoming" }
 */
export const promoteUserController = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const { id } = req.params as { id: any };
  const { role } = req.body as { role: UserRole };

  // Guard: prevent a leader from demoting / modifying themselves
  if (req.user?.userId === id) {
    res.status(403).json({
      success: false,
      error: "You cannot change your own role.",
    });
    return;
  }

  // Guard: validate MongoDB ObjectId format before hitting DB
  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400).json({
      success: false,
      error: `Invalid user identifier format: '${id}'`,
    });
    return;
  }

  try {
    const user = await User.findByIdAndUpdate(
      id,
      { role },
      { new: true, runValidators: true }, // runValidators enforces the enum on the schema
    );

    if (!user) {
      res.status(404).json({
        success: false,
        error: "User not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: `User role updated to '${role}' successfully.`,
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    next(err); // Delegate to global errorHandler (handles CastError, ValidationError, etc.)
  }
};
