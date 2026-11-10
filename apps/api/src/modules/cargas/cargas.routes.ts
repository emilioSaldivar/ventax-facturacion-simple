import express, { Router, type NextFunction, type Request, type RequestHandler, type Response } from "express";
import { z } from "zod";
import { env } from "../../config/env";
import { HttpError } from "../../shared/errors/http-error";
import { validateRequest } from "../../shared/validation/validate-request";
import { requireAuth } from "../auth/auth.middleware";
import { operationalContextRepository } from "../context/context.repository";
import { getOperationalContext, getReadiness } from "../context/context.service";
import type { OperationalContextResponse, ReadinessResponse } from "../context/context.types";
import { createFiscalGateway, fiscalGateway } from "../fiscal-gateway/fiscal-gateway.client";
import { buildFiscalGatewayConfig } from "../fiscal-gateway/fiscal-gateway.config";
import type { FiscalArtifactResponse } from "../fiscal-gateway/fiscal-gateway.types";
import { cargaRepository } from "./cargas.repository";
import {
  accionSobreCarga,
  descargarDiccionario,
  descargarEjemplo,
  descargarPlantilla,
  listarEjemplos,
  descargarResultado,
  inutilizarComprobante,
  listarCargas,
  listarComprobantes,
  obtenerCarga,
  obtenerLotes,
  subirCarga,
  type CargasDeps
} from "./cargas.service";

const TIPOS_DE_ARCHIVO = new Set(["text/csv", "application/zip"]);
/** SPEC_DOCUMENTOS_ESCRITORIO_v0.1, fase B1 (RN-05): tipos habilitados del catalogo `CARGA_TIPO_DOCUMENTO` de FE. */
const TIPOS_DE_DOCUMENTO = ["FACTURA", "NOTA_REMISION"] as const;

function tipoDeDocumento(valor: unknown): (typeof TIPOS_DE_DOCUMENTO)[number] {
  if (valor === undefined || valor === "") return "FACTURA";
  if (typeof valor === "string" && (TIPOS_DE_DOCUMENTO as readonly string[]).includes(valor)) return valor as (typeof TIPOS_DE_DOCUMENTO)[number];
  throw new HttpError(400, "VALIDATION_ERROR", "Tipo de documento no habilitado para la carga.", { reason: "TIPO_NO_HABILITADO", tipos: TIPOS_DE_DOCUMENTO });
}

export interface CargasRouterDeps extends CargasDeps {
  requireAuth: RequestHandler;
  getContext: (userId: string) => Promise<OperationalContextResponse>;
  getReadiness: (userId: string) => Promise<ReadinessResponse>;
  enabled: () => boolean;
  maxBytes: number;
  subidasSimultaneas: number;
}

/**
 * La clave de consumidor es del facturador (`/v1/cargas` no acepta la compartida). En modo mock
 * no hay FE que la pida.
 */
export async function gatewayDeCargas(facturadorId: string, repository = cargaRepository) {
  const apiKey = await repository.getFacturadorApiKey(facturadorId);
  if (apiKey) return createFiscalGateway({ ...buildFiscalGatewayConfig(env), apiKey });
  if (env.FE_GATEWAY_MODE === "mock") return fiscalGateway;
  throw new HttpError(409, "CONFLICT", "El facturador no tiene clave de consumidor en el servicio fiscal. Contacta a soporte.", {
    reason: "SIN_CLAVE_DE_CONSUMIDOR"
  });
}

const idSchema = z.object({ id: z.string().uuid() });
const comprobanteParamsSchema = z.object({ id: z.string().uuid(), orden: z.coerce.number().int().min(1) });
const inutilizarBodySchema = z.object({ motivo: z.string().trim().min(5).max(150) });

const listQuerySchema = z.object({
  estado: z.string().trim().max(200).optional(),
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0)
});

