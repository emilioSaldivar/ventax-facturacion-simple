import { pool } from "../../db/pool";
import type { DeliveryLinkRecord, DeliveryLinkRepository } from "./entrega.types";

interface DeliveryLinkRow {
  id: string;
  token: string;
  revoked_at: Date | null;
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
