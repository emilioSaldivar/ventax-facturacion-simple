import type { ApiErrorResponse } from "@facturacion-simple/shared";
import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { HttpError } from "./http-error";

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  const requestId = String(req.id);

  if (error instanceof ZodError) {
    const body: ApiErrorResponse = {
      error: {
        code: "VALIDATION_ERROR",
        message: "La solicitud contiene datos invalidos.",
        details: error.flatten(),
        requestId
      }
    };
    res.status(400).json(body);
    return;
  }

  if (error instanceof HttpError) {
    const body: ApiErrorResponse = {
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
        requestId
      }
    };
    res.status(error.statusCode).json(body);
    return;
  }

  req.log.error({ err: error }, "Unhandled API error");

  const body: ApiErrorResponse = {
    error: {
      code: "INTERNAL_ERROR",
      message: "Ocurrio un error interno.",
      requestId
    }
  };
  res.status(500).json(body);
};
