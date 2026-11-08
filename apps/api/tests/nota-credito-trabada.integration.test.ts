// SPEC_NOTA_CREDITO_TRABADA_v0.1, NCT-003 — integracion real contra Postgres. Se salta sin DATABASE_URL_TEST.
//
//   DATABASE_URL_TEST=postgres://<usuario>:<clave>@127.0.0.1:5533/<base> npx vitest run tests/nota-credito-trabada.integration.test.ts
//
// Requiere la migracion 0038. Crea una factura y sus notas por corrida y las borra al final.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const DATABASE_URL = process.env.DATABASE_URL_TEST;
const describeDb = DATABASE_URL ? describe : describe.skip;

process.env.DATABASE_URL = DATABASE_URL ?? process.env.DATABASE_URL ?? "postgres://localhost/none";
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? "test-secret-integration";

describeDb("nota de credito trabada: repositorio (integracion)", () => {
  let pool: import("pg").Pool;
  let repo: import("../src/modules/facturas/facturas.repository").PgFacturaRepository;
  let tenantId = "";
  let facturadorId = "";
  let usuarioId = "";
  let facturaId = "";
  const creados: string[] = [];

  const fila = async <T>(sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows[0] as T;

  beforeAll(async () => {
    ({ pool } = await import("../src/db/pool"));
    ({ facturasRepository: repo } = await import("../src/modules/facturas/facturas.repository"));
    const base = await fila<{ tenant_id: string; facturador_id: string; usuario_id: string }>(`
      select f.tenant_id, f.id as facturador_id, u.id as usuario_id
      from facturadores f join usuarios u on u.tenant_id = f.tenant_id
      order by f.created_at limit 1
    `);
    tenantId = base.tenant_id;
    facturadorId = base.facturador_id;
    usuarioId = base.usuario_id;
    const factura = await fila<{ id: string }>(
      `insert into facturas_operativas (
         tenant_id, facturador_id, usuario_id, tipo, condicion_venta, estado,
         cliente_snapshot, totals_snapshot, external_ref, fiscal_response_snapshot, numero_fiscal, cdc
       ) values ($1, $2, $3, 'FACTURA', 'CONTADO', 'EMITIDA',
         '{"documento_tipo":"RUC","documento":"80000000-1","razon_social":"NC trabada IT"}'::jsonb,
         '{"subtotal":1100,"total_sin_iva":1000,"iva_5":0,"iva_10":100,"total_iva":100,"total":1100}'::jsonb,
         $4, '{}'::jsonb, '0000001', $5)
       returning id`,
      [tenantId, facturadorId, usuarioId, `fac_ncit${Date.now()}`, "C".repeat(44)]
    );
    facturaId = factura.id;
    creados.push(facturaId);
  });

  afterAll(async () => {
    for (const id of [...creados].reverse()) {
      await pool.query("delete from audit_events where entity_id = $1", [id]);
      await pool.query("delete from factura_items_snapshot where factura_operativa_id = $1", [id]);
      await pool.query("delete from facturas_operativas where id = $1", [id]);
    }
    await pool.end();
  });

  async function crearNota(clave: string, estado: "PENDIENTE_SIFEN" | "RECHAZADA", trabada: boolean) {
    const original = (await repo.findById({ facturadorId, documentoId: facturaId }))!;
    const nota = await repo.createNotaCreditoFromFactura({
      tenantId,
      facturadorId,
      userId: usuarioId,
      original,
      motivo: "IT",
      externalRef: clave,
      idempotencyKey: clave,
      fiscalRequest: {} as never,
      fiscalResponse: null,
      fiscalError: { code: "TRANSMISSION_FAILED", recoverable: true, suggested_action: "RETRY" },
      estado,
      trabada
    });
    creados.push(nota.id);
    return nota;
  }

  it("persiste la nota trabada sin agenda de verificacion y con la marca en fiscal_status (RN-03, RN-08)", async () => {
    const nota = await crearNota(`nce_it_a_${Date.now()}`, "PENDIENTE_SIFEN", true);
    expect(nota.fiscal_status?.code).toBe("TRANSMISSION_FAILED");
    const agenda = await fila<{ next: string | null }>("select verificacion_next_at as next from facturas_operativas where id = $1", [nota.id]);
    expect(agenda.next).toBeNull();
  });

  it("la misma clave no crea otra fila: devuelve la existente (RN-09)", async () => {
    const notas = await repo.findNotasCreditoByOriginal({ facturadorId, documentoId: facturaId });
    const clave = notas[0]!.external_ref!;
    const otra = await crearNota(clave, "PENDIENTE_SIFEN", true);
    expect(otra.id).toBe(notas[0]!.id);
    expect(await repo.findNotasCreditoByOriginal({ facturadorId, documentoId: facturaId })).toHaveLength(1);
  });

  it("el reintento guarda la identidad y no la pisa con null (PLAN, seccion 2)", async () => {
    const [nota] = await repo.findNotasCreditoByOriginal({ facturadorId, documentoId: facturaId });
    const emitida = await repo.updateNotaCreditoTrasReintento({
      facturadorId,
      documentoId: nota!.id,
      estado: "EMITIDA",
      trabada: false,
      fiscalError: null,
      fiscalResponse: {
        fiscal_document_id: "nce-it",
        document_uuid: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        cdc: "D".repeat(44),
        numero_fiscal: "0000099",
        estado: "EMITIDA",
        status_raw: "APPROVED",
        result_code: "0260",
        result_message: "Aprobado",
        email_status: "SENT",
        raw: { status: "APPROVED" }
      }
    });
    expect(emitida).toMatchObject({ estado: "EMITIDA", numero_fiscal: "0000099", document_uuid: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" });
    const sinIdentidad = await repo.updateNotaCreditoTrasReintento({
      facturadorId,
      documentoId: nota!.id,
      estado: "EMITIDA",
      trabada: false,
      fiscalError: { code: "x" },
      fiscalResponse: null
    });
    expect(sinIdentidad?.document_uuid).toBe("dddddddd-dddd-4ddd-8ddd-dddddddddddd");
    expect(sinIdentidad?.cdc).toBe("D".repeat(44));
  });

  it("una nota RECHAZADA no bloquea la siguiente sobre la misma factura (migracion 0038, RN-02)", async () => {
    const [nota] = await repo.findNotasCreditoByOriginal({ facturadorId, documentoId: facturaId });
    await pool.query("update facturas_operativas set estado = 'RECHAZADA' where id = $1", [nota!.id]);
    const segunda = await crearNota(`nce_it_b_${Date.now()}`, "PENDIENTE_SIFEN", true);
    expect(segunda.id).not.toBe(nota!.id);
    const todas = await repo.findNotasCreditoByOriginal({ facturadorId, documentoId: facturaId });
    expect(todas.map((n) => n.estado)).toEqual(["RECHAZADA", "PENDIENTE_SIFEN"]);
    // Con una nota viva, otra clave sobre la misma factura no crea fila: devuelve la viva.
    const tercera = await crearNota(`nce_it_c_${Date.now()}`, "PENDIENTE_SIFEN", true);
    expect(tercera.id).toBe(segunda.id);
  });
});
