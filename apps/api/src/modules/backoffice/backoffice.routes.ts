import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { requireAuth } from "../auth/auth.middleware";
import { fiscalGateway } from "../fiscal-gateway/fiscal-gateway.client";
import { validateRequest } from "../../shared/validation/validate-request";
import { HttpError } from "../../shared/errors/http-error";
import { backofficeRepository } from "./backoffice.repository";
import {
  assignBackofficeOperationConfig,
  createBackofficeUser,
  createTenant,
  createFacturador,
  createEstablecimiento,
  createPunto,
  createActividad,
  createPerfil,
  createContexto,
  deleteBackofficeUser,
  getBackofficeUserDetail,
  getContexto,
  getEstablecimiento,
  getFacturador,
  getFacturadorReadiness,
  getActividad,
  getPerfil,
  getPunto,
  getTenant,
  listActividades,
  listBackofficeUsers,
  listContextos,
  listEstablecimientos,
  listFacturadores,
  listPerfiles,
  listPuntos,
  listTenants,
  resetBackofficeUserPassword,
  updateBackofficeUser,
  updateContexto,
  updateEstablecimiento,
  updateFacturador,
  updateActividad,
  updatePerfil,
  updatePunto,
  updateTenant
} from "./backoffice.service";

// ─── Schemas ──────────────────────────────────────────────────────────────────

const roles = ["OPERADOR_FACTURACION", "SOPORTE_INTERNO", "ADMIN_INTERNO"] as const;

const uuidParam = z.object({ id: z.string().uuid() });
const tenantIdParam = z.object({ tenantId: z.string().uuid() });
const facturadorIdParam = z.object({ facturadorId: z.string().uuid() });
const establecimientoIdParam = z.object({ establecimientoId: z.string().uuid() });
const userIdParam = z.object({ userId: z.string().uuid() });

const paginationQuery = z.object({
  limit: z.coerce.number().int().positive().max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0)
});

const tenantListQuery = paginationQuery.extend({ q: z.string().trim().optional() });

const userListQuery = paginationQuery.extend({
  tenant_id: z.string().uuid().optional(),
  facturador_id: z.string().uuid().optional(),
  role: z.enum(roles).optional()
});

const tenantCreateSchema = z.object({
  nombre: z.string().trim().min(1).max(200),
  slug: z.string().trim().min(2).max(80),
  plan_codigo: z.string().trim().min(1).max(60)
});

const tenantUpdateSchema = z.object({
  nombre: z.string().trim().min(1).max(200).optional(),
  estado: z.enum(["ACTIVO", "SUSPENDIDO"]).optional()
}).refine((d) => Object.keys(d).length > 0, { message: "Al menos un campo requerido." });

const facturadorCreateSchema = z.object({
  emisor_id: z.string().trim().min(1).max(60),
  ruc: z.string().trim().min(1).max(30),
  razon_social: z.string().trim().min(1).max(300),
  nombre_fantasia: z.string().trim().max(300).nullable().optional()
});

const facturadorUpdateSchema = z.object({
  razon_social: z.string().trim().min(1).max(300).optional(),
  ruc: z.string().trim().min(1).max(30).optional(),
  nombre_fantasia: z.string().trim().max(300).nullable().optional(),
  activo: z.boolean().optional()
}).refine((d) => Object.keys(d).length > 0, { message: "Al menos un campo requerido." });

const establecimientoCreateSchema = z.object({
  codigo: z.string().trim().regex(/^[0-9]{3}$/, "Codigo debe ser 3 digitos."),
  nombre: z.string().trim().min(1).max(200),
  direccion: z.string().trim().max(400).nullable().optional()
});

const establecimientoUpdateSchema = z.object({
  nombre: z.string().trim().min(1).max(200).optional(),
  direccion: z.string().trim().max(400).nullable().optional(),
  activo: z.boolean().optional()
}).refine((d) => Object.keys(d).length > 0, { message: "Al menos un campo requerido." });

const puntoCreateSchema = z.object({
  codigo: z.string().trim().regex(/^[0-9]{3}$/, "Codigo debe ser 3 digitos."),
  nombre: z.string().trim().max(200).nullable().optional()
});

const puntoUpdateSchema = z.object({
  nombre: z.string().trim().max(200).nullable().optional(),
  activo: z.boolean().optional()
}).refine((d) => Object.keys(d).length > 0, { message: "Al menos un campo requerido." });

