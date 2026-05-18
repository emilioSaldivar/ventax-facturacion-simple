import { pool } from "../../db/pool";
import type { OperationalContextRepository, OperationalContextResponse, ReadinessCheck } from "./context.types";

interface ContextRow {
  user_id: string;
  username: string;
  display_name: string | null;
  role: "OPERADOR_FACTURACION" | "SOPORTE_INTERNO" | "ADMIN_INTERNO";
  tenant_id: string;
  tenant_name: string;
  tenant_status: "ACTIVE" | "SUSPENDED" | "CANCELLED";
  facturador_id: string;
  emisor_id: string;
  razon_social: string;
  ruc: string;
  establecimiento: string;
  punto_expedicion: string;
  perfil_emision_codigo: string;
  actividad_economica_codigo: string;
  actividad_economica_descripcion: string | null;
}

interface ReadinessRow {
  tenant_activo: boolean;
  tenant_estado: string;
  suscripcion_activa: boolean;
  usuario_config_activa: boolean;
  facturador_activo: boolean;
  fiscal_context_activo: boolean;
}

export class PgOperationalContextRepository implements OperationalContextRepository {
  async getOperationalContext(userId: string): Promise<OperationalContextResponse | null> {
    const result = await pool.query<ContextRow>(
      `
        select
          u.id as user_id,
          u.username::text as username,
          u.display_name,
          coalesce(r.codigo, 'OPERADOR_FACTURACION') as role,
          t.id as tenant_id,
          t.nombre as tenant_name,
          case t.estado
            when 'ACTIVO' then 'ACTIVE'
            when 'SUSPENDIDO' then 'SUSPENDED'
            else 'CANCELLED'
          end as tenant_status,
          f.id as facturador_id,
          f.emisor_id,
          f.razon_social,
          f.ruc,
          e.codigo as establecimiento,
          p.codigo as punto_expedicion,
          pe.codigo as perfil_emision_codigo,
          a.codigo as actividad_economica_codigo,
          a.descripcion as actividad_economica_descripcion
        from usuarios u
        join tenants t on t.id = u.tenant_id
        left join usuario_roles ur on ur.usuario_id = u.id
        left join roles r on r.id = ur.role_id and r.activo = true and r.deleted_at is null
        join usuario_operacion_config uoc on uoc.usuario_id = u.id
          and uoc.activo = true
          and uoc.deleted_at is null
        join facturadores f on f.id = uoc.facturador_id
          and f.activo = true
          and f.deleted_at is null
        join actividad_punto_perfiles app on app.id = uoc.actividad_punto_perfil_id
          and app.activo = true
          and app.deleted_at is null
        join facturador_actividades a on a.id = app.actividad_id
          and a.activo = true
          and a.deleted_at is null
        join facturador_establecimientos e on e.id = app.establecimiento_id
          and e.activo = true
          and e.deleted_at is null
        join facturador_puntos_expedicion p on p.id = app.punto_expedicion_id
          and p.activo = true
          and p.deleted_at is null
        join facturador_perfiles_emision pe on pe.id = app.perfil_emision_id
          and pe.activo = true
          and pe.deleted_at is null
        where u.id = $1
          and u.activo = true
          and u.deleted_at is null
          and u.bloqueado_at is null
          and t.activo = true
          and t.deleted_at is null
          and t.estado = 'ACTIVO'
          and exists (
            select 1
            from tenant_suscripciones ts
            where ts.tenant_id = t.id
              and ts.activo = true
              and ts.deleted_at is null
              and ts.estado = 'ACTIVA'
              and (ts.fecha_fin is null or ts.fecha_fin >= current_date)
          )
        order by
          case r.codigo
            when 'ADMIN_INTERNO' then 1
            when 'SOPORTE_INTERNO' then 2
            when 'OPERADOR_FACTURACION' then 3
            else 4
          end
        limit 1
      `,
      [userId]
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return {
      user: {
        id: row.user_id,
        username: row.username,
        display_name: row.display_name,
        role: row.role
      },
      tenant: {
        id: row.tenant_id,
        name: row.tenant_name,
        status: row.tenant_status
      },
      facturador: {
        id: row.facturador_id,
        emisor_id: row.emisor_id,
        razon_social: row.razon_social,
        ruc: row.ruc
      },
      fiscal_context: {
        establecimiento: row.establecimiento,
        punto_expedicion: row.punto_expedicion,
        perfil_emision_codigo: row.perfil_emision_codigo,
        actividad_economica_codigo: row.actividad_economica_codigo,
        actividad_economica_descripcion: row.actividad_economica_descripcion
      }
    };
  }

  async getReadinessChecks(userId: string): Promise<ReadinessCheck[]> {
    const result = await pool.query<ReadinessRow>(
      `
        select
          coalesce(t.activo, false) as tenant_activo,
          coalesce(t.estado, 'CANCELADO') as tenant_estado,
          exists (
            select 1
            from tenant_suscripciones ts
            where ts.tenant_id = u.tenant_id
              and ts.activo = true
              and ts.deleted_at is null
              and ts.estado = 'ACTIVA'
              and (ts.fecha_fin is null or ts.fecha_fin >= current_date)
          ) as suscripcion_activa,
          coalesce(uoc.activo, false) and uoc.deleted_at is null as usuario_config_activa,
          coalesce(f.activo, false) and f.deleted_at is null as facturador_activo,
          coalesce(app.activo, false)
            and app.deleted_at is null
            and coalesce(a.activo, false)
            and a.deleted_at is null
            and coalesce(e.activo, false)
            and e.deleted_at is null
            and coalesce(p.activo, false)
            and p.deleted_at is null
            and coalesce(pe.activo, false)
            and pe.deleted_at is null as fiscal_context_activo
        from usuarios u
        left join tenants t on t.id = u.tenant_id and t.deleted_at is null
        left join usuario_operacion_config uoc on uoc.usuario_id = u.id and uoc.deleted_at is null
        left join facturadores f on f.id = uoc.facturador_id
        left join actividad_punto_perfiles app on app.id = uoc.actividad_punto_perfil_id
        left join facturador_actividades a on a.id = app.actividad_id
        left join facturador_establecimientos e on e.id = app.establecimiento_id
        left join facturador_puntos_expedicion p on p.id = app.punto_expedicion_id
        left join facturador_perfiles_emision pe on pe.id = app.perfil_emision_id
        where u.id = $1
          and u.deleted_at is null
        limit 1
      `,
      [userId]
    );

    const row = result.rows[0];
    if (!row) {
      return [
        {
          code: "usuario_activo",
          ok: false,
          message: "Usuario no encontrado o inactivo."
        }
      ];
    }

    return [
      {
        code: "tenant_activo",
        ok: row.tenant_activo && row.tenant_estado === "ACTIVO",
        message: row.tenant_activo && row.tenant_estado === "ACTIVO" ? "Tenant activo." : "Tenant suspendido o inactivo."
      },
      {
        code: "suscripcion_activa",
        ok: row.suscripcion_activa,
        message: row.suscripcion_activa ? "Suscripcion activa." : "No existe suscripcion activa."
      },
      {
        code: "usuario_config_operativa",
        ok: row.usuario_config_activa,
        message: row.usuario_config_activa ? "Usuario con configuracion operativa." : "Falta configuracion operativa del usuario."
      },
      {
        code: "facturador_activo",
        ok: row.facturador_activo,
        message: row.facturador_activo ? "Facturador activo." : "Facturador inactivo o no configurado."
      },
      {
        code: "fiscal_context_local",
        ok: row.fiscal_context_activo,
        message: row.fiscal_context_activo
          ? "Establecimiento, punto, perfil y actividad configurados."
          : "Falta asociacion activa de establecimiento, punto, perfil y actividad."
      }
    ];
  }
}

export const operationalContextRepository = new PgOperationalContextRepository();

