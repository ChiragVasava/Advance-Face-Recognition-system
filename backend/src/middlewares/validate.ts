import { Request, Response, NextFunction } from "express";
import { AnyZodObject, ZodEffects } from "zod";

/**
 * Factory that returns Express middleware validating `req.body`, `req.query`,
 * and `req.params` against a Zod schema.
 *
 * On success the parsed (and potentially transformed) values are written back
 * to the request object so controllers always receive clean data.
 *
 * On failure the ZodError is forwarded to the global error handler which
 * maps it to a 422 response with per-field messages.
 */
export const validate =
  (schema: AnyZodObject | ZodEffects<AnyZodObject>) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const result = (schema as AnyZodObject).safeParse({
      body: req.body,
      query: req.query,
      params: req.params,
    });

    if (!result.success) {
      next(result.error);
      return;
    }

    // Write parsed values back so downstream code uses validated data.
    req.body = result.data.body;
    req.query = result.data.query;
    req.params = result.data.params;

    next();
  };
