import { pool } from "../../db/pool";
import type {
  ClienteListResponse,
  ClienteNaturaleza,
  ClienteRepository,
  ClienteResponse,
  ClienteSearchResult,
  DocumentoIdentidadTipo
} from "./clientes.types";
import { normalizeDocumento } from "./clientes.utils";
import type { DomicilioReceptor } from "../../shared/validation/receptor";

interface ClienteRow {
  source: "AGENDA_FACTURADOR" | "IDENTIDAD_COMPARTIDA";
  cliente_id: string | null;
  documento_tipo: DocumentoIdentidadTipo;
  documento: string;
  razon_social: string;
  direccion: string | null;
  telefono: string | null;
  email: string | null;
  naturaleza: ClienteNaturaleza;
  numero_casa?: string | null;
  departamento?: number | null;
  departamento_descripcion?: string | null;
  distrito?: number | null;
  distrito_descripcion?: string | null;
  ciudad?: number | null;
  ciudad_descripcion?: string | null;
  activo?: boolean;
  total_count?: string;
}

interface DnitRow {
  ruc_sin_dv: string;
  dv: string;
  ruc: string;
  nombre: string | null;
  apellido: string | null;
  razon_social: string;
  codigo_dnit: string | null;
  estado: string | null;
}

/**
 * SPEC_DIRECCION_RECEPTOR_v0.1: el domicilio se escribe solo si el pedido lo trae (alguno de sus campos definido);
 * si no, se conserva el guardado. Devuelve [traeDomicilio, numero_casa, departamento, departamento_descripcion,
 * distrito, distrito_descripcion, ciudad, ciudad_descripcion].
 */
function parametrosDomicilio(data: DomicilioReceptor): unknown[] {
  const campos = [
    data.numero_casa,
    data.departamento,
    data.departamento_descripcion,
    data.distrito,
    data.distrito_descripcion,
    data.ciudad,
    data.ciudad_descripcion
  ];
  return [campos.some((v) => v !== undefined), ...campos.map((v) => v ?? null)];
}

const COLUMNAS_DOMICILIO_RETORNO = `numero_casa, departamento, departamento_descripcion, distrito, distrito_descripcion, ciudad, ciudad_descripcion`;

