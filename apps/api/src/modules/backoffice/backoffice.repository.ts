import type { UserSummary } from "@facturacion-simple/shared";
import { pool } from "../../db/pool";
import { HttpError } from "../../shared/errors/http-error";
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
  BackofficeReadinessData,
  BackofficeRepository,
  BackofficeTenantCreateInput,
  BackofficeTenantListQuery,
  BackofficeTenantResponse,
  BackofficeTenantUpdateInput,
  BackofficeUserDetailResponse,
  BackofficeUserListQuery,
  BackofficeUserResponse,
  BackofficeUserUpdateInput,
  BackofficePlanResponse
} from "./backoffice.types";

interface Queryable {
  query<T>(queryText: string, values?: unknown[]): Promise<{ rows: T[] }>;
}

// ─── Row types ────────────────────────────────────────────────────────────────

interface BackofficeUserRow {
  id: string;
  username: string;
  display_name: string | null;
  role: UserSummary["role"];
  active: boolean;
}

interface OperationConfigRow {
  user_id: string;
  tenant_id: string;
  facturador_id: string;
  emisor_id: string;
  establecimiento: string;
  punto_expedicion: string;
  perfil_emision_codigo: string;
  actividad_economica_codigo: string;
  active: boolean;
}

interface TenantRow {
  id: string;
  nombre: string;
  slug: string;
  estado: string;
  activo: boolean;
  suscripcion_id: string | null;
  plan_codigo: string | null;
  plan_nombre: string | null;
  suscripcion_estado: string | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
}

interface FacturadorRow {
  id: string;
  tenant_id: string;
  emisor_id: string;
  ruc: string;
  razon_social: string;
  nombre_fantasia: string | null;
  activo: boolean;
  has_api_key: boolean;
}

interface EstablecimientoRow {
  id: string;
  facturador_id: string;
  tenant_id: string;
  codigo: string;
  nombre: string | null;
  direccion: string | null;
  activo: boolean;
}

interface PuntoRow {
  id: string;
  establecimiento_id: string;
  facturador_id: string;
  tenant_id: string;
  codigo: string;
  nombre: string | null;
  activo: boolean;
}

interface ActividadRow {
  id: string;
  facturador_id: string;
  tenant_id: string;
  codigo: string;
  descripcion: string | null;
  alias_operativo: string | null;
  activo: boolean;
}

interface PerfilRow {
  id: string;
  facturador_id: string;
  tenant_id: string;
  codigo: string;
  descripcion: string | null;
  activo: boolean;
}

interface ContextoRow {
  id: string;
  facturador_id: string;
  actividad_id: string;
  actividad_codigo: string;
  actividad_descripcion: string | null;
  actividad_alias: string | null;
  establecimiento_id: string;
  establecimiento_codigo: string;
  establecimiento_nombre: string | null;
  punto_id: string;
  punto_codigo: string;
  punto_nombre: string | null;
  perfil_id: string;
  perfil_codigo: string;
  perfil_descripcion: string | null;
  timbrado: string | null;
  timbrado_inicio: string | null;
  documento_nro: string | null;
  credito_plazo_dias: number;
  alias_operativo: string | null;
  activo: boolean;
}

interface UserDetailRow {
  id: string;
  username: string;
  display_name: string | null;
  role: UserSummary["role"];
  active: boolean;
  config_user_id: string | null;
  config_tenant_id: string | null;
  config_facturador_id: string | null;
  config_emisor_id: string | null;
  config_establecimiento: string | null;
  config_punto: string | null;
  config_perfil: string | null;
  config_actividad: string | null;
  config_active: boolean | null;
}

interface ReadinessRow {
  tenant_activo: boolean;
  suscripcion_activa: boolean;
  facturador_activo: boolean;
  contextos_activos: string;
  usuarios_operativos: string;
}

// ─── Mappers ──────────────────────────────────────────────────────────────────

function mapUserRow(row: BackofficeUserRow): Omit<BackofficeUserResponse, "temporary_password"> {
  return { id: row.id, username: row.username, display_name: row.display_name, role: row.role, active: row.active };
}

function mapTenantRow(row: TenantRow): BackofficeTenantResponse {
  return {
    id: row.id,
    nombre: row.nombre,
    slug: row.slug,
    estado: row.estado,
    activo: row.activo,
    suscripcion: row.suscripcion_id
      ? {
          id: row.suscripcion_id,
          plan_codigo: row.plan_codigo!,
          plan_nombre: row.plan_nombre!,
          estado: row.suscripcion_estado!,
          fecha_inicio: row.fecha_inicio!,
          fecha_fin: row.fecha_fin
        }
      : null
  };
}

function mapFacturadorRow(row: FacturadorRow): BackofficeFacturadorResponse {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    emisor_id: row.emisor_id,
    ruc: row.ruc,
    razon_social: row.razon_social,
    nombre_fantasia: row.nombre_fantasia,
    activo: row.activo,
    has_api_key: row.has_api_key
  };
}

function mapEstablecimientoRow(row: EstablecimientoRow): BackofficeEstablecimientoResponse {
  return {
    id: row.id,
    facturador_id: row.facturador_id,
    tenant_id: row.tenant_id,
    codigo: row.codigo,
    nombre: row.nombre,
    direccion: row.direccion,
    activo: row.activo
  };
}

