import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../auth/auth.middleware.js";
import { operationalContextRepository } from "../context/context.repository.js";
import { getOperationalContext } from "../context/context.service.js";
import { facturasRepository } from "../facturas/facturas.repository.js";
import { validateRequest } from "../../shared/validation/validate-request.js";
import { env } from "../../config/env.js";
import { htmlToPdfBuffer } from "../../shared/pdf/pdf.service.js";
import { recibosRepository } from "./recibos.repository.js";
import { buildReciboPdfHtml } from "./recibos.pdf.js";
import {
  createRecibo,
  deleteRecibo,
  emitirRecibo,
  getRecibo,
  listRecibos,
  updateRecibo,
} from "./recibos.service.js";
import { HttpError } from "../../shared/errors/http-error.js";

export const recibosRouter = Router();

const reciboIdSchema = z.object({ reciboId: z.string().uuid() });
const facturaIdSchema = z.object({ documentoId: z.string().uuid() });

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

const createBodySchema = z.object({
  fecha_cobro: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  pagador_nombre: z.string().min(1),
  pagador_documento_tipo: z.string().nullish(),
  pagador_documento: z.string().nullish(),
  concepto: z.string().min(1),
  importe: z.number().positive(),
  forma_pago: z.enum(["EFECTIVO", "TRANSFERENCIA", "CHEQUE", "TARJETA_CREDITO", "TARJETA_DEBITO", "OTRO"]).optional(),
  referencia_bancaria: z.string().nullish(),
});

const updateBodySchema = createBodySchema.partial().omit({ fecha_cobro: true }).extend({
  fecha_cobro: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

recibosRouter.post(
  "/recibos",
  requireAuth,
  validateRequest("body", createBodySchema),
  async (req, res, next) => {
    try {
      const context = await getOperationalContext(req.user!.id, operationalContextRepository);
      const recibo = await createRecibo(context.facturador.id, req.body, recibosRepository);
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
      const recibo = await updateRecibo(reciboId, context.facturador.id, req.body, recibosRepository);
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
      const recibo = await emitirRecibo(reciboId, context.facturador.id, recibosRepository);
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
      const recibo = await getRecibo(reciboId, context.facturador.id, recibosRepository);
      const facturador = await recibosRepository.getFacturadorParaPdf(context.facturador.id);
      if (!facturador) throw new HttpError(500, "INTERNAL_ERROR", "Datos del facturador no encontrados.");
      const html = await buildReciboPdfHtml(recibo, facturador, env.PUBLIC_APP_BASE_URL);
      const pdf = await htmlToPdfBuffer(html);
      const nroStr = recibo.numero != null ? String(recibo.numero).padStart(7, "0") : "borrador";
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="recibo-${nroStr}.pdf"`);
      res.send(pdf);
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
      await deleteRecibo(reciboId, context.facturador.id, recibosRepository);
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
      const recibo = await createRecibo(
        context.facturador.id,
        {
          fecha_cobro: today,
          pagador_nombre: factura.cliente.razon_social,
          pagador_documento_tipo: factura.cliente.documento_tipo ?? null,
          pagador_documento: factura.cliente.documento ?? null,
          concepto: `Cobro de factura N° ${factura.numero_fiscal ?? documentoId}`,
          importe: factura.totals.total,
          factura_id: documentoId,
          factura_numero_display: factura.numero_fiscal ?? null,
        },
        recibosRepository
      );
      res.status(201).json(recibo);
    } catch (error) { next(error); }
  }
);
