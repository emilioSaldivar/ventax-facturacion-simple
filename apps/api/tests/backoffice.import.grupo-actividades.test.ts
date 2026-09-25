// SPEC_IMPORT_CONFIG_FACTURADOR_v0.2: grupo de actividades y perfiles sin actividad fija.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseFeConfig } from "../src/modules/backoffice/import/fe-config.parser";
import { advertencias, bloqueantes, buildImportPlan, ignorados } from "../src/modules/backoffice/import/fe-config.mapper";
import { buildDiff } from "../src/modules/backoffice/import/fe-config.diff";
import { applyFacturadorImport, previewFacturadorImport } from "../src/modules/backoffice/import/import.service";
import type { ImportRepository, ImportApplyResult } from "../src/modules/backoffice/import/import.repository";
import type { ImportSnapshot, ImportTarget, MapperContext } from "../src/modules/backoffice/import/import.types";

const FIXTURES = join(__dirname, "fixtures");
const leer = (n: string) => readFileSync(join(FIXTURES, n), "utf8");

const ctx: MapperContext = {
  feApiEnv: "test",
  feApiBaseUrl: "http://localhost:9988",
  sendProfileCode: true,
  hoy: "2026-09-24"
};
const target: ImportTarget = { mode: "EXISTENTE", tenant_id: "11111111-1111-1111-1111-111111111111" };
const archivo = { nombre: "x.json", formato: "json" };

const vacio: ImportSnapshot = {
  tenant: { id: target.mode === "EXISTENTE" ? target.tenant_id : "", nombre: "Demo", slug: "demo" },
  facturador: null,
  establecimientos: [],
  puntos: [],
  actividades: [],
  perfiles: [],
  contextos: [],
  emisorEnOtroTenant: null,
  slugOcupado: false
};

function plan(fixture: string) {
  const parsed = parseFeConfig({ filename: fixture, content: leer(fixture) });
  return buildImportPlan(parsed.document, ctx);
}
const codigos = (xs: ReturnType<typeof bloqueantes>) => xs.map((x) => x.codigo);

describe("RN-21 — grupo_actividades es informativo y se declara", () => {
  it("un perfil con actividad fija y grupo no bloquea", () => {
    const p = plan("fe-config-grupo-actividades.json");
    expect(codigos(bloqueantes(p))).toEqual([]);
    expect(p.contextos).toHaveLength(2);
  });

  it("el grupo aparece en ignorados con sus actividades", () => {
    const ign = ignorados(plan("fe-config-grupo-actividades.json"));
    const grupo = ign.find((x) => x.ruta === "$.perfiles_emision.items[].grupo_actividades");
    expect(grupo).toBeDefined();
    expect(grupo?.mensaje).toContain("gActEco");
    expect(Array.isArray(grupo?.valor)).toBe(true);
  });

  it("no se reporta cuando ningun perfil trae grupo", () => {
    const ign = ignorados(plan("fe-config-ambiente-test.json"));
    expect(ign.some((x) => x.ruta === "$.perfiles_emision.items[].grupo_actividades")).toBe(false);
  });

  it("la actividad del contexto sigue siendo la fija, no la del grupo", () => {
    const p = plan("fe-config-grupo-actividades.json");
    expect(p.contextos.every((c) => !c.actividad_editable)).toBe(true);
    expect(p.contextos.every((c) => c.actividad_opciones.length === 0)).toBe(true);
  });
});

describe("RN-22/RN-23 — perfil sin actividad fija", () => {
  const p = plan("fe-config-actividad-seleccionable.json");

  it("NO bloquea: el grupo aporta la actividad", () => {
    expect(codigos(bloqueantes(p))).toEqual([]);
    expect(p.contextos).toHaveLength(2);
  });

  it("marca el contexto como editable y ofrece las opciones del grupo", () => {
    expect(p.contextos.every((c) => c.actividad_editable)).toBe(true);
    expect(p.contextos[0]!.actividad_opciones.map((o) => o.codigo).sort()).toEqual(["45203", "96099"]);
  });

  it("sugiere la actividad principal del emisor cuando esta en el grupo (RN-23)", () => {
    // En el fixture, 96099 es es_principal: true
    expect(p.contextos.every((c) => c.actividad_codigo === "96099")).toBe(true);
  });

  it("advierte PERFIL_SIN_ACTIVIDAD_FIJA explicando la eleccion", () => {
    const adv = advertencias(p).find((x) => x.codigo === "PERFIL_SIN_ACTIVIDAD_FIJA");
    expect(adv).toBeDefined();
    expect(adv?.sugerencia).toContain("96099");
    expect(adv?.sugerencia).toContain("principal");
  });

  it("cae a la primera del grupo si ninguna es principal", () => {
    const doc = JSON.parse(leer("fe-config-actividad-seleccionable.json")) as Record<string, any>;
    for (const a of doc.actividades_economicas) a.es_principal.valor = false;
    const parsed = parseFeConfig({ filename: "x.json", content: JSON.stringify(doc) });
    const p2 = buildImportPlan(parsed.document, ctx);

    const primera = doc.perfiles_emision.items[0].grupo_actividades.valor[0].codigo;
    expect(p2.contextos[0]!.actividad_codigo).toBe(primera);
    expect(advertencias(p2).find((x) => x.codigo === "PERFIL_SIN_ACTIVIDAD_FIJA")?.sugerencia).toContain("primera del grupo");
  });
});

