// SPEC_IMPORT_CONFIG_FACTURADOR_v0.3: emisor sin perfiles (RN-28 a RN-31), textos visibles
// (RN-32, RN-34) y API key obligatoria en el apply (RN-33). Casos tomados del alta real de
// 4543629-0 en staging (2026-10-14).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseFeConfig } from "../src/modules/backoffice/import/fe-config.parser";
import { advertencias, bloqueantes, buildImportPlan, ignorados } from "../src/modules/backoffice/import/fe-config.mapper";
import { buildDiff } from "../src/modules/backoffice/import/fe-config.diff";
import { applyFacturadorImport, previewFacturadorImport, type ImportApplyInput } from "../src/modules/backoffice/import/import.service";
import type { ImportApplyResult, ImportRepository } from "../src/modules/backoffice/import/import.repository";
import type { ImportSnapshot, ImportTarget, MapperContext } from "../src/modules/backoffice/import/import.types";

const FIXTURES = join(__dirname, "fixtures");
const leer = (n: string) => readFileSync(join(FIXTURES, n), "utf8");

const SIN_PERFILES = "fe-config-4543629-sin-perfiles.json";
const CON_PERFIL = "fe-config-4543629-con-perfil.json";
// Valor sintetico, no es una clave real (RN-33 exige una en el apply de un facturador nuevo).
const API_KEY_TEST = "clave-sintetica-de-prueba";

const ctx: MapperContext = {
  feApiEnv: "test",
  feApiBaseUrl: "http://facturacion-electronica:8080/v1",
  sendProfileCode: true,
  hoy: "2026-10-14"
};
const target: ImportTarget = { mode: "EXISTENTE", tenant_id: "67a764d7-4dc2-40dd-927c-dbd1a20ed86f" };
const archivo = { nombre: "x.json", formato: "json" };

const vacio: ImportSnapshot = {
  tenant: { id: "67a764d7-4dc2-40dd-927c-dbd1a20ed86f", nombre: "CARDOZO BENITEZ JILSSE ZULMINA", slug: "metamorfosis-agencia-1" },
  facturador: null,
  establecimientos: [],
  puntos: [],
  actividades: [],
  perfiles: [],
  contextos: [],
  emisorEnOtroTenant: null,
  slugOcupado: false
};

const planDe = (contenido: string, c: MapperContext = ctx) => buildImportPlan(parseFeConfig({ filename: "x.json", content: contenido }).document, c);
const plan = (fixture: string, c: MapperContext = ctx) => planDe(leer(fixture), c);
const codigos = (xs: Array<{ codigo: string }>) => xs.map((x) => x.codigo);

/** El export sin perfiles con un segundo punto y una segunda actividad (no principal). */
function sinPerfilesMultiple(): string {
  const d = JSON.parse(leer(SIN_PERFILES));
  const ref = (valor: unknown) => ({ valor, referencia: "x" });
  d.establecimientos[0].puntos_expedicion.push({ codigo: ref("002"), descripcion: ref("CAJA 2") });
  d.actividades_economicas.push({ codigo: ref("45203"), descripcion: ref("CHAPERIA Y PINTURA"), es_principal: ref(false) });
  return JSON.stringify(d);
}

/** Estado de la base de staging despues del alta manual y del cambio de nombre visible. */
function snapshotMetamorfosis(over: Partial<ImportSnapshot> = {}): ImportSnapshot {
  return {
    ...vacio,
    facturador: {
      id: "a0f786fc-edb2-49c6-a442-df3dee342815",
      tenant_id: vacio.tenant!.id,
      emisor_id: "4543629-0",
      ruc: "4543629-0",
      razon_social: "CARDOZO BENITEZ JILSSE ZULMINA",
      nombre_fantasia: "METAMORFOSIS AGENCIA DIGITAL",
      activo: true,
      has_api_key: true
    },
    establecimientos: [{ id: "e1", codigo: "001", activo: true, nombre: "JILSSE ZULMINA CARDOZO BENITEZ", direccion: "TTE VICTOR RODRIGUEZ C/ VICTOR HEYN, Nro. 0, ASUNCION (DISTRITO), ASUNCION (DISTRITO), CAPITAL" }],
    puntos: [{ id: "p1", codigo: "001", activo: true, establecimiento_codigo: "001", nombre: "PRESTACION DE SERVICIOS" }],
    actividades: [{ id: "a1", codigo: "96099", activo: true, descripcion: "OTRAS ACTIVIDADES DE SERVICIOS PERSONALES N.C.P.", alias_operativo: "OTRAS ACTIVIDADES DE SERVICIOS PERSONALES N.C.P." }],
    ...over
  };
}

