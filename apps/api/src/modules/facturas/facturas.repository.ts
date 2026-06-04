import { pool } from "../../db/pool";
import type {
  DocumentoListFilters,
  DocumentoListResponse,
  FacturaQueuedPersistInput,
  FacturaItemPreview,
  FacturaPersistInput,
  NotaCreditoPersistInput,
  PendingFiscalEmission,
  FacturaRepository,
  DocumentoResponse
} from "./facturas.types";

interface FacturaRow {
  id: string;
  document_uuid: string | null;
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
  documento_relacionado_id: string | null;
  nce_motivo: string | null;
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

interface PendingFiscalEmissionRow {
  outbox_id: string;
  documento_id: string;
  facturador_id: string;
  fiscal_request_snapshot: unknown;
}

export class PgFacturaRepository implements FacturaRepository {
  async findById(input: { facturadorId: string; documentoId: string }): Promise<DocumentoResponse | null> {
    const result = await pool.query<FacturaRow>(
      `
        select
          id,
          document_uuid,
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
          documento_relacionado_id,
          nce_motivo,
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
          document_uuid,
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
          documento_relacionado_id,
          nce_motivo,
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

  async findNotaCreditoByOriginal(input: { facturadorId: string; documentoId: string }): Promise<DocumentoResponse | null> {
    const result = await pool.query<FacturaRow>(
      `
        select
          id,
          document_uuid,
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
          documento_relacionado_id,
          nce_motivo,
          created_at
        from facturas_operativas
        where facturador_id = $1
          and documento_relacionado_id = $2
          and tipo = 'NOTA_CREDITO'
          and deleted_at is null
        limit 1
      `,
      [input.facturadorId, input.documentoId]
    );

    const notaCredito = result.rows[0];
    if (!notaCredito) {
      return null;
    }

    return mapFacturaRow(notaCredito, await this.findItems(notaCredito.id));
  }

  async list(input: { facturadorId: string; filters: DocumentoListFilters }): Promise<DocumentoListResponse> {
    const { where, params } = buildListWhere(input.facturadorId, input.filters);
    const limitParam = params.length + 1;
    const offsetParam = params.length + 2;

    const listResult = await pool.query<FacturaRow>(
      `
        select
          id,
          document_uuid,
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
          documento_relacionado_id,
          nce_motivo,
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
    cdc?: string | null;
  }): Promise<DocumentoResponse | null> {
    const result = await pool.query<FacturaRow>(
      `
        update facturas_operativas
        set
          estado = $3,
          fiscal_response_snapshot = $4::jsonb,
          cdc = coalesce($5, cdc),
          updated_at = now()
        where facturador_id = $1
          and id = $2
          and deleted_at is null
        returning
          id,
          document_uuid,
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
          documento_relacionado_id,
          nce_motivo,
          created_at
      `,
      [input.facturadorId, input.documentoId, input.estado, JSON.stringify(input.fiscalStatus), input.cdc ?? null]
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
            document_uuid,
            cdc,
            numero_fiscal,
            email_estado,
            emitted_at
          )
          values (
            $1, $2, $3, 'FACTURA', $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb,
            $11::jsonb, $12, $13, $14, $15, $16, now()
          )
          returning
            id,
            document_uuid,
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
            documento_relacionado_id,
            nce_motivo,
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
          input.fiscalResponse?.document_uuid ?? null,
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

  async createQueuedEmission(input: FacturaQueuedPersistInput): Promise<DocumentoResponse> {
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
            email_estado
          )
          values (
            $1, $2, $3, 'FACTURA', $4, 'EMITIENDO', $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, '{}'::jsonb, $10
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
            documento_relacionado_id,
            nce_motivo,
            created_at
        `,
        [
          input.tenantId,
          input.facturadorId,
          input.userId,
          input.input.condicion_venta,
          input.externalRef,
          input.idempotencyKey ?? null,
          JSON.stringify(input.input.cliente),
          JSON.stringify(input.preview.totals),
          JSON.stringify(input.fiscalRequest),
          input.input.cliente.email?.trim() ? "DELEGATED" : null
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
          insert into factura_emision_outbox (
            tenant_id,
            facturador_id,
            factura_operativa_id,
            estado
          )
          values ($1, $2, $3, 'PENDING')
        `,
        [input.tenantId, input.facturadorId, factura.id]
      );

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
          values ($1, $2, $3, 'factura_operativa', $4, 'FACTURA_EMISION_ENCOLADA', $5::jsonb)
        `,
        [
          input.tenantId,
          input.facturadorId,
          input.userId,
          factura.id,
          JSON.stringify({
            estado: "EMITIENDO",
            external_ref: input.externalRef
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

  async createNotaCreditoFromFactura(input: NotaCreditoPersistInput): Promise<DocumentoResponse> {
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
            documento_relacionado_id,
            nce_motivo,
            cliente_snapshot,
            totals_snapshot,
            fiscal_request_snapshot,
            fiscal_response_snapshot,
            fiscal_document_id,
            document_uuid,
            cdc,
            numero_fiscal,
            email_estado,
            emitted_at
          )
          values (
            $1, $2, $3, 'NOTA_CREDITO', $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12::jsonb,
            $13::jsonb, $14, $15, $16, $17, $18, now()
          )
          returning
            id,
            document_uuid,
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
            documento_relacionado_id,
            nce_motivo,
            created_at
        `,
        [
          input.tenantId,
          input.facturadorId,
          input.userId,
          input.original.condicion_venta,
          input.estado,
          input.externalRef,
          input.idempotencyKey ?? null,
          input.original.id,
          input.motivo,
          JSON.stringify(input.original.cliente),
          JSON.stringify(input.original.totals),
          JSON.stringify(input.fiscalRequest),
          JSON.stringify(input.fiscalResponse?.raw ?? input.fiscalError ?? {}),
          input.fiscalResponse?.fiscal_document_id ?? null,
          input.fiscalResponse?.document_uuid ?? null,
          input.fiscalResponse?.cdc ?? null,
          input.fiscalResponse?.numero_fiscal ?? null,
          input.fiscalResponse?.email_status === "NOT_APPLICABLE" ? null : input.fiscalResponse?.email_status ?? null
        ]
      );