function mapPuntoRow(row: PuntoRow): BackofficePuntoResponse {
  return {
    id: row.id,
    establecimiento_id: row.establecimiento_id,
    facturador_id: row.facturador_id,
    tenant_id: row.tenant_id,
    codigo: row.codigo,
    nombre: row.nombre,
    activo: row.activo
  };
}

function mapActividadRow(row: ActividadRow): BackofficeActividadResponse {
  return {
    id: row.id,
    facturador_id: row.facturador_id,
    tenant_id: row.tenant_id,
    codigo: row.codigo,
    descripcion: row.descripcion,
    alias_operativo: row.alias_operativo,
    activo: row.activo
  };
}

function mapPerfilRow(row: PerfilRow): BackofficePerfilResponse {
  return {
    id: row.id,
    facturador_id: row.facturador_id,
    tenant_id: row.tenant_id,
    codigo: row.codigo,
    descripcion: row.descripcion,
    activo: row.activo
  };
}

function mapContextoRow(row: ContextoRow): BackofficeContextoResponse {
  return {
    id: row.id,
    facturador_id: row.facturador_id,
    actividad: { id: row.actividad_id, codigo: row.actividad_codigo, descripcion: row.actividad_descripcion, alias_operativo: row.actividad_alias },
    establecimiento: { id: row.establecimiento_id, codigo: row.establecimiento_codigo, nombre: row.establecimiento_nombre },
    punto_expedicion: { id: row.punto_id, codigo: row.punto_codigo, nombre: row.punto_nombre },
    perfil_emision: { id: row.perfil_id, codigo: row.perfil_codigo, descripcion: row.perfil_descripcion },
    timbrado: row.timbrado,
    timbrado_inicio: row.timbrado_inicio,
    documento_nro: row.documento_nro,
    credito_plazo_dias: row.credito_plazo_dias,
    alias_operativo: row.alias_operativo,
    activo: row.activo
  };
}

function mapUserDetailRow(row: UserDetailRow): BackofficeUserDetailResponse {
  const operation_config: BackofficeOperationConfigResponse | null =
    row.config_user_id
      ? {
          user_id: row.config_user_id,
          tenant_id: row.config_tenant_id!,
          facturador_id: row.config_facturador_id!,
          emisor_id: row.config_emisor_id!,
          establecimiento: row.config_establecimiento!,
          punto_expedicion: row.config_punto!,
          perfil_emision_codigo: row.config_perfil!,
          actividad_economica_codigo: row.config_actividad!,
          active: row.config_active!
        }
      : null;

  return {
    id: row.id,
    username: row.username,
    display_name: row.display_name,
    role: row.role,
    active: row.active,
    operation_config
  };
}

// ─── SQL fragments ────────────────────────────────────────────────────────────

const TENANT_SELECT = `
  select
    t.id,
    t.nombre,
    t.slug,
    t.estado,
    t.activo,
    ts.id as suscripcion_id,
    p.codigo as plan_codigo,
    p.nombre as plan_nombre,
    ts.estado as suscripcion_estado,
    ts.fecha_inicio::text as fecha_inicio,
    ts.fecha_fin::text as fecha_fin
  from tenants t
  left join tenant_suscripciones ts
    on ts.tenant_id = t.id
    and ts.activo = true
    and ts.estado = 'ACTIVA'
    and ts.deleted_at is null
  left join planes p on p.id = ts.plan_id
`;

const CONTEXTO_SELECT = `
  select
    app.id,
    app.facturador_id,
    a.id as actividad_id,
    a.codigo as actividad_codigo,
    a.descripcion as actividad_descripcion,
    a.alias_operativo as actividad_alias,
    e.id as establecimiento_id,
    e.codigo as establecimiento_codigo,
    e.nombre as establecimiento_nombre,
    p.id as punto_id,
    p.codigo as punto_codigo,
    p.nombre as punto_nombre,
    pe.id as perfil_id,
    pe.codigo as perfil_codigo,
    pe.descripcion as perfil_descripcion,
    app.timbrado,
    app.timbrado_inicio::text as timbrado_inicio,
    app.documento_nro,
    app.credito_plazo_dias,
    app.alias_operativo,
    app.activo
  from actividad_punto_perfiles app
  join facturador_actividades a on a.id = app.actividad_id and a.deleted_at is null
  join facturador_establecimientos e on e.id = app.establecimiento_id and e.deleted_at is null
  join facturador_puntos_expedicion p on p.id = app.punto_expedicion_id and p.deleted_at is null
  join facturador_perfiles_emision pe on pe.id = app.perfil_emision_id and pe.deleted_at is null
`;

const USER_DETAIL_SELECT = `
  select
    u.id,
    u.username::text as username,
    u.display_name,
    coalesce(r.codigo, 'OPERADOR_FACTURACION') as role,
    u.activo as active,
    uoc.usuario_id as config_user_id,
    uoc.tenant_id as config_tenant_id,
    uoc.facturador_id as config_facturador_id,
    f.emisor_id as config_emisor_id,
    e.codigo as config_establecimiento,
    pt.codigo as config_punto,
    pe.codigo as config_perfil,
    av.codigo as config_actividad,
    uoc.activo as config_active
  from usuarios u
  left join usuario_roles ur on ur.usuario_id = u.id
  left join roles r on r.id = ur.role_id and r.activo = true and r.deleted_at is null
  left join usuario_operacion_config uoc
    on uoc.usuario_id = u.id and uoc.activo = true and uoc.deleted_at is null
  left join actividad_punto_perfiles app
    on app.id = uoc.actividad_punto_perfil_id and app.deleted_at is null
  left join facturadores f on f.id = uoc.facturador_id and f.deleted_at is null
  left join facturador_establecimientos e on e.id = app.establecimiento_id and e.deleted_at is null
  left join facturador_puntos_expedicion pt on pt.id = app.punto_expedicion_id and pt.deleted_at is null
  left join facturador_perfiles_emision pe on pe.id = app.perfil_emision_id and pe.deleted_at is null
  left join facturador_actividades av on av.id = app.actividad_id and av.deleted_at is null
`;

