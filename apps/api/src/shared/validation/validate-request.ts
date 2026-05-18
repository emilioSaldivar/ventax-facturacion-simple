import type { NextFunction, Request, Response } from "express";
import type { ZodSchema } from "zod";

type RequestPart = "body" | "query" | "params";

export function validateRequest(part: RequestPart, schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const parsed = schema.parse(req[part]);
    req[part] = parsed;
    next();
  };
}