      const notaCredito = inserted.rows[0]!;

      for (const item of input.original.items) {
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
            notaCredito.id,
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
          values ($1, $2, $3, 'factura_operativa', $4, 'NOTA_CREDITO_EMITIDA', $5::jsonb)
        `,
        [
          input.tenantId,
          input.facturadorId,
          input.userId,
          notaCredito.id,
          JSON.stringify({
            estado: input.estado,
            external_ref: input.externalRef,
            factura_relacionada_id: input.original.id,
            fiscal_document_id: input.fiscalResponse?.fiscal_document_id ?? null
          })
        ]
      );

      await client.query("commit");

      return mapFacturaRow(notaCredito, input.original.items);
    } catch (error) {
      await client.query("rollback");
      if (isUniqueViolation(error)) {
        const existingByIdempotency = input.idempotencyKey
          ? await this.findByIdempotencyKey({
              facturadorId: input.facturadorId,
              idempotencyKey: input.idempotencyKey
            })
          : null;

        if (existingByIdempotency) {
          return existingByIdempotency;
        }

        const existingByOriginal = await this.findNotaCreditoByOriginal({
          facturadorId: input.facturadorId,
          documentoId: input.original.id
        });

        if (existingByOriginal) {
          return existingByOriginal;
        }
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async claimNextPendingEmission(): Promise<PendingFiscalEmission | null> {
    const result = await pool.query<PendingFiscalEmissionRow>(
      `
        with next_job as (
          select o.id
          from factura_emision_outbox o
          join facturas_operativas f on f.id = o.factura_operativa_id
          where o.estado in ('PENDING', 'FAILED_TEMP')
            and o.next_attempt_at <= now()
            and f.deleted_at is null
          order by o.next_attempt_at asc, o.created_at asc
          limit 1
          for update skip locked
        )
        update factura_emision_outbox o
        set
          estado = 'PROCESSING',
          attempts = attempts + 1,
          locked_at = now(),
          updated_at = now()
        from next_job, facturas_operativas f
        where o.id = next_job.id
          and f.id = o.factura_operativa_id
        returning
          o.id as outbox_id,
          f.id as documento_id,
          f.facturador_id,
          f.fiscal_request_snapshot
      `
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return {
      outboxId: row.outbox_id,
      documentoId: row.documento_id,
      facturadorId: row.facturador_id,
      fiscalRequest: row.fiscal_request_snapshot as PendingFiscalEmission["fiscalRequest"]
    };
  }

  async completePendingEmission(input: {
    outboxId: string;
    documentoId: string;
    response: Parameters<FacturaRepository["completePendingEmission"]>[0]["response"];
  }): Promise<DocumentoResponse | null> {
    const client = await pool.connect();

    try {
      await client.query("begin");
      await client.query(
        `
          update factura_emision_outbox
          set estado = 'DONE', locked_at = null, last_error = null, updated_at = now()
          where id = $1
        `,
        [input.outboxId]
      );

      const result = await client.query<FacturaRow>(
        `
          update facturas_operativas
          set
            estado = $2,
            fiscal_response_snapshot = $3::jsonb,
            fiscal_document_id = $4,
            document_uuid = coalesce(document_uuid, $5),
            cdc = $6,
            numero_fiscal = $7,
            email_estado = $8,
            emitted_at = now(),
            updated_at = now()
          where id = $1
            and deleted_at is null
          returning
            id,
            document_uuid,
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
            documento_relacionado_id,
            nce_motivo,
            created_at
        `,
        [
          input.documentoId,
          input.response.estado,
          JSON.stringify(input.response.raw),
          input.response.fiscal_document_id,
          input.response.document_uuid ?? null,
          input.response.cdc,
          input.response.numero_fiscal,
          input.response.email_status === "NOT_APPLICABLE" ? null : input.response.email_status
        ]
      );

      await client.query("commit");

      const factura = result.rows[0];
      return factura ? mapFacturaRow(factura, await this.findItems(factura.id)) : null;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async failPendingEmission(input: {
    outboxId: string;
    documentoId: string;
    estado: DocumentoResponse["estado"];
    error: Record<string, unknown>;
    retryAfterSeconds: number;
  }): Promise<DocumentoResponse | null> {
    const client = await pool.connect();

    try {
      await client.query("begin");
      await client.query(
        `
          update factura_emision_outbox
          set
            estado = 'FAILED_TEMP',
            locked_at = null,
            next_attempt_at = now() + ($2::text || ' seconds')::interval,
            last_error = $3::jsonb,
            updated_at = now()
          where id = $1
        `,
        [input.outboxId, input.retryAfterSeconds, JSON.stringify(input.error)]
      );

      const result = await client.query<FacturaRow>(
        `
          update facturas_operativas
          set
            estado = $2,
            fiscal_response_snapshot = $3::jsonb,
            updated_at = now()
          where id = $1
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
            documento_relacionado_id,
            nce_motivo,
            created_at
        `,
        [input.documentoId, input.estado, JSON.stringify(input.error)]
      );

      await client.query("commit");

      const factura = result.rows[0];
      return factura ? mapFacturaRow(factura, await this.findItems(factura.id)) : null;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async retryPendingEmission(input: {
    facturadorId: string;
    documentoId: string;
    requestedBy: string;
  }): Promise<DocumentoResponse | null> {
    const client = await pool.connect();

    try {
      await client.query("begin");

      const outbox = await client.query<{ id: string }>(
        `
          update factura_emision_outbox o
          set
            estado = 'PENDING',
            locked_at = null,
            next_attempt_at = now(),
            last_error = null,
            updated_at = now()
          from facturas_operativas f
          where o.factura_operativa_id = f.id
            and f.facturador_id = $1
            and f.id = $2
            and f.deleted_at is null
            and o.estado in ('PENDING', 'FAILED_TEMP', 'FAILED_PERM')
          returning o.id
        `,
        [input.facturadorId, input.documentoId]
      );

      if (!outbox.rows[0]) {
        await client.query("rollback");
        return null;
      }

      const retryStatus = {
        recoverable: true,
        action: "RETRY_EMISSION_REQUESTED",
        message: "Reintento de emision fiscal encolado.",
        requested_by: input.requestedBy
      };

      const result = await client.query<FacturaRow>(
        `
          update facturas_operativas
          set
            estado = 'EMITIENDO',
            fiscal_response_snapshot = $3::jsonb,
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
            documento_relacionado_id,
            nce_motivo,
            created_at
        `,
        [input.facturadorId, input.documentoId, JSON.stringify(retryStatus)]
      );

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
          select
            tenant_id,
            facturador_id,
            $3,
            'factura_operativa',
            id,
            'FACTURA_EMISION_REINTENTO',
            $4::jsonb
          from facturas_operativas
          where facturador_id = $1
            and id = $2
        `,
        [input.facturadorId, input.documentoId, input.requestedBy, JSON.stringify(retryStatus)]
      );

