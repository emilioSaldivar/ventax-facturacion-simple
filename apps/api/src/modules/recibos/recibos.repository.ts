import { pool } from "../../db/pool.js";
import type {
  ReciboRecord,
  ReciboListFilters,
  ReciboListResponse,
  RecibosRepository,
  UpsertReciboFromFiscalInput,
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
    moneda: (row.moneda as string) ?? "PYG",
    forma_pago: row.forma_pago as ReciboRecord["forma_pago"],
    referencia_bancaria: (row.referencia_bancaria as string | null) ?? null,
    referencia_documento_uuid: (row.referencia_documento_uuid as string | null) ?? null,
    referencia_documento_numero_display:
      (row.referencia_documento_numero_display as string | null) ??
      (row.factura_numero_display as string | null) ??
      null,
    external_ref: (row.external_ref as string | null) ?? null,
    idempotency_key: (row.idempotency_key as string | null) ?? null,
    xml_hash: (row.xml_hash as string | null) ?? null,
    pdf_hash: (row.pdf_hash as string | null) ?? null,
    anulacion_motivo: (row.anulacion_motivo as string | null) ?? null,
    verification_token: (row.verification_token as string | null) ?? null,
    emitido_at: row.emitido_at ? new Date(row.emitido_at as string | Date).toISOString() : null,
    created_at: new Date(row.created_at as string | Date).toISOString(),
    updated_at: new Date(row.updated_at as string | Date).toISOString(),
  };
}

export class PgRecibosRepository implements RecibosRepository {
  async getFacturadorApiKey(facturadorId: string): Promise<string | null> {
    const { rows } = await pool.query<{ fe_consumer_api_key: string | null }>(
      `SELECT fe_consumer_api_key FROM facturadores WHERE id = $1`,
      [facturadorId]
    );
    return rows[0]?.fe_consumer_api_key ?? null;
  }

  async upsertFromFiscal(input: UpsertReciboFromFiscalInput): Promise<ReciboRecord> {
    const { facturadorId, fiscal } = input;
    const numero = fiscal.numero != null ? Number(fiscal.numero) : null;
    const importe = Number(fiscal.importe);

    const { rows } = await pool.query<Record<string, unknown>>(
      `INSERT INTO recibos_dinero
         (id, facturador_id, numero, estado, fecha_cobro, pagador_nombre, pagador_documento_tipo,
          pagador_documento, concepto, importe, moneda, forma_pago, referencia_bancaria,
          referencia_documento_uuid, referencia_documento_numero_display,
          external_ref, idempotency_key, fiscal_request_snapshot, fiscal_response_snapshot,
          xml_hash, pdf_hash, anulacion_motivo, verification_token, emitido_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
       ON CONFLICT (id) DO UPDATE SET
         numero = EXCLUDED.numero,
         estado = EXCLUDED.estado,
         fecha_cobro = EXCLUDED.fecha_cobro,
         pagador_nombre = EXCLUDED.pagador_nombre,
         pagador_documento_tipo = EXCLUDED.pagador_documento_tipo,
         pagador_documento = EXCLUDED.pagador_documento,
         concepto = EXCLUDED.concepto,
         importe = EXCLUDED.importe,
         moneda = EXCLUDED.moneda,
         forma_pago = EXCLUDED.forma_pago,
         referencia_bancaria = EXCLUDED.referencia_bancaria,
         referencia_documento_uuid = COALESCE(EXCLUDED.referencia_documento_uuid, recibos_dinero.referencia_documento_uuid),
         referencia_documento_numero_display = COALESCE(EXCLUDED.referencia_documento_numero_display, recibos_dinero.referencia_documento_numero_display),
         external_ref = COALESCE(EXCLUDED.external_ref, recibos_dinero.external_ref),
         idempotency_key = COALESCE(EXCLUDED.idempotency_key, recibos_dinero.idempotency_key),
         fiscal_request_snapshot = COALESCE(EXCLUDED.fiscal_request_snapshot, recibos_dinero.fiscal_request_snapshot),
         fiscal_response_snapshot = EXCLUDED.fiscal_response_snapshot,
         xml_hash = COALESCE(EXCLUDED.xml_hash, recibos_dinero.xml_hash),
         pdf_hash = COALESCE(EXCLUDED.pdf_hash, recibos_dinero.pdf_hash),
         anulacion_motivo = COALESCE(EXCLUDED.anulacion_motivo, recibos_dinero.anulacion_motivo),
         verification_token = COALESCE(EXCLUDED.verification_token, recibos_dinero.verification_token),
         emitido_at = COALESCE(EXCLUDED.emitido_at, recibos_dinero.emitido_at),
         updated_at = now()
       RETURNING *`,
      [
        fiscal.id,
        facturadorId,
        numero,
        fiscal.estado,
        fiscal.fecha_cobro,
        fiscal.pagador_nombre,
        fiscal.pagador_documento_tipo,
        fiscal.pagador_documento,
        fiscal.concepto,
        importe,
        fiscal.moneda,
        fiscal.forma_pago,
        fiscal.referencia_bancaria,
        input.referenciaDocumentoUuid ?? null,
        fiscal.referencia_documento_numero_display,
        input.externalRef ?? null,
        input.idempotencyKey ?? null,
        input.fiscalRequestSnapshot ? JSON.stringify(input.fiscalRequestSnapshot) : null,
        JSON.stringify(fiscal.raw),
        fiscal.xml_hash,
        fiscal.pdf_hash,
        fiscal.anulacion_motivo,
        fiscal.verification_token,
        fiscal.emitido_at,
      ]
    );
    return mapRow(rows[0]!);
  }

  async markDeleted(id: string, facturadorId: string): Promise<void> {
    await pool.query(
      `UPDATE recibos_dinero SET deleted_at = now(), updated_at = now()
       WHERE id = $1 AND facturador_id = $2 AND deleted_at IS NULL`,
      [id, facturadorId]
    );
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

  async findByIdempotencyKey(facturadorId: string, idempotencyKey: string): Promise<ReciboRecord | null> {
    const { rows } = await pool.query<Record<string, unknown>>(
      `SELECT * FROM recibos_dinero
       WHERE facturador_id = $1 AND idempotency_key = $2 AND deleted_at IS NULL`,
      [facturadorId, idempotencyKey]
    );
    return rows[0] ? mapRow(rows[0]) : null;
  }

  async findByVerificationToken(token: string): Promise<ReciboRecord | null> {
    const { rows } = await pool.query<Record<string, unknown>>(
      `SELECT * FROM recibos_dinero WHERE verification_token = $1 AND deleted_at IS NULL`,
      [token]
    );
    return rows[0] ? mapRow(rows[0]) : null;
  }

  async listByReferenciaDocumento(documentoUuid: string, facturadorId: string): Promise<ReciboRecord[]> {
    const { rows } = await pool.query<Record<string, unknown>>(
      `SELECT * FROM recibos_dinero
       WHERE referencia_documento_uuid = $1 AND facturador_id = $2 AND deleted_at IS NULL
       ORDER BY created_at ASC`,
      [documentoUuid, facturadorId]
    );
    return rows.map(mapRow);
  }
}

export const recibosRepository = new PgRecibosRepository();
