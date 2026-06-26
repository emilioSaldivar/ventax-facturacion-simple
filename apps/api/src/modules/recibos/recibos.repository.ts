import { pool } from "../../db/pool.js";
import type { FacturadorParaPdf } from "../notas/notas.types.js";
import type {
  ReciboRecord,
  ReciboCreateInput,
  ReciboListFilters,
  ReciboListResponse,
  ReciboUpdateInput,
  RecibosRepository,
} from "./recibos.types.js";

function mapRow(row: Record<string, unknown>): ReciboRecord {
  return {
    id: row.id as string,
    facturador_id: row.facturador_id as string,
    numero: row.numero != null ? Number(row.numero) : null,
    estado: row.estado as ReciboRecord["estado"],
    fecha_cobro: row.fecha_cobro instanceof Date
      ? row.fecha_cobro.toISOString().slice(0, 10)
      : String(row.fecha_cobro),
    pagador_nombre: row.pagador_nombre as string,
    pagador_documento_tipo: (row.pagador_documento_tipo as string | null) ?? null,
    pagador_documento: (row.pagador_documento as string | null) ?? null,
    concepto: row.concepto as string,
    importe: Number(row.importe),
    forma_pago: row.forma_pago as ReciboRecord["forma_pago"],
    referencia_bancaria: (row.referencia_bancaria as string | null) ?? null,
    factura_id: (row.factura_id as string | null) ?? null,
    factura_numero_display: (row.factura_numero_display as string | null) ?? null,
    verification_token: row.verification_token as string,
    emitido_at: row.emitido_at ? (row.emitido_at as Date).toISOString() : null,
    created_at: (row.created_at as Date).toISOString(),
    updated_at: (row.updated_at as Date).toISOString(),
  };
}

export class PgRecibosRepository implements RecibosRepository {
  async create(facturadorId: string, input: ReciboCreateInput): Promise<ReciboRecord> {
    const { rows } = await pool.query<Record<string, unknown>>(
      `INSERT INTO recibos_dinero
         (facturador_id, fecha_cobro, pagador_nombre, pagador_documento_tipo,
          pagador_documento, concepto, importe, forma_pago, referencia_bancaria,
          factura_id, factura_numero_display)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [
        facturadorId,
        input.fecha_cobro,
        input.pagador_nombre,
        input.pagador_documento_tipo ?? null,
        input.pagador_documento ?? null,
        input.concepto,
        input.importe,
        input.forma_pago ?? "EFECTIVO",
        input.referencia_bancaria ?? null,
        input.factura_id ?? null,
        input.factura_numero_display ?? null,
      ]
    );
    return mapRow(rows[0]!);
  }

  async findById(id: string, facturadorId: string): Promise<ReciboRecord | null> {
    const { rows } = await pool.query<Record<string, unknown>>(
      `SELECT * FROM recibos_dinero
       WHERE id = $1 AND facturador_id = $2 AND deleted_at IS NULL`,
      [id, facturadorId]
    );
    return rows[0] ? mapRow(rows[0]) : null;
  }

  async list(facturadorId: string, filters: ReciboListFilters): Promise<ReciboListResponse> {
    const { rows: countRows } = await pool.query<{ total: string }>(
      `SELECT count(*)::text AS total FROM recibos_dinero
       WHERE facturador_id = $1 AND deleted_at IS NULL`,
      [facturadorId]
    );
    const total = Number(countRows[0]?.total ?? 0);

    const { rows } = await pool.query<Record<string, unknown>>(
      `SELECT * FROM recibos_dinero
       WHERE facturador_id = $1 AND deleted_at IS NULL
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [facturadorId, filters.limit, filters.offset]
    );

    return { items: rows.map(mapRow), total };
  }

