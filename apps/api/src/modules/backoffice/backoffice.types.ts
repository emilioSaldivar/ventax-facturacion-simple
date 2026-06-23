import type { UserSummary } from "@facturacion-simple/shared";

// ─── Usuarios (existentes) ────────────────────────────────────────────────────

export interface BackofficeUserCreateInput {
  username: string;
  email: string;
  display_name?: string | null;
  role: UserSummary["role"];
  temporary_password?: string | null;
  // tenant_id se pasa como primer argumento a createBackofficeUser, no dentro de este objeto
}

export interface BackofficeUserPasswordResetInput {
  temporary_password?: string | null;
}

export interface BackofficeOperationConfigInput {
  tenant_id: string;
  facturador_id: string;
  emisor_id: string;
  establecimiento: string;
  punto_expedicion: string;
  perfil_emision_codigo: string;
  actividad_economica_codigo: string;
}

export interface BackofficeOperationConfigResponse extends BackofficeOperationConfigInput {
  user_id: string;
  active: boolean;
}

export interface BackofficeUserResponse {
  id: string;
  username: string;
  display_name: string | null;
  role: UserSummary["role"];
  active: boolean;
  temporary_password?: string;
}

// ─── Inputs nuevos ────────────────────────────────────────────────────────────

export interface BackofficeTenantCreateInput {
  nombre: string;
  slug: string;
  plan_codigo: string;
}

export interface BackofficeTenantUpdateInput {
  nombre?: string;
  estado?: "ACTIVO" | "SUSPENDIDO";
}

export interface BackofficeFacturadorCreateInput {
  emisor_id: string;
  ruc: string;
  razon_social: string;
  nombre_fantasia?: string | null;
}

export interface BackofficeFacturadorUpdateInput {
  razon_social?: string;
  ruc?: string;
  nombre_fantasia?: string | null;
  activo?: boolean;
}

export interface BackofficeEstablecimientoCreateInput {
  codigo: string;
  nombre: string;
  direccion?: string | null;
}

export interface BackofficeEstablecimientoUpdateInput {
  nombre?: string;
  direccion?: string | null;
  activo?: boolean;
}

export interface BackofficePuntoCreateInput {
  codigo: string;
  nombre?: string | null;
}

export interface BackofficePuntoUpdateInput {
  nombre?: string | null;
  activo?: boolean;
}

export interface BackofficeActividadCreateInput {
  codigo: string;
  descripcion?: string | null;
  alias_operativo?: string | null;
}

export interface BackofficeActividadUpdateInput {
  descripcion?: string | null;
  alias_operativo?: string | null;
  activo?: boolean;
}

export interface BackofficePerfilCreateInput {
  codigo: string;
  descripcion?: string | null;
}

export interface BackofficePerfilUpdateInput {
  descripcion?: string | null;
  activo?: boolean;
}

export interface BackofficeContextoCreateInput {
  actividad_id: string;
  establecimiento_id: string;
  punto_expedicion_id: string;
  perfil_emision_id: string;
  timbrado?: string | null;
  timbrado_inicio?: string | null;
  documento_nro?: string | null;
  credito_plazo_dias?: number | null;
  alias_operativo?: string | null;
}

export interface BackofficeContextoUpdateInput {
  timbrado?: string | null;
  timbrado_inicio?: string | null;
  documento_nro?: string | null;
  credito_plazo_dias?: number | null;
  alias_operativo?: string | null;
  activo?: boolean;
}

export interface BackofficeUserUpdateInput {
  display_name?: string | null;
  role?: UserSummary["role"];
  activo?: boolean;
}

export interface BackofficeTenantListQuery {
  q?: string;
  limit?: number;
  offset?: number;
}

export interface BackofficeUserListQuery {
  tenant_id?: string;
  facturador_id?: string;
  role?: string;
  limit?: number;
  offset?: number;
}

// ─── Responses nuevos ─────────────────────────────────────────────────────────

export interface BackofficeSuscripcionResponse {
  id: string;
  plan_codigo: string;
  plan_nombre: string;
  estado: string;
  fecha_inicio: string;
  fecha_fin: string | null;
}

export interface BackofficeTenantResponse {
  id: string;
  nombre: string;
  slug: string;
  estado: string;
  activo: boolean;
  suscripcion: BackofficeSuscripcionResponse | null;
}

export interface BackofficeFacturadorResponse {
  id: string;
  tenant_id: string;
  emisor_id: string;
  ruc: string;
  razon_social: string;
  nombre_fantasia: string | null;
  activo: boolean;
  has_api_key: boolean;
}

export interface BackofficeEstablecimientoResponse {
  id: string;
  facturador_id: string;
  tenant_id: string;
  codigo: string;
  nombre: string | null;
  direccion: string | null;
  activo: boolean;
}

export interface BackofficePuntoResponse {
  id: string;
  establecimiento_id: string;
  facturador_id: string;
  tenant_id: string;
  codigo: string;
  nombre: string | null;
  activo: boolean;
}

export interface BackofficeActividadResponse {
  id: string;
  facturador_id: string;
  tenant_id: string;
  codigo: string;
  descripcion: string | null;
  alias_operativo: string | null;
  activo: boolean;
}

export interface BackofficePerfilResponse {
  id: string;
  facturador_id: string;
  tenant_id: string;
  codigo: string;
  descripcion: string | null;
  activo: boolean;
}

export interface BackofficeContextoResponse {
  id: string;
  facturador_id: string;
  actividad: { id: string; codigo: string; descripcion: string | null; alias_operativo: string | null };
  establecimiento: { id: string; codigo: string; nombre: string | null };
  punto_expedicion: { id: string; codigo: string; nombre: string | null };
  perfil_emision: { id: string; codigo: string; descripcion: string | null };
  timbrado: string | null;
  timbrado_inicio: string | null;
  documento_nro: string | null;
  credito_plazo_dias: number;
  alias_operativo: string | null;
  activo: boolean;
}