// ─── Repository ───────────────────────────────────────────────────────────────

export class PgBackofficeRepository implements BackofficeRepository {
  // ── Usuarios existentes ───────────────────────────────────────────────────

  async createUser(input: {
    tenantId: string;
    username: string;
    displayName: string | null;
    passwordHash: string;
    role: UserSummary["role"];
  }): Promise<Omit<BackofficeUserResponse, "temporary_password">> {
    const client = await pool.connect();
    try {
      await client.query("begin");
      const userResult = await client.query<{ id: string }>(
        `insert into usuarios (tenant_id, username, display_name, password_hash)
         values ($1, $2, $3, $4) returning id`,
        [input.tenantId, input.username, input.displayName, input.passwordHash]
      );
      const userId = userResult.rows[0]!.id;
      await client.query(
        `insert into usuario_roles (usuario_id, role_id)
         select $1, id from roles
         where codigo = $2 and activo = true and deleted_at is null`,
        [userId, input.role]
      );
      const row = await this.findUserRow(userId, client);
      await client.query("commit");
      return mapUserRow(row!);
    } catch (error) {
      await client.query("rollback");
      if (isUniqueViolation(error)) throw new HttpError(409, "CONFLICT", "Username ya existe.");
      throw error;
    } finally {
      client.release();
    }
  }

