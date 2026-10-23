import { Router } from "express";
import { validate } from "../middlewares/validate";
import {
  createUserSchema,
  getUserByIdSchema,
  updateUserSchema,
} from "../validators/user.validator";
import {
  createUser,
  getUserById,
  getAllUsers,
  updateUser,
  deleteUser,
} from "../controllers/user.controller";
import { asyncHandler } from "../utils/asyncHandler";

const router: Router = Router();

/**
 * POST   /api/users          → Register a new face-recognition user
 * GET    /api/users          → List all registered users
 * GET    /api/users/:id      → Retrieve a single user by ID
 * PATCH  /api/users/:id      → Partially update a user record
 * DELETE /api/users/:id      → Soft-delete (deactivate) a user
 */

router.post("/", validate(createUserSchema), asyncHandler(createUser));
router.get("/", asyncHandler(getAllUsers));
router.get("/:id", validate(getUserByIdSchema), asyncHandler(getUserById));
router.patch("/:id", validate(updateUserSchema), asyncHandler(updateUser));
router.delete("/:id", validate(getUserByIdSchema), asyncHandler(deleteUser));

export default router;
