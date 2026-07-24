import { Router } from "express";
import { z } from "zod";
import { env } from "../../config/env.js";
import { htmlToPdfBuffer } from "../../shared/pdf/pdf.service.js";
import { validateRequest } from "../../shared/validation/validate-request.js";
import { notasRepository } from "../notas/notas.repository.js";
import { buildNotaPdfHtml } from "../notas/notas.pdf.js";
import { verificarNota } from "../notas/notas.service.js";
import { recibosRepository } from "../recibos/recibos.repository.js";
import { fiscalGateway } from "../fiscal-gateway/fiscal-gateway.client.js";
import { verificarRecibo } from "../recibos/recibos.service.js";

const tokenParamsSchema = z.object({
  token: z.string().uuid(),
});

export const verificacionRouter = Router();

verificacionRouter.get(
  "/nota/:token",
  validateRequest("params", tokenParamsSchema),
  async (req, res, next) => {
    try {
      const { token } = req.params as z.infer<typeof tokenParamsSchema>;
      const result = await verificarNota(token, notasRepository);

      if (!result.valido) {
        res.status(404).json({ valido: false });
        return;
      }

      const n = result.nota!;
      res.json({
        valido: true,
        tipo: n.tipo,
        numero: n.numero,
        fecha_emision: n.fecha_emision,
        valido_hasta: n.valido_hasta,
        cliente_nombre: n.cliente_nombre,
        cliente_ruc: n.cliente_ruc,
        observaciones: n.observaciones,
        estado_comercial: n.estado_comercial,
        estado_visual: result.estado_visual,
        total: n.total,
        items: n.items.map(it => ({
          fila_tipo: it.fila_tipo,
          descripcion: it.descripcion,
          cantidad: it.cantidad,
          precio_total: it.precio_total,
        })),
        emitido_at: n.emitido_at,
      });
    } catch (error) {
      next(error);
    }
  }
);

// PDF público — no requiere autenticación
verificacionRouter.get(
  "/nota/:token/pdf",
  validateRequest("params", tokenParamsSchema),
  async (req, res, next) => {
    try {
      const { token } = req.params as z.infer<typeof tokenParamsSchema>;
      const nota = await notasRepository.findByVerificationToken(token);

      if (!nota || nota.estado !== "EMITIDO") {
        res.status(404).json({ error: "NOT_FOUND" });
        return;
      }

      const facturador = await notasRepository.getFacturadorParaPdf(nota.facturador_id);
      if (!facturador) {
        res.status(404).json({ error: "NOT_FOUND" });
        return;
      }

      const html = await buildNotaPdfHtml(nota, facturador, env.PUBLIC_APP_BASE_URL);
      const pdf = await htmlToPdfBuffer(html);

      const tipoLabel = nota.tipo === "PRESUPUESTO" ? "presupuesto" : "pedido";
      const nroStr = String(nota.numero ?? 0).padStart(7, "0");

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${tipoLabel}-${nroStr}.pdf"`);
      res.send(pdf);
    } catch (error) {
      next(error);
    }
  }
);

verificacionRouter.get(
  "/recibo/:token",
  validateRequest("params", tokenParamsSchema),
  async (req, res, next) => {
    try {
      const { token } = req.params as z.infer<typeof tokenParamsSchema>;
      const result = await verificarRecibo(token, recibosRepository, fiscalGateway);

      if (!result.valido) {
        res.status(404).json({ valido: false });
        return;
      }

      res.json({
        valido: true,
        numero: result.numero,
        fecha_cobro: result.fecha_cobro,
        pagador_nombre: result.pagador_nombre,
        concepto: result.concepto,
        importe: result.importe,
        forma_pago: result.forma_pago,
        referencia_documento_numero_display: result.referencia_documento_numero_display,
        estado: result.estado,
        emitido_at: result.emitido_at,
      });
    } catch (error) {
      next(error);
    }
  }
);

// PDF público — no requiere autenticación. Passthrough del PDF firmado por facturacion-electronica.
verificacionRouter.get(
  "/recibo/:token/pdf",
  validateRequest("params", tokenParamsSchema),
  async (req, res, next) => {
    try {
      const { token } = req.params as z.infer<typeof tokenParamsSchema>;
      const artifact = await fiscalGateway.verificarReciboPdf(token);

      res.setHeader("Content-Type", artifact.content_type);
      res.setHeader("Content-Disposition", `inline; filename="${artifact.filename}"`);
      res.send(artifact.body);
    } catch (error) {
      next(error);
    }
  }
);

// XML firmado público — no requiere autenticación. Passthrough del XML firmado por facturacion-electronica.
verificacionRouter.get(
  "/recibo/:token/xml",
  validateRequest("params", tokenParamsSchema),
  async (req, res, next) => {
    try {
      const { token } = req.params as z.infer<typeof tokenParamsSchema>;
      const artifact = await fiscalGateway.verificarReciboXml(token);

      res.setHeader("Content-Type", artifact.content_type);
      res.setHeader("Content-Disposition", `attachment; filename="${artifact.filename}"`);
      res.send(artifact.body);
    } catch (error) {
      next(error);
    }
  }
);
