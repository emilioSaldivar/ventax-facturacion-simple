import type { UserSummary } from "@facturacion-simple/shared";
import { pool } from "../../db/pool";
import type { AuthRepository, AuthenticatedUser, LoginUserRecord } from "./auth.types";

interface UserRow {
  id: string;
  tenant_id: string;
  username: string;
  display_name: string | null;
  password_hash: string;
  role: UserSummary["role"];
  activo: boolean;
  bloqueado_at: Date | null;
  failed_login_count: number;
}

export class PgAuthRepository implements AuthRepository {
  async findUserForLogin(username: string): Promise<LoginUserRecord | null> {
    const result = await pool.query<UserRow>(
      `
        select
          u.id,
          u.tenant_id,
          u.username::text as username,
          u.display_name,
          u.password_hash,
          coalesce(r.codigo, 'OPERADOR_FACTURACION') as role,
          u.activo,
          u.bloqueado_at,
          u.failed_login_count
        from usuarios u
        left join usuario_roles ur on ur.usuario_id = u.id
        left join roles r on r.id = ur.role_id and r.activo = true and r.deleted_at is null
        where u.username = $1
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
      [username]
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return {
      id: row.id,
      tenantId: row.tenant_id,
      username: row.username,
      displayName: row.display_name,
      passwordHash: row.password_hash,
      role: row.role,
      activo: row.activo,
      bloqueadoAt: row.bloqueado_at,
      failedLoginCount: row.failed_login_count
    };
  }

  async recordFailedLogin(input: {
    username: string;
    userId?: string;
    ip?: string;
    userAgent?: string;
    reason: string;
    nextFailedCount?: number;
    blockUser?: boolean;
  }): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query("begin");

      if (input.userId && input.nextFailedCount !== undefined) {
        await client.query(
          `
            update usuarios
            set
              failed_login_count = $2,
              bloqueado_at = case when $3 then now() else bloqueado_at end
            where id = $1
          `,
          [input.userId, input.nextFailedCount, input.blockUser === true]
        );
      }

      await client.query(
        `
          insert into login_attempts (username, usuario_id, success, reason, ip, user_agent)
          values ($1, $2, false, $3, $4::inet, $5)
        `,
        [input.username, input.userId ?? null, input.reason, input.ip ?? null, input.userAgent ?? null]
      );

      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async recordSuccessfulLogin(input: { userId: string; username: string; ip?: string; userAgent?: string }): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(
        `
          update usuarios
          set failed_login_count = 0, ultimo_login_at = now()
          where id = $1
        `,
        [input.userId]
      );
      await client.query(
        `
          insert into login_attempts (username, usuario_id, success, reason, ip, user_agent)
          values ($1, $2, true, 'LOGIN_OK', $3::inet, $4)
        `,
        [input.username, input.userId, input.ip ?? null, input.userAgent ?? null]
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async createRefreshToken(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    ip?: string;
    userAgent?: string;
  }): Promise<void> {
    await pool.query(
      `
        insert into refresh_tokens (usuario_id, token_hash, expires_at, created_by_ip, user_agent)
        values ($1, $2, $3, $4::inet, $5)
      `,
      [input.userId, input.tokenHash, input.expiresAt, input.ip ?? null, input.userAgent ?? null]
    );
  }

  async rotateRefreshToken(input: {
    currentTokenHash: string;
    newTokenHash: string;
    newExpiresAt: Date;
    ip?: string;
    userAgent?: string;
  }): Promise<LoginUserRecord | null> {
    const client = await pool.connect();

    try {
      await client.query("begin");

      const currentToken = await client.query<{ id: string; usuario_id: string }>(
        `
          select id, usuario_id
          from refresh_tokens
          where token_hash = $1
            and revoked_at is null
            and expires_at > now()
          for update
        `,
        [input.currentTokenHash]
      );

      const tokenRow = currentToken.rows[0];
      if (!tokenRow) {
        await client.query("rollback");
        return null;
      }

      const userResult = await client.query<UserRow>(
        `
          select
            u.id,
            u.tenant_id,
            u.username::text as username,
            u.display_name,
            u.password_hash,
            coalesce(r.codigo, 'OPERADOR_FACTURACION') as role,
            u.activo,
            u.bloqueado_at,
            u.failed_login_count
          from usuarios u
          left join usuario_roles ur on ur.usuario_id = u.id
          left join roles r on r.id = ur.role_id and r.activo = true and r.deleted_at is null
          where u.id = $1
            and u.deleted_at is null
            and u.activo = true
            and u.bloqueado_at is null
          order by
            case r.codigo
              when 'ADMIN_INTERNO' then 1
              when 'SOPORTE_INTERNO' then 2
              when 'OPERADOR_FACTURACION' then 3
              else 4
            end
          limit 1
        `,
        [tokenRow.usuario_id]
      );

      const userRow = userResult.rows[0];
      if (!userRow) {
        await client.query("update refresh_tokens set revoked_at = now() where id = $1", [tokenRow.id]);
        await client.query("commit");
        return null;
      }

      const newToken = await client.query<{ id: string }>(
        `
          insert into refresh_tokens (usuario_id, token_hash, expires_at, created_by_ip, user_agent)
          values ($1, $2, $3, $4::inet, $5)
          returning id
        `,
        [userRow.id, input.newTokenHash, input.newExpiresAt, input.ip ?? null, input.userAgent ?? null]
      );

      await client.query(
        `
          update refresh_tokens
          set revoked_at = now(), replaced_by_token_id = $2
          where id = $1
        `,
        [tokenRow.id, newToken.rows[0]?.id]
      );

      await client.query("commit");

      return mapUserRow(userRow);
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async revokeRefreshToken(input: { tokenHash: string }): Promise<boolean> {
    const result = await pool.query(
      `
        update refresh_tokens
        set revoked_at = now()
        where token_hash = $1
          and revoked_at is null
      `,
      [input.tokenHash]
    );

    return (result.rowCount ?? 0) > 0;
  }

  async findActiveUserById(userId: string): Promise<AuthenticatedUser | null> {
    const result = await pool.query<Pick<UserRow, "id" | "tenant_id" | "username" | "role">>(
      `
        select
          u.id,
          u.tenant_id,
          u.username::text as username,
          coalesce(r.codigo, 'OPERADOR_FACTURACION') as role
        from usuarios u
        left join usuario_roles ur on ur.usuario_id = u.id
        left join roles r on r.id = ur.role_id and r.activo = true and r.deleted_at is null
        where u.id = $1
          and u.deleted_at is null
          and u.activo = true
          and u.bloqueado_at is null
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
      id: row.id,
      tenantId: row.tenant_id,
      username: row.username,
      role: row.role
    };
  }
}

export const authRepository = new PgAuthRepository();

function mapUserRow(row: UserRow): LoginUserRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    username: row.username,
    displayName: row.display_name,
    passwordHash: row.password_hash,
    role: row.role,
    activo: row.activo,
    bloqueadoAt: row.bloqueado_at,
    failedLoginCount: row.failed_login_count
  };
}