export class PgClienteRepository implements ClienteRepository {
  async findDnitByDocumento(input: {
    documentoTipo: "RUC" | "CI";
    rucSinDv: string;
    dv?: string;
  }): Promise<{
    status: "FOUND" | "NOT_FOUND" | "AMBIGUOUS";
    item?: DnitRow;
  }> {
    if (input.dv) {
      const result = await pool.query<DnitRow>(
        `
          select ruc_sin_dv, dv, ruc, nombre, apellido, razon_social, codigo_dnit, estado
          from dnit_ruc_contribuyentes
          where ruc_sin_dv = $1
            and dv = $2
          limit 1
        `,
        [input.rucSinDv, input.dv]
      );

      if (!result.rows[0]) {
        return { status: "NOT_FOUND" };
      }

      return { status: "FOUND", item: result.rows[0] };
    }

    const result = await pool.query<DnitRow>(
      `
        select ruc_sin_dv, dv, ruc, nombre, apellido, razon_social, codigo_dnit, estado
        from dnit_ruc_contribuyentes
        where ruc_sin_dv = $1
        order by updated_at desc
        limit 2
      `,
      [input.rucSinDv]
    );

    if (result.rows.length === 0) {
      return { status: "NOT_FOUND" };
    }

    if (result.rows.length > 1) {
      return { status: "AMBIGUOUS" };
    }

    return { status: "FOUND", item: result.rows[0] };
  }

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
            fc.naturaleza,
            fc.numero_casa,
            fc.departamento,
            fc.departamento_descripcion,
            fc.distrito,
            fc.distrito_descripcion,
            fc.ciudad,
            fc.ciudad_descripcion,
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
            -- Datos de contacto de otro facturador: nunca salen de su agenda.
            null::text as direccion,
            null::text as telefono,
            null::text as email,
            ci.naturaleza,
            null::text as numero_casa,
            null::integer as departamento,
            null::text as departamento_descripcion,
            null::integer as distrito,
            null::text as distrito_descripcion,
            null::integer as ciudad,
            null::text as ciudad_descripcion,
            2 as priority
          from cliente_identidades ci
          where ci.deleted_at is null
            and ci.activo = true
            -- Solo documento exacto (SPEC_BUSQUEDA_CLIENTES_ENTRE_FACTURADORES RN-02): por
            -- fragmento o por nombre, cualquiera listaria clientes de otros facturadores.
            and ci.documento_normalizado = $5
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
      [input.facturadorId, likeDoc, likeQ, input.limit, documentoQ]
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
          fc.naturaleza,
          fc.numero_casa,
          fc.departamento,
          fc.departamento_descripcion,
          fc.distrito,
          fc.distrito_descripcion,
          fc.ciudad,
          fc.ciudad_descripcion,
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
          fc.naturaleza,
          fc.numero_casa,
          fc.departamento,
          fc.departamento_descripcion,
          fc.distrito,
          fc.distrito_descripcion,
          fc.ciudad,
          fc.ciudad_descripcion,
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
            email,
            naturaleza
          )
          values ($1, $2, $3, $4, $5, $6, $7, coalesce($8, 'FISICA'))
          on conflict (documento_tipo, documento_normalizado)
            where deleted_at is null
          do update set
            documento = excluded.documento,
            razon_social = excluded.razon_social,
            direccion = coalesce(excluded.direccion, cliente_identidades.direccion),
            telefono = coalesce(excluded.telefono, cliente_identidades.telefono),
            email = coalesce(excluded.email, cliente_identidades.email),
            naturaleza = coalesce($8, cliente_identidades.naturaleza),
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
          input.data.email ?? null,
          input.data.naturaleza ?? null
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
            naturaleza,
            created_by,
            updated_by,
            numero_casa,
            departamento,
            departamento_descripcion,
            distrito,
            distrito_descripcion,
            ciudad,
            ciudad_descripcion
          )
          values ($1, $2, $3, $4, $5, $6, $7, coalesce($8, 'FISICA'), $9, $9, $13, $14, $15, $16, $17, $18, $19)
          on conflict (facturador_id, cliente_identidad_id)
            where deleted_at is null
          do update set
            razon_social = excluded.razon_social,
            direccion = excluded.direccion,
            telefono = excluded.telefono,
            email = excluded.email,
            naturaleza = coalesce($8, facturador_clientes.naturaleza),
            numero_casa = case when $12 then excluded.numero_casa else facturador_clientes.numero_casa end,
            departamento = case when $12 then excluded.departamento else facturador_clientes.departamento end,
            departamento_descripcion = case when $12 then excluded.departamento_descripcion else facturador_clientes.departamento_descripcion end,
            distrito = case when $12 then excluded.distrito else facturador_clientes.distrito end,
            distrito_descripcion = case when $12 then excluded.distrito_descripcion else facturador_clientes.distrito_descripcion end,
            ciudad = case when $12 then excluded.ciudad else facturador_clientes.ciudad end,
            ciudad_descripcion = case when $12 then excluded.ciudad_descripcion else facturador_clientes.ciudad_descripcion end,
            activo = true,
            updated_by = excluded.updated_by
          returning
            'AGENDA_FACTURADOR'::text as source,
            id as cliente_id,
            $10::text as documento_tipo,
            $11::text as documento,
            razon_social,
            direccion,
            telefono,
            email::text as email,
            naturaleza,
            ${COLUMNAS_DOMICILIO_RETORNO},
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
          input.data.naturaleza ?? null,
          input.userId,
          input.data.documento_tipo,
          input.data.documento.trim(),
          ...parametrosDomicilio(input.data)
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
            email,
            naturaleza
          )
          values ($1, $2, $3, $4, $5, $6, $7, coalesce($8, 'FISICA'))
          on conflict (documento_tipo, documento_normalizado)
            where deleted_at is null
          do update set
            documento = excluded.documento,
            razon_social = excluded.razon_social,
            direccion = coalesce(excluded.direccion, cliente_identidades.direccion),
            telefono = coalesce(excluded.telefono, cliente_identidades.telefono),
            email = coalesce(excluded.email, cliente_identidades.email),
            naturaleza = coalesce($8, cliente_identidades.naturaleza),
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
          input.data.email ?? null,
          input.data.naturaleza ?? null
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
            naturaleza = coalesce($9, fc.naturaleza),
            numero_casa = case when $10 then $11 else fc.numero_casa end,
            departamento = case when $10 then $12::integer else fc.departamento end,
            departamento_descripcion = case when $10 then $13 else fc.departamento_descripcion end,
            distrito = case when $10 then $14::integer else fc.distrito end,
            distrito_descripcion = case when $10 then $15 else fc.distrito_descripcion end,
            ciudad = case when $10 then $16::integer else fc.ciudad end,
            ciudad_descripcion = case when $10 then $17 else fc.ciudad_descripcion end,
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
            fc.naturaleza,
            fc.numero_casa,
            fc.departamento,
            fc.departamento_descripcion,
            fc.distrito,
            fc.distrito_descripcion,
            fc.ciudad,
            fc.ciudad_descripcion,
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
          input.userId,
          input.data.naturaleza ?? null,
          ...parametrosDomicilio(input.data)
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

  async deleteForFacturador(input: { clienteId: string; facturadorId: string; userId: string }): Promise<boolean> {
    const result = await pool.query<{ cliente_id: string }>(
      `
        update facturador_clientes
        set
          activo = false,
          deleted_at = now(),
          updated_by = $3
        where id = $1
          and facturador_id = $2
          and deleted_at is null
        returning id as cliente_id
      `,
      [input.clienteId, input.facturadorId, input.userId]
    );

    return (result.rowCount ?? 0) > 0;
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
    email: row.email,
    naturaleza: row.naturaleza,
    numero_casa: row.numero_casa ?? null,
    departamento: row.departamento ?? null,
    departamento_descripcion: row.departamento_descripcion ?? null,
    distrito: row.distrito ?? null,
    distrito_descripcion: row.distrito_descripcion ?? null,
    ciudad: row.ciudad ?? null,
    ciudad_descripcion: row.ciudad_descripcion ?? null
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