class FakeRepo implements ImportRepository {
  public ultimo: Parameters<ImportRepository["applyImport"]>[0] | null = null;
  constructor(private readonly snap: ImportSnapshot = vacio) {}
  async loadSnapshot(): Promise<ImportSnapshot> {
    return this.snap;
  }
  async applyImport(input: Parameters<ImportRepository["applyImport"]>[0]): Promise<ImportApplyResult> {
    this.ultimo = input;
    return { tenant_id: target.mode === "EXISTENTE" ? target.tenant_id : "", facturador_id: "f1", aplicado_en: "2026-10-14T00:00:00.000Z" };
  }
}

async function aplicar(fixture: string, snap: ImportSnapshot, over: Partial<ImportApplyInput> = {}) {
  const repo = new FakeRepo(snap);
  const entrada = { filename: fixture, format: "auto" as const, content: leer(fixture), target };
  const d = await previewFacturadorImport(entrada, { repository: repo, ctx });
  const res = await applyFacturadorImport(
    { ...entrada, preview_token: d.preview_token, permitir_ambiente_distinto: false, documento_nro_overrides: {}, actividad_overrides: {}, ...over },
    "u1",
    { repository: repo, ctx }
  );
  return { repo, res };
}

// ─── Mapper ───────────────────────────────────────────────────────────────────

describe("RN-28/RN-29/RN-30 — emisor sin perfiles", () => {
  it("el primer export de 4543629-0 deja de bloquear y propone el contexto centinela (CA-1)", () => {
    const p = plan(SIN_PERFILES);
    expect(codigos(bloqueantes(p))).toEqual([]);
    expect(p.perfiles).toEqual([{ codigo: "NO_REQUERIDO", descripcion: "Perfil no requerido por FE" }]);
    expect(p.contextos).toHaveLength(1);
    expect(p.contextos[0]).toMatchObject({
      ref: "NO_REQUERIDO@001-001",
      perfil_codigo: "NO_REQUERIDO",
      actividad_codigo: "96099",
      establecimiento_codigo: "001",
      punto_codigo: "001",
      timbrado: "04543629",
      timbrado_inicio: "2026-10-14",
      alias_operativo: "PRESTACION DE SERVICIOS",
      actividad_editable: false
    });
    expect(codigos(advertencias(p))).toContain("PERFIL_NO_REQUERIDO");
  });

  it("rige igual cuando el deployment no envia el codigo de perfil", () => {
    const p = plan(SIN_PERFILES, { ...ctx, sendProfileCode: false });
    expect(codigos(bloqueantes(p))).toEqual([]);
    expect(p.contextos.map((c) => c.ref)).toEqual(["NO_REQUERIDO@001-001"]);
    expect(codigos(advertencias(p))).not.toContain("SIN_CONTEXTOS");
  });

  it("un contexto por punto, no uno por actividad; la actividad es editable entre todas (D-1)", () => {
    const p = planDe(sinPerfilesMultiple());
    expect(p.contextos.map((c) => c.ref)).toEqual(["NO_REQUERIDO@001-001", "NO_REQUERIDO@001-002"]);
    expect(p.contextos.every((c) => c.actividad_codigo === "96099")).toBe(true);
    expect(p.contextos.every((c) => c.actividad_editable)).toBe(true);
    expect(p.contextos[0]!.actividad_opciones.map((o) => o.codigo)).toEqual(["96099", "45203"]);
    expect(p.contextos[1]!.alias_operativo).toBe("CAJA 2");
    // El perfil centinela se declara una sola vez.
    expect(p.perfiles.filter((x) => x.codigo === "NO_REQUERIDO")).toHaveLength(1);
  });

  it("sin actividades no hay contexto derivable: bloquea con SIN_CONTEXTOS", () => {
    const d = JSON.parse(leer(SIN_PERFILES));
    d.actividades_economicas = [];
    const p = planDe(JSON.stringify(d));
    expect(codigos(bloqueantes(p))).toContain("SIN_CONTEXTOS");
    expect(p.contextos).toHaveLength(0);
  });

  it("items vacio sin la declaracion de FE sigue bloqueando como en v0.2 (CA-3)", () => {
    const p = plan("fe-config-sin-perfiles-requerido-ausente.json");
    expect(codigos(bloqueantes(p))).toContain("SIN_CONTEXTOS");
  });
});

