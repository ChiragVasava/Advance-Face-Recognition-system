import { Request, Response, NextFunction } from "express";

/**
 * Higher-order wrapper that catches both synchronous throws and rejected
 * promises from any Express route handler or controller, forwarding them
 * to the centralized error-handling middleware.
 *
 * Usage:
 * ```ts
 * router.get("/users/:id", asyncHandler(getUserById));
 * ```
 */
type AsyncRouteHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<void> | void;

export const asyncHandler =
  (fn: AsyncRouteHandler) =>
  (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