  async update(id: string, facturadorId: string, input: ReciboUpdateInput): Promise<ReciboRecord> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (input.fecha_cobro !== undefined) { fields.push(`fecha_cobro = $${idx++}`); values.push(input.fecha_cobro); }
    if (input.pagador_nombre !== undefined) { fields.push(`pagador_nombre = $${idx++}`); values.push(input.pagador_nombre); }
    if (input.pagador_documento_tipo !== undefined) { fields.push(`pagador_documento_tipo = $${idx++}`); values.push(input.pagador_documento_tipo); }
    if (input.pagador_documento !== undefined) { fields.push(`pagador_documento = $${idx++}`); values.push(input.pagador_documento); }
    if (input.concepto !== undefined) { fields.push(`concepto = $${idx++}`); values.push(input.concepto); }
    if (input.importe !== undefined) { fields.push(`importe = $${idx++}`); values.push(input.importe); }
    if (input.forma_pago !== undefined) { fields.push(`forma_pago = $${idx++}`); values.push(input.forma_pago); }
    if (input.referencia_bancaria !== undefined) { fields.push(`referencia_bancaria = $${idx++}`); values.push(input.referencia_bancaria); }

    fields.push(`updated_at = now()`);
    values.push(id, facturadorId);

    const { rows } = await pool.query<Record<string, unknown>>(
      `UPDATE recibos_dinero SET ${fields.join(", ")}
       WHERE id = $${idx++} AND facturador_id = $${idx++} AND deleted_at IS NULL
       RETURNING *`,
      values
    );
    return mapRow(rows[0]!);
  }

  async emitir(id: string, facturadorId: string): Promise<ReciboRecord> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const { rows: numRows } = await client.query<{ ultimo_numero: number }>(
        `INSERT INTO recibos_dinero_numeracion (facturador_id, ultimo_numero)
         VALUES ($1, 1)
         ON CONFLICT (facturador_id)
         DO UPDATE SET ultimo_numero = recibos_dinero_numeracion.ultimo_numero + 1
         RETURNING ultimo_numero`,
        [facturadorId]
      );
      const numero = numRows[0]!.ultimo_numero;

      const { rows } = await client.query<Record<string, unknown>>(
        `UPDATE recibos_dinero
         SET estado = 'EMITIDO', numero = $1, emitido_at = now(), updated_at = now()
         WHERE id = $2 AND facturador_id = $3 AND deleted_at IS NULL
         RETURNING *`,
        [numero, id, facturadorId]
      );

      await client.query("COMMIT");
      return mapRow(rows[0]!);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async softDelete(id: string, facturadorId: string): Promise<void> {
    await pool.query(
      `UPDATE recibos_dinero SET deleted_at = now(), updated_at = now()
       WHERE id = $1 AND facturador_id = $2 AND deleted_at IS NULL`,
      [id, facturadorId]
    );
  }

  async findByVerificationToken(token: string): Promise<ReciboRecord | null> {
    const { rows } = await pool.query<Record<string, unknown>>(
      `SELECT * FROM recibos_dinero WHERE verification_token = $1 AND deleted_at IS NULL`,
      [token]
    );
    return rows[0] ? mapRow(rows[0]) : null;
  }

  async listByFactura(facturaId: string, facturadorId: string): Promise<ReciboRecord[]> {
    const { rows } = await pool.query<Record<string, unknown>>(
      `SELECT * FROM recibos_dinero
       WHERE factura_id = $1 AND facturador_id = $2 AND deleted_at IS NULL
       ORDER BY created_at ASC`,
      [facturaId, facturadorId]
    );
    return rows.map(mapRow);
  }

  async getFacturadorParaPdf(facturadorId: string): Promise<FacturadorParaPdf | null> {
    const { rows } = await pool.query<FacturadorParaPdf>(
      `SELECT f.razon_social, f.ruc, f.logo_url, f.rubro_descripcion,
              e.direccion, e.telefono, e.email
       FROM facturadores f
       LEFT JOIN establecimientos e
         ON e.facturador_id = f.id AND e.es_principal = true
       WHERE f.id = $1`,
      [facturadorId]
    );
    return rows[0] ?? null;
  }
}

export const recibosRepository = new PgRecibosRepository();
