import { Router } from "express";
import { z } from "zod";
import { env } from "../../config/env.js";
import { HttpError } from "../../shared/errors/http-error.js";
import { htmlToPdfBuffer } from "../../shared/pdf/pdf.service.js";
import { validateRequest } from "../../shared/validation/validate-request.js";
import { requireAuth } from "../auth/auth.middleware.js";
import { getOperationalContext } from "../context/context.service.js";
import { operationalContextRepository } from "../context/context.repository.js";
import { buildNotaPdfHtml } from "./notas.pdf.js";
import { notasRepository } from "./notas.repository.js";
import {
  actualizarEstadoComercial,
  createNota,
  deleteNota,
  duplicarNota,
  emitirNota,
  getNota,
  listNotas,
  updateNota,
} from "./notas.service.js";

const notaTipos = ["PRESUPUESTO", "PEDIDO"] as const;
const notaFilaTipos = ["CONTEXTO", "ITEM", "ITEM_SIN_PRECIO"] as const;

const notaEstadoComerciales = ["PENDIENTE_RESPUESTA", "ACEPTADO", "RECHAZADO"] as const;

const filaInputSchema = z.object({
  orden: z.number().int().min(0),
  fila_tipo: z.enum(notaFilaTipos),
  descripcion: z.string().trim().min(1).max(500),
  cantidad: z.number().positive().nullable().optional(),
  precio_unitario: z.number().min(0).nullable().optional(),
  catalog_item_id: z.string().uuid().nullable().optional(),
});

const createBodySchema = z.object({
  tipo: z.enum(notaTipos),
  cliente_nombre: z.string().trim().min(1).max(200),
  cliente_ruc: z.string().trim().max(20).nullable().optional(),
  valido_hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  observaciones: z.string().max(2000).nullable().optional(),
  items: z.array(filaInputSchema).default([]),
});

const updateBodySchema = z.object({
  cliente_nombre: z.string().trim().min(1).max(200).optional(),
  cliente_ruc: z.string().trim().max(20).nullable().optional(),
  valido_hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  observaciones: z.string().max(2000).nullable().optional(),
  items: z.array(filaInputSchema).optional(),
});

const estadoComercialBodySchema = z.object({
  estado_comercial: z.enum(notaEstadoComerciales),
});

const idParamsSchema = z.object({
  id: z.string().uuid(),
});

const listQuerySchema = z.object({
  tipo: z.enum(notaTipos).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  offset: z.coerce.number().int().min(0).default(0),
});

export const notasRouter = Router();

notasRouter.post(
  "/notas",
  requireAuth,
  validateRequest("body", createBodySchema),
  async (req, res, next) => {
    try {
      const context = await getOperationalContext(req.user!.id, operationalContextRepository);
      const result = await createNota(context.facturador.id, req.body, notasRepository);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  }
);

notasRouter.get(
  "/notas",
  requireAuth,
  validateRequest("query", listQuerySchema),
  async (req, res, next) => {
    try {
      const context = await getOperationalContext(req.user!.id, operationalContextRepository);
      const query = req.query as unknown as z.infer<typeof listQuerySchema>;
      const result = await listNotas(context.facturador.id, query, notasRepository);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

notasRouter.get(
  "/notas/:id",
  requireAuth,
  validateRequest("params", idParamsSchema),
  async (req, res, next) => {
    try {
      const context = await getOperationalContext(req.user!.id, operationalContextRepository);
      const { id } = req.params as z.infer<typeof idParamsSchema>;
      const result = await getNota(id, context.facturador.id, notasRepository);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

notasRouter.patch(
  "/notas/:id",
  requireAuth,
  validateRequest("params", idParamsSchema),
  validateRequest("body", updateBodySchema),
  async (req, res, next) => {
    try {
      const context = await getOperationalContext(req.user!.id, operationalContextRepository);
      const { id } = req.params as z.infer<typeof idParamsSchema>;
      const result = await updateNota(id, context.facturador.id, req.body, notasRepository);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

notasRouter.post(
  "/notas/:id/emitir",
  requireAuth,
  validateRequest("params", idParamsSchema),
  async (req, res, next) => {
    try {
      const context = await getOperationalContext(req.user!.id, operationalContextRepository);
      const { id } = req.params as z.infer<typeof idParamsSchema>;
      const result = await emitirNota(id, context.facturador.id, notasRepository);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

notasRouter.get(
  "/notas/:id/pdf",
  requireAuth,
  validateRequest("params", idParamsSchema),
  async (req, res, next) => {
    try {
      const context = await getOperationalContext(req.user!.id, operationalContextRepository);
      const { id } = req.params as z.infer<typeof idParamsSchema>;
      const nota = await getNota(id, context.facturador.id, notasRepository);

      if (nota.estado !== "EMITIDO") {
        throw new HttpError(409, "CONFLICT", "Solo se puede generar PDF de una nota emitida.");
      }

      const facturador = await notasRepository.getFacturadorParaPdf(context.facturador.id);
      if (!facturador) throw new HttpError(404, "NOT_FOUND", "Facturador no encontrado.");

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

notasRouter.patch(
  "/notas/:id/estado-comercial",
  requireAuth,
  validateRequest("params", idParamsSchema),
  validateRequest("body", estadoComercialBodySchema),
  async (req, res, next) => {
    try {
      const context = await getOperationalContext(req.user!.id, operationalContextRepository);
      const { id } = req.params as z.infer<typeof idParamsSchema>;
      const { estado_comercial } = req.body as z.infer<typeof estadoComercialBodySchema>;
      const result = await actualizarEstadoComercial(id, context.facturador.id, estado_comercial, notasRepository);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

notasRouter.post(
  "/notas/:id/duplicar",
  requireAuth,
  validateRequest("params", idParamsSchema),
  async (req, res, next) => {
    try {
      const context = await getOperationalContext(req.user!.id, operationalContextRepository);
      const { id } = req.params as z.infer<typeof idParamsSchema>;
      const result = await duplicarNota(id, context.facturador.id, notasRepository);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  }
);

notasRouter.delete(
  "/notas/:id",
  requireAuth,
  validateRequest("params", idParamsSchema),
  async (req, res, next) => {
    try {
      const context = await getOperationalContext(req.user!.id, operationalContextRepository);
      const { id } = req.params as z.infer<typeof idParamsSchema>;
      await deleteNota(id, context.facturador.id, notasRepository);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);
