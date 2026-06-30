import type { PoolClient } from "pg";
import { pool } from "../../db/pool.js";
import { HttpError } from "../../shared/errors/http-error.js";
import type {
  FacturadorParaPdf,
  NotaConItems,
  NotaCreateInput,
  NotaEstadoComercial,
  NotaFilaRecord,
  NotaListFilters,
  NotaListResponse,
  NotaRecord,
  NotasRepository,
  NotaUpdateInput,
} from "./notas.types.js";

function calcularTotal(items: NotaFilaRecord[]): number {
  return items.reduce((acc, it) => acc + (it.precio_total ?? 0), 0);
}

/** pg devuelve date como Date object o string "YYYY-MM-DD" dependiendo de la versión. */
function toIsoDate(val: unknown): string | null {
  if (!val) return null;
  if (val instanceof Date) {
    const y = val.getUTCFullYear();
    const m = String(val.getUTCMonth() + 1).padStart(2, "0");
    const d = String(val.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const s = String(val);
  const match = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

function rowToRecord(row: Record<string, unknown>): NotaRecord {
  return {
    id: row.id as string,
    facturador_id: row.facturador_id as string,
    tipo: row.tipo as NotaRecord["tipo"],
    numero: row.numero != null ? Number(row.numero) : null,
    estado: row.estado as NotaRecord["estado"],
    estado_comercial: (row.estado_comercial ?? null) as NotaRecord["estado_comercial"],
    fecha_emision: toIsoDate(row.fecha_emision),
    valido_hasta: toIsoDate(row.valido_hasta),
    cliente_nombre: row.cliente_nombre as string,
    cliente_ruc: (row.cliente_ruc ?? null) as string | null,
    observaciones: (row.observaciones ?? null) as string | null,
    verification_token: row.verification_token as string,
    emitido_at: row.emitido_at ? String(row.emitido_at) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function rowToFila(row: Record<string, unknown>): NotaFilaRecord {
  return {
    id: row.id as string,
    nota_id: row.nota_id as string,
    orden: Number(row.orden),
    fila_tipo: row.fila_tipo as NotaFilaRecord["fila_tipo"],
    descripcion: row.descripcion as string,
    cantidad: row.cantidad != null ? Number(row.cantidad) : null,
    precio_unitario: row.precio_unitario != null ? Number(row.precio_unitario) : null,
    precio_total: row.precio_total != null ? Number(row.precio_total) : null,
    catalog_item_id: (row.catalog_item_id ?? null) as string | null,
    catalog_iva_tipo: (row.catalog_iva_tipo ?? null) as string | null,
  };
}

async function fetchItems(notaId: string): Promise<NotaFilaRecord[]> {
  const result = await pool.query(
    `SELECT ni.id, ni.nota_id, ni.orden, ni.fila_tipo, ni.descripcion,
            ni.cantidad, ni.precio_unitario, ni.precio_total,
            ni.catalog_item_id, ci.iva_tipo AS catalog_iva_tipo
     FROM notas_comerciales_items ni
     LEFT JOIN catalogo_items ci ON ci.id = ni.catalog_item_id
     WHERE ni.nota_id = $1
     ORDER BY ni.orden ASC`,
    [notaId]
  );
  return result.rows.map(rowToFila);
}

async function insertItems(
  client: PoolClient,
  notaId: string,
  items: NotaCreateInput["items"]
): Promise<void> {
  for (const item of items) {
    const precioTotal =
      item.fila_tipo === "ITEM" && item.cantidad != null && item.precio_unitario != null
        ? item.cantidad * item.precio_unitario
        : null;
    await client.query(
      `INSERT INTO notas_comerciales_items
         (nota_id, orden, fila_tipo, descripcion, cantidad, precio_unitario, precio_total, catalog_item_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        notaId,
        item.orden,
        item.fila_tipo,
        item.descripcion,
        item.fila_tipo === "ITEM" ? (item.cantidad ?? null) : null,
        item.fila_tipo === "ITEM" ? (item.precio_unitario ?? null) : null,
        precioTotal,
        item.catalog_item_id ?? null,
      ]
    );
  }
}

export class PgNotasRepository implements NotasRepository {
  async create(facturadorId: string, input: NotaCreateInput): Promise<NotaConItems> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const notaResult = await client.query(
        `INSERT INTO notas_comerciales
           (facturador_id, tipo, cliente_nombre, cliente_ruc, valido_hasta, observaciones)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          facturadorId,
          input.tipo,
          input.cliente_nombre,
          input.cliente_ruc ?? null,
          input.valido_hasta ?? null,
          input.observaciones ?? null,
        ]
      );
      const nota = notaResult.rows[0] as Record<string, unknown>;

      if (input.items.length > 0) {
        await insertItems(client, nota.id as string, input.items);
      }

      await client.query("COMMIT");

      const items = await fetchItems(nota.id as string);
      const record = rowToRecord(nota);
      return { ...record, items, total: calcularTotal(items) };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async findById(id: string, facturadorId: string): Promise<NotaConItems | null> {
    const result = await pool.query(
      `SELECT * FROM notas_comerciales
       WHERE id = $1 AND facturador_id = $2 AND deleted_at IS NULL`,
      [id, facturadorId]
    );
    if (!result.rows[0]) return null;
    const record = rowToRecord(result.rows[0] as Record<string, unknown>);
    const items = await fetchItems(record.id);
    return { ...record, items, total: calcularTotal(items) };
  }

  async list(facturadorId: string, filters: NotaListFilters): Promise<NotaListResponse> {
    const conditions: string[] = ["facturador_id = $1", "deleted_at IS NULL"];
    const params: unknown[] = [facturadorId];
    let idx = 2;

    if (filters.tipo) {
      conditions.push(`tipo = $${idx++}`);
      params.push(filters.tipo);
    }

    const where = conditions.join(" AND ");

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM notas_comerciales WHERE ${where}`,
      params
    );
    const total = Number(countResult.rows[0].count);

    params.push(filters.limit, filters.offset);
    const dataResult = await pool.query(
      `SELECT * FROM notas_comerciales
       WHERE ${where}
       ORDER BY created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      params
    );

    return { items: dataResult.rows.map(r => rowToRecord(r as Record<string, unknown>)), total };
  }

  async update(id: string, facturadorId: string, input: NotaUpdateInput): Promise<NotaConItems> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const existing = await client.query(
        `SELECT estado FROM notas_comerciales WHERE id = $1 AND facturador_id = $2 AND deleted_at IS NULL`,
        [id, facturadorId]
      );
      if (!existing.rows[0]) throw new HttpError(404, "NOT_FOUND", "Nota no encontrada.");
      if (existing.rows[0].estado === "EMITIDO") {
        throw new HttpError(409, "CONFLICT", "No se puede modificar una nota emitida.");
      }

      const updates: string[] = ["updated_at = now()"];
      const params: unknown[] = [];
      let idx = 1;

      if (input.cliente_nombre !== undefined) { updates.push(`cliente_nombre = $${idx++}`); params.push(input.cliente_nombre); }
      if (input.cliente_ruc !== undefined) { updates.push(`cliente_ruc = $${idx++}`); params.push(input.cliente_ruc); }
      if (input.valido_hasta !== undefined) { updates.push(`valido_hasta = $${idx++}`); params.push(input.valido_hasta); }
      if (input.observaciones !== undefined) { updates.push(`observaciones = $${idx++}`); params.push(input.observaciones); }

      params.push(id, facturadorId);
      await client.query(
        `UPDATE notas_comerciales SET ${updates.join(", ")}
         WHERE id = $${idx++} AND facturador_id = $${idx}`,
        params
      );

      if (input.items !== undefined) {
        await client.query(`DELETE FROM notas_comerciales_items WHERE nota_id = $1`, [id]);
        await insertItems(client, id, input.items);
      }

      await client.query("COMMIT");

      const notaResult = await pool.query(`SELECT * FROM notas_comerciales WHERE id = $1`, [id]);
      const record = rowToRecord(notaResult.rows[0] as Record<string, unknown>);
      const items = await fetchItems(id);
      return { ...record, items, total: calcularTotal(items) };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async emitir(id: string, facturadorId: string): Promise<NotaConItems> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const existing = await client.query(
        `SELECT tipo, estado FROM notas_comerciales
         WHERE id = $1 AND facturador_id = $2 AND deleted_at IS NULL
         FOR UPDATE`,
        [id, facturadorId]
      );
      if (!existing.rows[0]) throw new HttpError(404, "NOT_FOUND", "Nota no encontrada.");
      if (existing.rows[0].estado === "EMITIDO") {
        throw new HttpError(409, "CONFLICT", "La nota ya fue emitida.");
      }

      const tipo = existing.rows[0].tipo as string;

      const numResult = await client.query(
        `INSERT INTO notas_comerciales_numeracion (facturador_id, tipo, ultimo_numero)
         VALUES ($1, $2, 1)
         ON CONFLICT (facturador_id, tipo) DO UPDATE
           SET ultimo_numero = notas_comerciales_numeracion.ultimo_numero + 1
         RETURNING ultimo_numero`,
        [facturadorId, tipo]
      );
      const numero = Number(numResult.rows[0].ultimo_numero);

      // Auto-asignar valido_hasta = fecha_emision + 30 dias si no tiene
      const notaResult = await client.query(
        `UPDATE notas_comerciales
         SET estado = 'EMITIDO',
             numero = $1,
             fecha_emision = CURRENT_DATE,
             emitido_at = now(),
             updated_at = now(),
             valido_hasta = CASE WHEN valido_hasta IS NULL THEN CURRENT_DATE + INTERVAL '30 days' ELSE valido_hasta END
         WHERE id = $2
         RETURNING *`,
        [numero, id]
      );

      await client.query("COMMIT");

      const items = await fetchItems(id);
      const record = rowToRecord(notaResult.rows[0] as Record<string, unknown>);
      return { ...record, items, total: calcularTotal(items) };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async softDelete(id: string, facturadorId: string): Promise<void> {
    const existing = await pool.query(
      `SELECT estado FROM notas_comerciales WHERE id = $1 AND facturador_id = $2 AND deleted_at IS NULL`,
      [id, facturadorId]
    );
    if (!existing.rows[0]) throw new HttpError(404, "NOT_FOUND", "Nota no encontrada.");
    if (existing.rows[0].estado === "EMITIDO") {
      throw new HttpError(409, "CONFLICT", "No se puede eliminar una nota emitida.");
    }
    await pool.query(
      `UPDATE notas_comerciales SET deleted_at = now() WHERE id = $1`,
      [id]
    );
  }

  async findByVerificationToken(token: string): Promise<NotaConItems | null> {
    const result = await pool.query(
      `SELECT * FROM notas_comerciales WHERE verification_token = $1 AND deleted_at IS NULL`,
      [token]
    );
    if (!result.rows[0]) return null;
    const record = rowToRecord(result.rows[0] as Record<string, unknown>);
    const items = await fetchItems(record.id);
    return { ...record, items, total: calcularTotal(items) };
  }

  async actualizarEstadoComercial(
    id: string,
    facturadorId: string,
    estado: NotaEstadoComercial
  ): Promise<NotaRecord> {
    const existing = await pool.query(
      `SELECT estado FROM notas_comerciales WHERE id = $1 AND facturador_id = $2 AND deleted_at IS NULL`,
      [id, facturadorId]
    );
    if (!existing.rows[0]) throw new HttpError(404, "NOT_FOUND", "Nota no encontrada.");
    if (existing.rows[0].estado !== "EMITIDO") {
      throw new HttpError(409, "CONFLICT", "Solo se puede cambiar el estado comercial de una nota emitida.");
    }
    const result = await pool.query(
      `UPDATE notas_comerciales
       SET estado_comercial = $1, updated_at = now()
       WHERE id = $2 AND facturador_id = $3
       RETURNING *`,
      [estado, id, facturadorId]
    );
    return rowToRecord(result.rows[0] as Record<string, unknown>);
  }

  async duplicar(id: string, facturadorId: string): Promise<NotaRecord> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const original = await client.query(
        `SELECT * FROM notas_comerciales WHERE id = $1 AND facturador_id = $2 AND deleted_at IS NULL`,
        [id, facturadorId]
      );
      if (!original.rows[0]) throw new HttpError(404, "NOT_FOUND", "Nota no encontrada.");
      const src = original.rows[0] as Record<string, unknown>;

      const newNota = await client.query(
        `INSERT INTO notas_comerciales
           (facturador_id, tipo, cliente_nombre, cliente_ruc, observaciones)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [facturadorId, src.tipo, src.cliente_nombre, src.cliente_ruc ?? null, src.observaciones ?? null]
      );
      const newId = newNota.rows[0].id as string;

      const srcItems = await client.query(
        `SELECT orden, fila_tipo, descripcion, cantidad, precio_unitario, precio_total, catalog_item_id
         FROM notas_comerciales_items WHERE nota_id = $1 ORDER BY orden`,
        [id]
      );
      for (const item of srcItems.rows) {
        await client.query(
          `INSERT INTO notas_comerciales_items
             (nota_id, orden, fila_tipo, descripcion, cantidad, precio_unitario, precio_total, catalog_item_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            newId,
            item.orden,
            item.fila_tipo,
            item.descripcion,
            item.cantidad ?? null,
            item.precio_unitario ?? null,
            item.precio_total ?? null,
            item.catalog_item_id ?? null,
          ]
        );
      }

      await client.query("COMMIT");
      return rowToRecord(newNota.rows[0] as Record<string, unknown>);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async getFacturadorParaPdf(facturadorId: string): Promise<FacturadorParaPdf | null> {
    const result = await pool.query(
      `SELECT f.razon_social, f.ruc, f.logo_url, f.rubro_descripcion,
              f.telefono,
              (SELECT e.direccion FROM facturador_establecimientos e
               WHERE e.facturador_id = f.id AND e.activo = true AND e.deleted_at IS NULL
               ORDER BY e.codigo LIMIT 1) AS direccion
       FROM facturadores f
       WHERE f.id = $1`,
      [facturadorId]
    );
    if (!result.rows[0]) return null;
    const row = result.rows[0];
    return {
      razon_social: row.razon_social as string,
      ruc: row.ruc as string,
      rubro_descripcion: row.rubro_descripcion as string | null,
      logo_url: row.logo_url as string | null,
      telefono: row.telefono as string | null,
      direccion: row.direccion as string | null,
    };
  }
}

export const notasRepository = new PgNotasRepository();
