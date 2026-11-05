// Integracion real contra Postgres. Se salta sin DATABASE_URL_TEST.
//   SPEC_BUSQUEDA_CLIENTES_ENTRE_FACTURADORES_v0.1 y SPEC_RECUPERACION_EMISION_TRABADA_v0.1
//
// Usa dos facturadores existentes y borra lo que crea.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const DATABASE_URL = process.env.DATABASE_URL_TEST;
const describeDb = DATABASE_URL ? describe : describe.skip;

process.env.DATABASE_URL = DATABASE_URL ?? process.env.DATABASE_URL ?? "postgres://localhost/none";
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? "test-secret-integration";

describeDb("correcciones de capacidad, con base", () => {
  let pool: import("pg").Pool;
  let clientes: import("../src/modules/clientes/clientes.repository").PgClienteRepository;
  let facturas: import("../src/modules/facturas/facturas.repository").PgFacturaRepository;
  type Base = { tenant_id: string; facturador_id: string; usuario_id: string };
  let a: Base;
  let b: Base;
  const sufijo = String(Date.now()).slice(-9);
  const documentoB = `77${sufijo}`;
  const razonB = `Zeta Ajena ${sufijo}`;
  const facturasCreadas: string[] = [];

  beforeAll(async () => {
    ({ pool } = await import("../src/db/pool"));
    ({ clienteRepository: clientes } = await import("../src/modules/clientes/clientes.repository"));
    ({ facturasRepository: facturas } = await import("../src/modules/facturas/facturas.repository"));
    const filas = (
      await pool.query<Base>(`
        select f.tenant_id, f.id as facturador_id, min(u.id::text)::uuid as usuario_id
        from facturadores f join usuarios u on u.tenant_id = f.tenant_id
        group by f.tenant_id, f.id, f.created_at order by f.created_at limit 2
      `)
    ).rows;
    [a, b] = filas;
    expect(b, "hacen falta dos facturadores en la base").toBeDefined();

    await clientes.upsertForFacturador({
      tenantId: b.tenant_id,
      facturadorId: b.facturador_id,
      userId: b.usuario_id,
      data: { documento_tipo: "CI", documento: documentoB, documento_normalizado: documentoB, razon_social: razonB, direccion: "Calle B", telefono: "0981000000", email: "b@carga.invalid", naturaleza: "FISICA" } as never
    });
  });

  afterAll(async () => {
    for (const id of facturasCreadas) await pool.query("delete from facturas_operativas where id = $1", [id]);
    await pool.query("delete from facturador_clientes where cliente_identidad_id in (select id from cliente_identidades where documento_normalizado = $1)", [documentoB]);
    await pool.query("delete from cliente_identidades where documento_normalizado = $1", [documentoB]);
    await pool.end();
  });

  const buscarComoA = (q: string) => clientes.search({ tenantId: a.tenant_id, facturadorId: a.facturador_id, q, limit: 30 });
  const ajeno = (filas: Awaited<ReturnType<typeof buscarComoA>>) => filas.filter((f) => f.documento === documentoB);

  it("CA-01: un fragmento de razon social ajena no devuelve clientes de otro facturador", async () => {
    expect(ajeno(await buscarComoA(razonB.slice(0, 8)))).toHaveLength(0);
    expect(ajeno(await buscarComoA(razonB))).toHaveLength(0);
  });

  it("CA-02: un fragmento de documento ajeno tampoco", async () => {
    expect(ajeno(await buscarComoA(documentoB.slice(0, 6)))).toHaveLength(0);
  });

  it("CA-03: el documento exacto devuelve la identidad, sin datos de contacto", async () => {
    const [resultado] = ajeno(await buscarComoA(documentoB));
    expect(resultado).toMatchObject({ source: "IDENTIDAD_COMPARTIDA", razon_social: razonB, cliente_id: null });
    expect(resultado.direccion ?? null).toBeNull();
    expect(resultado.telefono ?? null).toBeNull();
    expect(resultado.email ?? null).toBeNull();
  });

  it("CA-04: la agenda propia sigue encontrando por fragmento, con sus datos", async () => {
    const filas = await clientes.search({ tenantId: b.tenant_id, facturadorId: b.facturador_id, q: razonB.slice(0, 8), limit: 30 });
    const [resultado] = filas.filter((f) => f.documento === documentoB);
    expect(resultado).toMatchObject({ source: "AGENDA_FACTURADOR", telefono: "0981000000", email: "b@carga.invalid" });
  });

  async function crearTrabajo(estado: string, lockedHace: string | null): Promise<string> {
    const { rows } = await pool.query<{ id: string }>(
      `insert into facturas_operativas (tenant_id, facturador_id, usuario_id, tipo, condicion_venta, estado,
         cliente_snapshot, totals_snapshot, external_ref, fiscal_request_snapshot)
       values ($1, $2, $3, 'FACTURA', 'CONTADO', 'EMITIENDO',
         '{"documento_tipo":"CI","documento":"1","razon_social":"IT"}'::jsonb,
         '{"subtotal":1,"total_sin_iva":1,"iva_5":0,"iva_10":0,"total_iva":0,"total":1}'::jsonb,
         $4, '{"external_ref":"it"}'::jsonb)
       returning id`,
      [a.tenant_id, a.facturador_id, a.usuario_id, `fac_it${Date.now()}${Math.random()}`]
    );
    await pool.query(
      `insert into factura_emision_outbox (tenant_id, facturador_id, factura_operativa_id, estado, attempts, locked_at, next_attempt_at)
       values ($1, $2, $3, $4, 1, ${lockedHace ? `now() - interval '${lockedHace}'` : "null"}, now() + interval '1 day')`,
      [a.tenant_id, a.facturador_id, rows[0].id, estado]
    );
    facturasCreadas.push(rows[0].id);
    return rows[0].id;
  }

  it("RET CA-01: reclama un PROCESSING vencido y no uno reciente ni uno terminado", async () => {
    await pool.query("update factura_emision_outbox set next_attempt_at = now() + interval '1 day' where estado in ('PENDING','FAILED_TEMP')");
    const reciente = await crearTrabajo("PROCESSING", "1 minute");
    const terminado = await crearTrabajo("DONE", "2 hours");
    const vencido = await crearTrabajo("PROCESSING", "6 minutes");

    const reclamado = await facturas.claimNextPendingEmission();
    expect(reclamado?.documentoId).toBe(vencido);
    expect(reclamado?.attempts).toBe(2);

    const segundo = await facturas.claimNextPendingEmission();
    expect(segundo?.documentoId).not.toBe(reciente);
    expect(segundo?.documentoId).not.toBe(terminado);
    expect(segundo?.documentoId).not.toBe(vencido);
  });
});
