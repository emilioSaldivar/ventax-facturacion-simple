import crypto from "node:crypto";
import { HttpError } from "../../shared/errors/http-error";
import { hashPassword } from "../auth/password.service";
import type { FiscalGateway } from "../fiscal-gateway/fiscal-gateway.types";
import type {
  BackofficeActividadCreateInput,
  BackofficeActividadResponse,
  BackofficeActividadUpdateInput,
  BackofficeContextoCreateInput,
  BackofficeContextoResponse,
  BackofficeContextoUpdateInput,
  BackofficeEstablecimientoCreateInput,
  BackofficeEstablecimientoResponse,
  BackofficeEstablecimientoUpdateInput,
  BackofficeFacturadorCreateInput,
  BackofficeFacturadorResponse,
  BackofficeFacturadorUpdateInput,
  BackofficeOperationConfigInput,
  BackofficeOperationConfigResponse,
  BackofficePerfilCreateInput,
  BackofficePerfilResponse,
  BackofficePerfilUpdateInput,
  BackofficePuntoCreateInput,
  BackofficePuntoResponse,
  BackofficePuntoUpdateInput,
  BackofficeReadinessResponse,
  BackofficeRepository,
  BackofficeTenantCreateInput,
  BackofficeTenantListQuery,
  BackofficeTenantResponse,
  BackofficeTenantUpdateInput,
  BackofficeUserCreateInput,
  BackofficeUserDetailResponse,
  BackofficeUserListQuery,
  BackofficeUserPasswordResetInput,
  BackofficeUserResponse,
  BackofficeUserUpdateInput
} from "./backoffice.types";

// ─── Usuarios (existentes) ────────────────────────────────────────────────────

export async function createBackofficeUser(
  tenantId: string,
  input: BackofficeUserCreateInput,
  repository: BackofficeRepository
): Promise<BackofficeUserResponse> {
  const username = normalizeUsername(input.username);
  const displayName = normalizeOptional(input.display_name);
  const temporaryPassword = normalizePassword(input.temporary_password) ?? generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);
  const user = await repository.createUser({ tenantId, username, displayName, passwordHash, role: input.role });
  return { ...user, temporary_password: temporaryPassword };
}

export async function resetBackofficeUserPassword(
  userId: string,
  input: BackofficeUserPasswordResetInput,
  repository: BackofficeRepository
): Promise<BackofficeUserResponse> {
  const temporaryPassword = normalizePassword(input.temporary_password) ?? generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);
  const user = await repository.resetPassword({ userId, passwordHash });
  if (!user) throw new HttpError(404, "NOT_FOUND", "Usuario no encontrado.");
  return { ...user, temporary_password: temporaryPassword };
}

export async function assignBackofficeOperationConfig(
  userId: string,
  input: BackofficeOperationConfigInput,
  repository: BackofficeRepository
): Promise<BackofficeOperationConfigResponse> {
  const data = normalizeOperationConfig(input);
  const config = await repository.assignOperationConfig({ userId, data });
  if (!config) throw new HttpError(404, "NOT_FOUND", "Usuario o configuracion operativa no encontrada.");
  return config;
}

// ─── Tenants ──────────────────────────────────────────────────────────────────

export async function createTenant(
  input: BackofficeTenantCreateInput,
  repository: BackofficeRepository
): Promise<BackofficeTenantResponse> {
  const nombre = normalizeRequired(input.nombre, "Nombre del tenant requerido.");
  const slug = normalizeSlug(input.slug);
  const plan_codigo = normalizeRequired(input.plan_codigo, "Plan requerido.");
  return repository.createTenant({ nombre, slug, planCodigo: plan_codigo });
}

export async function listTenants(
  query: BackofficeTenantListQuery,
  repository: BackofficeRepository
): Promise<BackofficeTenantResponse[]> {
  return repository.listTenants({
    q: query.q?.trim() || undefined,
    limit: Math.min(query.limit ?? 20, 100),
    offset: query.offset ?? 0
  });
}

