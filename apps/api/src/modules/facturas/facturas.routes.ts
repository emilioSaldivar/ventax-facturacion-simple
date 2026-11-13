import { Router } from "express";
import { cantidadEscalada, monedasFactura, tieneDecimalesValidos } from "@facturacion-simple/shared";
import { z } from "zod";
import { requireAuth } from "../auth/auth.middleware";
import { clienteRepository } from "../clientes/clientes.repository";
import { clienteNaturalezaTipos } from "../clientes/clientes.types";
import { operationalContextRepository } from "../context/context.repository";
import { getOperationalContext } from "../context/context.service";
import { validateRequest } from "../../shared/validation/validate-request";
import { ISSUE_OPERADOR, agregarErroresReceptor, revisarReceptor } from "../../shared/validation/receptor";
import { createFiscalGateway, fiscalGateway } from "../fiscal-gateway/fiscal-gateway.client";
import { buildFiscalGatewayConfig } from "../fiscal-gateway/fiscal-gateway.config";
import type { FiscalGateway } from "../fiscal-gateway/fiscal-gateway.types";
import { env } from "../../config/env";
import { facturasRepository } from "./facturas.repository";
import {
  cancelDocumento,
  cancelDocumentoSend,
  createDocumentoDerived,
  enqueueFacturaEmission,
  inutilizarNumeroFactura,
  emitNotaCredito,
  getNotaCreditoSaldo,
  reintentarNotaCreditoPorId,
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
import { condicionesVenta, facturaDocumentoTipos, type DocumentoListFilters, type FacturaPreviewInput } from "./facturas.types";
import { HttpError } from "../../shared/errors/http-error";
import { cargarManual, eliminarExterna, previsualizarDeSifen, traerDeSifen, type FacturaExternaManualInput } from "./facturas-externas.service";

const ivaTipos = ["IVA_10", "IVA_5", "EXENTA"] as const;
const documentoTipos = ["FACTURA", "NOTA_CREDITO", "NOTA_REMISION"] as const;
const documentoTiposOperativos = ["CONTADO", "CREDITO", "NOTA_CREDITO"] as const;
const documentoEstados = ["EMITIENDO", "EMITIDA", "PENDIENTE_SIFEN", "RECHAZADA", "ERROR_OPERATIVO", "ERROR_TEMPORAL", "ANULADA", "CANCELADO_LOCAL"] as const;

/** Base de la factura, sin las reglas que cruzan campos (se aplican con `refinarFactura`). */
const facturaBaseSchema = z.object({
  condicion_venta: z.enum(condicionesVenta),
  tipo_transaccion: z.coerce.number().int().refine((value) => [1, 2, 3].includes(value), "tipo_transaccion invalido. Use 1, 2 o 3.").default(2),
  credito_plazo_dias: z.coerce.number().int().min(1).max(365).nullable().optional(),
  cliente: z.object({
    cliente_id: z.string().uuid().nullable().optional(),
    documento_tipo: z.enum(facturaDocumentoTipos),
    documento: z.string().trim().min(1).max(40),
    razon_social: z.string().trim().min(1).max(240),
    direccion: z.string().trim().max(240).nullable().optional(),
    telefono: z.string().trim().max(60).nullable().optional(),
    // SPEC_VALIDACIONES_RECEPTOR_v0.1 RV-03: el formato del correo lo valida `revisarReceptor` (refinarFactura).
    email: z.string().trim().max(240).nullable().optional(),
    naturaleza: z.enum(clienteNaturalezaTipos).nullable().optional()
  }).transform((cliente) => revisarReceptor(cliente).normalizado),
  items: z
    .array(
      z.object({
        catalogo_item_id: z.string().uuid().nullable().optional(),
        codigo: z.string().trim().max(60).nullable().optional(),
        descripcion: z.string().trim().min(1).max(240),
        // SPEC_MONEDA_EXTRANJERA_v0.1, RN-06: mayor que cero con hasta 4 decimales (MT150 E711; se valida abajo).
        cantidad: z.coerce.number().positive(),
        // SPEC_MONEDA_EXTRANJERA_v0.1, RN-02: decimales segun la moneda (se valida abajo).
        precio_unitario: z.coerce.number().min(0),
        iva_tipo: z.enum(ivaTipos).default("IVA_10"),
        // SPEC_DESCUENTOS_FACTURA_v0.1 RN-01: descuento por unidad; los decimales por moneda se validan abajo.
        descuento: z.coerce.number().min(0).optional()
      })
    )
    .min(1),
  moneda: z.enum(monedasFactura).default("PYG"),
  tipo_cambio: z.coerce.number().positive().nullable().optional(),
  // SPEC_DESCUENTOS_FACTURA_v0.1 RN-01: descuento sobre el total.
  descuento_global: z.coerce.number().min(0).optional()
});

type FacturaBase = z.infer<typeof facturaBaseSchema>;

/** SPEC_MONEDA_EXTRANJERA_v0.1, RN-02 y RN-06: tipo de cambio, decimales del precio por moneda y de la cantidad. */
function refinarFactura(input: FacturaBase, ctx: z.RefinementCtx): void {
  // SPEC_VALIDACIONES_RECEPTOR_v0.1 RV-01 a RV-06 y RV-08: el receptor se valida antes de encolar nada.
  agregarErroresReceptor(ctx, revisarReceptor(input.cliente).errores, ["cliente"]);
  if (input.descuento_global !== undefined && input.descuento_global > 0 && !tieneDecimalesValidos(input.descuento_global, input.moneda)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["descuento_global"],
      message: input.moneda === "PYG" ? "En guaraníes, el descuento va sin decimales" : "El descuento admite hasta 2 decimales",
      params: ISSUE_OPERADOR
    });
  }
  if (input.moneda !== "PYG") {
    if (!input.tipo_cambio) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["tipo_cambio"], message: "Con moneda extranjera el tipo de cambio es obligatorio." });
    } else if (Math.abs(input.tipo_cambio * 10000 - Math.round(input.tipo_cambio * 10000)) > 1e-6) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["tipo_cambio"], message: "El tipo de cambio admite hasta 4 decimales." });
    }
  }
  input.items.forEach((item, indice) => {
    if (cantidadEscalada(item.cantidad) === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["items", indice, "cantidad"], message: "La cantidad admite hasta 4 decimales." });
    }
    // SPEC_DESCUENTOS_FACTURA_v0.1 RN-02 y RN-03.
    if (item.descuento !== undefined && item.descuento > 0) {
      if (!tieneDecimalesValidos(item.descuento, input.moneda)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["items", indice, "descuento"],
          message: input.moneda === "PYG" ? "En guaraníes, el descuento va sin decimales" : "El descuento admite hasta 2 decimales",
          params: ISSUE_OPERADOR
        });
      } else if (item.descuento >= item.precio_unitario) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["items", indice, "descuento"], message: "El descuento tiene que ser menor que el precio", params: ISSUE_OPERADOR });
      }
    }
    if (!tieneDecimalesValidos(item.precio_unitario, input.moneda)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["items", indice, "precio_unitario"],
        message: input.moneda === "PYG" ? "En guaranies el precio es un entero." : "El precio admite hasta 2 decimales."
      });
    }
  });
}

