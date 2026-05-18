import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../auth/auth.middleware";
import { documentoIdentidadTipos } from "../clientes/clientes.types";
import { operationalContextRepository } from "../context/context.repository";
import { getOperationalContext } from "../context/context.service";
import { validateRequest } from "../../shared/validation/validate-request";
import { fiscalGateway } from "../fiscal-gateway/fiscal-gateway.client";
import { facturasRepository } from "./facturas.repository";
import { emitFacturaAgainstFiscalGateway, previewFactura } from "./facturas.service";
import { condicionesVenta } from "./facturas.types";

const ivaTipos = ["IVA_10", "IVA_5", "EXENTA"] as const;

const facturaPreviewSchema = z.object({
  condicion_venta: z.enum(condicionesVenta),
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

export const facturasRouter = Router();

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
    const idempotencyKey = req.get("idempotency-key")?.trim() || undefined;
    const result = await emitFacturaAgainstFiscalGateway(context, req.body, facturasRepository, fiscalGateway, {
      idempotencyKey
    });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});