export async function getTenant(
  tenantId: string,
  repository: BackofficeRepository
): Promise<BackofficeTenantResponse> {
  const tenant = await repository.getTenant(tenantId);
  if (!tenant) throw new HttpError(404, "NOT_FOUND", "Tenant no encontrado.");
  return tenant;
}

export async function updateTenant(
  tenantId: string,
  input: BackofficeTenantUpdateInput,
  repository: BackofficeRepository
): Promise<BackofficeTenantResponse> {
  const tenant = await repository.updateTenant(tenantId, {
    nombre: input.nombre ? normalizeRequired(input.nombre, "Nombre requerido.") : undefined,
    estado: input.estado
  });
  if (!tenant) throw new HttpError(404, "NOT_FOUND", "Tenant no encontrado.");
  return tenant;
}

// ─── Facturadores ─────────────────────────────────────────────────────────────

export async function createFacturador(
  tenantId: string,
  input: BackofficeFacturadorCreateInput,
  repository: BackofficeRepository
): Promise<BackofficeFacturadorResponse> {
  return repository.createFacturador({
    tenantId,
    emisor_id: normalizeRequired(input.emisor_id, "emisor_id requerido."),
    ruc: normalizeRequired(input.ruc, "RUC requerido."),
    razon_social: normalizeRequired(input.razon_social, "Razon social requerida."),
    nombre_fantasia: normalizeOptional(input.nombre_fantasia)
  });
}

export async function listFacturadores(
  tenantId: string,
  repository: BackofficeRepository
): Promise<BackofficeFacturadorResponse[]> {
  return repository.listFacturadores(tenantId);
}

export async function getFacturador(
  facturadorId: string,
  repository: BackofficeRepository
): Promise<BackofficeFacturadorResponse> {
  const f = await repository.getFacturador(facturadorId);
  if (!f) throw new HttpError(404, "NOT_FOUND", "Facturador no encontrado.");
  return f;
}

export async function updateFacturador(
  facturadorId: string,
  input: BackofficeFacturadorUpdateInput,
  repository: BackofficeRepository
): Promise<BackofficeFacturadorResponse> {
  const f = await repository.updateFacturador(facturadorId, {
    razon_social: input.razon_social ? normalizeRequired(input.razon_social, "Razon social requerida.") : undefined,
    ruc: input.ruc ? normalizeRequired(input.ruc, "RUC requerido.") : undefined,
    nombre_fantasia: "nombre_fantasia" in input ? normalizeOptional(input.nombre_fantasia) : undefined,
    activo: input.activo
  });
  if (!f) throw new HttpError(404, "NOT_FOUND", "Facturador no encontrado.");
  return f;
}

export async function setFacturadorApiKey(
  facturadorId: string,
  apiKey: string,
  repository: BackofficeRepository
): Promise<void> {
  const f = await repository.getFacturador(facturadorId);
  if (!f) throw new HttpError(404, "NOT_FOUND", "Facturador no encontrado.");
  await repository.setFacturadorApiKey(facturadorId, apiKey.trim());
}

export async function getFacturadorReadiness(
  facturadorId: string,
  repository: BackofficeRepository,
  gateway: FiscalGateway
): Promise<BackofficeReadinessResponse> {
  const [data, fiscalHealth] = await Promise.all([
    repository.getReadinessData(facturadorId),
    gateway.health().catch((_err: unknown) => ({ ok: false }))
  ]);

  if (!data) throw new HttpError(404, "NOT_FOUND", "Facturador no encontrado.");

  const fiscal_backend_available = (fiscalHealth as { ok: boolean }).ok;
  const checks = {
    tenant_activo: data.tenant_activo,
    suscripcion_activa: data.suscripcion_activa,
    facturador_activo: data.facturador_activo,
    contextos_activos: data.contextos_activos,
    usuarios_operativos: data.usuarios_operativos,
    fiscal_backend_available
  };
  const ready =
    checks.tenant_activo &&
    checks.suscripcion_activa &&
    checks.facturador_activo &&
    checks.contextos_activos >= 1 &&
    checks.usuarios_operativos >= 1 &&
    checks.fiscal_backend_available;

  return { facturador_id: facturadorId, checks, ready };
}