describe("RN-26 — la referencia rota conserva su significado estricto", () => {
  it("actividad nula SIN grupo sigue bloqueando", () => {
    const p = plan("fe-config-actividad-nula-sin-grupo.json");
    expect(codigos(bloqueantes(p))).toContain("REFERENCIA_INTERNA_ROTA");
    expect(p.contextos).toHaveLength(0);
  });

  it("el mensaje ya no afirma una unica causa", () => {
    const b = bloqueantes(plan("fe-config-actividad-nula-sin-grupo.json"))
      .find((x) => x.codigo === "REFERENCIA_INTERNA_ROTA");
    expect(b?.sugerencia).toContain("inactiva");
    expect(b?.sugerencia).toContain("seleccionable");
  });

  it("establecimiento nulo sigue bloqueando, con su causa propia", () => {
    const doc = JSON.parse(leer("fe-config-grupo-actividades.json")) as Record<string, any>;
    doc.perfiles_emision.items[0].establecimiento_codigo.valor = null;
    const parsed = parseFeConfig({ filename: "x.json", content: JSON.stringify(doc) });
    const b = bloqueantes(buildImportPlan(parsed.document, ctx));
    expect(b.map((x) => x.codigo)).toContain("REFERENCIA_INTERNA_ROTA");
    expect(b[0]!.sugerencia).toContain("establecimiento o punto inactivo");
  });
});

describe("RN-25 — actividad del grupo que el archivo no define", () => {
  it("se reporta y no se ofrece como opcion", () => {
    const doc = JSON.parse(leer("fe-config-actividad-seleccionable.json")) as Record<string, any>;
    for (const it of doc.perfiles_emision.items) {
      it.grupo_actividades.valor.push({ codigo: "99999", descripcion: "No declarada" });
    }
    const parsed = parseFeConfig({ filename: "x.json", content: JSON.stringify(doc) });
    const p = buildImportPlan(parsed.document, ctx);

    expect(advertencias(p).map((x) => x.codigo)).toContain("ACTIVIDAD_GRUPO_DESCONOCIDA");
    expect(p.contextos[0]!.actividad_opciones.map((o) => o.codigo)).not.toContain("99999");
  });
});

describe("RN-27 — consumidor sin estado informado", () => {
  it("advierte que los permisos pueden venir de una clave inactiva", () => {
    const p = plan("fe-config-ambiente-test.json");
    expect(advertencias(p).map((x) => x.codigo)).toContain("CONSUMIDOR_ESTADO_DESCONOCIDO");
  });
});

