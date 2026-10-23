import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { AppError } from "../utils/AppError";

/**
 * Envelope returned on every error response.
 * `stack` is only included when NODE_ENV !== "production".
 */
interface ErrorResponseBody {
  success: false;
  statusCode: number;
  message: string;
  errors?: Array<{ field: string; message: string }>;
  stack?: string;
}

/**
 * Global error-handling middleware.
 *
 * Express identifies error middleware by its 4-parameter signature — do NOT
 * remove any parameter even if the linter complains about `_req` / `_next`.
 */
export const globalErrorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const isProduction = process.env.NODE_ENV === "production";

  // ── Zod Validation Errors ────────────────────────────────────────
  if (err instanceof ZodError) {
    const body: ErrorResponseBody = {
      success: false,
      statusCode: 422,
      message: "Validation failed",
      errors: err.errors.map((e) => ({
        field: e.path.join("."),
        message: e.message,
      })),
    };
    res.status(422).json(body);
    return;
  }

  // ── Known Operational Errors ─────────────────────────────────────
  if (err instanceof AppError) {
    const body: ErrorResponseBody = {
      success: false,
      statusCode: err.statusCode,
      message: err.message,
    };
    if (!isProduction) {
      body.stack = err.stack;
    }
    res.status(err.statusCode).json(body);
    return;
  }

  const prismaError = err as Error & { errorCode?: string; code?: string };
  if (err.name.startsWith("Prisma") || prismaError.errorCode || prismaError.code?.startsWith("P")) {
    const databaseUnavailable = prismaError.errorCode === "P1001" || err.name === "PrismaClientInitializationError";
    console.warn("[DATABASE ERROR]", databaseUnavailable ? "PostgreSQL is unreachable" : err.message);
    res.status(503).json({
      success: false,
      statusCode: 503,
      message: databaseUnavailable
        ? "PostgreSQL is unreachable. Start your database or configure DATABASE_URL before registering users."
        : "The database request failed. Check the PostgreSQL connection and schema.",
    });
    return;
  }

  // ── Unknown / Programmer Errors ──────────────────────────────────
  console.error("[UNHANDLED ERROR]", err);

  const body: ErrorResponseBody = {
    success: false,
    statusCode: 500,
    message: isProduction
      ? "An unexpected error occurred"
      : err.message || "Internal Server Error",
  };
  if (!isProduction) {
    body.stack = err.stack;
  }

  res.status(500).json(body);
};

/**
 * Catch-all handler for undefined routes.
 * Mounted AFTER all legitimate routers so any unmatched path hits this.
 */
export const notFoundHandler = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  next(new AppError(`Route ${req.method} ${req.originalUrl} not found`, 404));
};
