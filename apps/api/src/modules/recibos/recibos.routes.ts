import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../auth/auth.middleware.js";
import { operationalContextRepository } from "../context/context.repository.js";
import { getOperationalContext } from "../context/context.service.js";
import { fiscalGateway, createFiscalGateway } from "../fiscal-gateway/fiscal-gateway.client.js";
import { buildFiscalGatewayConfig } from "../fiscal-gateway/fiscal-gateway.config.js";
import type { FiscalGateway } from "../fiscal-gateway/fiscal-gateway.types.js";
import { env } from "../../config/env.js";
import { facturasRepository } from "../facturas/facturas.repository.js";
import { validateRequest } from "../../shared/validation/validate-request.js";
import { HttpError } from "../../shared/errors/http-error.js";
import { recibosRepository } from "./recibos.repository.js";
import {
  anularRecibo,
  crearRecibo,
  editarRecibo,
  eliminarRecibo,
  emitirRecibo,
  getRecibo,
  getReciboPdf,
  getReciboXml,
  listRecibos,
} from "./recibos.service.js";

/**
 * Recibos delega cada operacion de escritura al backend fiscal (a diferencia de
 * facturas, que solo lo hace al emitir), por lo que aca resolvemos la clave
 * por-facturador (facturadores.fe_consumer_api_key) en cada request en vez de
 * solo en el worker de outbox. Mismo mecanismo que server.ts usa para facturas
 * (gatewayWithKey), aplicado de forma sincrona.
 */
async function resolveGateway(facturadorId: string): Promise<FiscalGateway> {
  const apiKey = await recibosRepository.getFacturadorApiKey(facturadorId);
  return apiKey ? createFiscalGateway({ ...buildFiscalGatewayConfig(env), apiKey }) : fiscalGateway;
}

export const recibosRouter = Router();

const reciboIdSchema = z.object({ reciboId: z.string().uuid() });
const facturaIdSchema = z.object({ documentoId: z.string().uuid() });

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

const pagadorDocumentoTipoSchema = z.enum(["RUC", "CI", "PASAPORTE", "CEDULA_EXTRANJERA", "NO_ESPECIFICADO"]);
const formaPagoSchema = z.enum(["EFECTIVO", "TRANSFERENCIA", "CHEQUE", "TARJETA_CREDITO", "TARJETA_DEBITO", "OTRO"]);

const createBodySchema = z.object({
  fecha_cobro: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  pagador_nombre: z.string().min(1),
  pagador_documento_tipo: pagadorDocumentoTipoSchema.nullish(),
  pagador_documento: z.string().nullish(),
  concepto: z.string().min(1),
  importe: z.number().positive(),
  moneda: z.string().min(1).optional(),
  forma_pago: formaPagoSchema.optional(),
  referencia_bancaria: z.string().nullish(),
  referencia_documento_uuid: z.string().uuid().nullish(),
  referencia_documento_numero_display: z.string().nullish(),
});

const updateBodySchema = createBodySchema
  .omit({ fecha_cobro: true, referencia_documento_uuid: true, referencia_documento_numero_display: true })
  .partial()
  .extend({
    fecha_cobro: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  });

const anularBodySchema = z.object({
  motivo: z.string().min(1).max(500),
});