const actividadCreateSchema = z.object({
  codigo: z.string().trim().min(1).max(20),
  descripcion: z.string().trim().max(400).nullable().optional(),
  alias_operativo: z.string().trim().max(100).nullable().optional()
});

const actividadUpdateSchema = z.object({
  descripcion: z.string().trim().max(400).nullable().optional(),
  alias_operativo: z.string().trim().max(100).nullable().optional(),
  activo: z.boolean().optional()
}).refine((d) => Object.keys(d).length > 0, { message: "Al menos un campo requerido." });

const perfilCreateSchema = z.object({
  codigo: z.string().trim().min(1).max(80),
  descripcion: z.string().trim().max(400).nullable().optional()
});

const perfilUpdateSchema = z.object({
  descripcion: z.string().trim().max(400).nullable().optional(),
  activo: z.boolean().optional()
}).refine((d) => Object.keys(d).length > 0, { message: "Al menos un campo requerido." });

const contextoCreateSchema = z.object({
  actividad_id: z.string().uuid(),
  establecimiento_id: z.string().uuid(),
  punto_expedicion_id: z.string().uuid(),
  perfil_emision_id: z.string().uuid(),
  timbrado: z.string().trim().regex(/^[0-9]+$/).nullable().optional(),
  timbrado_inicio: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  documento_nro: z.string().trim().regex(/^[0-9]{7}$/, "documento_nro debe ser 7 digitos.").nullable().optional(),
  credito_plazo_dias: z.number().int().positive().optional(),
  alias_operativo: z.string().trim().max(100).nullable().optional()
});

const contextoUpdateSchema = z.object({
  timbrado: z.string().trim().regex(/^[0-9]+$/).nullable().optional(),
  timbrado_inicio: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  documento_nro: z.string().trim().regex(/^[0-9]{7}$/, "documento_nro debe ser 7 digitos.").nullable().optional(),
  credito_plazo_dias: z.number().int().positive().nullable().optional(),
  alias_operativo: z.string().trim().max(100).nullable().optional(),
  activo: z.boolean().optional()
}).refine((d) => Object.keys(d).length > 0, { message: "Al menos un campo requerido." });

const userCreateSchema = z.object({
  username: z.string().trim().min(3).max(120),
  display_name: z.string().trim().min(1).max(180).nullable().optional(),
  role: z.enum(roles),
  temporary_password: z.string().trim().min(10).max(120).nullable().optional()
});

const userUpdateSchema = z.object({
  display_name: z.string().trim().min(1).max(180).nullable().optional(),
  role: z.enum(roles).optional(),
  activo: z.boolean().optional()
}).refine((d) => Object.keys(d).length > 0, { message: "Al menos un campo requerido." });

const passwordResetSchema = z.object({
  temporary_password: z.string().trim().min(10).max(120).nullable().optional()
});

const operationConfigSchema = z.object({
  tenant_id: z.string().uuid(),
  facturador_id: z.string().uuid(),
  emisor_id: z.string().trim().min(1).max(120),
  establecimiento: z.string().trim().regex(/^[0-9]{3}$/),
  punto_expedicion: z.string().trim().regex(/^[0-9]{3}$/),
  perfil_emision_codigo: z.string().trim().min(1).max(40),
  actividad_economica_codigo: z.string().trim().min(1).max(40)
});

// ─── Middlewares ──────────────────────────────────────────────────────────────

function requireBackofficeRole(req: Request, _res: Response, next: NextFunction) {
  if (!req.user || !["SOPORTE_INTERNO", "ADMIN_INTERNO"].includes(req.user.role)) {
    next(new HttpError(403, "FORBIDDEN", "Permiso de backoffice requerido."));
    return;
  }
  next();
}

function requireAdminRole(req: Request, _res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== "ADMIN_INTERNO") {
    next(new HttpError(403, "FORBIDDEN", "Permiso de administrador requerido."));
    return;
  }
  next();
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const backofficeRouter = Router();

const auth = [requireAuth, requireBackofficeRole] as const;
const adminAuth = [requireAuth, requireBackofficeRole, requireAdminRole] as const;

// ── Tenants ───────────────────────────────────────────────────────────────────

backofficeRouter.get("/backoffice/tenants", ...auth, validateRequest("query", tenantListQuery), async (req, res, next) => {
  try {
    res.json(await listTenants(req.query as unknown as z.infer<typeof tenantListQuery>, backofficeRepository));
  } catch (e) { next(e); }
});