export interface BackofficeUserDetailResponse extends BackofficeUserResponse {
  operation_config: BackofficeOperationConfigResponse | null;
}

export interface BackofficeReadinessChecks {
  tenant_activo: boolean;
  suscripcion_activa: boolean;
  facturador_activo: boolean;
  contextos_activos: number;
  usuarios_operativos: number;
  fiscal_backend_available: boolean;
}

export interface BackofficeReadinessResponse {
  facturador_id: string;
  checks: BackofficeReadinessChecks;
  ready: boolean;
}

export interface BackofficeReadinessData {
  tenant_activo: boolean;
  suscripcion_activa: boolean;
  facturador_activo: boolean;
  contextos_activos: number;
  usuarios_operativos: number;
}

export interface BackofficePlanResponse {
  id: string;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  max_usuarios: number;
  max_facturadores: number;
}

// ─── Repository interface ─────────────────────────────────────────────────────

export interface BackofficeRepository {
  // Usuarios existentes
  createUser(input: {
    tenantId: string;
    username: string;
    email: string;
    displayName: string | null;
    passwordHash: string;
    role: UserSummary["role"];
  }): Promise<Omit<BackofficeUserResponse, "temporary_password">>;
  resetPassword(input: {
    userId: string;
    passwordHash: string;
  }): Promise<Omit<BackofficeUserResponse, "temporary_password"> | null>;
  assignOperationConfig(input: {
    userId: string;
    data: BackofficeOperationConfigInput;
  }): Promise<BackofficeOperationConfigResponse | null>;

  // Planes
  listPlanes(): Promise<BackofficePlanResponse[]>;

  // Tenants
  createTenant(input: { nombre: string; slug: string; planCodigo: string }): Promise<BackofficeTenantResponse>;
  listTenants(query: BackofficeTenantListQuery): Promise<BackofficeTenantResponse[]>;
  getTenant(tenantId: string): Promise<BackofficeTenantResponse | null>;
  updateTenant(tenantId: string, input: BackofficeTenantUpdateInput): Promise<BackofficeTenantResponse | null>;

  // Facturadores
  createFacturador(input: { tenantId: string } & BackofficeFacturadorCreateInput): Promise<BackofficeFacturadorResponse>;
  listFacturadores(tenantId: string): Promise<BackofficeFacturadorResponse[]>;
  getFacturador(facturadorId: string): Promise<BackofficeFacturadorResponse | null>;
  updateFacturador(facturadorId: string, input: BackofficeFacturadorUpdateInput): Promise<BackofficeFacturadorResponse | null>;
  setFacturadorApiKey(facturadorId: string, apiKey: string): Promise<void>;
  getReadinessData(facturadorId: string): Promise<BackofficeReadinessData | null>;

  // Establecimientos
  createEstablecimiento(input: { facturadorId: string } & BackofficeEstablecimientoCreateInput): Promise<BackofficeEstablecimientoResponse>;
  listEstablecimientos(facturadorId: string): Promise<BackofficeEstablecimientoResponse[]>;
  getEstablecimiento(id: string): Promise<BackofficeEstablecimientoResponse | null>;
  updateEstablecimiento(id: string, input: BackofficeEstablecimientoUpdateInput): Promise<BackofficeEstablecimientoResponse | null>;

  // Puntos
  createPunto(input: { establecimientoId: string } & BackofficePuntoCreateInput): Promise<BackofficePuntoResponse>;
  listPuntos(establecimientoId: string): Promise<BackofficePuntoResponse[]>;
  getPunto(id: string): Promise<BackofficePuntoResponse | null>;
  updatePunto(id: string, input: BackofficePuntoUpdateInput): Promise<BackofficePuntoResponse | null>;

  // Actividades
  createActividad(input: { facturadorId: string } & BackofficeActividadCreateInput): Promise<BackofficeActividadResponse>;
  listActividades(facturadorId: string): Promise<BackofficeActividadResponse[]>;
  getActividad(id: string): Promise<BackofficeActividadResponse | null>;
  updateActividad(id: string, input: BackofficeActividadUpdateInput): Promise<BackofficeActividadResponse | null>;

  // Perfiles
  createPerfil(input: { facturadorId: string } & BackofficePerfilCreateInput): Promise<BackofficePerfilResponse>;
  listPerfiles(facturadorId: string): Promise<BackofficePerfilResponse[]>;
  getPerfil(id: string): Promise<BackofficePerfilResponse | null>;
  updatePerfil(id: string, input: BackofficePerfilUpdateInput): Promise<BackofficePerfilResponse | null>;

  // Contextos
  createContexto(input: { facturadorId: string } & BackofficeContextoCreateInput): Promise<BackofficeContextoResponse | null>;
  listContextos(facturadorId: string): Promise<BackofficeContextoResponse[]>;
  getContexto(id: string): Promise<BackofficeContextoResponse | null>;
  updateContexto(id: string, input: BackofficeContextoUpdateInput): Promise<BackofficeContextoResponse | null>;

  // Usuarios extendidos
  listUsers(query: BackofficeUserListQuery): Promise<BackofficeUserDetailResponse[]>;
  getUserDetail(userId: string): Promise<BackofficeUserDetailResponse | null>;
  updateUser(userId: string, input: BackofficeUserUpdateInput): Promise<BackofficeUserDetailResponse | null>;
  softDeleteUser(userId: string): Promise<boolean>;
}
