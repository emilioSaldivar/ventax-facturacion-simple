// SPEC_IMPORT_CONFIG_FACTURADOR_v0.3 — integracion real contra Postgres. Se salta sin DATABASE_URL_TEST.
//
//   DATABASE_URL_TEST=postgres://facturacion_simple:facturacion_simple@127.0.0.1:5433/facturacion_simple \
//     npx vitest run tests/backoffice.import.v03.integration.test.ts --root apps/api
//
// Reproduce el alta de 4543629-0 (2026-10-14) con un emisor propio por corrida: el primer export
// sin perfiles, el cambio de nombre visible y el re-export con perfil de las 13:47.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const DATABASE_URL = process.env.DATABASE_URL_TEST;
const describeDb = DATABASE_URL ? describe : describe.skip;

process.env.DATABASE_URL = DATABASE_URL ?? process.env.DATABASE_URL ?? "postgres://localhost/none";
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? "test-secret-integration";

const FIXTURES = join(__dirname, "fixtures");
const leer = (n: string) => readFileSync(join(FIXTURES, n), "utf8");
// Valor sintetico, no es una clave real.
const API_KEY_TEST = "clave-sintetica-de-integracion";

describeDb("import v0.3 — integracion con base", () => {
  let pool: import("pg").Pool;
  let repo: import("../src/modules/backoffice/import/import.repository").ImportRepository;
  let backoffice: import("../src/modules/backoffice/backoffice.repository").PgBackofficeRepository;
  let previewFacturadorImport: typeof import("../src/modules/backoffice/import/import.service").previewFacturadorImport;
  let applyFacturadorImport: typeof import("../src/modules/backoffice/import/import.service").applyFacturadorImport;

  const SLUG = `import-v03-${Date.now()}`;
  const EMISOR = `8${String(Date.now()).slice(-6)}-0`;
  let tenantId = "";
  let usuarioId = "";
  let facturadorId = "";

  const ctx = { feApiEnv: "test" as const, feApiBaseUrl: "http://facturacion-electronica:8080/v1", sendProfileCode: true, hoy: "2026-10-14" };

  const archivo = (fixture: string) => ({
    filename: fixture,
    format: "auto" as const,
    content: leer(fixture).replaceAll("4543629-0", EMISOR),
    target: { mode: "EXISTENTE" as const, tenant_id: tenantId }
  });

  async function aplicar(fixture: string, extra: Record<string, unknown> = {}) {
    const d = await previewFacturadorImport(archivo(fixture), { repository: repo, ctx });
    return applyFacturadorImport(
      { ...archivo(fixture), preview_token: d.preview_token, permitir_ambiente_distinto: false, documento_nro_overrides: {}, actividad_overrides: {}, ...extra },
      usuarioId,
      { repository: repo, ctx }
    );
  }

  const fila = async <T>(sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows[0] as T;

  beforeAll(async () => {
    ({ pool } = await import("../src/db/pool"));
    ({ importRepository: repo } = await import("../src/modules/backoffice/import/import.repository"));
    ({ backofficeRepository: backoffice } = await import("../src/modules/backoffice/backoffice.repository"));
    ({ previewFacturadorImport, applyFacturadorImport } = await import("../src/modules/backoffice/import/import.service"));

    tenantId = (await fila<{ id: string }>(`insert into tenants (nombre, slug, estado, activo) values ('Import v03', $1, 'ACTIVO', true) returning id`, [SLUG])).id;
    usuarioId = (
      await fila<{ id: string }>(
        `insert into usuarios (tenant_id, username, email, display_name, password_hash) values ($1, $2, $3, 'Import v03', 'x') returning id`,
        [tenantId, SLUG, `${SLUG}@example.com`]
      )
    ).id;
  });

  afterAll(async () => {
    if (!tenantId) return;
    for (const tabla of [
      "facturador_import_eventos",
      "usuario_operacion_config",
      "actividad_punto_perfiles",
      "facturador_perfiles_emision",
      "facturador_puntos_expedicion",
      "facturador_establecimientos",
      "facturador_actividades",
      "facturadores",
      "usuarios",
      "tenant_suscripciones"
    ]) {
      await pool.query(`delete from ${tabla} where tenant_id = $1`, [tenantId]);
    }
    await pool.query(`delete from tenants where id = $1`, [tenantId]);
    await pool.end();
  });

  it("sin API key no escribe nada (CA-7)", async () => {
    await expect(aplicar("fe-config-4543629-sin-perfiles.json")).rejects.toMatchObject({
      statusCode: 422,
      details: { motivo: "API_KEY_REQUERIDA" }
    });
    const { c } = await fila<{ c: number }>(`select count(*)::int as c from facturadores where tenant_id = $1`, [tenantId]);
    expect(c).toBe(0);
  });

  it("el primer export sin perfiles crea el alta completa con el centinela (CA-1)", async () => {
    const res = await aplicar("fe-config-4543629-sin-perfiles.json", {
      api_key: API_KEY_TEST,
      textos_overrides: { nombre_fantasia: "METAMORFOSIS AGENCIA DIGITAL" }
    });
    facturadorId = res.facturador_id;

    const f = await fila<{ nombre_fantasia: string; key: string }>(
      `select nombre_fantasia, fe_consumer_api_key as key from facturadores where id = $1`,
      [facturadorId]
    );
    expect(f.nombre_fantasia).toBe("METAMORFOSIS AGENCIA DIGITAL");
    expect(f.key).toBe(API_KEY_TEST);

    const c = await fila<{ perfil: string; actividad: string; timbrado: string; documento_nro: string; alias: string; activo: boolean }>(
      `select pe.codigo as perfil, a.codigo as actividad, app.timbrado, app.documento_nro, app.alias_operativo as alias, app.activo
         from actividad_punto_perfiles app
         join facturador_perfiles_emision pe on pe.id = app.perfil_emision_id
         join facturador_actividades a on a.id = app.actividad_id
        where app.facturador_id = $1`,
      [facturadorId]
    );
    expect(c).toEqual({ perfil: "NO_REQUERIDO", actividad: "96099", timbrado: "04543629", documento_nro: "0000001", alias: "PRESTACION DE SERVICIOS", activo: true });
  });

  it("la API key no queda en la auditoria del import (CA-8)", async () => {
    const { texto } = await fila<{ texto: string }>(
      `select coalesce(string_agg(payload::text || resumen::text, ''), '') as texto from facturador_import_eventos where tenant_id = $1`,
      [tenantId]
    );
    expect(texto.length).toBeGreaterThan(0);
    expect(texto).not.toContain(API_KEY_TEST);
  });

  it("re-importar el mismo archivo no cambia nada (CA-2, RN-12)", async () => {
    const d = await previewFacturadorImport(archivo("fe-config-4543629-sin-perfiles.json"), { repository: repo, ctx });
    expect(d.resumen.crear).toBe(0);
    expect(d.resumen.actualizar).toBe(0);
    expect(d.facturador.has_api_key).toBe(true);
    expect(d.advertencias.find((x) => x.codigo === "TEXTO_VISIBLE_DIFIERE")?.valor).toEqual([
      { entidad: "facturador", codigo: EMISOR, actual: "METAMORFOSIS AGENCIA DIGITAL", archivo: "JILSSE ZULMINA CARDOZO BENITEZ" }
    ]);
  });

  it("el re-export con perfil no revierte el nombre visible ni el del punto (CA-6)", async () => {
    await aplicar("fe-config-4543629-con-perfil.json");
    const f = await fila<{ nombre_fantasia: string }>(`select nombre_fantasia from facturadores where id = $1`, [facturadorId]);
    expect(f.nombre_fantasia).toBe("METAMORFOSIS AGENCIA DIGITAL");
    const p = await fila<{ nombre: string }>(`select nombre from facturador_puntos_expedicion where facturador_id = $1`, [facturadorId]);
    expect(p.nombre).toBe("PRESTACION DE SERVICIOS");
    const { c } = await fila<{ c: number }>(
      `select count(*)::int as c from actividad_punto_perfiles where facturador_id = $1 and activo = true`,
      [facturadorId]
    );
    expect(c).toBe(2);
  });

  it("con adopcion explicita, los textos del archivo reemplazan a los actuales (CA-6)", async () => {
    await aplicar("fe-config-4543629-con-perfil.json", { adoptar_textos_archivo: true });
    const f = await fila<{ nombre_fantasia: string }>(`select nombre_fantasia from facturadores where id = $1`, [facturadorId]);
    expect(f.nombre_fantasia).toBe("JILSSE ZULMINA CARDOZO BENITEZ");
    const p = await fila<{ nombre: string }>(`select nombre from facturador_puntos_expedicion where facturador_id = $1`, [facturadorId]);
    expect(p.nombre).toBe("METAMORFOSIS AGENCIA DIGITAL");
  });

  it("readiness no cuenta usuarios asignados a un contexto inactivo (CA-11, RN-35)", async () => {
    await backoffice.assignOperationConfig({
      userId: usuarioId,
      data: {
        tenant_id: tenantId,
        facturador_id: facturadorId,
        emisor_id: EMISOR,
        establecimiento: "001",
        punto_expedicion: "001",
        perfil_emision_codigo: "NO_REQUERIDO",
        actividad_economica_codigo: "96099"
      }
    });
    expect((await backoffice.getReadinessData(facturadorId))?.usuarios_operativos).toBe(1);

    await pool.query(
      `update actividad_punto_perfiles set activo = false
        where facturador_id = $1 and perfil_emision_id = (select id from facturador_perfiles_emision where facturador_id = $1 and codigo = 'NO_REQUERIDO')`,
      [facturadorId]
    );
    expect((await backoffice.getReadinessData(facturadorId))?.usuarios_operativos).toBe(0);
  });

  it("no se asignan usuarios a un facturador sin API key (CA-9, RN-33)", async () => {
    await pool.query(`update facturadores set fe_consumer_api_key = null where id = $1`, [facturadorId]);
    await expect(
      backoffice.assignOperationConfig({
        userId: usuarioId,
        data: {
          tenant_id: tenantId,
          facturador_id: facturadorId,
          emisor_id: EMISOR,
          establecimiento: "001",
          punto_expedicion: "001",
          perfil_emision_codigo: "A96099-E001-P001-FE-COMP",
          actividad_economica_codigo: "96099"
        }
      })
    ).rejects.toMatchObject({ statusCode: 422, details: { motivo: "FACTURADOR_SIN_API_KEY" } });
  });
});