// ─── Establecimientos ─────────────────────────────────────────────────────────

export async function createEstablecimiento(
  facturadorId: string,
  input: BackofficeEstablecimientoCreateInput,
  repository: BackofficeRepository
): Promise<BackofficeEstablecimientoResponse> {
  return repository.createEstablecimiento({
    facturadorId,
    codigo: normalizeCode(input.codigo, "Codigo de establecimiento invalido (3 digitos)."),
    nombre: normalizeRequired(input.nombre, "Nombre requerido."),
    direccion: normalizeOptional(input.direccion)
  });
}

export async function listEstablecimientos(
  facturadorId: string,
  repository: BackofficeRepository
): Promise<BackofficeEstablecimientoResponse[]> {
  return repository.listEstablecimientos(facturadorId);
}

export async function getEstablecimiento(
  id: string,
  repository: BackofficeRepository
): Promise<BackofficeEstablecimientoResponse> {
  const e = await repository.getEstablecimiento(id);
  if (!e) throw new HttpError(404, "NOT_FOUND", "Establecimiento no encontrado.");
  return e;
}

export async function updateEstablecimiento(
  id: string,
  input: BackofficeEstablecimientoUpdateInput,
  repository: BackofficeRepository
): Promise<BackofficeEstablecimientoResponse> {
  const e = await repository.updateEstablecimiento(id, {
    nombre: input.nombre ? normalizeRequired(input.nombre, "Nombre requerido.") : undefined,
    direccion: "direccion" in input ? normalizeOptional(input.direccion) : undefined,
    activo: input.activo
  });
  if (!e) throw new HttpError(404, "NOT_FOUND", "Establecimiento no encontrado.");
  return e;
}

// ─── Puntos ───────────────────────────────────────────────────────────────────

export async function createPunto(
  establecimientoId: string,
  input: BackofficePuntoCreateInput,
  repository: BackofficeRepository
): Promise<BackofficePuntoResponse> {
  return repository.createPunto({
    establecimientoId,
    codigo: normalizeCode(input.codigo, "Codigo de punto invalido (3 digitos)."),
    nombre: normalizeOptional(input.nombre)
  });
}

export async function listPuntos(
  establecimientoId: string,
  repository: BackofficeRepository
): Promise<BackofficePuntoResponse[]> {
  return repository.listPuntos(establecimientoId);
}

export async function getPunto(id: string, repository: BackofficeRepository): Promise<BackofficePuntoResponse> {
  const p = await repository.getPunto(id);
  if (!p) throw new HttpError(404, "NOT_FOUND", "Punto de expedicion no encontrado.");
  return p;
}

export async function updatePunto(
  id: string,
  input: BackofficePuntoUpdateInput,
  repository: BackofficeRepository
): Promise<BackofficePuntoResponse> {
  const p = await repository.updatePunto(id, {
    nombre: "nombre" in input ? normalizeOptional(input.nombre) : undefined,
    activo: input.activo
  });
  if (!p) throw new HttpError(404, "NOT_FOUND", "Punto de expedicion no encontrado.");
  return p;
}

// ─── Actividades ──────────────────────────────────────────────────────────────

export async function createActividad(
  facturadorId: string,
  input: BackofficeActividadCreateInput,
  repository: BackofficeRepository
): Promise<BackofficeActividadResponse> {
  return repository.createActividad({
    facturadorId,
    codigo: normalizeRequired(input.codigo, "Codigo de actividad requerido."),
    descripcion: normalizeOptional(input.descripcion),
    alias_operativo: normalizeOptional(input.alias_operativo)
  });
}

export async function listActividades(
  facturadorId: string,
  repository: BackofficeRepository
): Promise<BackofficeActividadResponse[]> {
  return repository.listActividades(facturadorId);
}

export async function getActividad(id: string, repository: BackofficeRepository): Promise<BackofficeActividadResponse> {
  const a = await repository.getActividad(id);
  if (!a) throw new HttpError(404, "NOT_FOUND", "Actividad no encontrada.");
  return a;
}

