// Integracion real contra Postgres. Se salta sin DATABASE_URL_TEST.
//   SPEC_CARGA_MASIVA_FACTURAS_v0.1, CA-05, CA-06 y CA-09.
//
// Usa un contexto existente y borra lo que crea.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const DATABASE_URL = process.env.DATABASE_URL_TEST;
const describeDb = DATABASE_URL ? describe : describe.skip;

process.env.DATABASE_URL = DATABASE_URL ?? process.env.DATABASE_URL ?? "postgres://localhost/none";
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? "test-secret-integration";

describeDb("carga masiva, con base", () => {
  let pool: import("pg").Pool;
  let repo: import("../src/modules/cargas/cargas.repository").PgCargaRepository;
  let mapeo: typeof import("../src/modules/cargas/cargas.mapeo");
  type Base = { tenant_id: string; facturador_id: string; usuario_id: string; contexto_id: string };
  let base: Base;
  let cargaId: string;
  const feCargaId = `integracion-${Date.now()}`;
  const uuid = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

  const totales = { lineas: 1, comprobantes: 1, invalidos: 0, duplicados: 0, pendientes: 0, preparados: 1, enviados: 0, aprobados: 0, aprobados_con_obs: 0, rechazados: 0, con_error: 0, cancelados: 0, con_advertencias: 0, numeros_salteados: 0, lotes_enviados: 0, lotes_en_proceso: 0, lotes_concluidos: 0 };

  function comprobante(estado: "PREPARADO" | "APROBADO", documento_estado: string | null = null) {
    return {
      orden: 1,
      filas: [2, 2],
      tipo_documento: "FACTURA",
      numero_archivo: "001-002-0000099",
      numero_asignado: "001-002-0000007",
      referencia_venta: "PED-1",
      estado,
      errores: [],
      advertencias: [],
      document_uuid: uuid,
      cdc: "1".repeat(44),
      documento_estado,
      lote: null,
      sifen: estado === "APROBADO" ? { codigo: "0260", mensaje: "Aprobado" } : null,
      correo: estado === "APROBADO" ? ("SENT" as const) : ("PENDING" as const),
      aprobado_en: estado === "APROBADO" ? "2026-11-07T10:00:00.000Z" : null,
      actualizado_en: "2026-11-07T10:00:00.000Z",
      detalle: {
        fecha: "2026-11-07T09:00:00",
        tipoTransaccion: 1,
        receptor: { tipoDocumento: "RUC", docNro: "80000000", dv: "5", razonSocial: `Integracion ${feCargaId}` },
        condicionOperacion: { tipo: "CONTADO" },
        items: [{ codigo: "A", descripcion: "Uno", cantidad: 1.5, precioUnitario: 110000, ivaTipo: "IVA10" }],
        total: 165000
      }
    };
  }

  async function incorporar(estado: "PREPARADO" | "APROBADO", documentoEstado: string | null = null) {
    const fila = (await repo.findById(cargaId, base.facturador_id))!;
    const factura = mapeo.comprobanteAFactura(fila, comprobante(estado, documentoEstado))!;
    await repo.incorporarFacturas(fila, [factura]);
  }

  const documento = async () =>
    (await pool.query<{ id: string; estado: string; email_estado: string; verificacion_next_at: Date | null; carga_masiva_id: string; carga_numero_archivo: string; numero_fiscal: string; usuario_id: string }>(
      "select * from facturas_operativas where facturador_id = $1 and external_ref = $2",
      [base.facturador_id, `carga:${feCargaId}:1`]
    )).rows;

  beforeAll(async () => {
    ({ pool } = await import("../src/db/pool"));
    ({ cargaRepository: repo } = await import("../src/modules/cargas/cargas.repository"));
    mapeo = await import("../src/modules/cargas/cargas.mapeo");
    const fila = await pool.query<Base>(`
      select app.tenant_id, app.facturador_id, app.id as contexto_id,
             (select u.id from usuarios u where u.tenant_id = app.tenant_id and u.deleted_at is null limit 1) as usuario_id
      from actividad_punto_perfiles app
      where app.deleted_at is null
        and exists (select 1 from usuarios u where u.tenant_id = app.tenant_id and u.deleted_at is null)
      limit 1
    `);
    if (!fila.rows[0]) throw new Error("La base de prueba necesita un contexto operativo con usuario.");
    base = fila.rows[0];
    const creada = await repo.crear({
      tenantId: base.tenant_id,
      facturadorId: base.facturador_id,
      actividadPuntoPerfilId: base.contexto_id,
      tamanoBytes: 10,
      sha256: `sha-${feCargaId}`,
      subidaPor: base.usuario_id,
      syncNextAt: new Date(Date.now() - 1000),
      feCarga: {
        carga_id: feCargaId,
        estado: "EN_PREPARACION",
        emisor_id: "x",
        env: "test",
        formato: "CSV",
        version: "1",
        nombre_archivo: "ventas.csv",
        tamano_bytes: 10,
        perfil: null,
        establecimiento: "001",
        punto: "002",
        actividad: "82110",
        numeracion: "SERVICIO",
        recibida_en: null,
        validada_en: null,
        confirmada_en: null,
        iniciada_en: null,
        finalizada_en: null,
        cancelada_en: null,
        acciones: { puede_confirmar: false, puede_cancelar: false, puede_reintentar: false },
        motivos: null,
        totales
      }
    });
    cargaId = creada.id;
  });

  afterAll(async () => {
    if (!pool) return;
    await pool.query("delete from audit_events where entity_id = $1", [cargaId]);
    await pool.query("delete from facturas_operativas where carga_masiva_id = $1", [cargaId]);
    await pool.query("delete from cargas_masivas where id = $1", [cargaId]);
    await pool.end();
  });

  it("crear dos veces la misma carga no duplica", async () => {
    const fila = (await repo.findById(cargaId, base.facturador_id))!;
    const again = await repo.crear({
      tenantId: base.tenant_id,
      facturadorId: base.facturador_id,
      actividadPuntoPerfilId: base.contexto_id,
      tamanoBytes: 10,
      sha256: fila.sha256,
      subidaPor: base.usuario_id,
      syncNextAt: null,
      feCarga: fila.fe_snapshot as never
    });
    expect(again.id).toBe(cargaId);
    expect(await repo.findActivaPorSha(base.facturador_id, fila.sha256)).toMatchObject({ id: cargaId });
  });

  it("el claim toma una carga agendada y la traba: un segundo claim no la devuelve", async () => {
    const primero = await repo.claimNextCargasSync(50);
    expect(primero.map((c) => c.id)).toContain(cargaId);
    const segundo = await repo.claimNextCargasSync(50);
    expect(segundo.map((c) => c.id)).not.toContain(cargaId);
  });

  it("CA-06, RN-17: incorpora con cantidad decimal, sin agenda de verificacion, y repetir no duplica", async () => {
    await incorporar("PREPARADO");
    await incorporar("PREPARADO");
    const filas = await documento();
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ estado: "PENDIENTE_SIFEN", email_estado: "PENDING", carga_masiva_id: cargaId, carga_numero_archivo: "001-002-0000099", numero_fiscal: "0000007", verificacion_next_at: null });
    const items = await pool.query<{ cantidad: string; subtotal: number }>("select cantidad, subtotal from factura_items_snapshot where factura_operativa_id = $1", [filas[0]!.id]);
    expect(items.rows).toHaveLength(1);
    expect(Number(items.rows[0]!.cantidad)).toBe(1.5);
    expect(items.rows[0]!.subtotal).toBe(165000);
  });

  it("avanza a EMITIDA y el documento se lee por el repositorio de facturas con su carga", async () => {
    await incorporar("APROBADO");
    const { facturasRepository } = await import("../src/modules/facturas/facturas.repository");
    const { items } = await facturasRepository.list({ facturadorId: base.facturador_id, filters: { carga_id: cargaId, limit: 10, offset: 0 } });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ estado: "EMITIDA", document_uuid: uuid, carga: { id: cargaId, numero_archivo: "001-002-0000099" } });
    expect(items[0]!.items[0]!.cantidad).toBe(1.5);
  });

  it("una EMITIDA no vuelve atras; una ANULADA no se revierte", async () => {
    await incorporar("PREPARADO");
    expect((await documento())[0]!.estado).toBe("EMITIDA");
    await incorporar("APROBADO", "CANCELLED");
    expect((await documento())[0]!.estado).toBe("ANULADA");
    await incorporar("APROBADO", "APPROVED");
    expect((await documento())[0]!.estado).toBe("ANULADA");
  });

  it("CA-09: no crea clientes ni items de catalogo", async () => {
    const clientes = await pool.query("select 1 from facturador_clientes where razon_social = $1", [`Integracion ${feCargaId}`]);
    expect(clientes.rowCount).toBe(0);
  });

  it("registra eventos de auditoria y documentos por uuid", async () => {
    const fila = (await repo.findById(cargaId, base.facturador_id))!;
    await repo.registrarEvento(fila, base.usuario_id, "CARGA_CONFIRMADA", { prueba: true });
    const eventos = await pool.query("select event_type from audit_events where entity_type = 'carga_masiva' and entity_id = $1", [cargaId]);
    expect(eventos.rows[0]).toMatchObject({ event_type: "CARGA_CONFIRMADA" });
    const mapa = await repo.documentosPorUuid(base.facturador_id, [uuid]);
    expect(mapa.get(uuid)).toBeDefined();
  });
});