backofficeRouter.post("/backoffice/tenants", ...auth, validateRequest("body", tenantCreateSchema), async (req, res, next) => {
  try {
    res.status(201).json(await createTenant(req.body, backofficeRepository));
  } catch (e) { next(e); }
});

backofficeRouter.get("/backoffice/tenants/:tenantId", ...auth, validateRequest("params", tenantIdParam), async (req, res, next) => {
  try {
    const { tenantId } = req.params as z.infer<typeof tenantIdParam>;
    res.json(await getTenant(tenantId, backofficeRepository));
  } catch (e) { next(e); }
});

backofficeRouter.patch("/backoffice/tenants/:tenantId", ...auth, validateRequest("params", tenantIdParam), validateRequest("body", tenantUpdateSchema), async (req, res, next) => {
  try {
    const { tenantId } = req.params as z.infer<typeof tenantIdParam>;
    res.json(await updateTenant(tenantId, req.body, backofficeRepository));
  } catch (e) { next(e); }
});

// ── Facturadores ──────────────────────────────────────────────────────────────

backofficeRouter.get("/backoffice/tenants/:tenantId/facturadores", ...auth, validateRequest("params", tenantIdParam), async (req, res, next) => {
  try {
    const { tenantId } = req.params as z.infer<typeof tenantIdParam>;
    res.json(await listFacturadores(tenantId, backofficeRepository));
  } catch (e) { next(e); }
});

backofficeRouter.post("/backoffice/tenants/:tenantId/facturadores", ...auth, validateRequest("params", tenantIdParam), validateRequest("body", facturadorCreateSchema), async (req, res, next) => {
  try {
    const { tenantId } = req.params as z.infer<typeof tenantIdParam>;
    res.status(201).json(await createFacturador(tenantId, req.body, backofficeRepository));
  } catch (e) { next(e); }
});

backofficeRouter.get("/backoffice/facturadores/:id", ...auth, validateRequest("params", uuidParam), async (req, res, next) => {
  try {
    const { id } = req.params as unknown as z.infer<typeof uuidParam>;
    res.json(await getFacturador(id, backofficeRepository));
  } catch (e) { next(e); }
});

backofficeRouter.patch("/backoffice/facturadores/:id", ...auth, validateRequest("params", uuidParam), validateRequest("body", facturadorUpdateSchema), async (req, res, next) => {
  try {
    const { id } = req.params as unknown as z.infer<typeof uuidParam>;
    res.json(await updateFacturador(id, req.body, backofficeRepository));
  } catch (e) { next(e); }
});

backofficeRouter.get("/backoffice/facturadores/:id/readiness", ...auth, validateRequest("params", uuidParam), async (req, res, next) => {
  try {
    const { id } = req.params as unknown as z.infer<typeof uuidParam>;
    res.json(await getFacturadorReadiness(id, backofficeRepository, fiscalGateway));
  } catch (e) { next(e); }
});

// ── Establecimientos ──────────────────────────────────────────────────────────

backofficeRouter.get("/backoffice/facturadores/:facturadorId/establecimientos", ...auth, validateRequest("params", facturadorIdParam), async (req, res, next) => {
  try {
    const { facturadorId } = req.params as z.infer<typeof facturadorIdParam>;
    res.json(await listEstablecimientos(facturadorId, backofficeRepository));
  } catch (e) { next(e); }
});

backofficeRouter.post("/backoffice/facturadores/:facturadorId/establecimientos", ...auth, validateRequest("params", facturadorIdParam), validateRequest("body", establecimientoCreateSchema), async (req, res, next) => {
  try {
    const { facturadorId } = req.params as z.infer<typeof facturadorIdParam>;
    res.status(201).json(await createEstablecimiento(facturadorId, req.body, backofficeRepository));
  } catch (e) { next(e); }
});

backofficeRouter.get("/backoffice/establecimientos/:id", ...auth, validateRequest("params", uuidParam), async (req, res, next) => {
  try {
    const { id } = req.params as unknown as z.infer<typeof uuidParam>;
    res.json(await getEstablecimiento(id, backofficeRepository));
  } catch (e) { next(e); }
});

backofficeRouter.patch("/backoffice/establecimientos/:id", ...auth, validateRequest("params", uuidParam), validateRequest("body", establecimientoUpdateSchema), async (req, res, next) => {
  try {
    const { id } = req.params as unknown as z.infer<typeof uuidParam>;
    res.json(await updateEstablecimiento(id, req.body, backofficeRepository));
  } catch (e) { next(e); }
});