describe("RN-31 — requerido siempre se reporta (CA-12)", () => {
  it("con perfiles, requerido va a ignorados explicando como lo deriva FE", () => {
    const ign = ignorados(plan(CON_PERFIL)).find((x) => x.ruta === "$.perfiles_emision.requerido");
    expect(ign?.valor).toBe(false);
    expect(ign?.mensaje).toContain("cantidad de perfiles");
  });

  it("bajo RN-28 no se duplica: lo explica PERFIL_NO_REQUERIDO", () => {
    const p = plan(SIN_PERFILES);
    expect(ignorados(p).some((x) => x.ruta === "$.perfiles_emision.requerido")).toBe(false);
  });

  it("los perfiles de FE usan su codigo como ref (retrocompatible con v0.2)", () => {
    expect(plan(CON_PERFIL).contextos.map((c) => c.ref)).toEqual(["A96099-E001-P001-FE-COMP"]);
  });
});

// ─── Diff ─────────────────────────────────────────────────────────────────────

describe("diff — ref, overrides y has_api_key", () => {
  it("los overrides de actividad y documento_nro se indexan por ref", () => {
    const p = planDe(sinPerfilesMultiple());
    const d = buildDiff(p, vacio, target, archivo, { "NO_REQUERIDO@001-002": "0000050" }, { "NO_REQUERIDO@001-002": "45203" });
    const [c1, c2] = d.contextos;
    expect(c1).toMatchObject({ ref: "NO_REQUERIDO@001-001", actividad_codigo: "96099", documento_nro_sugerido: "0000001" });
    expect(c2).toMatchObject({ ref: "NO_REQUERIDO@001-002", actividad_codigo: "45203", documento_nro_sugerido: "0000050" });
  });

  it("has_api_key refleja el facturador existente; en uno nuevo es false", () => {
    expect(buildDiff(plan(CON_PERFIL), vacio, target, archivo).facturador.has_api_key).toBe(false);
    expect(buildDiff(plan(CON_PERFIL), snapshotMetamorfosis(), target, archivo).facturador.has_api_key).toBe(true);
  });

  it("API_KEY_AUSENTE avisa que sera obligatoria al aplicar", () => {
    const a = buildDiff(plan(CON_PERFIL), vacio, target, archivo).advertencias.find((x) => x.codigo === "API_KEY_AUSENTE");
    expect(a?.sugerencia).toContain("obligatoria");
  });
});

describe("RN-32 — textos visibles editables al crear", () => {
  it("en un facturador nuevo los cuatro textos son editables y precargados con el archivo", () => {
    const d = buildDiff(plan(CON_PERFIL), vacio, target, archivo);
    expect(d.facturador.texto).toEqual({ campo: "nombre_fantasia", propuesto: "JILSSE ZULMINA CARDOZO BENITEZ", editable: true });
    expect(d.establecimientos[0]!.texto).toMatchObject({ propuesto: "JILSSE ZULMINA CARDOZO BENITEZ", editable: true });
    expect(d.puntos[0]!.texto).toMatchObject({ propuesto: "METAMORFOSIS AGENCIA DIGITAL", editable: true });
    expect(d.contextos[0]!.texto).toMatchObject({ campo: "alias_operativo", propuesto: "METAMORFOSIS AGENCIA DIGITAL", editable: true });
  });

  it("los overrides cambian lo que se va a crear", () => {
    const d = buildDiff(plan(CON_PERFIL), vacio, target, archivo, {}, {}, {
      textos: {
        nombre_fantasia: "METAMORFOSIS AGENCIA DIGITAL",
        establecimientos: { "001": "CASA CENTRAL" },
        puntos: { "001-001": "MOSTRADOR" },
        contextos: { "A96099-E001-P001-FE-COMP": "FACTURAS" }
      }
    });
    expect(d.facturador.campos.find((c) => c.campo === "nombre_fantasia")?.nuevo).toBe("METAMORFOSIS AGENCIA DIGITAL");
    expect(d.establecimientos[0]!.campos.find((c) => c.campo === "nombre")?.nuevo).toBe("CASA CENTRAL");
    expect(d.puntos[0]!.campos.find((c) => c.campo === "nombre")?.nuevo).toBe("MOSTRADOR");
    expect(d.contextos[0]!.campos.find((c) => c.campo === "alias_operativo")?.nuevo).toBe("FACTURAS");
  });

  it("en entidades existentes el texto no es editable y muestra el valor actual", () => {
    const d = buildDiff(plan(CON_PERFIL), snapshotMetamorfosis(), target, archivo);
    expect(d.facturador.texto).toEqual({ campo: "nombre_fantasia", propuesto: "METAMORFOSIS AGENCIA DIGITAL", editable: false });
    expect(d.puntos[0]!.texto?.editable).toBe(false);
  });
});

