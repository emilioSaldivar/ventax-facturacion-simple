import { pool } from "../../db/pool";
import type {
  DocumentoListFilters,
  DocumentoListResponse,
  FacturaItemPreview,
  FacturaPersistInput,
  FacturaRepository,
  DocumentoResponse
} from "./facturas.types";

interface FacturaRow {
  id: string;
  tipo: DocumentoResponse["tipo"];
  estado: DocumentoResponse["estado"];
  condicion_venta: DocumentoResponse["condicion_venta"];
  external_ref: string | null;
  cliente_snapshot: unknown;
  totals_snapshot: unknown;
  fiscal_response_snapshot: unknown;
  fiscal_document_id: string | null;
  cdc: string | null;
  numero_fiscal: string | null;
  email_estado: DocumentoResponse["delivery"]["email_status"] | null;
  created_at: Date;
}

interface FacturaItemRow {
  catalogo_item_id: string | null;
  line_no: number;
  codigo: string | null;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  iva_tipo: FacturaItemPreview["iva_tipo"];
  subtotal: number;
  base_imponible: number;
  iva_monto: number;
}

export class PgFacturaRepository implements FacturaRepository {
  async findById(input: { facturadorId: string; documentoId: string }): Promise<DocumentoResponse | null> {
    const result = await pool.query<FacturaRow>(
      `
        select
          id,
          tipo,
          estado,
          condicion_venta,
          external_ref,
          cliente_snapshot,
          totals_snapshot,
          fiscal_response_snapshot,
          fiscal_document_id,
          cdc,
          numero_fiscal,
          email_estado,
          created_at
        from facturas_operativas
        where facturador_id = $1
          and id = $2
          and deleted_at is null
        limit 1
      `,
      [input.facturadorId, input.documentoId]
    );

    const factura = result.rows[0];
    if (!factura) {
      return null;
    }

    return mapFacturaRow(factura, await this.findItems(factura.id));
  }

  async findByIdempotencyKey(input: { facturadorId: string; idempotencyKey: string }): Promise<DocumentoResponse | null> {
    const result = await pool.query<FacturaRow>(
      `
        select
          id,
          tipo,
          estado,
          condicion_venta,
          external_ref,
          cliente_snapshot,
          totals_snapshot,
          fiscal_response_snapshot,
          fiscal_document_id,
          cdc,
          numero_fiscal,
          email_estado,
          created_at
        from facturas_operativas
        where facturador_id = $1
          and idempotency_key = $2
          and deleted_at is null
        limit 1
      `,
      [input.facturadorId, input.idempotencyKey]
    );

    const factura = result.rows[0];
    if (!factura) {
      return null;
    }

    return mapFacturaRow(factura, await this.findItems(factura.id));
  }

  async list(input: { facturadorId: string; filters: DocumentoListFilters }): Promise<DocumentoListResponse> {
    const { where, params } = buildListWhere(input.facturadorId, input.filters);
    const limitParam = params.length + 1;
    const offsetParam = params.length + 2;

    const listResult = await pool.query<FacturaRow>(
      `
        select
          id,
          tipo,
          estado,
          condicion_venta,
          external_ref,
          cliente_snapshot,
          totals_snapshot,
          fiscal_response_snapshot,
          fiscal_document_id,
          cdc,
          numero_fiscal,
          email_estado,
          created_at
        from facturas_operativas
        ${where}
        order by created_at desc, id desc
        limit $${limitParam}
        offset $${offsetParam}
      `,
      [...params, input.filters.limit, input.filters.offset]
    );

    const countResult = await pool.query<{ total: string }>(
      `
        select count(*)::text as total
        from facturas_operativas
        ${where}
      `,
      params
    );

    const itemsByFacturaId = await this.findItemsByFacturaIds(listResult.rows.map((row) => row.id));

    return {
      items: listResult.rows.map((row) => mapFacturaRow(row, itemsByFacturaId.get(row.id) ?? [])),
      total: Number(countResult.rows[0]?.total ?? 0)
    };
  }