// ── Puntos ────────────────────────────────────────────────────────────────────

backofficeRouter.get("/backoffice/establecimientos/:establecimientoId/puntos", ...auth, validateRequest("params", establecimientoIdParam), async (req, res, next) => {
  try {
    const { establecimientoId } = req.params as z.infer<typeof establecimientoIdParam>;
    res.json(await listPuntos(establecimientoId, backofficeRepository));
  } catch (e) { next(e); }
});

backofficeRouter.post("/backoffice/establecimientos/:establecimientoId/puntos", ...auth, validateRequest("params", establecimientoIdParam), validateRequest("body", puntoCreateSchema), async (req, res, next) => {
  try {
    const { establecimientoId } = req.params as z.infer<typeof establecimientoIdParam>;
    res.status(201).json(await createPunto(establecimientoId, req.body, backofficeRepository));
  } catch (e) { next(e); }
});

backofficeRouter.get("/backoffice/puntos/:id", ...auth, validateRequest("params", uuidParam), async (req, res, next) => {
  try {
    const { id } = req.params as unknown as z.infer<typeof uuidParam>;
    res.json(await getPunto(id, backofficeRepository));
  } catch (e) { next(e); }
});

backofficeRouter.patch("/backoffice/puntos/:id", ...auth, validateRequest("params", uuidParam), validateRequest("body", puntoUpdateSchema), async (req, res, next) => {
  try {
    const { id } = req.params as unknown as z.infer<typeof uuidParam>;
    res.json(await updatePunto(id, req.body, backofficeRepository));
  } catch (e) { next(e); }
});

// ── Actividades ───────────────────────────────────────────────────────────────

backofficeRouter.get("/backoffice/facturadores/:facturadorId/actividades", ...auth, validateRequest("params", facturadorIdParam), async (req, res, next) => {
  try {
    const { facturadorId } = req.params as z.infer<typeof facturadorIdParam>;
    res.json(await listActividades(facturadorId, backofficeRepository));
  } catch (e) { next(e); }
});

backofficeRouter.post("/backoffice/facturadores/:facturadorId/actividades", ...auth, validateRequest("params", facturadorIdParam), validateRequest("body", actividadCreateSchema), async (req, res, next) => {
  try {
    const { facturadorId } = req.params as z.infer<typeof facturadorIdParam>;
    res.status(201).json(await createActividad(facturadorId, req.body, backofficeRepository));
  } catch (e) { next(e); }
});

backofficeRouter.get("/backoffice/actividades/:id", ...auth, validateRequest("params", uuidParam), async (req, res, next) => {
  try {
    const { id } = req.params as unknown as z.infer<typeof uuidParam>;
    res.json(await getActividad(id, backofficeRepository));
  } catch (e) { next(e); }
});

backofficeRouter.patch("/backoffice/actividades/:id", ...auth, validateRequest("params", uuidParam), validateRequest("body", actividadUpdateSchema), async (req, res, next) => {
  try {
    const { id } = req.params as unknown as z.infer<typeof uuidParam>;
    res.json(await updateActividad(id, req.body, backofficeRepository));
  } catch (e) { next(e); }
});

// ── Perfiles ──────────────────────────────────────────────────────────────────

backofficeRouter.get("/backoffice/facturadores/:facturadorId/perfiles", ...auth, validateRequest("params", facturadorIdParam), async (req, res, next) => {
  try {
    const { facturadorId } = req.params as z.infer<typeof facturadorIdParam>;
    res.json(await listPerfiles(facturadorId, backofficeRepository));
  } catch (e) { next(e); }
});

backofficeRouter.post("/backoffice/facturadores/:facturadorId/perfiles", ...auth, validateRequest("params", facturadorIdParam), validateRequest("body", perfilCreateSchema), async (req, res, next) => {
  try {
    const { facturadorId } = req.params as z.infer<typeof facturadorIdParam>;
    res.status(201).json(await createPerfil(facturadorId, req.body, backofficeRepository));
  } catch (e) { next(e); }
});

backofficeRouter.get("/backoffice/perfiles/:id", ...auth, validateRequest("params", uuidParam), async (req, res, next) => {
  try {
    const { id } = req.params as unknown as z.infer<typeof uuidParam>;
    res.json(await getPerfil(id, backofficeRepository));
  } catch (e) { next(e); }
});