describe("diff — identidad por la actividad efectiva", () => {
  it("el override cambia la actividad del contexto y su clave", () => {
    const p = plan("fe-config-actividad-seleccionable.json");
    const perfil = p.contextos[0]!.perfil_codigo;
    const d = buildDiff(p, vacio, target, archivo, {}, { [perfil]: "45203" });

    const c = d.contextos.find((x) => x.clave.perfil === perfil);
    expect(c?.actividad_codigo).toBe("45203");
    expect(c?.clave.actividad).toBe("45203");
    expect(c?.actividad_editable).toBe(true);
  });

  it("un override fuera de las opciones no cambia nada en el diff", () => {
    const p = plan("fe-config-actividad-seleccionable.json");
    const perfil = p.contextos[0]!.perfil_codigo;
    const d = buildDiff(p, vacio, target, archivo, {}, { [perfil]: "99999" });
    expect(d.contextos.find((x) => x.clave.perfil === perfil)?.actividad_codigo).toBe("96099");
  });

  it("reconoce como SIN_CAMBIOS un contexto ya creado con la actividad elegida", () => {
    const p = plan("fe-config-actividad-seleccionable.json");
    const c0 = p.contextos[0]!;
    const snap: ImportSnapshot = {
      ...vacio,
      contextos: [
        {
          id: "c1",
          actividad_codigo: "45203",
          establecimiento_codigo: c0.establecimiento_codigo,
          punto_codigo: c0.punto_codigo,
          perfil_codigo: c0.perfil_codigo,
          timbrado: c0.timbrado,
          timbrado_inicio: c0.timbrado_inicio,
          documento_nro: "0000007",
          credito_plazo_dias: 30,
          alias_operativo: c0.alias_operativo,
          activo: true,
          usuarios_asignados: 0
        }
      ]
    };
    const d = buildDiff(p, snap, target, archivo, {}, { [c0.perfil_codigo]: "45203" });
    expect(d.contextos.find((x) => x.clave.perfil === c0.perfil_codigo)?.accion).toBe("SIN_CAMBIOS");
  });
});

describe("service — actividad_overrides", () => {
  class FakeRepo implements ImportRepository {
    public ultimo: Parameters<ImportRepository["applyImport"]>[0] | null = null;
    constructor(private readonly snap: ImportSnapshot = vacio) {}
    async loadSnapshot(): Promise<ImportSnapshot> { return this.snap; }
    async applyImport(input: Parameters<ImportRepository["applyImport"]>[0]): Promise<ImportApplyResult> {
      this.ultimo = input;
      return { tenant_id: "t1", facturador_id: "f1", aplicado_en: "2026-09-24T00:00:00.000Z" };
    }
  }

  const entrada = (fixture: string) => ({
    filename: fixture,
    format: "auto" as const,
    content: leer(fixture),
    target
  });

  async function aplicar(fixture: string, actividad_overrides: Record<string, string>) {
    const repo = new FakeRepo();
    const d = await previewFacturadorImport(entrada(fixture), { repository: repo, ctx });
    const res = await applyFacturadorImport(
      { ...entrada(fixture), preview_token: d.preview_token, permitir_ambiente_distinto: false, documento_nro_overrides: {}, actividad_overrides },
      "u1",
      { repository: repo, ctx }
    );
    return { repo, res };
  }

  it("la actividad elegida llega al repositorio dentro del plan", async () => {
    const p = plan("fe-config-actividad-seleccionable.json");
    const perfil = p.contextos[0]!.perfil_codigo;
    const { repo } = await aplicar("fe-config-actividad-seleccionable.json", { [perfil]: "45203" });

    const ctxRepo = repo.ultimo!.plan.contextos.find((c) => c.perfil_codigo === perfil);
    expect(ctxRepo?.actividad_codigo).toBe("45203");
  });

  it("sin override se aplica la sugerencia", async () => {
    const { repo } = await aplicar("fe-config-actividad-seleccionable.json", {});
    expect(repo.ultimo!.plan.contextos.every((c) => c.actividad_codigo === "96099")).toBe(true);
  });

  it("se ignora con advertencia si el perfil fija su actividad", async () => {
    const p = plan("fe-config-grupo-actividades.json");
    const perfil = p.contextos[0]!.perfil_codigo;
    const { res } = await aplicar("fe-config-grupo-actividades.json", { [perfil]: "96099" });

    const adv = res.advertencias.find((a) => a.codigo === "OVERRIDE_IGNORADO");
    expect(adv?.mensaje).toContain("ya fija su actividad");
  });

  it("se ignora si la actividad no esta en el grupo", async () => {
    const p = plan("fe-config-actividad-seleccionable.json");
    const perfil = p.contextos[0]!.perfil_codigo;
    const { res } = await aplicar("fe-config-actividad-seleccionable.json", { [perfil]: "99999" });

    expect(res.advertencias.find((a) => a.codigo === "OVERRIDE_IGNORADO")?.mensaje).toContain("no esta entre las actividades");
  });

  it("se ignora si el perfil no existe en el archivo", async () => {
    const { res } = await aplicar("fe-config-actividad-seleccionable.json", { "PERFIL-FANTASMA": "45203" });
    expect(res.advertencias.find((a) => a.codigo === "OVERRIDE_IGNORADO")?.mensaje).toContain("no define ese perfil");
  });
});