  async updateFiscalStatus(input: {
    facturadorId: string;
    documentoId: string;
    estado: DocumentoResponse["estado"];
    fiscalStatus: Record<string, unknown>;
  }): Promise<DocumentoResponse | null> {
    const result = await pool.query<FacturaRow>(
      `
        update facturas_operativas
        set
          estado = $3,
          fiscal_response_snapshot = $4::jsonb,
          updated_at = now()
        where facturador_id = $1
          and id = $2
          and deleted_at is null
        returning
          id,
          tipo,
          estado,
          condicion_venta,
          external_ref,
          cliente_snapshot,
          totals_snapshot,
          fiscal_response_snapshot,
          fiscal_document_id,
          cdc,
          numero_fiscal,
          email_estado,
          created_at
      `,
      [input.facturadorId, input.documentoId, input.estado, JSON.stringify(input.fiscalStatus)]
    );

    const factura = result.rows[0];
    if (!factura) {
      return null;
    }

    return mapFacturaRow(factura, await this.findItems(factura.id));
  }

  async createFromEmission(input: FacturaPersistInput): Promise<DocumentoResponse> {
    const client = await pool.connect();

    try {
      await client.query("begin");

      const inserted = await client.query<FacturaRow>(
        `
          insert into facturas_operativas (
            tenant_id,
            facturador_id,
            usuario_id,
            tipo,
            condicion_venta,
            estado,
            external_ref,
            idempotency_key,
            cliente_snapshot,
            totals_snapshot,
            fiscal_request_snapshot,
            fiscal_response_snapshot,
            fiscal_document_id,
            cdc,
            numero_fiscal,
            email_estado,
            emitted_at
          )
          values (
            $1, $2, $3, 'FACTURA', $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb,
            $11::jsonb, $12, $13, $14, $15, now()
          )
          returning
            id,
            tipo,
            estado,
            condicion_venta,
            external_ref,
            cliente_snapshot,
            totals_snapshot,
            fiscal_response_snapshot,
            fiscal_document_id,
            cdc,
            numero_fiscal,
            email_estado,
            created_at
        `,
        [
          input.tenantId,
          input.facturadorId,
          input.userId,
          input.input.condicion_venta,
          input.estado,
          input.externalRef,
          input.idempotencyKey ?? null,
          JSON.stringify(input.input.cliente),
          JSON.stringify(input.preview.totals),
          JSON.stringify(input.fiscalRequest),
          JSON.stringify(input.fiscalResponse?.raw ?? input.fiscalError ?? {}),
          input.fiscalResponse?.fiscal_document_id ?? null,
          input.fiscalResponse?.cdc ?? null,
          input.fiscalResponse?.numero_fiscal ?? null,
          input.fiscalResponse?.email_status === "NOT_APPLICABLE" ? null : input.fiscalResponse?.email_status ?? null
        ]
      );

      const factura = inserted.rows[0]!;

      for (const item of input.preview.items) {
        await client.query(
          `
            insert into factura_items_snapshot (
              tenant_id,
              facturador_id,
              factura_operativa_id,
              catalogo_item_id,
              line_no,
              codigo,
              descripcion,
              cantidad,
              precio_unitario,
              iva_tipo,
              subtotal,
              base_imponible,
              iva_monto
            )
            values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          `,
          [
            input.tenantId,
            input.facturadorId,
            factura.id,
            item.catalogo_item_id,
            item.line_no,
            item.codigo,
            item.descripcion,
            item.cantidad,
            item.precio_unitario,
            item.iva_tipo,
            item.subtotal,
            item.base_imponible,
            item.iva_monto
          ]
        );
      }

      await client.query(
        `
          insert into audit_events (
            tenant_id,
            facturador_id,
            usuario_id,
            entity_type,
            entity_id,
            event_type,
            metadata
          )
          values ($1, $2, $3, 'factura_operativa', $4, 'FACTURA_EMITIDA', $5::jsonb)
        `,
        [
          input.tenantId,
          input.facturadorId,
          input.userId,
          factura.id,
          JSON.stringify({
            estado: input.estado,
            external_ref: input.externalRef,
            fiscal_document_id: input.fiscalResponse?.fiscal_document_id ?? null
          })
        ]
      );

      await client.query("commit");

      return mapFacturaRow(factura, input.preview.items);
    } catch (error) {
      await client.query("rollback");
      if (isUniqueViolation(error) && input.idempotencyKey) {
        const existing = await this.findByIdempotencyKey({
          facturadorId: input.facturadorId,
          idempotencyKey: input.idempotencyKey
        });

        if (existing) {
          return existing;
        }
      }
      throw error;
    } finally {
      client.release();
    }
  }

