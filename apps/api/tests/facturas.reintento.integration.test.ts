// SPEC_REINTENTO_EMISION_CONFIRMADO_v0.1 RN-03 — integracion real contra Postgres. Se salta sin DATABASE_URL_TEST.
//
//   DATABASE_URL_TEST=postgres://facturacion_simple:facturacion_simple@127.0.0.1:5433/facturacion_simple \
//     npx vitest run tests/facturas.reintento.integration.test.ts --root apps/api
//
// Usa un facturador ya existente en la base y crea una factura propia por corrida, que borra al final.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const DATABASE_URL = process.env.DATABASE_URL_TEST;
const describeDb = DATABASE_URL ? describe : describe.skip;

process.env.DATABASE_URL = DATABASE_URL ?? process.env.DATABASE_URL ?? "postgres://localhost/none";
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? "test-secret-integration";

describeDb("reintento de emision confirmado — adopcion con base", () => {
  let pool: import("pg").Pool;
  let repo: import("../src/modules/facturas/facturas.repository").PgFacturaRepository;
  let documentoId = "";
  let facturadorId = "";
  let usuarioId = "";

  const fila = async <T>(sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows[0] as T;

  beforeAll(async () => {
    ({ pool } = await import("../src/db/pool"));
    ({ facturasRepository: repo } = await import("../src/modules/facturas/facturas.repository"));

    const base = await fila<{ tenant_id: string; facturador_id: string; usuario_id: string }>(`
      select f.tenant_id, f.id as facturador_id, u.id as usuario_id
      from facturadores f
      join usuarios u on u.tenant_id = f.tenant_id
      order by f.created_at
      limit 1
    `);
    facturadorId = base.facturador_id;
    usuarioId = base.usuario_id;

    const factura = await fila<{ id: string }>(
      `
        insert into facturas_operativas (
          tenant_id, facturador_id, usuario_id, tipo, condicion_venta, estado,
          cliente_snapshot, totals_snapshot, external_ref, fiscal_response_snapshot, numero_fiscal
        )
        values ($1, $2, $3, 'FACTURA', 'CONTADO', 'ERROR_TEMPORAL',
          '{"documento_tipo":"RUC","documento":"80000000-1","razon_social":"Reintento IT"}'::jsonb,
          '{"subtotal":11000,"total_sin_iva":10000,"iva_5":0,"iva_10":1000,"total_iva":1000,"total":11000}'::jsonb,
          $4, '{"code":"TIMEOUT","recoverable":true}'::jsonb, null)
        returning id
      `,
      [base.tenant_id, facturadorId, usuarioId, `fac_it${Date.now()}`]
    );
    documentoId = factura.id;

    await pool.query(
      `insert into factura_emision_outbox (tenant_id, facturador_id, factura_operativa_id, estado, attempts)
       values ($1, $2, $3, 'FAILED_TEMP', 3)`,
      [base.tenant_id, facturadorId, documentoId]
    );
  });

  afterAll(async () => {
    if (documentoId) {
      await pool.query("delete from audit_events where entity_id = $1", [documentoId]);
      await pool.query("delete from facturas_operativas where id = $1", [documentoId]);
    }
    await pool.end();
  });

  it("adopta la identidad de FE, cierra el outbox, agenda la verificacion y audita", async () => {
    const adoptado = await repo.adoptarDocumentoFiscalExistente({
      facturadorId,
      documentoId,
      requestedBy: usuarioId,
      documentUuid: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      fiscalDocumentId: "158",
      cdc: "0".repeat(44),
      numeroFiscal: "0001086",
      fiscalStatus: { action: "ADOPTED_FROM_IDEMPOTENCY", idempotency: { result: "IMPACTED" } }
    });

    expect(adoptado).toMatchObject({
      estado: "PENDIENTE_SIFEN",
      document_uuid: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      cdc: "0".repeat(44),
      numero_fiscal: "0001086",
      fiscal_document_id: "158"
    });

    const outbox = await fila<{ estado: string }>("select estado from factura_emision_outbox where factura_operativa_id = $1", [documentoId]);
    expect(outbox.estado).toBe("DONE");

    const agenda = await fila<{ minutos: number; attempts: number; emitido: boolean }>(
      `select extract(epoch from (verificacion_next_at - now())) / 60 as minutos, verificacion_attempts as attempts,
              emitted_at is not null as emitido
       from facturas_operativas where id = $1`,
      [documentoId]
    );
    expect(Number(agenda.minutos)).toBeGreaterThan(4);
    expect(Number(agenda.minutos)).toBeLessThanOrEqual(5);
    expect(agenda.attempts).toBe(0);
    expect(agenda.emitido).toBe(true);

    const audit = await fila<{ total: string }>(
      "select count(*) as total from audit_events where entity_id = $1 and event_type = 'FACTURA_EMISION_ADOPTADA'",
      [documentoId]
    );
    expect(Number(audit.total)).toBe(1);
  });

  it("no pisa una identidad existente: la segunda adopcion devuelve null", async () => {
    const segunda = await repo.adoptarDocumentoFiscalExistente({
      facturadorId,
      documentoId,
      requestedBy: usuarioId,
      documentUuid: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      fiscalDocumentId: null,
      cdc: null,
      numeroFiscal: null,
      fiscalStatus: {}
    });

    expect(segunda).toBeNull();
    const actual = await fila<{ document_uuid: string }>("select document_uuid from facturas_operativas where id = $1", [documentoId]);
    expect(actual.document_uuid).toBe("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
  });

  it("devuelve la clave de consumidor del facturador sin exponerla en el test", async () => {
    const clave = await repo.getFacturadorApiKey(facturadorId);
    expect(clave === null || typeof clave === "string").toBe(true);
    expect(await repo.getFacturadorApiKey("00000000-0000-4000-8000-000000000000")).toBeNull();
  });
});