describe("RN-34 — el re-import no pisa los textos visibles (D-4, CA-6)", () => {
  it("el re-export de 13:47 no revierte el nombre visible y lo informa", () => {
    const d = buildDiff(plan(CON_PERFIL), snapshotMetamorfosis(), target, archivo);
    expect(d.facturador.accion).toBe("SIN_CAMBIOS");
    expect(d.puntos[0]!.accion).toBe("SIN_CAMBIOS");
    const aviso = d.advertencias.find((x) => x.codigo === "TEXTO_VISIBLE_DIFIERE");
    expect(aviso?.valor).toEqual([
      { entidad: "facturador", codigo: "4543629-0", actual: "METAMORFOSIS AGENCIA DIGITAL", archivo: "JILSSE ZULMINA CARDOZO BENITEZ" },
      { entidad: "punto", codigo: "001-001", actual: "PRESTACION DE SERVICIOS", archivo: "METAMORFOSIS AGENCIA DIGITAL" }
    ]);
  });

  it("con adopcion explicita, los textos del archivo pasan a ACTUALIZAR", () => {
    const d = buildDiff(plan(CON_PERFIL), snapshotMetamorfosis(), target, archivo, {}, {}, { adoptarTextos: true });
    expect(d.facturador.campos).toContainEqual({ campo: "nombre_fantasia", actual: "METAMORFOSIS AGENCIA DIGITAL", nuevo: "JILSSE ZULMINA CARDOZO BENITEZ" });
    expect(d.puntos[0]!.accion).toBe("ACTUALIZAR");
    expect(d.advertencias.some((x) => x.codigo === "TEXTO_VISIBLE_DIFIERE")).toBe(false);
  });

  it("un texto existente vacio se completa con el del archivo, sin advertencia", () => {
    const snap = snapshotMetamorfosis();
    snap.facturador = { ...snap.facturador!, nombre_fantasia: null };
    snap.puntos = [{ ...snap.puntos[0]!, nombre: "METAMORFOSIS AGENCIA DIGITAL" }];
    const d = buildDiff(plan(CON_PERFIL), snap, target, archivo);
    expect(d.facturador.campos).toContainEqual({ campo: "nombre_fantasia", actual: null, nuevo: "JILSSE ZULMINA CARDOZO BENITEZ" });
    expect(d.advertencias.some((x) => x.codigo === "TEXTO_VISIBLE_DIFIERE")).toBe(false);
  });

  it("razon_social sigue actualizandose desde FE: es un dato fiscal", () => {
    const snap = snapshotMetamorfosis();
    snap.facturador = { ...snap.facturador!, razon_social: "OTRA RAZON" };
    const d = buildDiff(plan(CON_PERFIL), snap, target, archivo);
    expect(d.facturador.campos).toContainEqual({ campo: "razon_social", actual: "OTRA RAZON", nuevo: "CARDOZO BENITEZ JILSSE ZULMINA" });
  });
});

// ─── Service ──────────────────────────────────────────────────────────────────