  private async findItems(facturaId: string): Promise<FacturaItemPreview[]> {
    const result = await pool.query<FacturaItemRow>(
      `
        select
          catalogo_item_id,
          line_no,
          codigo,
          descripcion,
          cantidad,
          precio_unitario,
          iva_tipo,
          subtotal,
          base_imponible,
          iva_monto
        from factura_items_snapshot
        where factura_operativa_id = $1
        order by line_no
      `,
      [facturaId]
    );

    return result.rows.map((row) => ({
      catalogo_item_id: row.catalogo_item_id,
      line_no: Number(row.line_no),
      codigo: row.codigo,
      descripcion: row.descripcion,
      cantidad: Number(row.cantidad),
      precio_unitario: Number(row.precio_unitario),
      iva_tipo: row.iva_tipo,
      subtotal: Number(row.subtotal),
      base_imponible: Number(row.base_imponible),
      iva_monto: Number(row.iva_monto)
    }));
  }

  private async findItemsByFacturaIds(facturaIds: string[]): Promise<Map<string, FacturaItemPreview[]>> {
    const byFacturaId = new Map<string, FacturaItemPreview[]>();
    if (facturaIds.length === 0) {
      return byFacturaId;
    }

    const result = await pool.query<FacturaItemRow & { factura_operativa_id: string }>(
      `
        select
          factura_operativa_id,
          catalogo_item_id,
          line_no,
          codigo,
          descripcion,
          cantidad,
          precio_unitario,
          iva_tipo,
          subtotal,
          base_imponible,
          iva_monto
        from factura_items_snapshot
        where factura_operativa_id = any($1::uuid[])
        order by factura_operativa_id, line_no
      `,
      [facturaIds]
    );

    for (const row of result.rows) {
      const items = byFacturaId.get(row.factura_operativa_id) ?? [];
      items.push({
        catalogo_item_id: row.catalogo_item_id,
        line_no: Number(row.line_no),
        codigo: row.codigo,
        descripcion: row.descripcion,
        cantidad: Number(row.cantidad),
        precio_unitario: Number(row.precio_unitario),
        iva_tipo: row.iva_tipo,
        subtotal: Number(row.subtotal),
        base_imponible: Number(row.base_imponible),
        iva_monto: Number(row.iva_monto)
      });
      byFacturaId.set(row.factura_operativa_id, items);
    }

    return byFacturaId;
  }
}

export const facturasRepository = new PgFacturaRepository();

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

function buildListWhere(facturadorId: string, filters: DocumentoListFilters): { where: string; params: unknown[] } {
  const params: unknown[] = [facturadorId];
  const clauses = ["facturador_id = $1", "deleted_at is null"];

  if (filters.tipo) {
    params.push(filters.tipo);
    clauses.push(`tipo = $${params.length}`);
  }

  if (filters.estado) {
    params.push(filters.estado);
    clauses.push(`estado = $${params.length}`);
  }

  if (filters.desde) {
    params.push(filters.desde);
    clauses.push(`created_at >= $${params.length}::date`);
  }

  if (filters.hasta) {
    params.push(filters.hasta);
    clauses.push(`created_at < ($${params.length}::date + interval '1 day')`);
  }

  const q = filters.q?.trim();
  if (q) {
    params.push(`%${q}%`);
    clauses.push(`(
      numero_fiscal ilike $${params.length}
      or cdc ilike $${params.length}
      or external_ref ilike $${params.length}
      or cliente_snapshot->>'documento' ilike $${params.length}
      or cliente_snapshot->>'razon_social' ilike $${params.length}
    )`);
  }

  return {
    where: `where ${clauses.join(" and ")}`,
    params
  };
}

function mapFacturaRow(row: FacturaRow, items: FacturaItemPreview[]): DocumentoResponse {
  const emailStatus = row.email_estado ?? "NOT_APPLICABLE";
  const cdc = row.cdc;

  return {
    id: row.id,
    tipo: row.tipo,
    estado: row.estado,
    condicion_venta: row.condicion_venta,
    numero_fiscal: row.numero_fiscal,
    cdc,
    fiscal_document_id: row.fiscal_document_id,
    external_ref: row.external_ref,
    cliente: row.cliente_snapshot as DocumentoResponse["cliente"],
    items,
    totals: row.totals_snapshot as DocumentoResponse["totals"],
    fiscal_status: row.fiscal_response_snapshot as Record<string, unknown>,
    delivery: {
      public_url: null,
      whatsapp_url: null,
      email_status: emailStatus,
      artifacts: {
        kude_pdf: {
          available: Boolean(cdc),
          url: null
        },
        xml: {
          available: Boolean(cdc),
          url: null
        }
      }
    },
    created_at: row.created_at.toISOString()
  };
}
