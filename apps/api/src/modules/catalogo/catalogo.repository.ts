import { pool } from "../../db/pool";
import type { CatalogoItem, CatalogoItemListResponse, CatalogoItemPersistInput, CatalogoRepository } from "./catalogo.types";
import { normalizeCodigo } from "./catalogo.utils";

interface CatalogoItemRow {
  id: string;
  codigo: string;
  descripcion: string;
  precio_unitario: number;
  iva_tipo: CatalogoItem["iva_tipo"];
  activo: boolean;
  total_count?: string;
}

export class PgCatalogoRepository implements CatalogoRepository {
  async search(input: { facturadorId: string; q: string; limit: number }): Promise<CatalogoItem[]> {
    const q = input.q.trim();
    const codigoQ = `%${normalizeCodigo(q)}%`;
    const likeQ = `%${q}%`;

    const result = await pool.query<CatalogoItemRow>(
      `
        select id, codigo, descripcion, precio_unitario, iva_tipo, activo
        from catalogo_items
        where facturador_id = $1
          and deleted_at is null
          and activo = true
          and (
            codigo_normalizado ilike $2
            or codigo ilike $3
            or descripcion ilike $3
          )
        order by
          case when codigo_normalizado = $4 then 0 else 1 end,
          descripcion
        limit $5
      `,
      [input.facturadorId, codigoQ, likeQ, normalizeCodigo(q), input.limit]
    );

    return result.rows.map(mapRow);
  }

  async list(input: {
    facturadorId: string;
    q?: string;
    activo?: boolean;
    limit: number;
    offset: number;
  }): Promise<CatalogoItemListResponse> {
    const q = input.q?.trim();
    const likeQ = q ? `%${q}%` : null;
    const codigoQ = q ? `%${normalizeCodigo(q)}%` : null;

    const result = await pool.query<CatalogoItemRow>(
      `
        select
          id,
          codigo,
          descripcion,
          precio_unitario,
          iva_tipo,
          activo,
          count(*) over()::text as total_count
        from catalogo_items
        where facturador_id = $1
          and deleted_at is null
          and ($2::boolean is null or activo = $2)
          and (
            $3::text is null
            or codigo_normalizado ilike $4
            or codigo ilike $3
            or descripcion ilike $3
          )
        order by descripcion
        limit $5 offset $6
      `,
      [input.facturadorId, input.activo ?? null, likeQ, codigoQ, input.limit, input.offset]
    );

    return {
      items: result.rows.map(mapRow),
      total: Number(result.rows[0]?.total_count ?? 0)
    };
  }

  async create(input: {
    tenantId: string;
    facturadorId: string;
    userId: string;
    data: CatalogoItemPersistInput;
  }): Promise<CatalogoItem> {
    const result = await pool.query<CatalogoItemRow>(
      `
        insert into catalogo_items (
          tenant_id,
          facturador_id,
          codigo,
          codigo_normalizado,
          descripcion,
          precio_unitario,
          iva_tipo,
          activo,
          created_by,
          updated_by
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
        returning id, codigo, descripcion, precio_unitario, iva_tipo, activo
      `,
      [
        input.tenantId,
        input.facturadorId,
        input.data.codigo,
        normalizeCodigo(input.data.codigo),
        input.data.descripcion,
        input.data.precio_unitario,
        input.data.iva_tipo,
        input.data.activo,
        input.userId
      ]
    );

    return mapRow(result.rows[0]!);
  }

  async update(input: {
    itemId: string;
    facturadorId: string;
    userId: string;
    data: CatalogoItemPersistInput;
  }): Promise<CatalogoItem | null> {
    const result = await pool.query<CatalogoItemRow>(
      `
        update catalogo_items
        set
          codigo = $3,
          codigo_normalizado = $4,
          descripcion = $5,
          precio_unitario = $6,
          iva_tipo = $7,
          activo = $8,
          updated_by = $9
        where id = $1
          and facturador_id = $2
          and deleted_at is null
        returning id, codigo, descripcion, precio_unitario, iva_tipo, activo
      `,
      [
        input.itemId,
        input.facturadorId,
        input.data.codigo,
        normalizeCodigo(input.data.codigo),
        input.data.descripcion,
        input.data.precio_unitario,
        input.data.iva_tipo,
        input.data.activo,
        input.userId
      ]
    );

    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async existsByCodigo(input: {
    facturadorId: string;
    codigoNormalizado: string;
    excludeItemId?: string;
  }): Promise<boolean> {
    const result = await pool.query<{ exists: boolean }>(
      `
        select exists (
          select 1
          from catalogo_items
          where facturador_id = $1
            and codigo_normalizado = $2
            and deleted_at is null
            and ($3::uuid is null or id <> $3)
        ) as exists
      `,
      [input.facturadorId, input.codigoNormalizado, input.excludeItemId ?? null]
    );

    return result.rows[0]?.exists === true;
  }
}

export const catalogoRepository = new PgCatalogoRepository();

function mapRow(row: CatalogoItemRow): CatalogoItem {
  return {
    id: row.id,
    codigo: row.codigo,
    descripcion: row.descripcion,
    precio_unitario: Number(row.precio_unitario),
    iva_tipo: row.iva_tipo,
    activo: row.activo
  };
}
