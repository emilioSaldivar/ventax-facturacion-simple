import { pool } from "../../db/pool";
import type {
  ClienteListResponse,
  ClienteRepository,
  ClienteResponse,
  ClienteSearchResult,
  DocumentoIdentidadTipo
} from "./clientes.types";
import { normalizeDocumento } from "./clientes.utils";

interface ClienteRow {
  source: "AGENDA_FACTURADOR" | "IDENTIDAD_COMPARTIDA";
  cliente_id: string | null;
  documento_tipo: DocumentoIdentidadTipo;
  documento: string;
  razon_social: string;
  direccion: string | null;
  telefono: string | null;
  email: string | null;
  activo?: boolean;
  total_count?: string;
}

export class PgClienteRepository implements ClienteRepository {
  async search(input: { tenantId: string; facturadorId: string; q: string; limit: number }): Promise<ClienteSearchResult[]> {
    const q = input.q.trim();
    const documentoQ = normalizeDocumento(q);
    const likeQ = `%${q}%`;
    const likeDoc = `%${documentoQ}%`;

    const result = await pool.query<ClienteRow>(
      `
        with agenda as (
          select
            'AGENDA_FACTURADOR'::text as source,
            fc.id as cliente_id,
            ci.documento_tipo,
            ci.documento,
            fc.razon_social,
            fc.direccion,
            fc.telefono,
            fc.email::text as email,
            1 as priority
          from facturador_clientes fc
          join cliente_identidades ci on ci.id = fc.cliente_identidad_id
            and ci.deleted_at is null
            and ci.activo = true
          where fc.facturador_id = $1
            and fc.deleted_at is null
            and fc.activo = true
            and (
              ci.documento_normalizado ilike $2
              or ci.documento ilike $3
              or fc.razon_social ilike $3
            )
        ),
        compartida as (
          select
            'IDENTIDAD_COMPARTIDA'::text as source,
            null::uuid as cliente_id,
            ci.documento_tipo,
            ci.documento,
            ci.razon_social,
            ci.direccion,
            ci.telefono,
            ci.email::text as email,
            2 as priority
          from cliente_identidades ci
          where ci.deleted_at is null
            and ci.activo = true
            and (
              ci.documento_normalizado ilike $2
              or ci.documento ilike $3
              or ci.razon_social ilike $3
            )
            and not exists (
              select 1
              from facturador_clientes fc
              where fc.facturador_id = $1
                and fc.cliente_identidad_id = ci.id
                and fc.deleted_at is null
                and fc.activo = true
            )
        )
        select * from (
          select * from agenda
          union all
          select * from compartida
        ) results
        order by priority, razon_social
        limit $4
      `,
      [input.facturadorId, likeDoc, likeQ, input.limit]
    );

    return result.rows.map(mapSearchRow);
  }

  async list(input: { facturadorId: string; q?: string; limit: number; offset: number }): Promise<ClienteListResponse> {
    const q = input.q?.trim();
    const documentoQ = q ? normalizeDocumento(q) : "";
    const likeQ = q ? `%${q}%` : null;
    const likeDoc = q ? `%${documentoQ}%` : null;

    const result = await pool.query<ClienteRow>(
      `
        select
          'AGENDA_FACTURADOR'::text as source,
          fc.id as cliente_id,
          ci.documento_tipo,
          ci.documento,
          fc.razon_social,
          fc.direccion,
          fc.telefono,
          fc.email::text as email,
          fc.activo,
          count(*) over()::text as total_count
        from facturador_clientes fc
        join cliente_identidades ci on ci.id = fc.cliente_identidad_id
          and ci.deleted_at is null
        where fc.facturador_id = $1
          and fc.deleted_at is null
          and (
            $2::text is null
            or ci.documento_normalizado ilike $3
            or ci.documento ilike $2
            or fc.razon_social ilike $2
          )
        order by fc.razon_social
        limit $4 offset $5
      `,
      [input.facturadorId, likeQ, likeDoc, input.limit, input.offset]
    );

    return {
      items: result.rows.map(mapResponseRow),
      total: Number(result.rows[0]?.total_count ?? 0)
    };
  }

  async findByIdForFacturador(input: { clienteId: string; facturadorId: string }): Promise<ClienteResponse | null> {
    const result = await pool.query<ClienteRow>(
      `
        select
          'AGENDA_FACTURADOR'::text as source,
          fc.id as cliente_id,
          ci.documento_tipo,
          ci.documento,
          fc.razon_social,
          fc.direccion,
          fc.telefono,
          fc.email::text as email,
          fc.activo
        from facturador_clientes fc
        join cliente_identidades ci on ci.id = fc.cliente_identidad_id
          and ci.deleted_at is null
        where fc.id = $1
          and fc.facturador_id = $2
          and fc.deleted_at is null
          and fc.activo = true
        limit 1
      `,
      [input.clienteId, input.facturadorId]
    );

    return result.rows[0] ? mapResponseRow(result.rows[0]) : null;
  }