function parseIdempotencyKey(value: string | undefined): string | undefined {
  const idempotencyKey = value?.trim();
  if (!idempotencyKey) return undefined;

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

recibosRouter.post(
  "/recibos",
  requireAuth,
  validateRequest("body", createBodySchema),
  async (req, res, next) => {
    try {
      const context = await getOperationalContext(req.user!.id, operationalContextRepository);
      const idempotencyKey = parseIdempotencyKey(req.get("idempotency-key"));
      const recibo = await crearRecibo(context, req.body, recibosRepository, await resolveGateway(context.facturador.id), { idempotencyKey });
      res.status(201).json(recibo);
    } catch (error) { next(error); }
  }
);

recibosRouter.get(
  "/recibos",
  requireAuth,
  validateRequest("query", listQuerySchema),
  async (req, res, next) => {
    try {
      const context = await getOperationalContext(req.user!.id, operationalContextRepository);
      const { limit, offset } = req.query as unknown as z.infer<typeof listQuerySchema>;
      const result = await listRecibos(context.facturador.id, { limit, offset }, recibosRepository);
      res.json(result);
    } catch (error) { next(error); }
  }
);

recibosRouter.get(
  "/recibos/:reciboId",
  requireAuth,
  validateRequest("params", reciboIdSchema),
  async (req, res, next) => {
    try {
      const context = await getOperationalContext(req.user!.id, operationalContextRepository);
      const { reciboId } = req.params as z.infer<typeof reciboIdSchema>;
      const recibo = await getRecibo(reciboId, context.facturador.id, recibosRepository);
      res.json(recibo);
    } catch (error) { next(error); }
  }
);

recibosRouter.patch(
  "/recibos/:reciboId",
  requireAuth,
  validateRequest("params", reciboIdSchema),
  validateRequest("body", updateBodySchema),
  async (req, res, next) => {
    try {
      const context = await getOperationalContext(req.user!.id, operationalContextRepository);
      const { reciboId } = req.params as z.infer<typeof reciboIdSchema>;
      const recibo = await editarRecibo(reciboId, context, req.body, recibosRepository, await resolveGateway(context.facturador.id));
      res.json(recibo);
    } catch (error) { next(error); }
  }
);

recibosRouter.post(
  "/recibos/:reciboId/emitir",
  requireAuth,
  validateRequest("params", reciboIdSchema),
  async (req, res, next) => {
    try {
      const context = await getOperationalContext(req.user!.id, operationalContextRepository);
      const { reciboId } = req.params as z.infer<typeof reciboIdSchema>;
      const recibo = await emitirRecibo(reciboId, context, recibosRepository, await resolveGateway(context.facturador.id));
      res.json(recibo);
    } catch (error) { next(error); }
  }
);

recibosRouter.post(
  "/recibos/:reciboId/anular",
  requireAuth,
  validateRequest("params", reciboIdSchema),
  validateRequest("body", anularBodySchema),
  async (req, res, next) => {
    try {
      const context = await getOperationalContext(req.user!.id, operationalContextRepository);
      const { reciboId } = req.params as z.infer<typeof reciboIdSchema>;
      const recibo = await anularRecibo(reciboId, context, req.body, recibosRepository, await resolveGateway(context.facturador.id));
      res.json(recibo);
    } catch (error) { next(error); }
  }
);

recibosRouter.get(
  "/recibos/:reciboId/pdf",
  requireAuth,
  validateRequest("params", reciboIdSchema),
  async (req, res, next) => {
    try {
      const context = await getOperationalContext(req.user!.id, operationalContextRepository);
      const { reciboId } = req.params as z.infer<typeof reciboIdSchema>;
      const artifact = await getReciboPdf(reciboId, context, recibosRepository, await resolveGateway(context.facturador.id));
      res.setHeader("Content-Type", artifact.content_type);
      res.setHeader("Content-Disposition", `attachment; filename="${artifact.filename}"`);
      res.send(artifact.body);
    } catch (error) { next(error); }
  }
);

recibosRouter.get(
  "/recibos/:reciboId/xml",
  requireAuth,
  validateRequest("params", reciboIdSchema),
  async (req, res, next) => {
    try {
      const context = await getOperationalContext(req.user!.id, operationalContextRepository);
      const { reciboId } = req.params as z.infer<typeof reciboIdSchema>;
      const artifact = await getReciboXml(reciboId, context, recibosRepository, await resolveGateway(context.facturador.id));
      res.setHeader("Content-Type", artifact.content_type);
      res.setHeader("Content-Disposition", `attachment; filename="${artifact.filename}"`);
      res.send(artifact.body);
    } catch (error) { next(error); }
  }
);

recibosRouter.delete(
  "/recibos/:reciboId",
  requireAuth,
  validateRequest("params", reciboIdSchema),
  async (req, res, next) => {
    try {
      const context = await getOperationalContext(req.user!.id, operationalContextRepository);
      const { reciboId } = req.params as z.infer<typeof reciboIdSchema>;
      await eliminarRecibo(reciboId, context, recibosRepository, await resolveGateway(context.facturador.id));
      res.status(204).send();
    } catch (error) { next(error); }
  }
);

// RD-010: crear recibo pre-llenado desde factura crédito
recibosRouter.post(
  "/facturas/:documentoId/recibo",
  requireAuth,
  validateRequest("params", facturaIdSchema),
  async (req, res, next) => {
    try {
      const context = await getOperationalContext(req.user!.id, operationalContextRepository);
      const { documentoId } = req.params as z.infer<typeof facturaIdSchema>;

      const factura = await facturasRepository.findById({
        facturadorId: context.facturador.id,
        documentoId,
      });
      if (!factura) throw new HttpError(404, "NOT_FOUND", "Factura no encontrada.");
      if (factura.condicion_venta !== "CREDITO") {
        throw new HttpError(400, "VALIDATION_ERROR", "Solo se puede emitir recibo para facturas a crédito.");
      }

      const today = new Date().toISOString().slice(0, 10);
      const recibo = await crearRecibo(
        context,
        {
          fecha_cobro: today,
          pagador_nombre: factura.cliente.razon_social,
          pagador_documento_tipo: factura.cliente.documento_tipo ?? null,
          pagador_documento: factura.cliente.documento ?? null,
          concepto: `Cobro de factura N° ${factura.numero_fiscal ?? documentoId}`,
          importe: factura.totals.total,
          referencia_documento_uuid: factura.document_uuid ?? null,
          referencia_documento_numero_display: factura.numero_fiscal ?? null,
        },
        recibosRepository,
        await resolveGateway(context.facturador.id)
      );
      res.status(201).json(recibo);
    } catch (error) { next(error); }
  }
);