export async function updateActividad(
  id: string,
  input: BackofficeActividadUpdateInput,
  repository: BackofficeRepository
): Promise<BackofficeActividadResponse> {
  const a = await repository.updateActividad(id, {
    descripcion: "descripcion" in input ? normalizeOptional(input.descripcion) : undefined,
    alias_operativo: "alias_operativo" in input ? normalizeOptional(input.alias_operativo) : undefined,
    activo: input.activo
  });
  if (!a) throw new HttpError(404, "NOT_FOUND", "Actividad no encontrada.");
  return a;
}

// ─── Perfiles ─────────────────────────────────────────────────────────────────

export async function createPerfil(
  facturadorId: string,
  input: BackofficePerfilCreateInput,
  repository: BackofficeRepository
): Promise<BackofficePerfilResponse> {
  return repository.createPerfil({
    facturadorId,
    codigo: normalizeRequired(input.codigo, "Codigo de perfil requerido."),
    descripcion: normalizeOptional(input.descripcion)
  });
}

export async function listPerfiles(
  facturadorId: string,
  repository: BackofficeRepository
): Promise<BackofficePerfilResponse[]> {
  return repository.listPerfiles(facturadorId);
}

export async function getPerfil(id: string, repository: BackofficeRepository): Promise<BackofficePerfilResponse> {
  const p = await repository.getPerfil(id);
  if (!p) throw new HttpError(404, "NOT_FOUND", "Perfil de emision no encontrado.");
  return p;
}

export async function updatePerfil(
  id: string,
  input: BackofficePerfilUpdateInput,
  repository: BackofficeRepository
): Promise<BackofficePerfilResponse> {
  const p = await repository.updatePerfil(id, {
    descripcion: "descripcion" in input ? normalizeOptional(input.descripcion) : undefined,
    activo: input.activo
  });
  if (!p) throw new HttpError(404, "NOT_FOUND", "Perfil de emision no encontrado.");
  return p;
}

// ─── Contextos ────────────────────────────────────────────────────────────────

export async function createContexto(
  facturadorId: string,
  input: BackofficeContextoCreateInput,
  repository: BackofficeRepository
): Promise<BackofficeContextoResponse> {
  const contexto = await repository.createContexto({
    facturadorId,
    actividad_id: input.actividad_id,
    establecimiento_id: input.establecimiento_id,
    punto_expedicion_id: input.punto_expedicion_id,
    perfil_emision_id: input.perfil_emision_id,
    timbrado: normalizeOptional(input.timbrado),
    timbrado_inicio: normalizeOptional(input.timbrado_inicio),
    documento_nro: normalizeOptional(input.documento_nro),
    credito_plazo_dias: input.credito_plazo_dias ?? 30,
    alias_operativo: normalizeOptional(input.alias_operativo)
  });
  if (!contexto) {
    throw new HttpError(400, "VALIDATION_ERROR", "Las referencias no corresponden al mismo facturador o no existen.");
  }
  return contexto;
}

export async function listContextos(
  facturadorId: string,
  repository: BackofficeRepository
): Promise<BackofficeContextoResponse[]> {
  return repository.listContextos(facturadorId);
}

export async function getContexto(id: string, repository: BackofficeRepository): Promise<BackofficeContextoResponse> {
  const c = await repository.getContexto(id);
  if (!c) throw new HttpError(404, "NOT_FOUND", "Contexto operativo no encontrado.");
  return c;
}

export async function updateContexto(
  id: string,
  input: BackofficeContextoUpdateInput,
  repository: BackofficeRepository
): Promise<BackofficeContextoResponse> {
  const c = await repository.updateContexto(id, input);
  if (!c) throw new HttpError(404, "NOT_FOUND", "Contexto operativo no encontrado.");
  return c;
}

// ─── Usuarios extendidos ──────────────────────────────────────────────────────

