import { Router } from "express";
import { z } from "zod";
import { validateRequest } from "../../shared/validation/validate-request.js";
import { notasRepository } from "../notas/notas.repository.js";
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

      res.json({
        valido: true,
        tipo: result.nota!.tipo,
        numero: result.nota!.numero,
        fecha_emision: result.nota!.fecha_emision,
        cliente_nombre: result.nota!.cliente_nombre,
        cliente_ruc: result.nota!.cliente_ruc,
        emitido_at: result.nota!.emitido_at,
      });
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
