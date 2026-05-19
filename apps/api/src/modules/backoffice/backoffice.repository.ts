import type { UserSummary } from "@facturacion-simple/shared";
import { pool } from "../../db/pool";
import { HttpError } from "../../shared/errors/http-error";
import type { BackofficeOperationConfigResponse, BackofficeRepository, BackofficeUserResponse } from "./backoffice.types";

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

interface Queryable {
  query<T>(queryText: string, values?: unknown[]): Promise<{ rows: T[] }>;
}

export class PgBackofficeRepository implements BackofficeRepository {
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
        `
          insert into usuarios (tenant_id, username, display_name, password_hash)
          values ($1, $2, $3, $4)
          returning id
        `,
        [input.tenantId, input.username, input.displayName, input.passwordHash]
      );
      const userId = userResult.rows[0]!.id;

      await client.query(
        `
          insert into usuario_roles (usuario_id, role_id)
          select $1, id
          from roles
          where codigo = $2
            and activo = true
            and deleted_at is null
        `,
        [userId, input.role]
      );

      const row = await this.findUserRow(userId, client);
      await client.query("commit");

      return mapUserRow(row!);
    } catch (error) {
      await client.query("rollback");
      if (isUniqueViolation(error)) {
        throw new HttpError(409, "CONFLICT", "Username ya existe.");
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async resetPassword(input: {
    userId: string;
    passwordHash: string;
  }): Promise<Omit<BackofficeUserResponse, "temporary_password"> | null> {
    const client = await pool.connect();

    try {
      await client.query("begin");

      const updated = await client.query<{ id: string }>(
        `
          update usuarios
          set
            password_hash = $2,
            failed_login_count = 0,
            bloqueado_at = null,
            activo = true,
            updated_at = now()
          where id = $1
            and deleted_at is null
          returning id
        `,
        [input.userId, input.passwordHash]
      );

      if (!updated.rows[0]) {
        await client.query("rollback");
        return null;
      }

      await client.query(
        `
          update refresh_tokens
          set revoked_at = now()
          where usuario_id = $1
            and revoked_at is null
        `,
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

  async assignOperationConfig(input: Parameters<BackofficeRepository["assignOperationConfig"]>[0]): Promise<BackofficeOperationConfigResponse | null> {
    const client = await pool.connect();

    try {
      await client.query("begin");

      const resolved = await client.query<{ usuario_id: string; tenant_id: string; facturador_id: string; actividad_punto_perfil_id: string }>(
        `
          select
            u.id as usuario_id,
            u.tenant_id,
            f.id as facturador_id,
            app.id as actividad_punto_perfil_id
          from usuarios u
          join facturadores f on f.id = $3
            and f.tenant_id = u.tenant_id
            and f.tenant_id = $2
            and f.emisor_id = $4
            and f.activo = true
            and f.deleted_at is null
          join actividad_punto_perfiles app on app.facturador_id = f.id
            and app.tenant_id = f.tenant_id
            and app.activo = true
            and app.deleted_at is null
          join facturador_establecimientos e on e.id = app.establecimiento_id
            and e.codigo = $5
            and e.activo = true
            and e.deleted_at is null
          join facturador_puntos_expedicion p on p.id = app.punto_expedicion_id
            and p.codigo = $6
            and p.activo = true
            and p.deleted_at is null
          join facturador_perfiles_emision pe on pe.id = app.perfil_emision_id
            and pe.codigo = $7
            and pe.activo = true
            and pe.deleted_at is null
          join facturador_actividades a on a.id = app.actividad_id
            and a.codigo = $8
            and a.activo = true
            and a.deleted_at is null
          where u.id = $1
            and u.tenant_id = $2
            and u.activo = true
            and u.deleted_at is null
          limit 1
        `,
        [
          input.userId,
          input.data.tenant_id,
          input.data.facturador_id,
          input.data.emisor_id,
          input.data.establecimiento,
          input.data.punto_expedicion,
          input.data.perfil_emision_codigo,
          input.data.actividad_economica_codigo
        ]
      );

      const match = resolved.rows[0];
      if (!match) {
        await client.query("rollback");
        return null;
      }

      await client.query(
        `
          update usuario_operacion_config
          set activo = false, updated_at = now()
          where usuario_id = $1
            and activo = true
            and deleted_at is null
        `,
        [input.userId]
      );

      await client.query(
        `
          insert into usuario_operacion_config (
            tenant_id,
            usuario_id,
            facturador_id,
            actividad_punto_perfil_id,
            activo
          )
          values ($1, $2, $3, $4, true)
        `,
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

  private async findUserRow(userId: string, client: Queryable = pool): Promise<BackofficeUserRow | null> {
    const result = await client.query<BackofficeUserRow>(
      `
        select
          u.id,
          u.username::text as username,
          u.display_name,
          coalesce(r.codigo, 'OPERADOR_FACTURACION') as role,
          u.activo as active
        from usuarios u
        left join usuario_roles ur on ur.usuario_id = u.id
        left join roles r on r.id = ur.role_id and r.activo = true and r.deleted_at is null
        where u.id = $1
          and u.deleted_at is null
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

    return result.rows[0] ?? null;
  }

  private async findOperationConfigRow(userId: string, client: Queryable = pool): Promise<OperationConfigRow | null> {
    const result = await client.query<OperationConfigRow>(
      `
        select
          uoc.usuario_id as user_id,
          uoc.tenant_id,
          uoc.facturador_id,
          f.emisor_id,
          e.codigo as establecimiento,
          p.codigo as punto_expedicion,
          pe.codigo as perfil_emision_codigo,
          a.codigo as actividad_economica_codigo,
          uoc.activo as active
        from usuario_operacion_config uoc
        join facturadores f on f.id = uoc.facturador_id
        join actividad_punto_perfiles app on app.id = uoc.actividad_punto_perfil_id
        join facturador_establecimientos e on e.id = app.establecimiento_id
        join facturador_puntos_expedicion p on p.id = app.punto_expedicion_id
        join facturador_perfiles_emision pe on pe.id = app.perfil_emision_id
        join facturador_actividades a on a.id = app.actividad_id
        where uoc.usuario_id = $1
          and uoc.activo = true
          and uoc.deleted_at is null
        limit 1
      `,
      [userId]
    );

    return result.rows[0] ?? null;
  }
}

export const backofficeRepository = new PgBackofficeRepository();

function mapUserRow(row: BackofficeUserRow): Omit<BackofficeUserResponse, "temporary_password"> {
  return {
    id: row.id,
    username: row.username,
    display_name: row.display_name,
    role: row.role,
    active: row.active
  };
}

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