export async function listBackofficeUsers(
  query: BackofficeUserListQuery,
  repository: BackofficeRepository
): Promise<BackofficeUserDetailResponse[]> {
  return repository.listUsers({
    tenant_id: query.tenant_id,
    facturador_id: query.facturador_id,
    role: query.role,
    limit: Math.min(query.limit ?? 20, 100),
    offset: query.offset ?? 0
  });
}

export async function getBackofficeUserDetail(
  userId: string,
  repository: BackofficeRepository
): Promise<BackofficeUserDetailResponse> {
  const user = await repository.getUserDetail(userId);
  if (!user) throw new HttpError(404, "NOT_FOUND", "Usuario no encontrado.");
  return user;
}

export async function updateBackofficeUser(
  userId: string,
  input: BackofficeUserUpdateInput,
  repository: BackofficeRepository
): Promise<BackofficeUserDetailResponse> {
  const user = await repository.updateUser(userId, {
    display_name: "display_name" in input ? normalizeOptional(input.display_name) : undefined,
    role: input.role,
    activo: input.activo
  });
  if (!user) throw new HttpError(404, "NOT_FOUND", "Usuario no encontrado.");
  return user;
}

export async function deleteBackofficeUser(
  userId: string,
  repository: BackofficeRepository
): Promise<void> {
  const deleted = await repository.softDeleteUser(userId);
  if (!deleted) throw new HttpError(404, "NOT_FOUND", "Usuario no encontrado.");
}

// ─── Helpers privados ─────────────────────────────────────────────────────────

function normalizeUsername(username: string): string {
  const normalized = username.trim().toLowerCase();
  const atCount = normalized.split("@").length - 1;
  if (
    !/^[a-z0-9._@-]{3,120}$/.test(normalized) ||
    normalized.startsWith("@") ||
    normalized.endsWith("@") ||
    atCount > 1
  ) {
    throw new HttpError(400, "VALIDATION_ERROR", "Username invalido.");
  }
  return normalized;
}

function normalizeSlug(slug: string): string {
  const normalized = slug.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(normalized) || normalized.length < 2) {
    throw new HttpError(400, "VALIDATION_ERROR", "Slug invalido. Solo minusculas, numeros y guiones.");
  }
  return normalized;
}

function normalizeCode(value: string, message: string): string {
  const normalized = value.trim();
  if (!/^[0-9]{3}$/.test(normalized)) throw new HttpError(400, "VALIDATION_ERROR", message);
  return normalized;
}

function normalizeRequired(value: string | null | undefined, message: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new HttpError(400, "VALIDATION_ERROR", message);
  return normalized;
}

function normalizeOptional(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized || null;
}

function normalizePassword(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  if (!normalized) return null;
  if (normalized.length < 10 || normalized.length > 120) {
    throw new HttpError(400, "VALIDATION_ERROR", "Password temporal debe tener entre 10 y 120 caracteres.");
  }
  return normalized;
}

function normalizeOperationConfig(input: BackofficeOperationConfigInput): BackofficeOperationConfigInput {
  const normalizeUuidish = (value: string, message: string): string => {
    const normalized = normalizeRequired(value, message);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
      throw new HttpError(400, "VALIDATION_ERROR", message);
    }
    return normalized;
  };
  return {
    tenant_id: normalizeUuidish(input.tenant_id, "Tenant requerido."),
    facturador_id: normalizeUuidish(input.facturador_id, "Facturador requerido."),
    emisor_id: normalizeRequired(input.emisor_id, "Emisor requerido."),
    establecimiento: normalizeCode(input.establecimiento, "Establecimiento invalido."),
    punto_expedicion: normalizeCode(input.punto_expedicion, "Punto de expedicion invalido."),
    perfil_emision_codigo: normalizeRequired(input.perfil_emision_codigo, "Perfil de emision requerido."),
    actividad_economica_codigo: normalizeRequired(input.actividad_economica_codigo, "Actividad economica requerida.")
  };
}

function generateTemporaryPassword(): string {
  return `Vtx-${crypto.randomBytes(9).toString("base64url")}`;
}

