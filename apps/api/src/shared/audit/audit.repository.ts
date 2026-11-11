import { pool } from "../../db/pool";

export interface AuditEventInput {
  tenantId: string | null;
  facturadorId: string | null;
  usuarioId: string | null;
  entityType: string;
  entityId: string | null;
  eventType: string;
  metadata: Record<string, unknown>;
}

export interface AuditRepository {
  insertEvent(input: AuditEventInput): Promise<void>;
}

/** Insert generico en audit_events (mismas columnas que usa facturas.repository.ts). */
export class PgAuditRepository implements AuditRepository {
  async insertEvent(input: AuditEventInput): Promise<void> {
    await pool.query(
      `
        insert into audit_events (tenant_id, facturador_id, usuario_id, entity_type, entity_id, event_type, metadata)
        values ($1, $2, $3, $4, $5, $6, $7::jsonb)
      `,
      [input.tenantId, input.facturadorId, input.usuarioId, input.entityType, input.entityId, input.eventType, JSON.stringify(input.metadata)]
    );
  }

  /** Facturador de una configuracion operativa, para atribuir el evento de perfil. */
  async facturadorDe(operacionConfigId: string): Promise<string | null> {
    const result = await pool.query<{ facturador_id: string }>(
      `select facturador_id from usuario_operacion_config where id = $1`,
      [operacionConfigId]
    );
    return result.rows[0]?.facturador_id ?? null;
  }
}

export const auditRepository = new PgAuditRepository();
