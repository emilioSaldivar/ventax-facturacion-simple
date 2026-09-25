// Integracion real contra Postgres. Se salta si no hay DATABASE_URL_TEST.
//
//   DATABASE_URL_TEST=postgres://facturacion_simple:facturacion_simple@127.0.0.1:5433/facturacion_simple \
//     npx vitest run tests/backoffice.import.integration.test.ts --root apps/api
//
// Cubre lo que los tests unitarios no pueden: los `on conflict` con clausula parcial, la
// atomicidad, el advisory lock y la resolucion de contexto que habilita la emision.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const DATABASE_URL = process.env.DATABASE_URL_TEST;
const describeDb = DATABASE_URL ? describe : describe.skip;

process.env.DATABASE_URL = DATABASE_URL ?? process.env.DATABASE_URL ?? "postgres://localhost/none";
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? "test-secret-integration";

const FIXTURES = join(__dirname, "fixtures");
const leer = (n: string) => readFileSync(join(FIXTURES, n), "utf8");

describeDb("import de configuracion — integracion con base", () => {
  let pool: import("pg").Pool;
  let repo: import("../src/modules/backoffice/import/import.repository").ImportRepository;
  let previewFacturadorImport: typeof import("../src/modules/backoffice/import/import.service").previewFacturadorImport;
  let applyFacturadorImport: typeof import("../src/modules/backoffice/import/import.service").applyFacturadorImport;

  const SLUG = `import-it-${Date.now()}`;
  // Emisor propio por corrida: RN-02 impide que el mismo emisor viva en dos tenants, asi que
  // reusar 5057016-1 chocaria con cualquier import previo (incluida la verificacion manual).
  const EMISOR = `9${String(Date.now()).slice(-6)}-1`;
  let tenantId = "";
  let usuarioId = "";

  const ctx = {
    feApiEnv: "prod" as const,
    feApiBaseUrl: "https://fe-api.ventax.app",
    sendProfileCode: true,
    hoy: "2026-09-19"
  };

  /** El fixture real, con el emisor reemplazado para aislar la corrida. */
  const archivo = () => ({
    filename: "fe-config-v0.1.json",
    format: "auto" as const,
    content: leer("fe-config-v0.1.json").replaceAll("5057016-1", EMISOR),
    target: { mode: "EXISTENTE" as const, tenant_id: tenantId }
  });

  beforeAll(async () => {
    ({ pool } = await import("../src/db/pool"));
    ({ importRepository: repo } = await import("../src/modules/backoffice/import/import.repository"));
    ({ previewFacturadorImport, applyFacturadorImport } = await import(
      "../src/modules/backoffice/import/import.service"
    ));

    const t = await pool.query<{ id: string }>(
      `insert into tenants (nombre, slug, estado, activo) values ($1, $2, 'ACTIVO', true) returning id`,
      ["Import IT", SLUG]
    );
    tenantId = t.rows[0]!.id;
    const u = await pool.query<{ id: string }>(
      `insert into usuarios (tenant_id, username, email, display_name, password_hash)
       values ($1, $2, $3, 'Import IT', 'x') returning id`,
      [tenantId, `import-it-${Date.now()}`, `import-it-${Date.now()}@example.com`]
    );
    usuarioId = u.rows[0]!.id;
  });

  afterAll(async () => {
    if (!tenantId) return;
    // Limpieza en orden inverso a las FK.
    await pool.query(`delete from facturador_import_eventos where tenant_id = $1`, [tenantId]);
    await pool.query(`delete from usuario_operacion_config where tenant_id = $1`, [tenantId]);
    await pool.query(`delete from actividad_punto_perfiles where tenant_id = $1`, [tenantId]);
    await pool.query(`delete from facturador_perfiles_emision where tenant_id = $1`, [tenantId]);
    await pool.query(`delete from facturador_puntos_expedicion where tenant_id = $1`, [tenantId]);
    await pool.query(`delete from facturador_establecimientos where tenant_id = $1`, [tenantId]);
    await pool.query(`delete from facturador_actividades where tenant_id = $1`, [tenantId]);
    await pool.query(`delete from facturadores where tenant_id = $1`, [tenantId]);
    await pool.query(`delete from usuarios where tenant_id = $1`, [tenantId]);
    await pool.query(`delete from tenant_suscripciones where tenant_id = $1`, [tenantId]);
    await pool.query(`delete from tenants where id = $1`, [tenantId]);
    await pool.end();
  });

  async function aplicar(overrides: Record<string, string> = {}) {
    const diff = await previewFacturadorImport(archivo(), { repository: repo, ctx });
    return applyFacturadorImport(
      {
        ...archivo(),
        preview_token: diff.preview_token,
        permitir_ambiente_distinto: false,
        documento_nro_overrides: overrides
      },
      usuarioId,
      { repository: repo, ctx }
    );
  }

  const contar = async (tabla: string) =>
    Number(
      (await pool.query<{ c: string }>(`select count(*)::text as c from ${tabla} where tenant_id = $1`, [tenantId]))
        .rows[0]!.c
    );

  it("import limpio crea toda la jerarquia en una transaccion", async () => {
    const res = await aplicar({ "A45203-E001-P001-FE-PTO": "0000950" });

    expect(res.aplicado).toBe(true);
    expect(await contar("facturadores")).toBe(1);
    expect(await contar("facturador_establecimientos")).toBe(1);
    expect(await contar("facturador_puntos_expedicion")).toBe(2);
    expect(await contar("facturador_actividades")).toBe(2);
    expect(await contar("facturador_perfiles_emision")).toBe(2);
    expect(await contar("actividad_punto_perfiles")).toBe(2);
    expect(await contar("facturador_import_eventos")).toBe(1);
  });

  it("el contexto creado cumple lo que exige la resolucion operativa (CA-2)", async () => {
    const { rows } = await pool.query<{ c: string }>(
      `select count(*)::text as c from actividad_punto_perfiles
        where tenant_id = $1 and activo = true and deleted_at is null
          and timbrado is not null and timbrado_inicio is not null
          and documento_nro is not null and credito_plazo_dias > 0`,
      [tenantId]
    );
    expect(Number(rows[0]!.c)).toBe(2);
  });

  it("aplica el override solo al contexto indicado", async () => {
    const { rows } = await pool.query<{ codigo: string; documento_nro: string }>(
      `select pe.codigo, app.documento_nro
         from actividad_punto_perfiles app
         join facturador_perfiles_emision pe on pe.id = app.perfil_emision_id
        where app.tenant_id = $1 order by pe.codigo`,
      [tenantId]
    );
    expect(rows.map((r) => r.documento_nro)).toEqual(["0000950", "0000001"]);
  });

  it("re-import identico no genera cambios (RN-12)", async () => {
    const diff = await previewFacturadorImport(archivo(), { repository: repo, ctx });
    expect(diff.resumen.crear).toBe(0);
    expect(diff.resumen.actualizar).toBe(0);
    expect(diff.contextos.every((c) => c.accion === "SIN_CAMBIOS")).toBe(true);
  });

  it("el re-import no pisa el documento_nro existente (RN-09)", async () => {
    await aplicar({ "A45203-E001-P001-FE-PTO": "9999999" });
    const { rows } = await pool.query<{ documento_nro: string }>(
      `select app.documento_nro from actividad_punto_perfiles app
         join facturador_perfiles_emision pe on pe.id = app.perfil_emision_id
        where app.tenant_id = $1 and pe.codigo = 'A45203-E001-P001-FE-PTO'`,
      [tenantId]
    );
    expect(rows[0]!.documento_nro).toBe("0000950");
  });

  it("un timbrado nuevo actualiza solo timbrado y timbrado_inicio", async () => {
    await pool.query(`update actividad_punto_perfiles set timbrado = '00000001' where tenant_id = $1`, [tenantId]);
    const diff = await previewFacturadorImport(archivo(), { repository: repo, ctx });

    expect(diff.contextos.every((c) => c.accion === "ACTUALIZAR")).toBe(true);
    expect(diff.contextos[0]!.campos.map((c) => c.campo)).toEqual(["timbrado"]);

    await aplicar();
    const { rows } = await pool.query<{ timbrado: string }>(
      `select distinct timbrado from actividad_punto_perfiles where tenant_id = $1`,
      [tenantId]
    );
    expect(rows.map((r) => r.timbrado)).toEqual(["18861677"]);
  });

  it("dos imports concurrentes del mismo emisor se serializan sin duplicar (RN-14)", async () => {
    const antes = await contar("facturadores");
    const d1 = await previewFacturadorImport(archivo(), { repository: repo, ctx });
    const d2 = await previewFacturadorImport(archivo(), { repository: repo, ctx });

    const hacer = (token: string) =>
      applyFacturadorImport(
        { ...archivo(), preview_token: token, permitir_ambiente_distinto: false, documento_nro_overrides: {} },
        usuarioId,
        { repository: repo, ctx }
      );

    const res = await Promise.allSettled([hacer(d1.preview_token), hacer(d2.preview_token)]);
    expect(res.some((r) => r.status === "fulfilled")).toBe(true);
    expect(await contar("facturadores")).toBe(antes);
    expect(await contar("actividad_punto_perfiles")).toBe(2);
  });

  it("un perfil sin actividad fija crea el contexto con la actividad elegida (RN-22, v0.2)", async () => {
    // Emisor propio para no chocar con el del resto del describe.
    const emisorSel = `8${String(Date.now()).slice(-6)}-1`;
    const contenido = leer("fe-config-actividad-seleccionable.json").replaceAll("5057016-1", emisorSel);
    const entrada = { filename: "sel.json", format: "auto" as const, content: contenido, target: { mode: "EXISTENTE" as const, tenant_id: tenantId } };

    const ctxTest = { ...ctx, feApiEnv: "test" as const, feApiBaseUrl: "http://localhost:9988" };
    const diff = await previewFacturadorImport(entrada, { repository: repo, ctx: ctxTest });

    expect(diff.puede_aplicar).toBe(true);
    expect(diff.contextos.every((c) => c.actividad_editable)).toBe(true);

    const perfil = diff.contextos[0]!.clave.perfil;
    await applyFacturadorImport(
      {
        ...entrada,
        preview_token: diff.preview_token,
        permitir_ambiente_distinto: false,
        documento_nro_overrides: {},
        actividad_overrides: { [perfil]: "45203" }
      },
      usuarioId,
      { repository: repo, ctx: ctxTest }
    );

    const { rows } = await pool.query<{ actividad: string; resoluble: boolean }>(
      `select a.codigo as actividad,
              (app.timbrado is not null and app.timbrado_inicio is not null
               and app.documento_nro is not null and app.credito_plazo_dias > 0) as resoluble
         from actividad_punto_perfiles app
         join facturador_actividades a on a.id = app.actividad_id
         join facturadores f on f.id = app.facturador_id and f.emisor_id = $1
         join facturador_perfiles_emision pe on pe.id = app.perfil_emision_id and pe.codigo = $2`,
      [emisorSel, perfil]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.actividad).toBe("45203");
    expect(rows[0]!.resoluble).toBe(true);
  });

  it("nada se persiste si el token quedo desactualizado", async () => {
    const eventosAntes = await contar("facturador_import_eventos");
    await expect(
      applyFacturadorImport(
        { ...archivo(), preview_token: "0".repeat(64), permitir_ambiente_distinto: false, documento_nro_overrides: {} },
        usuarioId,
        { repository: repo, ctx }
      )
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(await contar("facturador_import_eventos")).toBe(eventosAntes);
  });
});