const comprobantesQuerySchema = z.object({
  estado: z.string().trim().max(200).optional(),
  con_advertencias: z.enum(["true", "false"]).optional(),
  detalle: z.enum(["true", "false"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50)
});

function enviarArchivo(res: Response, archivo: FiscalArtifactResponse): void {
  res.setHeader("Content-Type", archivo.content_type);
  res.setHeader("Content-Disposition", `attachment; filename="${archivo.filename}"`);
  res.send(archivo.body);
}

export function createCargasRouter(deps: CargasRouterDeps): Router {
  const router = Router();
  let subidasEnCurso = 0;

  function fallar(res: Response, next: NextFunction, error: unknown): void {
    if (error instanceof HttpError && error.statusCode === 429) {
      const espera = (error.details as { retry_after_seconds?: number } | undefined)?.retry_after_seconds;
      if (espera) res.setHeader("Retry-After", String(espera));
    }
    next(error);
  }

  const leerArchivo = express.raw({ type: () => true, limit: deps.maxBytes });

  // Se valida el tipo y el cupo antes de leer: un rechazo no ocupa memoria.
  const prepararSubida: RequestHandler = (req, res, next) => {
    const tipo = (req.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
    if (!TIPOS_DE_ARCHIVO.has(tipo)) {
      next(new HttpError(415, "VALIDATION_ERROR", "El archivo debe ser .csv o .zip.", { reason: "TIPO_DE_CONTENIDO_NO_ADMITIDO" }));
      return;
    }
    if (subidasEnCurso >= deps.subidasSimultaneas) {
      fallar(res, next, new HttpError(429, "CONFLICT", "Hay otras subidas en curso. Intenta de nuevo en unos segundos.", {
        reason: "SUBIDAS_SIMULTANEAS",
        retry_after_seconds: 10
      }));
      return;
    }
    subidasEnCurso += 1;
    res.once("close", () => {
      subidasEnCurso -= 1;
    });
    leerArchivo(req, res, (error?: unknown) => {
      if ((error as { type?: string } | undefined)?.type === "entity.too.large") {
        next(new HttpError(413, "PAYLOAD_TOO_LARGE", "El archivo supera el tamano maximo permitido.", { tope_bytes: deps.maxBytes }));
        return;
      }
      next(error);
    });
  };

  async function contextoListo(req: Request): Promise<OperationalContextResponse> {
    const context = await deps.getContext(req.user!.id);
    const readiness = await deps.getReadiness(req.user!.id);
    if (!readiness.ready) {
      throw new HttpError(409, "CONFLICT", "El contexto operativo no esta listo para emitir.", {
        reason: "CONTEXTO_NO_LISTO",
        checks: readiness.checks
      });
    }
    return context;
  }

  router.use("/cargas", (_req, _res, next) => {
    next(deps.enabled() ? undefined : new HttpError(404, "NOT_FOUND", "Ruta no encontrada."));
  });
  router.use("/cargas", deps.requireAuth);

  router.get("/cargas/plantilla", async (req, res, next) => {
    try {
      enviarArchivo(res, await descargarPlantilla(await deps.getContext(req.user!.id), deps, tipoDeDocumento(req.query.tipo_documento)));
    } catch (error) {
      fallar(res, next, error);
    }
  });

  // SPEC_PLANILLAS_EJEMPLO_v0.1: ejemplos y documentacion de la planilla del tipo elegido.
  router.get("/cargas/ejemplos", async (req, res, next) => {
    try {
      res.json(await listarEjemplos(await deps.getContext(req.user!.id), deps, tipoDeDocumento(req.query.tipo_documento)));
    } catch (error) {
      fallar(res, next, error);
    }
  });

  router.get("/cargas/ejemplos/:codigo", async (req, res, next) => {
    try {
      const codigo = String(req.params.codigo);
      if (!/^[A-Z0-9_]{1,60}$/.test(codigo)) throw new HttpError(400, "VALIDATION_ERROR", "Codigo de ejemplo invalido.");
      enviarArchivo(res, await descargarEjemplo(await deps.getContext(req.user!.id), deps, codigo, tipoDeDocumento(req.query.tipo_documento)));
    } catch (error) {
      fallar(res, next, error);
    }
  });

  router.get("/cargas/diccionario", async (req, res, next) => {
    try {
      const formato = req.query.formato === "md" ? "md" : req.query.formato === undefined || req.query.formato === "pdf" ? "pdf" : null;
      if (!formato) throw new HttpError(400, "VALIDATION_ERROR", "Formato invalido: pdf o md.");
      enviarArchivo(res, await descargarDiccionario(await deps.getContext(req.user!.id), deps, tipoDeDocumento(req.query.tipo_documento), formato));
    } catch (error) {
      fallar(res, next, error);
    }
  });

  router.post("/cargas", prepararSubida, async (req, res, next) => {
    try {
      const tipoDocumento = tipoDeDocumento(req.query.tipo_documento);
      const contenido = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      if (contenido.length === 0) {
        throw new HttpError(422, "VALIDATION_ERROR", "El archivo esta vacio.", { reason: "ARCHIVO_VACIO" });
      }
      const context = await contextoListo(req);
      const nombre = typeof req.query.nombre_archivo === "string" ? req.query.nombre_archivo.slice(0, 200) : undefined;
      const contentType = (req.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase() as "text/csv" | "application/zip";
      const carga = await subirCarga(context, { contenido, contentType, nombreArchivo: nombre, tipoDocumento }, deps);
      res.status(carga.repetida ? 200 : 201).json(carga);
    } catch (error) {
      fallar(res, next, error);
    }
  });

  router.get("/cargas", validateRequest("query", listQuerySchema), async (req, res, next) => {
    try {
      const query = req.query as unknown as z.infer<typeof listQuerySchema>;
      const context = await deps.getContext(req.user!.id);
      res.json(await listarCargas(context, {
        estados: query.estado?.split(",").map((estado) => estado.trim()).filter(Boolean),
        desde: query.desde,
        hasta: query.hasta,
        limit: query.limit,
        offset: query.offset
      }, deps));
    } catch (error) {
      fallar(res, next, error);
    }
  });

  router.get("/cargas/:id", validateRequest("params", idSchema), async (req, res, next) => {
    try {
      res.json(await obtenerCarga(await deps.getContext(req.user!.id), String(req.params.id), deps));
    } catch (error) {
      fallar(res, next, error);
    }
  });

  router.get(
    "/cargas/:id/comprobantes",
    validateRequest("params", idSchema),
    validateRequest("query", comprobantesQuerySchema),
    async (req, res, next) => {
      try {
        const query = req.query as unknown as z.infer<typeof comprobantesQuerySchema>;
        res.json(await listarComprobantes(await deps.getContext(req.user!.id), String(req.params.id), {
          estado: query.estado,
          con_advertencias: query.con_advertencias === "true",
          detalle: query.detalle === "true",
          page: query.page,
          limit: query.limit
        }, deps));
      } catch (error) {
        fallar(res, next, error);
      }
    }
  );

  router.post("/cargas/:id/confirmar", validateRequest("params", idSchema), async (req, res, next) => {
    try {
      res.json(await accionSobreCarga(await contextoListo(req), String(req.params.id), "confirmar", deps));
    } catch (error) {
      fallar(res, next, error);
    }
  });

  for (const accion of ["cancelar", "reintentar"] as const) {
    router.post(`/cargas/:id/${accion}`, validateRequest("params", idSchema), async (req, res, next) => {
      try {
        res.json(await accionSobreCarga(await deps.getContext(req.user!.id), String(req.params.id), accion, deps));
      } catch (error) {
        fallar(res, next, error);
      }
    });
  }

  router.post(
    "/cargas/:id/comprobantes/:orden/inutilizar",
    validateRequest("params", comprobanteParamsSchema),
    validateRequest("body", inutilizarBodySchema),
    async (req, res, next) => {
      try {
        const { motivo } = req.body as z.infer<typeof inutilizarBodySchema>;
        res.json(await inutilizarComprobante(
          await deps.getContext(req.user!.id),
          String(req.params.id),
          Number(req.params.orden),
          motivo,
          deps
        ));
      } catch (error) {
        fallar(res, next, error);
      }
    }
  );

  router.get("/cargas/:id/resultado", validateRequest("params", idSchema), async (req, res, next) => {
    try {
      enviarArchivo(res, await descargarResultado(await deps.getContext(req.user!.id), String(req.params.id), deps));
    } catch (error) {
      fallar(res, next, error);
    }
  });

  router.get("/cargas/:id/lotes", validateRequest("params", idSchema), async (req, res, next) => {
    try {
      res.json(await obtenerLotes(await deps.getContext(req.user!.id), String(req.params.id), deps));
    } catch (error) {
      fallar(res, next, error);
    }
  });

  return router;
}

export const cargasRouter = createCargasRouter({
  repository: cargaRepository,
  gatewayFor: (facturadorId) => gatewayDeCargas(facturadorId),
  requireAuth,
  getContext: (userId) => getOperationalContext(userId, operationalContextRepository),
  getReadiness: (userId) => getReadiness(userId, operationalContextRepository, fiscalGateway),
  enabled: () => env.CARGA_MASIVA_ENABLED,
  maxBytes: env.CARGA_MAX_BYTES,
  subidasSimultaneas: env.CARGA_SUBIDAS_SIMULTANEAS
});
