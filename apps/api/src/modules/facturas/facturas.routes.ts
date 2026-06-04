import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../auth/auth.middleware";
import { clienteRepository } from "../clientes/clientes.repository";
import { documentoIdentidadTipos } from "../clientes/clientes.types";
import { operationalContextRepository } from "../context/context.repository";
import { getOperationalContext } from "../context/context.service";
import { validateRequest } from "../../shared/validation/validate-request";
import { fiscalGateway } from "../fiscal-gateway/fiscal-gateway.client";
import { facturasRepository } from "./facturas.repository";
import {
  cancelDocumento,
  cancelDocumentoSend,
  createDocumentoDerived,
  enqueueFacturaEmission,
  emitNotaCreditoTotal,
  getBatchPendientesGestion,
  getDocumentoDecision,
  getDocumentoById,
  getDocumentoEventos,
  getReconciliacionFiscal,
  listNotaCreditoCandidates,
  listDocumentos,
  previewFactura,
  refreshDocumentoStatus,
  retryDocumentoEmission,
  retryDocumentoSameCdc,
  validateDocumentoCdcImpact,
  voidDocumentoNumber
} from "./facturas.service";
import { condicionesVenta, type DocumentoListFilters } from "./facturas.types";
import { HttpError } from "../../shared/errors/http-error";

const ivaTipos = ["IVA_10", "IVA_5", "EXENTA"] as const;
const documentoTipos = ["FACTURA", "NOTA_CREDITO"] as const;
const documentoTiposOperativos = ["CONTADO", "CREDITO", "NOTA_CREDITO"] as const;
const documentoEstados = ["EMITIENDO", "EMITIDA", "PENDIENTE_SIFEN", "RECHAZADA", "ERROR_OPERATIVO", "ERROR_TEMPORAL", "ANULADA"] as const;

const facturaPreviewSchema = z.object({
  condicion_venta: z.enum(condicionesVenta),
  tipo_transaccion: z.coerce.number().int().refine((value) => [1, 2, 3].includes(value), "tipo_transaccion invalido. Use 1, 2 o 3.").default(2),
  credito_plazo_dias: z.coerce.number().int().min(1).max(365).nullable().optional(),
  cliente: z.object({
    cliente_id: z.string().uuid().nullable().optional(),
    documento_tipo: z.enum(documentoIdentidadTipos),
    documento: z.string().trim().min(1).max(40),
    razon_social: z.string().trim().min(1).max(240),
    direccion: z.string().trim().max(240).nullable().optional(),
    telefono: z.string().trim().max(60).nullable().optional(),
    email: z.string().trim().email().max(240).nullable().optional()
  }),
  items: z
    .array(
      z.object({
        catalogo_item_id: z.string().uuid().nullable().optional(),
        codigo: z.string().trim().max(60).nullable().optional(),
        descripcion: z.string().trim().min(1).max(240),
        cantidad: z.coerce.number().int().min(1),
        precio_unitario: z.coerce.number().int().min(0),
        iva_tipo: z.enum(ivaTipos).default("IVA_10")
      })
    )
    .min(1)
});

const documentoListQuerySchema = z
  .object({
    tipo: z.enum(documentoTipos).optional(),
    tipo_operativo: z.enum(documentoTiposOperativos).optional(),
    estado: z.enum(documentoEstados).optional(),
    desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    q: z.string().trim().min(1).max(120).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0)
  })
  .refine((value) => !value.desde || !value.hasta || value.desde <= value.hasta, {
    message: "`desde` no puede ser posterior a `hasta`.",
    path: ["desde"]
  });

const notaCreditoCandidatesQuerySchema = z.object({
  q: z.string().trim().min(1).max(120).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  offset: z.coerce.number().int().min(0).default(0)
});

const documentoParamsSchema = z.object({
  documentoId: z.string().uuid()
});

const gestionBatchQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0)
});

const reconciliacionQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  q: z.string().trim().min(1).max(120).optional()
});

const cancelacionSchema = z.object({
  motivo: z.string().trim().min(1).max(150)
});
const gestionActionSchema = z.object({
  mode: z.enum(["SYNC", "BATCH", "AUTO"]).optional(),
  send_now: z.boolean().optional(),
  comment: z.string().trim().max(500).optional(),
  json_input: z.record(z.string(), z.unknown()).optional()
});
const cancelSendSchema = z.object({
  comment: z.string().trim().max(500).optional()
});
const validateCdcSchema = z.object({
  json_input: z.record(z.string(), z.unknown()).optional()
});
const voidNumberSchema = z.object({
  motivo: z.string().trim().min(1).max(150)
});

const notaCreditoSchema = z.object({
  motivo: z.string().trim().min(1).max(300)
});

export const facturasRouter = Router();

