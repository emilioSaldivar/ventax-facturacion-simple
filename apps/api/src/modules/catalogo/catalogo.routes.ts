import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../auth/auth.middleware";
import { operationalContextRepository } from "../context/context.repository";
import { getOperationalContext } from "../context/context.service";
import { validateRequest } from "../../shared/validation/validate-request";
import { catalogoRepository } from "./catalogo.repository";
import { createCatalogoItem, deleteCatalogoItem, listCatalogoItems, searchCatalogoItems, updateCatalogoItem } from "./catalogo.service";
import { ivaTipos } from "./catalogo.types";

const catalogoItemSchema = z.object({
  codigo: z.string().trim().min(1).max(60).nullable().optional(),
  descripcion: z.string().trim().min(1).max(240),
  precio_unitario: z.coerce.number().int().min(0),
  iva_tipo: z.enum(ivaTipos).default("IVA_10"),
  activo: z.boolean().default(true)
});

const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(120),
  limit: z.coerce.number().int().min(1).max(30).default(10)
});

const listQuerySchema = z.object({
  q: z.string().trim().min(1).max(120).optional(),
  activo: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  offset: z.coerce.number().int().min(0).default(0)
});

const itemParamsSchema = z.object({
  itemId: z.string().uuid()
});

export const catalogoRouter = Router();

catalogoRouter.get(
  "/catalogo/items/search",
  requireAuth,
  validateRequest("query", searchQuerySchema),
  async (req, res, next) => {
    try {
      const context = await getOperationalContext(req.user!.id, operationalContextRepository);
      const result = await searchCatalogoItems(
        context,
        req.query as unknown as z.infer<typeof searchQuerySchema>,
        catalogoRepository
      );
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

catalogoRouter.get("/catalogo/items", requireAuth, validateRequest("query", listQuerySchema), async (req, res, next) => {
  try {
    const context = await getOperationalContext(req.user!.id, operationalContextRepository);
    const result = await listCatalogoItems(context, req.query as unknown as z.infer<typeof listQuerySchema>, catalogoRepository);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

catalogoRouter.post("/catalogo/items", requireAuth, validateRequest("body", catalogoItemSchema), async (req, res, next) => {
  try {
    const context = await getOperationalContext(req.user!.id, operationalContextRepository);
    const result = await createCatalogoItem(context, req.body, catalogoRepository);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

catalogoRouter.patch(
  "/catalogo/items/:itemId",
  requireAuth,
  validateRequest("params", itemParamsSchema),
  validateRequest("body", catalogoItemSchema),
  async (req, res, next) => {
    try {
      const context = await getOperationalContext(req.user!.id, operationalContextRepository);
      const params = req.params as unknown as z.infer<typeof itemParamsSchema>;
      const result = await updateCatalogoItem(context, params.itemId, req.body, catalogoRepository);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

catalogoRouter.delete(
  "/catalogo/items/:itemId",
  requireAuth,
  validateRequest("params", itemParamsSchema),
  async (req, res, next) => {
    try {
      const context = await getOperationalContext(req.user!.id, operationalContextRepository);
      const params = req.params as unknown as z.infer<typeof itemParamsSchema>;
      await deleteCatalogoItem(context, params.itemId, catalogoRepository);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);
