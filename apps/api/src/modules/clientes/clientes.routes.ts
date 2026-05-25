import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../auth/auth.middleware";
import { getOperationalContext } from "../context/context.service";
import { operationalContextRepository } from "../context/context.repository";
import { validateRequest } from "../../shared/validation/validate-request";
import { clienteRepository } from "./clientes.repository";
import { autocompleteClienteFromDnit, createCliente, listClientes, searchClientes, updateCliente } from "./clientes.service";
import { documentoIdentidadTipos } from "./clientes.types";

const clienteUpsertSchema = z.object({
  documento_tipo: z.enum(documentoIdentidadTipos),
  documento: z.string().trim().min(2).max(40),
  razon_social: z.string().trim().min(2).max(180),
  direccion: z.string().trim().max(220).nullable().optional(),
  telefono: z.string().trim().max(60).nullable().optional(),
  email: z.string().trim().email().max(180).nullable().optional()
});

const searchQuerySchema = z.object({
  q: z.string().trim().min(2).max(120),
  limit: z.coerce.number().int().min(1).max(30).default(10)
});

const listQuerySchema = z.object({
  q: z.string().trim().min(1).max(120).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  offset: z.coerce.number().int().min(0).default(0)
});

const clienteParamsSchema = z.object({
  clienteId: z.string().uuid()
});

const dnitAutocompleteQuerySchema = z.object({
  documento_tipo: z.enum(["RUC", "CI"]),
  documento: z.string().trim().min(3).max(40)
});

export const clientesRouter = Router();

clientesRouter.get(
  "/clientes/search",
  requireAuth,
  validateRequest("query", searchQuerySchema),
  async (req, res, next) => {
    try {
      const context = await getOperationalContext(req.user!.id, operationalContextRepository);
      const result = await searchClientes(context, req.query as unknown as z.infer<typeof searchQuerySchema>, clienteRepository);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

clientesRouter.get("/clientes", requireAuth, validateRequest("query", listQuerySchema), async (req, res, next) => {
  try {
    const context = await getOperationalContext(req.user!.id, operationalContextRepository);
    const result = await listClientes(context, req.query as unknown as z.infer<typeof listQuerySchema>, clienteRepository);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

clientesRouter.get(
  "/clientes/dnit/autocomplete",
  requireAuth,
  validateRequest("query", dnitAutocompleteQuerySchema),
  async (req, res, next) => {
    try {
      const result = await autocompleteClienteFromDnit(
        req.query as unknown as z.infer<typeof dnitAutocompleteQuerySchema>,
        clienteRepository
      );
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

clientesRouter.post("/clientes", requireAuth, validateRequest("body", clienteUpsertSchema), async (req, res, next) => {
  try {
    const context = await getOperationalContext(req.user!.id, operationalContextRepository);
    const result = await createCliente(context, req.body, clienteRepository);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

clientesRouter.patch(
  "/clientes/:clienteId",
  requireAuth,
  validateRequest("params", clienteParamsSchema),
  validateRequest("body", clienteUpsertSchema),
  async (req, res, next) => {
    try {
      const context = await getOperationalContext(req.user!.id, operationalContextRepository);
      const params = req.params as unknown as z.infer<typeof clienteParamsSchema>;
      const result = await updateCliente(context, params.clienteId, req.body, clienteRepository);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);