  async upsertForFacturador(input: {
    tenantId: string;
    facturadorId: string;
    userId: string;
    data: Parameters<ClienteRepository["upsertForFacturador"]>[0]["data"];
  }): Promise<ClienteResponse> {
    const client = await pool.connect();
    const documentoNormalizado = normalizeDocumento(input.data.documento);

    try {
      await client.query("begin");

      const identidad = await client.query<{ id: string }>(
        `
          insert into cliente_identidades (
            documento_tipo,
            documento,
            documento_normalizado,
            razon_social,
            direccion,
            telefono,
            email
          )
          values ($1, $2, $3, $4, $5, $6, $7)
          on conflict (documento_tipo, documento_normalizado)
            where deleted_at is null
          do update set
            documento = excluded.documento,
            razon_social = excluded.razon_social,
            direccion = coalesce(excluded.direccion, cliente_identidades.direccion),
            telefono = coalesce(excluded.telefono, cliente_identidades.telefono),
            email = coalesce(excluded.email, cliente_identidades.email),
            activo = true
          returning id
        `,
        [
          input.data.documento_tipo,
          input.data.documento.trim(),
          documentoNormalizado,
          input.data.razon_social.trim(),
          input.data.direccion ?? null,
          input.data.telefono ?? null,
          input.data.email ?? null
        ]
      );

      const identidadId = identidad.rows[0]!.id;
      const agenda = await client.query<ClienteRow>(
        `
          insert into facturador_clientes (
            tenant_id,
            facturador_id,
            cliente_identidad_id,
            razon_social,
            direccion,
            telefono,
            email,
            created_by,
            updated_by
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $8)
          on conflict (facturador_id, cliente_identidad_id)
            where deleted_at is null
          do update set
            razon_social = excluded.razon_social,
            direccion = excluded.direccion,
            telefono = excluded.telefono,
            email = excluded.email,
            activo = true,
            updated_by = excluded.updated_by
          returning
            'AGENDA_FACTURADOR'::text as source,
            id as cliente_id,
            $9::text as documento_tipo,
            $10::text as documento,
            razon_social,
            direccion,
            telefono,
            email::text as email,
            activo
        `,
        [
          input.tenantId,
          input.facturadorId,
          identidadId,
          input.data.razon_social.trim(),
          input.data.direccion ?? null,
          input.data.telefono ?? null,
          input.data.email ?? null,
          input.userId,
          input.data.documento_tipo,
          input.data.documento.trim()
        ]
      );

      await client.query("commit");
      return mapResponseRow(agenda.rows[0]!);
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async updateForFacturador(input: {
    clienteId: string;
    facturadorId: string;
    userId: string;
    data: Parameters<ClienteRepository["updateForFacturador"]>[0]["data"];
  }): Promise<ClienteResponse | null> {
    const client = await pool.connect();
    const documentoNormalizado = normalizeDocumento(input.data.documento);

    try {
      await client.query("begin");

      const current = await client.query<{ cliente_identidad_id: string }>(
        `
          select cliente_identidad_id
          from facturador_clientes
          where id = $1
            and facturador_id = $2
            and deleted_at is null
          for update
        `,
        [input.clienteId, input.facturadorId]
      );

      if (!current.rowCount) {
        await client.query("rollback");
        return null;
      }

      const identidad = await client.query<{ id: string }>(
        `
          insert into cliente_identidades (
            documento_tipo,
            documento,
            documento_normalizado,
            razon_social,
            direccion,
            telefono,
            email
          )
          values ($1, $2, $3, $4, $5, $6, $7)
          on conflict (documento_tipo, documento_normalizado)
            where deleted_at is null
          do update set
            documento = excluded.documento,
            razon_social = excluded.razon_social,
            direccion = coalesce(excluded.direccion, cliente_identidades.direccion),
            telefono = coalesce(excluded.telefono, cliente_identidades.telefono),
            email = coalesce(excluded.email, cliente_identidades.email),
            activo = true
          returning id
        `,
        [
          input.data.documento_tipo,
          input.data.documento.trim(),
          documentoNormalizado,
          input.data.razon_social.trim(),
          input.data.direccion ?? null,
          input.data.telefono ?? null,
          input.data.email ?? null
        ]
      );

      const result = await client.query<ClienteRow>(
        `
          update facturador_clientes fc
          set
            cliente_identidad_id = $3,
            razon_social = $4,
            direccion = $5,
            telefono = $6,
            email = $7,
            activo = true,
            updated_by = $8
          from cliente_identidades ci
          where fc.id = $1
            and fc.facturador_id = $2
            and fc.deleted_at is null
            and ci.id = $3
          returning
            'AGENDA_FACTURADOR'::text as source,
            fc.id as cliente_id,
            ci.documento_tipo,
            ci.documento,
            fc.razon_social,
            fc.direccion,
            fc.telefono,
            fc.email::text as email,
            fc.activo
        `,
        [
          input.clienteId,
          input.facturadorId,
          identidad.rows[0]!.id,
          input.data.razon_social.trim(),
          input.data.direccion ?? null,
          input.data.telefono ?? null,
          input.data.email ?? null,
          input.userId
        ]
      );

      await client.query("commit");
      return result.rows[0] ? mapResponseRow(result.rows[0]) : null;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
}

export const clienteRepository = new PgClienteRepository();

function mapSearchRow(row: ClienteRow): ClienteSearchResult {
  return {
    source: row.source,
    cliente_id: row.cliente_id,
    documento_tipo: row.documento_tipo,
    documento: row.documento,
    razon_social: row.razon_social,
    direccion: row.direccion,
    telefono: row.telefono,
    email: row.email
  };
}

function mapResponseRow(row: ClienteRow): ClienteResponse {
  return {
    ...mapSearchRow(row),
    source: "AGENDA_FACTURADOR",
    cliente_id: row.cliente_id!,
    activo: row.activo ?? true
  };
}
