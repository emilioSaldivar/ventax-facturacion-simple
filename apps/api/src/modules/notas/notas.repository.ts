import { pool } from "../../db/pool.js";
import { HttpError } from "../../shared/errors/http-error.js";
import type {
  FacturadorParaPdf,
  NotaConItems,
  NotaCreateInput,
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

function rowToRecord(row: Record<string, unknown>): NotaRecord {
  return {
    id: row.id as string,
    facturador_id: row.facturador_id as string,
    tipo: row.tipo as NotaRecord["tipo"],
    numero: row.numero != null ? Number(row.numero) : null,
    estado: row.estado as NotaRecord["estado"],
    fecha_emision: row.fecha_emision ? String(row.fecha_emision).slice(0, 10) : null,
    cliente_nombre: row.cliente_nombre as string,
    cliente_ruc: row.cliente_ruc as string | null,
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
  };
}

async function fetchItems(notaId: string): Promise<NotaFilaRecord[]> {
  const result = await pool.query(
    `SELECT id, nota_id, orden, fila_tipo, descripcion, cantidad, precio_unitario, precio_total
     FROM notas_comerciales_items
     WHERE nota_id = $1
     ORDER BY orden ASC`,
    [notaId]
  );
  return result.rows.map(rowToFila);
}

async function toConItems(row: Record<string, unknown>): Promise<NotaConItems> {
  const record = rowToRecord(row);
  const items = await fetchItems(record.id);
  return { ...record, items, total: calcularTotal(items) };
}

export class PgNotasRepository implements NotasRepository {
  async create(facturadorId: string, input: NotaCreateInput): Promise<NotaConItems> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const notaResult = await client.query(
        `INSERT INTO notas_comerciales (facturador_id, tipo, cliente_nombre, cliente_ruc)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [facturadorId, input.tipo, input.cliente_nombre, input.cliente_ruc ?? null]
      );
      const nota = notaResult.rows[0] as Record<string, unknown>;

      if (input.items.length > 0) {
        for (const item of input.items) {
          const precioTotal =
            item.fila_tipo === "ITEM" && item.cantidad != null && item.precio_unitario != null
              ? item.cantidad * item.precio_unitario
              : null;
          await client.query(
            `INSERT INTO notas_comerciales_items (nota_id, orden, fila_tipo, descripcion, cantidad, precio_unitario, precio_total)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              nota.id,
              item.orden,
              item.fila_tipo,
              item.descripcion,
              item.fila_tipo === "ITEM" ? (item.cantidad ?? null) : null,
              item.fila_tipo === "ITEM" ? (item.precio_unitario ?? null) : null,
              precioTotal,
            ]
          );
        }
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
    return toConItems(result.rows[0] as Record<string, unknown>);
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

      if (input.cliente_nombre !== undefined) {
        updates.push(`cliente_nombre = $${idx++}`);
        params.push(input.cliente_nombre);
      }
      if (input.cliente_ruc !== undefined) {
        updates.push(`cliente_ruc = $${idx++}`);
        params.push(input.cliente_ruc);
      }

      params.push(id, facturadorId);
      await client.query(
        `UPDATE notas_comerciales SET ${updates.join(", ")}
         WHERE id = $${idx++} AND facturador_id = $${idx}`,
        params
      );

      if (input.items !== undefined) {
        await client.query(`DELETE FROM notas_comerciales_items WHERE nota_id = $1`, [id]);
        for (const item of input.items) {
          const precioTotal =
            item.fila_tipo === "ITEM" && item.cantidad != null && item.precio_unitario != null
              ? item.cantidad * item.precio_unitario
              : null;
          await client.query(
            `INSERT INTO notas_comerciales_items (nota_id, orden, fila_tipo, descripcion, cantidad, precio_unitario, precio_total)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              id,
              item.orden,
              item.fila_tipo,
              item.descripcion,
              item.fila_tipo === "ITEM" ? (item.cantidad ?? null) : null,
              item.fila_tipo === "ITEM" ? (item.precio_unitario ?? null) : null,
              precioTotal,
            ]
          );
        }
      }

      await client.query("COMMIT");

      const notaResult = await client.query(
        `SELECT * FROM notas_comerciales WHERE id = $1`,
        [id]
      );
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

      const notaResult = await client.query(
        `UPDATE notas_comerciales
         SET estado = 'EMITIDO', numero = $1, fecha_emision = CURRENT_DATE, emitido_at = now(), updated_at = now()
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

  async findByVerificationToken(token: string): Promise<NotaRecord | null> {
    const result = await pool.query(
      `SELECT * FROM notas_comerciales WHERE verification_token = $1 AND deleted_at IS NULL`,
      [token]
    );
    if (!result.rows[0]) return null;
    return rowToRecord(result.rows[0] as Record<string, unknown>);
  }

  async getFacturadorParaPdf(facturadorId: string): Promise<FacturadorParaPdf | null> {
    const result = await pool.query(
      `SELECT f.razon_social, f.ruc, f.logo_url, f.rubro_descripcion,
              e.telefono, e.direccion
       FROM facturadores f
       LEFT JOIN establecimientos e ON e.facturador_id = f.id AND e.es_principal = true
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
