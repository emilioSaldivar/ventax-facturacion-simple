import { pool } from "../../db/pool";
import type { DeliveryLinkRecord, DeliveryLinkRepository, PublicDocumentRecord } from "./entrega.types";

interface DeliveryLinkRow {
  id: string;
  token: string;
  revoked_at: Date | null;
}

interface PublicDocumentRow {
  token: string;
  facturador_id: string;
  emisor_id: string;
  razon_social: string;
  ruc: string;
  documento_id: string;
  document_uuid: string | null;
  estado: PublicDocumentRecord["documento"]["estado"];
  numero_fiscal: string | null;
  cdc: string | null;
  cliente_snapshot: unknown;
  totals_snapshot: unknown;
  email_estado: PublicDocumentRecord["documento"]["email_status"] | null;
}

export class PgDeliveryLinkRepository implements DeliveryLinkRepository {
  async findActiveByDocumento(input: { facturadorId: string; documentoId: string }): Promise<DeliveryLinkRecord | null> {
    const result = await pool.query<DeliveryLinkRow>(
      `
        select id, token, revoked_at
        from documento_links_publicos
        where facturador_id = $1
          and factura_operativa_id = $2
          and revoked_at is null
        limit 1
      `,
      [input.facturadorId, input.documentoId]
    );

    return mapRow(result.rows[0]);
  }

  async findPublicByToken(token: string): Promise<PublicDocumentRecord | null> {
    const result = await pool.query<PublicDocumentRow>(
      `
        select
          dlp.token,
          f.id as facturador_id,
          f.emisor_id,
          f.razon_social,
          f.ruc,
          fo.id as documento_id,
          fo.document_uuid,
          fo.estado,
          fo.numero_fiscal,
          fo.cdc,
          fo.cliente_snapshot,
          fo.totals_snapshot,
          fo.email_estado
        from documento_links_publicos dlp
        join facturas_operativas fo on fo.id = dlp.factura_operativa_id
        join facturadores f on f.id = dlp.facturador_id
        where dlp.token = $1
          and dlp.revoked_at is null
          and fo.deleted_at is null
          and f.deleted_at is null
        limit 1
      `,
      [token]
    );

    return mapPublicRow(result.rows[0]);
  }

  async create(input: {
    tenantId: string;
    facturadorId: string;
    documentoId: string;
    userId: string;
    token: string;
    regenerate: boolean;
  }): Promise<DeliveryLinkRecord> {
    const client = await pool.connect();

    try {
      await client.query("begin");

      if (input.regenerate) {
        await client.query(
          `
            update documento_links_publicos
            set revoked_at = coalesce(revoked_at, now())
            where facturador_id = $1
              and factura_operativa_id = $2
              and revoked_at is null
          `,
          [input.facturadorId, input.documentoId]
        );
      }

      const inserted = await client.query<DeliveryLinkRow>(
        `
          insert into documento_links_publicos (
            tenant_id,
            facturador_id,
            factura_operativa_id,
            token,
            created_by
          )
          values ($1, $2, $3, $4, $5)
          returning id, token, revoked_at
        `,
        [input.tenantId, input.facturadorId, input.documentoId, input.token, input.userId]
      );

      await client.query("commit");
      return mapRow(inserted.rows[0])!;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
}

export const deliveryLinkRepository = new PgDeliveryLinkRepository();

function mapRow(row: DeliveryLinkRow | undefined): DeliveryLinkRecord | null {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    token: row.token,
    revoked_at: row.revoked_at?.toISOString() ?? null
  };
}

function mapPublicRow(row: PublicDocumentRow | undefined): PublicDocumentRecord | null {
  if (!row) {
    return null;
  }

  return {
    token: row.token,
    facturador: {
      id: row.facturador_id,
      emisor_id: row.emisor_id,
      razon_social: row.razon_social,
      ruc: row.ruc
    },
    documento: {
      id: row.documento_id,
      document_uuid: row.document_uuid,
      estado: row.estado,
      numero_fiscal: row.numero_fiscal,
      cdc: row.cdc,
      cliente: row.cliente_snapshot as PublicDocumentRecord["documento"]["cliente"],
      totals: row.totals_snapshot as PublicDocumentRecord["documento"]["totals"],
      email_status: row.email_estado ?? "NOT_APPLICABLE"
    }
  };
}
