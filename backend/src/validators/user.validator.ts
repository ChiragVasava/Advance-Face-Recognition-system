import { z } from "zod";

// ── Create User ────────────────────────────────────────────────────

/**
 * Schema for `POST /api/users`  —  registers a new face-recognition user.
 */
export const createUserSchema = z.object({
  body: z.object({
    name: z
      .string({ required_error: "Name is required", invalid_type_error: "Name must be a string" })
      .trim()
      .min(1, "Name must not be empty")
      .max(255, "Name must be at most 255 characters"),

    age: z
      .number({ required_error: "Age is required", invalid_type_error: "Age must be a number" })
      .int("Age must be a whole number")
      .min(1, "Age must be at least 1")
      .max(150, "Age must be at most 150"),

    address: z
      .string({ required_error: "Address is required", invalid_type_error: "Address must be a string" })
      .trim()
      .min(1, "Address must not be empty")
      .max(500, "Address must be at most 500 characters"),

    department: z
      .string()
      .trim()
      .max(100, "Department must be at most 100 characters")
      .optional(),
  }),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});

// ── Update User ────────────────────────────────────────────────────

/**
 * Schema for `PATCH /api/users/:id`  —  partial update of a registered user.
 */
export const updateUserSchema = z.object({
  body: z.object({
    name: z.string().trim().min(1).max(255).optional(),
    age: z.number().int().min(1).max(150).optional(),
    address: z.string().trim().min(1).max(500).optional(),
    department: z.string().trim().max(100).optional(),
    isActive: z.boolean().optional(),
  }),
  params: z.object({
    id: z.string().regex(/^\d+$/, "User ID must be a positive integer").transform(Number),
  }),
  query: z.object({}).optional(),
});

// ── Get / Delete User by ID ────────────────────────────────────────

/**
 * Schema for `GET /api/users/:id` and `DELETE /api/users/:id`.
 */
export const getUserByIdSchema = z.object({
  params: z.object({
    id: z
      .string({ required_error: "User ID is required" })
      .regex(/^\d+$/, "User ID must be a positive integer")
      .transform(Number),
  }),
  body: z.object({}).optional(),
  query: z.object({}).optional(),
});

// ── Inferred Types ─────────────────────────────────────────────────

export type CreateUserInput = z.infer<typeof createUserSchema>["body"];
export type UpdateUserInput = z.infer<typeof updateUserSchema>["body"];
export type GetUserByIdParams = z.infer<typeof getUserByIdSchema>["params"];