      await client.query("commit");

      const factura = result.rows[0];
      return factura ? mapFacturaRow(factura, await this.findItems(factura.id)) : null;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async cancelDocumento(input: {
    facturadorId: string;
    documentoId: string;
    requestedBy: string;
    estado: "ANULADA" | "PENDIENTE_SIFEN";
    fiscalStatus: Record<string, unknown>;
  }): Promise<DocumentoResponse | null> {
    const client = await pool.connect();

    try {
      await client.query("begin");

      const result = await client.query<FacturaRow>(
        `
          update facturas_operativas
          set
            estado = $3,
            fiscal_response_snapshot = $4::jsonb,
            updated_at = now()
          where facturador_id = $1
            and id = $2
            and estado = 'EMITIDA'
            and cdc is not null
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
            documento_relacionado_id,
            nce_motivo,
            created_at
        `,
        [input.facturadorId, input.documentoId, input.estado, JSON.stringify(input.fiscalStatus)]
      );

      const factura = result.rows[0];
      if (!factura) {
        await client.query("rollback");
        return null;
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
          select
            tenant_id,
            facturador_id,
            $3,
            'factura_operativa',
            id,
            'FACTURA_CANCELADA',
            $4::jsonb
          from facturas_operativas
          where facturador_id = $1
            and id = $2
        `,
        [input.facturadorId, input.documentoId, input.requestedBy, JSON.stringify(input.fiscalStatus)]
      );

      await client.query("commit");

      return mapFacturaRow(factura, await this.findItems(factura.id));
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async appendAuditEvent(input: {
    facturadorId: string;
    documentoId: string;
    requestedBy: string;
    eventType: string;
    metadata: Record<string, unknown>;
  }): Promise<void> {
    await pool.query(
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
        select
          tenant_id,
          facturador_id,
          $3,
          'factura_operativa',
          id,
          $4,
          $5::jsonb
        from facturas_operativas
        where facturador_id = $1
          and id = $2
      `,
      [input.facturadorId, input.documentoId, input.requestedBy, input.eventType, JSON.stringify(input.metadata)]
    );
  }

  async bulkUpdateDocumentUuidByCdc(items: Array<{ cdc: string; documentUuid: string }>): Promise<void> {
    if (items.length === 0) return;

    const values: unknown[] = [];
    const placeholders = items.map((item, i) => {
      values.push(item.cdc, item.documentUuid);
      return `($${i * 2 + 1}, $${i * 2 + 2})`;
    });

    await pool.query(
      `
        update facturas_operativas fo
        set document_uuid = v.document_uuid, updated_at = now()
        from (values ${placeholders.join(", ")}) as v(cdc, document_uuid)
        where fo.cdc = v.cdc
          and fo.document_uuid is null
          and fo.deleted_at is null
      `,
      values
    );
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
  const fechaOperativaExpr = "(coalesce(emitted_at, created_at) at time zone 'America/Asuncion')::date";

  if (filters.tipo) {
    params.push(filters.tipo);
    clauses.push(`tipo = $${params.length}`);
  }

  if (filters.tipo_operativo) {
    if (filters.tipo_operativo === "NOTA_CREDITO") {
      clauses.push("tipo = 'NOTA_CREDITO'");
    } else {
      clauses.push("tipo = 'FACTURA'");
      params.push(filters.tipo_operativo);
      clauses.push(`condicion_venta = $${params.length}`);
    }
  }

  if (filters.estado) {
    params.push(filters.estado);
    clauses.push(`estado = $${params.length}`);
  }

  if (filters.desde) {
    params.push(filters.desde);
    clauses.push(`${fechaOperativaExpr} >= $${params.length}::date`);
  }

  if (filters.hasta) {
    params.push(filters.hasta);
    clauses.push(`${fechaOperativaExpr} <= $${params.length}::date`);
  }

  const q = filters.q?.trim();
  if (q) {
    const numeroFiscalOrCdcPrefix = `${q}%`;
    const containsQuery = `%${q}%`;
    params.push(numeroFiscalOrCdcPrefix);
    const prefixParamIndex = params.length;
    params.push(containsQuery);
    const containsParamIndex = params.length;
    clauses.push(`(
      numero_fiscal ilike $${prefixParamIndex}
      or cdc ilike $${prefixParamIndex}
      or cliente_snapshot->>'documento' ilike $${containsParamIndex}
      or cliente_snapshot->>'razon_social' ilike $${containsParamIndex}
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
  const fiscalStatus = row.fiscal_response_snapshot as Record<string, unknown> | null;

  return {
    id: row.id,
    document_uuid: row.document_uuid,
    tipo: row.tipo,
    estado: row.estado,
    condicion_venta: row.condicion_venta,
    numero_fiscal: row.numero_fiscal,
    cdc,
    fiscal_document_id: row.fiscal_document_id,
    external_ref: row.external_ref,
    fiscal_envio_modo: getFiscalEnvioModo(fiscalStatus),
    delivery_mode: getDeliveryMode(fiscalStatus),
    fiscal_idempotent: getBoolean(fiscalStatus?.idempotent),
    batch: getBatchTransmissionInfo(fiscalStatus),
    cliente: row.cliente_snapshot as DocumentoResponse["cliente"],
    items,
    totals: row.totals_snapshot as DocumentoResponse["totals"],
    fiscal_status: fiscalStatus,
    documento_relacionado_id: row.documento_relacionado_id,
    nce_motivo: row.nce_motivo,
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

function getFiscalEnvioModo(fiscalStatus: Record<string, unknown> | null): DocumentoResponse["fiscal_envio_modo"] {
  const deliveryMode = getString(fiscalStatus?.delivery_mode);
  const explicitMode = getString(fiscalStatus?.fiscal_envio_modo);
  return deliveryMode === "SYNC" || explicitMode === "SYNC" ? "SYNC" : "BATCH";
}

function getDeliveryMode(fiscalStatus: Record<string, unknown> | null): DocumentoResponse["delivery_mode"] {
  const deliveryMode = getString(fiscalStatus?.delivery_mode);
  if (deliveryMode === "SYNC" || deliveryMode === "BATCH" || deliveryMode === "AUTO_FALLBACK_BATCH") {
    return deliveryMode;
  }

  return null;
}

function getBatchTransmissionInfo(fiscalStatus: Record<string, unknown> | null): DocumentoResponse["batch"] {
  const batch = fiscalStatus?.batch;
  if (!batch || typeof batch !== "object") {
    return null;
  }

  const data = batch as Record<string, unknown>;
  const status = getString(data.status);

  return {
    batch_id: getString(data.batch_id),
    did: getString(data.did),
    dProtConsLote: getString(data.dProtConsLote),
    dCodRes: getString(data.dCodRes),
    dMsgRes: getString(data.dMsgRes),
    dTpoProces: getString(data.dTpoProces),
    result_code: getString(data.result_code),
    result_message: getString(data.result_message),
    status:
      status === "CREATED" || status === "RECEIVED" || status === "PROCESSING" || status === "DONE" || status === "ERROR"
        ? status
        : null
  };
}

function getString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function getBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}
