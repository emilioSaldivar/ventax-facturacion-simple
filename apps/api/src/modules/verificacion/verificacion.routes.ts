import { Router } from "express";
import { z } from "zod";
import { env } from "../../config/env.js";
import { htmlToPdfBuffer } from "../../shared/pdf/pdf.service.js";
import { validateRequest } from "../../shared/validation/validate-request.js";
import { notasRepository } from "../notas/notas.repository.js";
import { buildNotaPdfHtml } from "../notas/notas.pdf.js";
import { verificarNota } from "../notas/notas.service.js";
import { recibosRepository } from "../recibos/recibos.repository.js";
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
      const result = await verificarRecibo(token, recibosRepository);

      if (!result.valido) {
        res.status(404).json({ valido: false });
        return;
      }

      const r = result.recibo!;
      res.json({
        valido: true,
        numero: r.numero,
        fecha_cobro: r.fecha_cobro,
        pagador_nombre: r.pagador_nombre,
        concepto: r.concepto,
        importe: r.importe,
        forma_pago: r.forma_pago,
        factura_numero_display: r.factura_numero_display,
        emitido_at: r.emitido_at,
      });
    } catch (error) {
      next(error);
    }
  }
);