facturasRouter.get("/facturas", requireAuth, validateRequest("query", documentoListQuerySchema), async (req, res, next) => {
  try {
    const context = await getOperationalContext(req.user!.id, operationalContextRepository);
    const result = await listDocumentos(context, req.query as unknown as DocumentoListFilters, facturasRepository);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

facturasRouter.get(
  "/facturas/nce-candidatas",
  requireAuth,
  validateRequest("query", notaCreditoCandidatesQuerySchema),
  async (req, res, next) => {
    try {
      const context = await getOperationalContext(req.user!.id, operationalContextRepository);
      const result = await listNotaCreditoCandidates(context, req.query as unknown as { q?: string; limit: number; offset: number }, facturasRepository);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

facturasRouter.post(
  "/facturas/:documentoId/gestion/validate-cdc-impact",
  requireAuth,
  validateRequest("params", documentoParamsSchema),
  validateRequest("body", validateCdcSchema),
  async (req, res, next) => {
    try {
      const context = await getOperationalContext(req.user!.id, operationalContextRepository);
      const result = await validateDocumentoCdcImpact(
        context,
        String(req.params.documentoId),
        req.body as { json_input?: Record<string, unknown> },
        facturasRepository,
        fiscalGateway
      );
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

facturasRouter.post(
  "/facturas/:documentoId/gestion/retry-same-cdc",
  requireAuth,
  validateRequest("params", documentoParamsSchema),
  validateRequest("body", gestionActionSchema),
  async (req, res, next) => {
    try {
      const context = await getOperationalContext(req.user!.id, operationalContextRepository);
      const result = await retryDocumentoSameCdc(
        context,
        String(req.params.documentoId),
        req.body as { mode?: "SYNC" | "BATCH" | "AUTO"; send_now?: boolean; comment?: string; json_input?: Record<string, unknown> },
        facturasRepository,
        fiscalGateway
      );
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

facturasRouter.post(
  "/facturas/:documentoId/gestion/create-derived",
  requireAuth,
  validateRequest("params", documentoParamsSchema),
  validateRequest("body", gestionActionSchema),
  async (req, res, next) => {
    try {
      const context = await getOperationalContext(req.user!.id, operationalContextRepository);
      const result = await createDocumentoDerived(
        context,
        String(req.params.documentoId),
        req.body as { mode?: "SYNC" | "BATCH" | "AUTO"; send_now?: boolean; comment?: string; json_input?: Record<string, unknown> },
        facturasRepository,
        fiscalGateway
      );
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  }
);

facturasRouter.post(
  "/facturas/:documentoId/gestion/cancel-send",
  requireAuth,
  validateRequest("params", documentoParamsSchema),
  validateRequest("body", cancelSendSchema),
  async (req, res, next) => {
    try {
      const context = await getOperationalContext(req.user!.id, operationalContextRepository);
      const result = await cancelDocumentoSend(
        context,
        String(req.params.documentoId),
        req.body as { comment?: string },
        facturasRepository,
        fiscalGateway
      );
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

facturasRouter.post(
  "/facturas/:documentoId/gestion/void-number",
  requireAuth,
  validateRequest("params", documentoParamsSchema),
  validateRequest("body", voidNumberSchema),
  async (req, res, next) => {
    try {
      const context = await getOperationalContext(req.user!.id, operationalContextRepository);
      const result = await voidDocumentoNumber(
        context,
        String(req.params.documentoId),
        req.body as { motivo: string },
        facturasRepository,
        fiscalGateway
      );
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

facturasRouter.get("/facturas/:documentoId", requireAuth, validateRequest("params", documentoParamsSchema), async (req, res, next) => {
  try {
    const context = await getOperationalContext(req.user!.id, operationalContextRepository);
    const result = await getDocumentoById(context, String(req.params.documentoId), facturasRepository);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

facturasRouter.get(
  "/facturas/:documentoId/gestion/decision",
  requireAuth,
  validateRequest("params", documentoParamsSchema),
  async (req, res, next) => {
    try {
      const context = await getOperationalContext(req.user!.id, operationalContextRepository);
      const result = await getDocumentoDecision(context, String(req.params.documentoId), facturasRepository, fiscalGateway);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

facturasRouter.get(
  "/facturas/:documentoId/eventos",
  requireAuth,
  validateRequest("params", documentoParamsSchema),
  async (req, res, next) => {
    try {
      const context = await getOperationalContext(req.user!.id, operationalContextRepository);
      const result = await getDocumentoEventos(context, String(req.params.documentoId), facturasRepository, fiscalGateway);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

facturasRouter.get(
  "/facturas/gestion/batch-pendientes",
  requireAuth,
  validateRequest("query", gestionBatchQuerySchema),
  async (req, res, next) => {
    try {
      const context = await getOperationalContext(req.user!.id, operationalContextRepository);
      const result = await getBatchPendientesGestion(
        context,
        {
          limit: Number(req.query.limit),
          offset: Number(req.query.offset)
        },
        fiscalGateway
      );
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

facturasRouter.get(
  "/facturas/gestion/reconciliacion",
  requireAuth,
  validateRequest("query", reconciliacionQuerySchema),
  async (req, res, next) => {
    try {
      const context = await getOperationalContext(req.user!.id, operationalContextRepository);
      const result = await getReconciliacionFiscal(
        context,
        {
          offset: Number(req.query.offset),
          limit: Number(req.query.limit),
          q: typeof req.query.q === "string" ? req.query.q : undefined
        },
        fiscalGateway,
        facturasRepository
      );
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

facturasRouter.post(
  "/facturas/:documentoId/refresh-status",
  requireAuth,
  validateRequest("params", documentoParamsSchema),
  async (req, res, next) => {
    try {
      const context = await getOperationalContext(req.user!.id, operationalContextRepository);
      const result = await refreshDocumentoStatus(context, String(req.params.documentoId), facturasRepository, fiscalGateway);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

facturasRouter.post(
  "/facturas/:documentoId/retry-emission",
  requireAuth,
  validateRequest("params", documentoParamsSchema),
  async (req, res, next) => {
    try {
      const context = await getOperationalContext(req.user!.id, operationalContextRepository);
      const result = await retryDocumentoEmission(context, String(req.params.documentoId), facturasRepository);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

facturasRouter.get(
  "/facturas/:documentoId/files/kude.pdf",
  requireAuth,
  validateRequest("params", documentoParamsSchema),
  async (req, res, next) => {
    try {
      const context = await getOperationalContext(req.user!.id, operationalContextRepository);
      const documento = await getDocumentoById(context, String(req.params.documentoId), facturasRepository);
      if (!documento.document_uuid) {
        throw new HttpError(404, "NOT_FOUND", "PDF no disponible para este documento.");
      }
      const artifact = await fiscalGateway.getKudePdf(documento.document_uuid);
      res.type(artifact.content_type);
      res.setHeader("content-disposition", `inline; filename="${artifact.filename}"`);
      res.send(artifact.body);
    } catch (error) {
      next(error);
    }
  }
);

facturasRouter.get(
  "/facturas/:documentoId/files/xml",
  requireAuth,
  validateRequest("params", documentoParamsSchema),
  async (req, res, next) => {
    try {
      const context = await getOperationalContext(req.user!.id, operationalContextRepository);
      const documento = await getDocumentoById(context, String(req.params.documentoId), facturasRepository);
      if (!documento.document_uuid) {
        throw new HttpError(404, "NOT_FOUND", "XML no disponible para este documento.");
      }
      const artifact = await fiscalGateway.getXml(documento.document_uuid);
      res.type(artifact.content_type);
      res.setHeader("content-disposition", `attachment; filename="${artifact.filename}"`);
      res.send(artifact.body);
    } catch (error) {
      next(error);
    }
  }
);

facturasRouter.post(
  "/facturas/:documentoId/cancelar",
  requireAuth,
  validateRequest("params", documentoParamsSchema),
  validateRequest("body", cancelacionSchema),
  async (req, res, next) => {
    try {
      const context = await getOperationalContext(req.user!.id, operationalContextRepository);
      const result = await cancelDocumento(context, String(req.params.documentoId), req.body, facturasRepository, fiscalGateway);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

facturasRouter.post(
  "/facturas/:documentoId/nota-credito",
  requireAuth,
  validateRequest("params", documentoParamsSchema),
  validateRequest("body", notaCreditoSchema),
  async (req, res, next) => {
    try {
      const context = await getOperationalContext(req.user!.id, operationalContextRepository);
      const idempotencyKey = parseIdempotencyKey(req.get("idempotency-key"));
      const result = await emitNotaCreditoTotal(context, String(req.params.documentoId), req.body, facturasRepository, fiscalGateway, {
        idempotencyKey
      });
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  }
);

facturasRouter.post("/facturas/preview", requireAuth, validateRequest("body", facturaPreviewSchema), async (req, res, next) => {
  try {
    const context = await getOperationalContext(req.user!.id, operationalContextRepository);
    const result = previewFactura(context, req.body);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

facturasRouter.post("/facturas", requireAuth, validateRequest("body", facturaPreviewSchema), async (req, res, next) => {
  try {
    const context = await getOperationalContext(req.user!.id, operationalContextRepository);
    const idempotencyKey = parseIdempotencyKey(req.get("idempotency-key"));
    const result = await enqueueFacturaEmission(context, req.body, facturasRepository, {
      idempotencyKey,
      clienteRepository
    });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

function parseIdempotencyKey(value: string | undefined): string {
  const idempotencyKey = value?.trim();

  if (!idempotencyKey) {
    throw new HttpError(400, "VALIDATION_ERROR", "Header Idempotency-Key requerido.");
  }

  if (idempotencyKey.length < 8 || idempotencyKey.length > 120) {
    throw new HttpError(400, "VALIDATION_ERROR", "Header Idempotency-Key debe tener entre 8 y 120 caracteres.");
  }

  if (!/^[A-Za-z0-9._:-]+$/.test(idempotencyKey)) {
    throw new HttpError(
      400,
      "VALIDATION_ERROR",
      "Header Idempotency-Key solo permite letras, numeros, punto, guion, guion bajo y dos puntos."
    );
  }

  return idempotencyKey;
}
