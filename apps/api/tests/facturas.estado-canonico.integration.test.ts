// SPEC_ESTADO_FISCAL_CANONICO_v0.1 RN-04 — integracion real contra Postgres. Se salta sin DATABASE_URL_TEST.
//
//   DATABASE_URL_TEST=postgres://facturacion_simple:facturacion_simple@127.0.0.1:5433/facturacion_simple \
//     npx vitest run tests/facturas.estado-canonico.integration.test.ts --root apps/api
//
// Usa un facturador ya existente y crea una factura propia por corrida, que borra al final.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const DATABASE_URL = process.env.DATABASE_URL_TEST;
const describeDb = DATABASE_URL ? describe : describe.skip;

process.env.DATABASE_URL = DATABASE_URL ?? process.env.DATABASE_URL ?? "postgres://localhost/none";
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? "test-secret-integration";

describeDb("estado fiscal canonico — agenda sin huerfanos con base", () => {
  let pool: import("pg").Pool;
  let repo: import("../src/modules/facturas/facturas.repository").PgFacturaRepository;
  let documentoId = "";
  let facturadorId = "";

  const agenda = async () =>
    (await pool.query<{ next: Date | null }>("select verificacion_next_at as next from facturas_operativas where id = $1", [documentoId])).rows[0].next;

  beforeAll(async () => {
    ({ pool } = await import("../src/db/pool"));
    ({ facturasRepository: repo } = await import("../src/modules/facturas/facturas.repository"));

    const base = (
      await pool.query<{ tenant_id: string; facturador_id: string; usuario_id: string }>(`
        select f.tenant_id, f.id as facturador_id, u.id as usuario_id
        from facturadores f join usuarios u on u.tenant_id = f.tenant_id
        order by f.created_at limit 1
      `)
    ).rows[0];
    facturadorId = base.facturador_id;

    documentoId = (
      await pool.query<{ id: string }>(
        `
          insert into facturas_operativas (tenant_id, facturador_id, usuario_id, tipo, condicion_venta, estado,
            cliente_snapshot, totals_snapshot, document_uuid, verificacion_next_at)
          values ($1, $2, $3, 'FACTURA', 'CONTADO', 'PENDIENTE_SIFEN',
            '{"documento_tipo":"RUC","documento":"80000000-1","razon_social":"Estado canonico IT"}'::jsonb,
            '{"subtotal":11000,"total_sin_iva":10000,"iva_5":0,"iva_10":1000,"total_iva":1000,"total":11000}'::jsonb,
            gen_random_uuid(), null)
          returning id
        `,
        [base.tenant_id, facturadorId, base.usuario_id]
      )
    ).rows[0].id;
  });

  afterAll(async () => {
    if (documentoId) {
      await pool.query("delete from facturas_operativas where id = $1", [documentoId]);
    }
    await pool.end();
  });

  it("agenda un documento no final que habia quedado sin agenda", async () => {
    expect(await agenda()).toBeNull();

    await repo.updateFiscalStatus({ facturadorId, documentoId, estado: "PENDIENTE_SIFEN", fiscalStatus: {}, fiscalStatusRaw: "QUEUED_BATCH" });

    const next = await agenda();
    expect(next).not.toBeNull();
    const minutos = (new Date(next as Date).getTime() - Date.now()) / 60000;
    expect(minutos).toBeGreaterThan(4);
    expect(minutos).toBeLessThanOrEqual(5);
  });

  it("no pisa una agenda existente (el worker manda con su backoff)", async () => {
    await pool.query("update facturas_operativas set verificacion_next_at = now() + interval '6 hours' where id = $1", [documentoId]);

    await repo.updateFiscalStatus({ facturadorId, documentoId, estado: "PENDIENTE_SIFEN", fiscalStatus: {} });

    const minutos = (new Date((await agenda()) as Date).getTime() - Date.now()) / 60000;
    expect(minutos).toBeGreaterThan(300);
  });

  it("retira de la agenda un documento que pasa a estado final", async () => {
    const actualizado = await repo.updateFiscalStatus({
      facturadorId,
      documentoId,
      estado: "RECHAZADA",
      fiscalStatus: {},
      fiscalStatusRaw: "REJECTED",
      sifenResultCode: "0420"
    });

    expect(actualizado).toMatchObject({ estado: "RECHAZADA", fiscal_status_raw: "REJECTED", sifen_result_code: "0420" });
    expect(await agenda()).toBeNull();
  });
});