  async resetPassword(input: { userId: string; passwordHash: string }): Promise<Omit<BackofficeUserResponse, "temporary_password"> | null> {
    const client = await pool.connect();
    try {
      await client.query("begin");
      const updated = await client.query<{ id: string }>(
        `update usuarios
         set password_hash = $2, failed_login_count = 0, bloqueado_at = null, activo = true, updated_at = now()
         where id = $1 and deleted_at is null returning id`,
        [input.userId, input.passwordHash]
      );
      if (!updated.rows[0]) { await client.query("rollback"); return null; }
      await client.query(
        `update refresh_tokens set revoked_at = now() where usuario_id = $1 and revoked_at is null`,
        [input.userId]
      );
      const row = await this.findUserRow(input.userId, client);
      await client.query("commit");
      return row ? mapUserRow(row) : null;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async assignOperationConfig(input: { userId: string; data: BackofficeOperationConfigInput }): Promise<BackofficeOperationConfigResponse | null> {
    const client = await pool.connect();
    try {
      await client.query("begin");
      const resolved = await client.query<{ usuario_id: string; tenant_id: string; facturador_id: string; actividad_punto_perfil_id: string }>(
        `select u.id as usuario_id, u.tenant_id, f.id as facturador_id, app.id as actividad_punto_perfil_id
         from usuarios u
         join facturadores f on f.id = $3 and f.tenant_id = u.tenant_id and f.tenant_id = $2 and f.emisor_id = $4 and f.activo = true and f.deleted_at is null
         join actividad_punto_perfiles app on app.facturador_id = f.id and app.tenant_id = f.tenant_id and app.activo = true and app.deleted_at is null
         join facturador_establecimientos e on e.id = app.establecimiento_id and e.codigo = $5 and e.activo = true and e.deleted_at is null
         join facturador_puntos_expedicion p on p.id = app.punto_expedicion_id and p.codigo = $6 and p.activo = true and p.deleted_at is null
         join facturador_perfiles_emision pe on pe.id = app.perfil_emision_id and pe.codigo = $7 and pe.activo = true and pe.deleted_at is null
         join facturador_actividades a on a.id = app.actividad_id and a.codigo = $8 and a.activo = true and a.deleted_at is null
         where u.id = $1 and u.tenant_id = $2 and u.activo = true and u.deleted_at is null limit 1`,
        [input.userId, input.data.tenant_id, input.data.facturador_id, input.data.emisor_id, input.data.establecimiento, input.data.punto_expedicion, input.data.perfil_emision_codigo, input.data.actividad_economica_codigo]
      );
      const match = resolved.rows[0];
      if (!match) { await client.query("rollback"); return null; }
      await client.query(
        `update usuario_operacion_config set activo = false, updated_at = now() where usuario_id = $1 and activo = true and deleted_at is null`,
        [input.userId]
      );
      await client.query(
        `insert into usuario_operacion_config (tenant_id, usuario_id, facturador_id, actividad_punto_perfil_id, activo)
         values ($1, $2, $3, $4, true)`,
        [match.tenant_id, match.usuario_id, match.facturador_id, match.actividad_punto_perfil_id]
      );
      const row = await this.findOperationConfigRow(input.userId, client);
      await client.query("commit");
      return row ? mapOperationConfigRow(row) : null;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  // ── Planes ────────────────────────────────────────────────────────────────

  async listPlanes(): Promise<BackofficePlanResponse[]> {
    const result = await pool.query<{ id: string; codigo: string; nombre: string; descripcion: string | null; max_usuarios: number; max_facturadores: number }>(
      `select id, codigo, nombre, descripcion, max_usuarios, max_facturadores
       from planes where activo = true and deleted_at is null order by nombre`
    );
    return result.rows;
  }

  // ── Tenants ───────────────────────────────────────────────────────────────

  async createTenant(input: { nombre: string; slug: string; planCodigo: string }): Promise<BackofficeTenantResponse> {
    const client = await pool.connect();
    try {
      await client.query("begin");
      const planResult = await client.query<{ id: string }>(
        `select id from planes where codigo = $1 and activo = true and deleted_at is null`,
        [input.planCodigo]
      );
      if (!planResult.rows[0]) {
        await client.query("rollback");
        throw new HttpError(400, "VALIDATION_ERROR", "Plan no encontrado.");
      }
      const tenantResult = await client.query<{ id: string }>(
        `insert into tenants (nombre, slug, estado, activo) values ($1, $2, 'ACTIVO', true) returning id`,
        [input.nombre, input.slug]
      );
      const tenantId = tenantResult.rows[0]!.id;
      await client.query(
        `insert into tenant_suscripciones (tenant_id, plan_id, estado, activo) values ($1, $2, 'ACTIVA', true)`,
        [tenantId, planResult.rows[0].id]
      );
      await client.query("commit");
      const row = await this.findTenantRow(tenantId);
      return mapTenantRow(row!);
    } catch (error) {
      await client.query("rollback");
      if (isUniqueViolation(error)) throw new HttpError(409, "CONFLICT", "Slug ya existe.");
      throw error;
    } finally {
      client.release();
    }
  }

  async listTenants(query: BackofficeTenantListQuery): Promise<BackofficeTenantResponse[]> {
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;
    const q = query.q ? `%${query.q}%` : null;
    const result = await pool.query<TenantRow>(
      `${TENANT_SELECT}
       where t.deleted_at is null
         and ($1::text is null or t.nombre ilike $1 or t.slug ilike $1)
       order by t.nombre
       limit $2 offset $3`,
      [q, limit, offset]
    );
    return result.rows.map(mapTenantRow);
  }

  async getTenant(tenantId: string): Promise<BackofficeTenantResponse | null> {
    const row = await this.findTenantRow(tenantId);
    return row ? mapTenantRow(row) : null;
  }

  async updateTenant(tenantId: string, input: BackofficeTenantUpdateInput): Promise<BackofficeTenantResponse | null> {
    const result = await pool.query<{ id: string }>(
      `update tenants
       set nombre = coalesce($2, nombre), estado = coalesce($3, estado), updated_at = now()
       where id = $1 and deleted_at is null returning id`,
      [tenantId, input.nombre ?? null, input.estado ?? null]
    );
    if (!result.rows[0]) return null;
    const row = await this.findTenantRow(tenantId);
    return row ? mapTenantRow(row) : null;
  }

  // ── Facturadores ──────────────────────────────────────────────────────────

  async createFacturador(input: { tenantId: string } & BackofficeFacturadorCreateInput): Promise<BackofficeFacturadorResponse> {
    const result = await pool.query<FacturadorRow>(
      `insert into facturadores (tenant_id, emisor_id, razon_social, ruc, nombre_fantasia, activo)
       values ($1, $2, $3, $4, $5, true)
       returning id, tenant_id, emisor_id, ruc, razon_social, nombre_fantasia, activo,
                 (fe_consumer_api_key is not null) as has_api_key`,
      [input.tenantId, input.emisor_id, input.razon_social, input.ruc, input.nombre_fantasia ?? null]
    );
    return mapFacturadorRow(result.rows[0]!);
  }

  async listFacturadores(tenantId: string): Promise<BackofficeFacturadorResponse[]> {
    const result = await pool.query<FacturadorRow>(
      `select id, tenant_id, emisor_id, ruc, razon_social, nombre_fantasia, activo,
              (fe_consumer_api_key is not null) as has_api_key
       from facturadores where tenant_id = $1 and deleted_at is null order by razon_social`,
      [tenantId]
    );
    return result.rows.map(mapFacturadorRow);
  }

  async getFacturador(facturadorId: string): Promise<BackofficeFacturadorResponse | null> {
    const result = await pool.query<FacturadorRow>(
      `select id, tenant_id, emisor_id, ruc, razon_social, nombre_fantasia, activo,
              (fe_consumer_api_key is not null) as has_api_key
       from facturadores where id = $1 and deleted_at is null`,
      [facturadorId]
    );
    return result.rows[0] ? mapFacturadorRow(result.rows[0]) : null;
  }

  async updateFacturador(facturadorId: string, input: BackofficeFacturadorUpdateInput): Promise<BackofficeFacturadorResponse | null> {
    const result = await pool.query<FacturadorRow>(
      `update facturadores
       set razon_social = coalesce($2, razon_social),
           ruc = coalesce($3, ruc),
           nombre_fantasia = case when $4::boolean then $5 else nombre_fantasia end,
           activo = coalesce($6, activo),
           updated_at = now()
       where id = $1 and deleted_at is null
       returning id, tenant_id, emisor_id, ruc, razon_social, nombre_fantasia, activo,
                 (fe_consumer_api_key is not null) as has_api_key`,
      [
        facturadorId,
        input.razon_social ?? null,
        input.ruc ?? null,
        "nombre_fantasia" in input,
        input.nombre_fantasia ?? null,
        input.activo ?? null
      ]
    );
    return result.rows[0] ? mapFacturadorRow(result.rows[0]) : null;
  }

  async setFacturadorApiKey(facturadorId: string, apiKey: string): Promise<void> {
    await pool.query(
      `update facturadores set fe_consumer_api_key = $2, updated_at = now()
       where id = $1 and deleted_at is null`,
      [facturadorId, apiKey]
    );
  }

  async getReadinessData(facturadorId: string): Promise<BackofficeReadinessData | null> {
    const result = await pool.query<ReadinessRow>(
      `with f as (
         select id, tenant_id, activo as facturador_activo
         from facturadores where id = $1 and deleted_at is null
       ),
       t as (
         select ten.activo as tenant_activo
         from tenants ten join f on ten.id = f.tenant_id where ten.deleted_at is null
       ),
       s as (
         select (ts.estado = 'ACTIVA') as suscripcion_activa
         from tenant_suscripciones ts join f on ts.tenant_id = f.tenant_id
         where ts.activo = true and ts.deleted_at is null limit 1
       ),
       ctx as (
         select count(*) as contextos_activos
         from actividad_punto_perfiles app join f on app.facturador_id = f.id
         where app.activo = true and app.deleted_at is null
       ),
       usr as (
         select count(*) as usuarios_operativos
         from usuario_operacion_config uoc join f on uoc.facturador_id = f.id
         where uoc.activo = true and uoc.deleted_at is null
       )
       select
         f.facturador_activo,
         coalesce(t.tenant_activo, false) as tenant_activo,
         coalesce(s.suscripcion_activa, false) as suscripcion_activa,
         coalesce(ctx.contextos_activos, 0) as contextos_activos,
         coalesce(usr.usuarios_operativos, 0) as usuarios_operativos
       from f
       left join t on true
       left join s on true
       left join ctx on true
       left join usr on true`,
      [facturadorId]
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      tenant_activo: row.tenant_activo,
      suscripcion_activa: row.suscripcion_activa,
      facturador_activo: row.facturador_activo,
      contextos_activos: parseInt(String(row.contextos_activos), 10),
      usuarios_operativos: parseInt(String(row.usuarios_operativos), 10)
    };
  }

  // ── Establecimientos ──────────────────────────────────────────────────────

  async createEstablecimiento(input: { facturadorId: string } & BackofficeEstablecimientoCreateInput): Promise<BackofficeEstablecimientoResponse> {
    const result = await pool.query<EstablecimientoRow>(
      `insert into facturador_establecimientos (tenant_id, facturador_id, codigo, nombre, direccion, activo)
       select f.tenant_id, f.id, $2, $3, $4, true from facturadores f where f.id = $1 and f.deleted_at is null
       returning id, facturador_id, tenant_id, codigo, nombre, direccion, activo`,
      [input.facturadorId, input.codigo, input.nombre, input.direccion ?? null]
    );
    if (!result.rows[0]) throw new HttpError(404, "NOT_FOUND", "Facturador no encontrado.");
    return mapEstablecimientoRow(result.rows[0]);
  }

  async listEstablecimientos(facturadorId: string): Promise<BackofficeEstablecimientoResponse[]> {
    const result = await pool.query<EstablecimientoRow>(
      `select id, facturador_id, tenant_id, codigo, nombre, direccion, activo
       from facturador_establecimientos where facturador_id = $1 and deleted_at is null order by codigo`,
      [facturadorId]
    );
    return result.rows.map(mapEstablecimientoRow);
  }

  async getEstablecimiento(id: string): Promise<BackofficeEstablecimientoResponse | null> {
    const result = await pool.query<EstablecimientoRow>(
      `select id, facturador_id, tenant_id, codigo, nombre, direccion, activo
       from facturador_establecimientos where id = $1 and deleted_at is null`,
      [id]
    );
    return result.rows[0] ? mapEstablecimientoRow(result.rows[0]) : null;
  }

  async updateEstablecimiento(id: string, input: BackofficeEstablecimientoUpdateInput): Promise<BackofficeEstablecimientoResponse | null> {
    const result = await pool.query<EstablecimientoRow>(
      `update facturador_establecimientos
       set nombre = coalesce($2, nombre),
           direccion = case when $3::boolean then $4 else direccion end,
           activo = coalesce($5, activo),
           updated_at = now()
       where id = $1 and deleted_at is null
       returning id, facturador_id, tenant_id, codigo, nombre, direccion, activo`,
      [id, input.nombre ?? null, "direccion" in input, input.direccion ?? null, input.activo ?? null]
    );
    return result.rows[0] ? mapEstablecimientoRow(result.rows[0]) : null;
  }

  // ── Puntos ────────────────────────────────────────────────────────────────

  async createPunto(input: { establecimientoId: string } & BackofficePuntoCreateInput): Promise<BackofficePuntoResponse> {
    const result = await pool.query<PuntoRow>(
      `insert into facturador_puntos_expedicion (tenant_id, facturador_id, establecimiento_id, codigo, nombre, activo)
       select e.tenant_id, e.facturador_id, e.id, $2, $3, true
       from facturador_establecimientos e where e.id = $1 and e.deleted_at is null
       returning id, establecimiento_id, facturador_id, tenant_id, codigo, nombre, activo`,
      [input.establecimientoId, input.codigo, input.nombre ?? null]
    );
    if (!result.rows[0]) throw new HttpError(404, "NOT_FOUND", "Establecimiento no encontrado.");
    return mapPuntoRow(result.rows[0]);
  }

  async listPuntos(establecimientoId: string): Promise<BackofficePuntoResponse[]> {
    const result = await pool.query<PuntoRow>(
      `select id, establecimiento_id, facturador_id, tenant_id, codigo, nombre, activo
       from facturador_puntos_expedicion where establecimiento_id = $1 and deleted_at is null order by codigo`,
      [establecimientoId]
    );
    return result.rows.map(mapPuntoRow);
  }

  async getPunto(id: string): Promise<BackofficePuntoResponse | null> {
    const result = await pool.query<PuntoRow>(
      `select id, establecimiento_id, facturador_id, tenant_id, codigo, nombre, activo
       from facturador_puntos_expedicion where id = $1 and deleted_at is null`,
      [id]
    );
    return result.rows[0] ? mapPuntoRow(result.rows[0]) : null;
  }

  async updatePunto(id: string, input: BackofficePuntoUpdateInput): Promise<BackofficePuntoResponse | null> {
    const result = await pool.query<PuntoRow>(
      `update facturador_puntos_expedicion
       set nombre = case when $2::boolean then $3 else nombre end,
           activo = coalesce($4, activo),
           updated_at = now()
       where id = $1 and deleted_at is null
       returning id, establecimiento_id, facturador_id, tenant_id, codigo, nombre, activo`,
      [id, "nombre" in input, input.nombre ?? null, input.activo ?? null]
    );
    return result.rows[0] ? mapPuntoRow(result.rows[0]) : null;
  }

  // ── Actividades ───────────────────────────────────────────────────────────

  async createActividad(input: { facturadorId: string } & BackofficeActividadCreateInput): Promise<BackofficeActividadResponse> {
    const result = await pool.query<ActividadRow>(
      `insert into facturador_actividades (tenant_id, facturador_id, codigo, descripcion, alias_operativo, activo)
       select f.tenant_id, f.id, $2, $3, $4, true from facturadores f where f.id = $1 and f.deleted_at is null
       returning id, facturador_id, tenant_id, codigo, descripcion, alias_operativo, activo`,
      [input.facturadorId, input.codigo, input.descripcion ?? null, input.alias_operativo ?? null]
    );
    if (!result.rows[0]) throw new HttpError(404, "NOT_FOUND", "Facturador no encontrado.");
    return mapActividadRow(result.rows[0]);
  }

  async listActividades(facturadorId: string): Promise<BackofficeActividadResponse[]> {
    const result = await pool.query<ActividadRow>(
      `select id, facturador_id, tenant_id, codigo, descripcion, alias_operativo, activo
       from facturador_actividades where facturador_id = $1 and deleted_at is null order by codigo`,
      [facturadorId]
    );
    return result.rows.map(mapActividadRow);
  }

  async getActividad(id: string): Promise<BackofficeActividadResponse | null> {
    const result = await pool.query<ActividadRow>(
      `select id, facturador_id, tenant_id, codigo, descripcion, alias_operativo, activo
       from facturador_actividades where id = $1 and deleted_at is null`,
      [id]
    );
    return result.rows[0] ? mapActividadRow(result.rows[0]) : null;
  }

  async updateActividad(id: string, input: BackofficeActividadUpdateInput): Promise<BackofficeActividadResponse | null> {
    const result = await pool.query<ActividadRow>(
      `update facturador_actividades
       set descripcion = case when $2::boolean then $3 else descripcion end,
           alias_operativo = case when $4::boolean then $5 else alias_operativo end,
           activo = coalesce($6, activo),
           updated_at = now()
       where id = $1 and deleted_at is null
       returning id, facturador_id, tenant_id, codigo, descripcion, alias_operativo, activo`,
      [id, "descripcion" in input, input.descripcion ?? null, "alias_operativo" in input, input.alias_operativo ?? null, input.activo ?? null]
    );
    return result.rows[0] ? mapActividadRow(result.rows[0]) : null;
  }

  // ── Perfiles ──────────────────────────────────────────────────────────────

  async createPerfil(input: { facturadorId: string } & BackofficePerfilCreateInput): Promise<BackofficePerfilResponse> {
    const result = await pool.query<PerfilRow>(
      `insert into facturador_perfiles_emision (tenant_id, facturador_id, codigo, descripcion, activo)
       select f.tenant_id, f.id, $2, $3, true from facturadores f where f.id = $1 and f.deleted_at is null
       returning id, facturador_id, tenant_id, codigo, descripcion, activo`,
      [input.facturadorId, input.codigo, input.descripcion ?? null]
    );
    if (!result.rows[0]) throw new HttpError(404, "NOT_FOUND", "Facturador no encontrado.");
    return mapPerfilRow(result.rows[0]);
  }

  async listPerfiles(facturadorId: string): Promise<BackofficePerfilResponse[]> {
    const result = await pool.query<PerfilRow>(
      `select id, facturador_id, tenant_id, codigo, descripcion, activo
       from facturador_perfiles_emision where facturador_id = $1 and deleted_at is null order by codigo`,
      [facturadorId]
    );
    return result.rows.map(mapPerfilRow);
  }

  async getPerfil(id: string): Promise<BackofficePerfilResponse | null> {
    const result = await pool.query<PerfilRow>(
      `select id, facturador_id, tenant_id, codigo, descripcion, activo
       from facturador_perfiles_emision where id = $1 and deleted_at is null`,
      [id]
    );
    return result.rows[0] ? mapPerfilRow(result.rows[0]) : null;
  }

  async updatePerfil(id: string, input: BackofficePerfilUpdateInput): Promise<BackofficePerfilResponse | null> {
    const result = await pool.query<PerfilRow>(
      `update facturador_perfiles_emision
       set descripcion = case when $2::boolean then $3 else descripcion end,
           activo = coalesce($4, activo),
           updated_at = now()
       where id = $1 and deleted_at is null
       returning id, facturador_id, tenant_id, codigo, descripcion, activo`,
      [id, "descripcion" in input, input.descripcion ?? null, input.activo ?? null]
    );
    return result.rows[0] ? mapPerfilRow(result.rows[0]) : null;
  }

  // ── Contextos ─────────────────────────────────────────────────────────────

  async createContexto(input: { facturadorId: string } & BackofficeContextoCreateInput): Promise<BackofficeContextoResponse | null> {
    const resolved = await pool.query<{ actividad_id: string; establecimiento_id: string; punto_id: string; perfil_id: string; tenant_id: string }>(
      `select a.id as actividad_id, e.id as establecimiento_id, p.id as punto_id, pe.id as perfil_id, a.tenant_id
       from facturador_actividades a
       join facturadores f on f.id = a.facturador_id and f.id = $1 and f.deleted_at is null
       join facturador_establecimientos e on e.facturador_id = f.id and e.id = $3 and e.deleted_at is null
       join facturador_puntos_expedicion p on p.establecimiento_id = e.id and p.id = $4 and p.deleted_at is null
       join facturador_perfiles_emision pe on pe.facturador_id = f.id and pe.id = $5 and pe.deleted_at is null
       where a.id = $2 and a.deleted_at is null`,
      [input.facturadorId, input.actividad_id, input.establecimiento_id, input.punto_expedicion_id, input.perfil_emision_id]
    );
    if (!resolved.rows[0]) return null;

    const r = resolved.rows[0];
    const insertResult = await pool.query<{ id: string }>(
      `insert into actividad_punto_perfiles (
         tenant_id, facturador_id, actividad_id, establecimiento_id, punto_expedicion_id, perfil_emision_id,
         timbrado, timbrado_inicio, documento_nro, credito_plazo_dias, alias_operativo, activo
       ) values ($1, $2, $3, $4, $5, $6, $7, $8::date, $9, $10, $11, true)
       returning id`,
      [
        r.tenant_id, input.facturadorId, r.actividad_id, r.establecimiento_id, r.punto_id, r.perfil_id,
        input.timbrado ?? null,
        input.timbrado_inicio ?? null,
        input.documento_nro ?? null,
        input.credito_plazo_dias ?? 30,
        input.alias_operativo ?? null
      ]
    );
    if (!insertResult.rows[0]) return null;
    return this.getContexto(insertResult.rows[0].id);
  }

  async listContextos(facturadorId: string): Promise<BackofficeContextoResponse[]> {
    const result = await pool.query<ContextoRow>(
      `${CONTEXTO_SELECT} where app.facturador_id = $1 and app.deleted_at is null order by a.codigo, e.codigo, p.codigo`,
      [facturadorId]
    );
    return result.rows.map(mapContextoRow);
  }

  async getContexto(id: string): Promise<BackofficeContextoResponse | null> {
    const result = await pool.query<ContextoRow>(
      `${CONTEXTO_SELECT} where app.id = $1 and app.deleted_at is null`,
      [id]
    );
    return result.rows[0] ? mapContextoRow(result.rows[0]) : null;
  }

  async updateContexto(id: string, input: BackofficeContextoUpdateInput): Promise<BackofficeContextoResponse | null> {
    const result = await pool.query<{ id: string }>(
      `update actividad_punto_perfiles
       set timbrado = case when $2::boolean then $3 else timbrado end,
           timbrado_inicio = case when $4::boolean then $5::date else timbrado_inicio end,
           documento_nro = case when $6::boolean then $7 else documento_nro end,
           credito_plazo_dias = coalesce($8, credito_plazo_dias),
           alias_operativo = case when $9::boolean then $10 else alias_operativo end,
           activo = coalesce($11, activo),
           updated_at = now()
       where id = $1 and deleted_at is null returning id`,
      [
        id,
        "timbrado" in input, input.timbrado ?? null,
        "timbrado_inicio" in input, input.timbrado_inicio ?? null,
        "documento_nro" in input, input.documento_nro ?? null,
        input.credito_plazo_dias ?? null,
        "alias_operativo" in input, input.alias_operativo ?? null,
        input.activo ?? null
      ]
    );
    if (!result.rows[0]) return null;
    return this.getContexto(id);
  }

  // ── Usuarios extendidos ───────────────────────────────────────────────────

  async listUsers(query: BackofficeUserListQuery): Promise<BackofficeUserDetailResponse[]> {
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;
    const result = await pool.query<UserDetailRow>(
      `${USER_DETAIL_SELECT}
       where u.deleted_at is null
         and ($1::uuid is null or u.tenant_id = $1::uuid)
         and ($2::uuid is null or uoc.facturador_id = $2::uuid)
         and ($3::text is null or r.codigo = $3)
       order by u.username
       limit $4 offset $5`,
      [query.tenant_id ?? null, query.facturador_id ?? null, query.role ?? null, limit, offset]
    );
    return result.rows.map(mapUserDetailRow);
  }

  async getUserDetail(userId: string): Promise<BackofficeUserDetailResponse | null> {
    const result = await pool.query<UserDetailRow>(
      `${USER_DETAIL_SELECT} where u.id = $1 and u.deleted_at is null`,
      [userId]
    );
    return result.rows[0] ? mapUserDetailRow(result.rows[0]) : null;
  }

  async updateUser(userId: string, input: BackofficeUserUpdateInput): Promise<BackofficeUserDetailResponse | null> {
    const client = await pool.connect();
    try {
      await client.query("begin");
      const updated = await client.query<{ id: string }>(
        `update usuarios
         set display_name = case when $2::boolean then $3 else display_name end,
             activo = coalesce($4, activo),
             updated_at = now()
         where id = $1 and deleted_at is null returning id`,
        [userId, "display_name" in input, input.display_name ?? null, input.activo ?? null]
      );
      if (!updated.rows[0]) { await client.query("rollback"); return null; }

      if (input.role !== undefined) {
        await client.query(`delete from usuario_roles where usuario_id = $1`, [userId]);
        await client.query(
          `insert into usuario_roles (usuario_id, role_id)
           select $1, id from roles where codigo = $2 and activo = true and deleted_at is null`,
          [userId, input.role]
        );
      }
      await client.query("commit");
      const result = await pool.query<UserDetailRow>(
        `${USER_DETAIL_SELECT} where u.id = $1 and u.deleted_at is null`,
        [userId]
      );
      return result.rows[0] ? mapUserDetailRow(result.rows[0]) : null;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async softDeleteUser(userId: string): Promise<boolean> {
    const client = await pool.connect();
    try {
      await client.query("begin");
      const result = await client.query<{ id: string }>(
        `update usuarios set deleted_at = now(), activo = false, updated_at = now()
         where id = $1 and deleted_at is null returning id`,
        [userId]
      );
      if (!result.rows[0]) { await client.query("rollback"); return false; }
      await client.query(
        `update usuario_operacion_config set activo = false, deleted_at = now(), updated_at = now()
         where usuario_id = $1 and activo = true and deleted_at is null`,
        [userId]
      );
      await client.query(
        `update refresh_tokens set revoked_at = now() where usuario_id = $1 and revoked_at is null`,
        [userId]
      );
      await client.query("commit");
      return true;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  // ── Helpers privados ──────────────────────────────────────────────────────

  private async findUserRow(userId: string, client: Queryable = pool): Promise<BackofficeUserRow | null> {
    const result = await client.query<BackofficeUserRow>(
      `select u.id, u.username::text as username, u.display_name,
              coalesce(r.codigo, 'OPERADOR_FACTURACION') as role, u.activo as active
       from usuarios u
       left join usuario_roles ur on ur.usuario_id = u.id
       left join roles r on r.id = ur.role_id and r.activo = true and r.deleted_at is null
       where u.id = $1 and u.deleted_at is null
       order by case r.codigo when 'ADMIN_INTERNO' then 1 when 'SOPORTE_INTERNO' then 2 when 'OPERADOR_FACTURACION' then 3 else 4 end
       limit 1`,
      [userId]
    );
    return result.rows[0] ?? null;
  }

  private async findTenantRow(tenantId: string): Promise<TenantRow | null> {
    const result = await pool.query<TenantRow>(
      `${TENANT_SELECT} where t.id = $1 and t.deleted_at is null`,
      [tenantId]
    );
    return result.rows[0] ?? null;
  }

  private async findOperationConfigRow(userId: string, client: Queryable = pool): Promise<OperationConfigRow | null> {
    const result = await client.query<OperationConfigRow>(
      `select uoc.usuario_id as user_id, uoc.tenant_id, uoc.facturador_id, f.emisor_id,
              e.codigo as establecimiento, p.codigo as punto_expedicion,
              pe.codigo as perfil_emision_codigo, a.codigo as actividad_economica_codigo, uoc.activo as active
       from usuario_operacion_config uoc
       join facturadores f on f.id = uoc.facturador_id
       join actividad_punto_perfiles app on app.id = uoc.actividad_punto_perfil_id
       join facturador_establecimientos e on e.id = app.establecimiento_id
       join facturador_puntos_expedicion p on p.id = app.punto_expedicion_id
       join facturador_perfiles_emision pe on pe.id = app.perfil_emision_id
       join facturador_actividades a on a.id = app.actividad_id
       where uoc.usuario_id = $1 and uoc.activo = true and uoc.deleted_at is null limit 1`,
      [userId]
    );
    return result.rows[0] ?? null;
  }
}

export const backofficeRepository = new PgBackofficeRepository();

function mapOperationConfigRow(row: OperationConfigRow): BackofficeOperationConfigResponse {
  return {
    user_id: row.user_id,
    tenant_id: row.tenant_id,
    facturador_id: row.facturador_id,
    emisor_id: row.emisor_id,
    establecimiento: row.establecimiento,
    punto_expedicion: row.punto_expedicion,
    perfil_emision_codigo: row.perfil_emision_codigo,
    actividad_economica_codigo: row.actividad_economica_codigo,
    active: row.active
  };
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}