backofficeRouter.patch("/backoffice/perfiles/:id", ...auth, validateRequest("params", uuidParam), validateRequest("body", perfilUpdateSchema), async (req, res, next) => {
  try {
    const { id } = req.params as unknown as z.infer<typeof uuidParam>;
    res.json(await updatePerfil(id, req.body, backofficeRepository));
  } catch (e) { next(e); }
});

// ── Contextos ─────────────────────────────────────────────────────────────────

backofficeRouter.get("/backoffice/facturadores/:facturadorId/contextos", ...auth, validateRequest("params", facturadorIdParam), async (req, res, next) => {
  try {
    const { facturadorId } = req.params as z.infer<typeof facturadorIdParam>;
    res.json(await listContextos(facturadorId, backofficeRepository));
  } catch (e) { next(e); }
});

backofficeRouter.post("/backoffice/facturadores/:facturadorId/contextos", ...auth, validateRequest("params", facturadorIdParam), validateRequest("body", contextoCreateSchema), async (req, res, next) => {
  try {
    const { facturadorId } = req.params as z.infer<typeof facturadorIdParam>;
    res.status(201).json(await createContexto(facturadorId, req.body, backofficeRepository));
  } catch (e) { next(e); }
});

backofficeRouter.get("/backoffice/contextos/:id", ...auth, validateRequest("params", uuidParam), async (req, res, next) => {
  try {
    const { id } = req.params as unknown as z.infer<typeof uuidParam>;
    res.json(await getContexto(id, backofficeRepository));
  } catch (e) { next(e); }
});

backofficeRouter.patch("/backoffice/contextos/:id", ...auth, validateRequest("params", uuidParam), validateRequest("body", contextoUpdateSchema), async (req, res, next) => {
  try {
    const { id } = req.params as unknown as z.infer<typeof uuidParam>;
    res.json(await updateContexto(id, req.body, backofficeRepository));
  } catch (e) { next(e); }
});

// ── Usuarios ──────────────────────────────────────────────────────────────────

backofficeRouter.get("/backoffice/users", ...auth, validateRequest("query", userListQuery), async (req, res, next) => {
  try {
    res.json(await listBackofficeUsers(req.query as unknown as z.infer<typeof userListQuery>, backofficeRepository));
  } catch (e) { next(e); }
});

backofficeRouter.post("/backoffice/users", ...auth, validateRequest("body", userCreateSchema), async (req, res, next) => {
  try {
    res.status(201).json(await createBackofficeUser(req.user!.tenantId, req.body, backofficeRepository));
  } catch (e) { next(e); }
});

backofficeRouter.get("/backoffice/users/:userId", ...auth, validateRequest("params", userIdParam), async (req, res, next) => {
  try {
    const { userId } = req.params as z.infer<typeof userIdParam>;
    res.json(await getBackofficeUserDetail(userId, backofficeRepository));
  } catch (e) { next(e); }
});

backofficeRouter.patch("/backoffice/users/:userId", ...auth, validateRequest("params", userIdParam), validateRequest("body", userUpdateSchema), async (req, res, next) => {
  try {
    const { userId } = req.params as z.infer<typeof userIdParam>;
    res.json(await updateBackofficeUser(userId, req.body, backofficeRepository));
  } catch (e) { next(e); }
});

backofficeRouter.delete("/backoffice/users/:userId", ...adminAuth, validateRequest("params", userIdParam), async (req, res, next) => {
  try {
    const { userId } = req.params as z.infer<typeof userIdParam>;
    await deleteBackofficeUser(userId, backofficeRepository);
    res.status(204).send();
  } catch (e) { next(e); }
});

backofficeRouter.post("/backoffice/users/:userId/reset-password", ...auth, validateRequest("params", userIdParam), validateRequest("body", passwordResetSchema), async (req, res, next) => {
  try {
    const { userId } = req.params as z.infer<typeof userIdParam>;
    res.json(await resetBackofficeUserPassword(userId, req.body, backofficeRepository));
  } catch (e) { next(e); }
});

backofficeRouter.put("/backoffice/users/:userId/operation-config", ...auth, validateRequest("params", userIdParam), validateRequest("body", operationConfigSchema), async (req, res, next) => {
  try {
    const { userId } = req.params as z.infer<typeof userIdParam>;
    res.json(await assignBackofficeOperationConfig(userId, req.body, backofficeRepository));
  } catch (e) { next(e); }
});