export const facturaPreviewSchema = facturaBaseSchema.superRefine(refinarFactura);

/** SPEC_NOTA_CREDITO_FACTURA_EXTERNA_v0.1 (PLAN 6). El formato fino del CDC y de la impresa lo valida el servicio (RN-01, RN-05). */
const cdcExternaSchema = z.object({ cdc: z.string().trim().min(1).max(80) });
const fechaSchema = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha AAAA-MM-DD.");
const facturaExternaManualSchema = facturaBaseSchema
  .extend({
    condicion_venta: z.enum(condicionesVenta).default("CONTADO"),
    fecha_emision: fechaSchema.nullable().optional(),
    referencia: z.discriminatedUnion("tipo", [
      z.object({ tipo: z.literal("ELECTRONICO"), cdc: z.string().trim().min(1).max(80) }),
      z.object({
        tipo: z.literal("IMPRESO"),
        timbrado: z.string().trim().min(1).max(8),
        establecimiento: z.string().trim().min(1).max(3),
        punto: z.string().trim().min(1).max(3),
        numero: z.string().trim().min(1).max(7),
        fecha: fechaSchema
      })
    ])
  })
  .superRefine(refinarFactura);

const documentoListQuerySchema = z
  .object({
    tipo: z.enum(documentoTipos).optional(),
    tipo_operativo: z.enum(documentoTiposOperativos).optional(),
    estado: z.enum(documentoEstados).optional(),
    desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    q: z.string().trim().min(1).max(120).optional(),
    carga_id: z.string().uuid().optional(),
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
  motivo: z.string().trim().min(1).max(150),
  // Reintento sobre el mismo CDC tras un rechazo transitorio de SIFEN (SPEC RN-03).
  reintentar: z.boolean().optional()
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

/** SPEC_CORRECCION_INUTILIZACION_RECHAZADAS_v0.1, RN-A1: solo la emision lleva la factura que corrige. */
const facturaEmisionSchema = facturaBaseSchema
  .extend({
    corrige_documento_id: z.string().uuid().nullable().optional()
  })
  .superRefine(refinarFactura);

/** RN-B2 y RN-B3: del operador solo se toma el motivo; cualquier otro campo se descarta. */
const inutilizarSchema = z.object({
  motivo: z.string().trim().min(5).max(150)
});

const acreditacionSchema = z.object({ tipo: z.enum(["MONTO", "PORCENTAJE"]), valor: z.number().positive() });

export const notaCreditoSchema = z
  .object({
    motivo: z.string().trim().min(1).max(300),
    // SPEC_NOTA_CREDITO_PARCIAL_v0.1: con lineas, nota parcial; sin ellas, la total de siempre.
    // SPEC_NOTA_CREDITO_UNIFICADA_v0.1 RN-01: cada linea puede llevar cantidad, acreditacion o las dos.
    lineas: z
      .array(z.object({ line_no: z.number().int().positive(), cantidad: z.number().positive().optional(), acreditacion: acreditacionSchema.optional() }))
      .max(200)
      .optional(),
    // SPEC_NOTA_CREDITO_POR_MONTO_v0.1: nota por monto (la regla de 50 Gs o 2 decimales la aplica el servicio, RN-01).
    monto: z.number().positive().optional(),
    motivo_codigo: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(8)]).optional(),
    // SPEC_NOTA_CREDITO_UNIFICADA_v0.1: pedido de la pantalla unificada y acreditacion sobre el total.
    combinada: z.boolean().optional(),
    acreditacion_total: acreditacionSchema.optional()
  })
  .superRefine((input, ctx) => {
    const combinada = input.combinada === true || input.acreditacion_total !== undefined || (input.lineas ?? []).some((l) => l.acreditacion !== undefined);
    // FS-143: `lineas: []` solo vale en la combinada (p. ej. solo ajuste sobre el total, RN-01). En el cuerpo viejo
    // `{motivo, lineas: []}` se sigue rechazando: el servicio lo tomaria como la nota total.
    if (input.lineas !== undefined && input.lineas.length === 0 && !combinada) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["lineas"], message: "Indica al menos una linea." });
    }
    if (combinada && (input.lineas ?? []).length === 0 && input.acreditacion_total === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["lineas"], message: "Indicá qué se devuelve o se ajusta." });
    }
    // RN-02 de por monto: lineas y monto son excluyentes; el motivo SIFEN solo acompaña al monto o a la combinada.
    if (input.monto !== undefined && (input.lineas !== undefined || combinada)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["monto"], message: "La nota va por lineas o por monto, no las dos cosas." });
    }
    if (input.motivo_codigo !== undefined && input.monto === undefined && !combinada) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["motivo_codigo"], message: "motivo_codigo solo se usa con monto o en la nota combinada." });
    }
    if (input.monto !== undefined && input.motivo_codigo !== undefined && ![3, 4, 8].includes(input.motivo_codigo)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["motivo_codigo"], message: "Con monto, el motivo es 3, 4 u 8." });
    }
    const vistas = new Set<number>();
    input.lineas?.forEach((linea, indice) => {
      if (linea.cantidad === undefined && linea.acreditacion === undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["lineas", indice], message: "La linea necesita cantidad o acreditacion." });
      }
      if (linea.cantidad !== undefined && cantidadEscalada(linea.cantidad) === null) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["lineas", indice, "cantidad"], message: "La cantidad admite hasta 4 decimales." });
      }
      if (vistas.has(linea.line_no)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["lineas", indice, "line_no"], message: "Linea repetida." });
      }
      vistas.add(linea.line_no);
    });
  });