describe("RN-33 — API key obligatoria en el apply (CA-7, CA-8)", () => {
  it("sin clave sobre un facturador nuevo: 422 API_KEY_REQUERIDA y nada se escribe", async () => {
    const repo = new FakeRepo(vacio);
    const entrada = { filename: CON_PERFIL, format: "auto" as const, content: leer(CON_PERFIL), target };
    const d = await previewFacturadorImport(entrada, { repository: repo, ctx });
    await expect(
      applyFacturadorImport(
        { ...entrada, preview_token: d.preview_token, permitir_ambiente_distinto: false, documento_nro_overrides: {}, actividad_overrides: {} },
        "u1",
        { repository: repo, ctx }
      )
    ).rejects.toMatchObject({ statusCode: 422, details: { motivo: "API_KEY_REQUERIDA" } });
    expect(repo.ultimo).toBeNull();
  });

  it("sin clave sobre un facturador que ya la tiene: se aplica y no la toca", async () => {
    const { repo } = await aplicar(CON_PERFIL, snapshotMetamorfosis());
    expect(repo.ultimo?.apiKey).toBeNull();
  });

  it("la clave llega al repositorio y no aparece en la respuesta ni en el payload auditado", async () => {
    const { repo, res } = await aplicar(SIN_PERFILES, vacio, { api_key: API_KEY_TEST });
    expect(repo.ultimo?.apiKey).toBe(API_KEY_TEST);
    expect(JSON.stringify(res)).not.toContain(API_KEY_TEST);
    expect(JSON.stringify(repo.ultimo?.payload)).not.toContain(API_KEY_TEST);
    expect(res.facturador.has_api_key).toBe(true);
  });

  it("el alta sin perfiles completa llega al repositorio con el contexto centinela (CA-1, CA-2)", async () => {
    const { repo } = await aplicar(SIN_PERFILES, vacio, { api_key: API_KEY_TEST, documento_nro_overrides: { "NO_REQUERIDO@001-001": "0000003" } });
    expect(repo.ultimo?.plan.contextos.map((c) => c.ref)).toEqual(["NO_REQUERIDO@001-001"]);
    expect(repo.ultimo?.documentoNroOverrides).toEqual({ "NO_REQUERIDO@001-001": "0000003" });
  });
});

describe("RN-32 — textos_overrides en el service (CA-5)", () => {
  it("se aplican a las entidades nuevas dentro del plan efectivo", async () => {
    const { repo, res } = await aplicar(CON_PERFIL, vacio, {
      api_key: API_KEY_TEST,
      textos_overrides: {
        nombre_fantasia: "METAMORFOSIS AGENCIA DIGITAL",
        puntos: { "001-001": "MOSTRADOR" },
        contextos: { "A96099-E001-P001-FE-COMP": "FACTURAS" }
      }
    });
    const p = repo.ultimo!.plan;
    expect(p.emisor.nombre_fantasia).toBe("METAMORFOSIS AGENCIA DIGITAL");
    expect(p.puntos[0]!.nombre).toBe("MOSTRADOR");
    expect(p.contextos[0]!.alias_operativo).toBe("FACTURAS");
    expect(res.advertencias.some((x) => x.codigo === "OVERRIDE_IGNORADO")).toBe(false);
  });

  it("sobre entidades existentes o inexistentes en el archivo se ignoran con advertencia", async () => {
    const { repo, res } = await aplicar(CON_PERFIL, snapshotMetamorfosis(), {
      textos_overrides: { nombre_fantasia: "OTRO NOMBRE", establecimientos: { "001": "X", "009": "Y" } }
    });
    expect(repo.ultimo!.plan.emisor.nombre_fantasia).toBe("JILSSE ZULMINA CARDOZO BENITEZ");
    expect(repo.ultimo!.plan.establecimientos[0]!.nombre).toBe("JILSSE ZULMINA CARDOZO BENITEZ");
    expect(res.advertencias.filter((x) => x.codigo === "OVERRIDE_IGNORADO")).toHaveLength(3);
  });

  it("adoptar_textos_archivo viaja al repositorio", async () => {
    const { repo } = await aplicar(CON_PERFIL, snapshotMetamorfosis(), { adoptar_textos_archivo: true });
    expect(repo.ultimo?.adoptarTextos).toBe(true);
  });
});