/**
 * `/conciliacion/idempotency` exige la clave de consumidor del facturador, a diferencia de
 * `/documentos/*`, que exige la compartida (SPEC_REINTENTO_EMISION_CONFIRMADO_v0.1 RN-09).
 * Mismo mecanismo que recibos.routes.ts.
 */
async function resolveConsumerGateway(facturadorId: string): Promise<FiscalGateway> {
  const apiKey = await facturasRepository.getFacturadorApiKey(facturadorId);
  return apiKey ? createFiscalGateway({ ...buildFiscalGatewayConfig(env), apiKey }) : fiscalGateway;
}

export const facturasRouter = Router();

facturasRouter.get("/facturas", requireAuth, validateRequest("query", documentoListQuerySchema), async (req, res, next) => {
  try {
    const context = await getOperationalContext(req.user!, operationalContextRepository);
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
      const context = await getOperationalContext(req.user!, operationalContextRepository);
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
      const context = await getOperationalContext(req.user!, operationalContextRepository);
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
      const context = await getOperationalContext(req.user!, operationalContextRepository);
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
      const context = await getOperationalContext(req.user!, operationalContextRepository);
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
      const context = await getOperationalContext(req.user!, operationalContextRepository);
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
      const context = await getOperationalContext(req.user!, operationalContextRepository);
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

// SPEC_NOTA_CREDITO_FACTURA_EXTERNA_v0.1 (PLAN 6): traer una factura que no emitio FS para acreditarla.
facturasRouter.post("/facturas/externas/sifen/previsualizar", requireAuth, validateRequest("body", cdcExternaSchema), async (req, res, next) => {
  try {
    const context = await getOperationalContext(req.user!, operationalContextRepository);
    const gateway = await resolveConsumerGateway(context.facturador.id);
    res.json(await previsualizarDeSifen(context, req.body.cdc, facturasRepository, gateway));
  } catch (error) {
    next(error);
  }
});

facturasRouter.post("/facturas/externas/sifen", requireAuth, validateRequest("body", cdcExternaSchema), async (req, res, next) => {
  try {
    const context = await getOperationalContext(req.user!, operationalContextRepository);
    const gateway = await resolveConsumerGateway(context.facturador.id);
    res.status(201).json(await traerDeSifen(context, req.body.cdc, facturasRepository, gateway));
  } catch (error) {
    next(error);
  }
});

facturasRouter.post("/facturas/externas/manual", requireAuth, validateRequest("body", facturaExternaManualSchema), async (req, res, next) => {
  try {
    const context = await getOperationalContext(req.user!, operationalContextRepository);
    res.status(201).json(await cargarManual(context, req.body as FacturaExternaManualInput, facturasRepository));
  } catch (error) {
    next(error);
  }
});

facturasRouter.delete("/facturas/externas/:documentoId", requireAuth, validateRequest("params", documentoParamsSchema), async (req, res, next) => {
  try {
    const context = await getOperationalContext(req.user!, operationalContextRepository);
    await eliminarExterna(context, String(req.params.documentoId), facturasRepository);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

facturasRouter.get("/facturas/:documentoId", requireAuth, validateRequest("params", documentoParamsSchema), async (req, res, next) => {
  try {
    const context = await getOperationalContext(req.user!, operationalContextRepository);
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
      const context = await getOperationalContext(req.user!, operationalContextRepository);
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
      const context = await getOperationalContext(req.user!, operationalContextRepository);
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
      const context = await getOperationalContext(req.user!, operationalContextRepository);
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
      const context = await getOperationalContext(req.user!, operationalContextRepository);
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
      const context = await getOperationalContext(req.user!, operationalContextRepository);
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
      const context = await getOperationalContext(req.user!, operationalContextRepository);
      const result = await retryDocumentoEmission(context, String(req.params.documentoId), facturasRepository, {
        consumerGateway: await resolveConsumerGateway(context.facturador.id),
        sharedGateway: fiscalGateway,
        feEnv: env.FE_API_ENV
      });
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
      const context = await getOperationalContext(req.user!, operationalContextRepository);
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
      const context = await getOperationalContext(req.user!, operationalContextRepository);
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
      const context = await getOperationalContext(req.user!, operationalContextRepository);
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
      const context = await getOperationalContext(req.user!, operationalContextRepository);
      // SPEC_NOTA_CREDITO_TRABADA_v0.1, RN-01: la clave la deriva el servidor; el encabezado se ignora.
      const { documento, reintento } = await emitNotaCredito(
        context,
        String(req.params.documentoId),
        req.body,
        facturasRepository,
        fiscalGateway
      );
      res.status(reintento ? 200 : 201).json(documento);
    } catch (error) {
      next(error);
    }
  }
);

// SPEC_NOTA_CREDITO_PARCIAL_v0.1: saldo acreditable por linea y que admite la factura (total o parcial).
facturasRouter.get(
  "/facturas/:documentoId/nota-credito/saldo",
  requireAuth,
  validateRequest("params", documentoParamsSchema),
  async (req, res, next) => {
    try {
      const context = await getOperationalContext(req.user!, operationalContextRepository);
      res.json(await getNotaCreditoSaldo(context, String(req.params.documentoId), facturasRepository, fiscalGateway));
    } catch (error) {
      next(error);
    }
  }
);

facturasRouter.post(
  "/facturas/:documentoId/inutilizar",
  requireAuth,
  validateRequest("params", documentoParamsSchema),
  validateRequest("body", inutilizarSchema),
  async (req, res, next) => {
    try {
      const context = await getOperationalContext(req.user!, operationalContextRepository);
      const { motivo } = req.body as z.infer<typeof inutilizarSchema>;
      res.json(await inutilizarNumeroFactura(context, String(req.params.documentoId), { motivo }, facturasRepository, fiscalGateway));
    } catch (error) {
      next(error);
    }
  }
);

facturasRouter.post(
  "/facturas/:documentoId/nota-credito/reintentar",
  requireAuth,
  validateRequest("params", documentoParamsSchema),
  async (req, res, next) => {
    try {
      const context = await getOperationalContext(req.user!, operationalContextRepository);
      const result = await reintentarNotaCreditoPorId(context, String(req.params.documentoId), facturasRepository, fiscalGateway);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

facturasRouter.post("/facturas/preview", requireAuth, validateRequest("body", facturaPreviewSchema), async (req, res, next) => {
  try {
    const context = await getOperationalContext(req.user!, operationalContextRepository);
    const result = previewFactura(context, req.body);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

facturasRouter.post("/facturas", requireAuth, validateRequest("body", facturaEmisionSchema), async (req, res, next) => {
  try {
    const context = await getOperationalContext(req.user!, operationalContextRepository);
    const idempotencyKey = parseIdempotencyKey(req.get("idempotency-key"));
    const { corrige_documento_id: corrigeDocumentoId, ...factura } = req.body as FacturaPreviewInput & { corrige_documento_id?: string | null };
    const result = await enqueueFacturaEmission(context, factura, facturasRepository, {
      idempotencyKey,
      clienteRepository,
      contextRepository: operationalContextRepository,
      corrigeDocumentoId: corrigeDocumentoId ?? null
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
