import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseFeConfig } from "../src/modules/backoffice/import/fe-config.parser";
import { buildImportPlan } from "../src/modules/backoffice/import/fe-config.mapper";
import { buildDiff, computePreviewToken } from "../src/modules/backoffice/import/fe-config.diff";
import type { ImportPlan, ImportSnapshot, ImportTarget, MapperContext } from "../src/modules/backoffice/import/import.types";

const FIXTURES = join(__dirname, "fixtures");
const ctx: MapperContext = {
  feApiEnv: "prod",
  feApiBaseUrl: "https://fe-api.ventax.app",
  sendProfileCode: true,
  hoy: "2026-09-19"
};
const archivo = { nombre: "fe-config-v0.1.json", formato: "json" };
const target: ImportTarget = { mode: "EXISTENTE", tenant_id: "11111111-1111-1111-1111-111111111111" };

function planBase(): ImportPlan {
  const parsed = parseFeConfig({
    filename: "fe-config-v0.1.json",
    content: readFileSync(join(FIXTURES, "fe-config-v0.1.json"), "utf8")
  });
  return buildImportPlan(parsed.document, ctx);
}

const vacio: ImportSnapshot = {
  tenant: { id: target.mode === "EXISTENTE" ? target.tenant_id : "", nombre: "Tenant Demo", slug: "demo" },
  facturador: null,
  establecimientos: [],
  puntos: [],
  actividades: [],
  perfiles: [],
  contextos: [],
  emisorEnOtroTenant: null,
  slugOcupado: false
};

/** Snapshot que refleja exactamente lo que el plan crearia: todo deberia dar SIN_CAMBIOS. */
function snapshotEspejo(plan: ImportPlan, over: Partial<ImportSnapshot> = {}): ImportSnapshot {
  return {
    ...vacio,
    facturador: {
      id: "f1",
      tenant_id: "t1",
      emisor_id: plan.emisor.emisor_id,
      ruc: plan.emisor.ruc,
      razon_social: plan.emisor.razon_social,
      nombre_fantasia: plan.emisor.nombre_fantasia,
      activo: true,
      has_api_key: true
    },
    establecimientos: plan.establecimientos.map((e, i) => ({ id: `e${i}`, codigo: e.codigo, nombre: e.nombre, direccion: e.direccion, activo: true })),
    puntos: plan.puntos.map((p, i) => ({ id: `p${i}`, codigo: p.codigo, establecimiento_codigo: p.establecimiento_codigo, nombre: p.nombre, activo: true })),
    actividades: plan.actividades.map((a, i) => ({ id: `a${i}`, codigo: a.codigo, descripcion: a.descripcion, alias_operativo: a.alias_operativo, activo: true })),
    perfiles: plan.perfiles.map((pe, i) => ({ id: `pe${i}`, codigo: pe.codigo, descripcion: pe.descripcion, activo: true })),
    contextos: plan.contextos.map((c, i) => ({
      id: `c${i}`,
      actividad_codigo: c.actividad_codigo,
      establecimiento_codigo: c.establecimiento_codigo,
      punto_codigo: c.punto_codigo,
      perfil_codigo: c.perfil_codigo,
      timbrado: c.timbrado,
      timbrado_inicio: c.timbrado_inicio,
      documento_nro: "0000123",
      credito_plazo_dias: c.credito_plazo_dias,
      alias_operativo: c.alias_operativo,
      activo: true,
      usuarios_asignados: 0
    })),
    ...over
  };
}

describe("buildDiff — base vacia", () => {
  const d = buildDiff(planBase(), vacio, target, archivo);

  it("marca todo como CREAR", () => {
    expect(d.facturador.accion).toBe("CREAR");
    expect(d.establecimientos.every((x) => x.accion === "CREAR")).toBe(true);
    expect(d.puntos.every((x) => x.accion === "CREAR")).toBe(true);
    expect(d.contextos.every((x) => x.accion === "CREAR")).toBe(true);
  });

  it("usa el tenant existente sin crearlo", () => {
    expect(d.tenant.accion).toBe("USAR_EXISTENTE");
  });

  it("permite aplicar y resume las creaciones", () => {
    expect(d.puede_aplicar).toBe(true);
    // 1 facturador + 1 est + 2 puntos + 2 actividades + 2 perfiles + 2 contextos
    expect(d.resumen.crear).toBe(10);
    expect(d.resumen.no_tocados).toBe(0);
  });

  it("los contextos nuevos traen documento_nro editable", () => {
    expect(d.contextos.every((c) => c.documento_nro_editable)).toBe(true);
    expect(d.contextos.every((c) => c.documento_nro_sugerido === "0000001")).toBe(true);
    expect(d.contextos.every((c) => !c.documento_nro_preservado)).toBe(true);
  });

  it("avisa que el facturador nace sin API key", () => {
    expect(d.advertencias.map((x) => x.codigo)).toContain("API_KEY_AUSENTE");
  });
});

describe("buildDiff — re-import identico (RN-12)", () => {
  const plan = planBase();
  const d = buildDiff(plan, snapshotEspejo(plan), target, archivo);

  it("no reporta ningun cambio", () => {
    expect(d.resumen.crear).toBe(0);
    expect(d.resumen.actualizar).toBe(0);
    expect(d.facturador.accion).toBe("SIN_CAMBIOS");
    expect(d.contextos.every((x) => x.accion === "SIN_CAMBIOS")).toBe(true);
  });

  it("preserva el documento_nro existente y no lo ofrece editable (RN-09)", () => {
    expect(d.contextos.every((c) => c.documento_nro_preservado)).toBe(true);
    expect(d.contextos.every((c) => !c.documento_nro_editable)).toBe(true);
    expect(d.contextos.flatMap((c) => c.campos).some((c) => c.campo === "documento_nro")).toBe(false);
  });
});

describe("buildDiff — actualizaciones acotadas", () => {
  it("una direccion distinta produce ACTUALIZAR con ese unico campo", () => {
    const plan = planBase();
    const snap = snapshotEspejo(plan);
    snap.establecimientos[0]!.direccion = "OTRA DIRECCION";
    const d = buildDiff(plan, snap, target, archivo);

    const est = d.establecimientos[0]!;
    expect(est.accion).toBe("ACTUALIZAR");
    expect(est.campos).toEqual([{ campo: "direccion", actual: "OTRA DIRECCION", nuevo: plan.establecimientos[0]!.direccion }]);
  });

  it("un timbrado nuevo solo cambia timbrado y timbrado_inicio", () => {
    const plan = planBase();
    const snap = snapshotEspejo(plan);
    for (const c of snap.contextos) c.timbrado = "00000001";
    const d = buildDiff(plan, snap, target, archivo);

    expect(d.contextos.every((c) => c.accion === "ACTUALIZAR")).toBe(true);
    expect(d.contextos[0]!.campos.map((x) => x.campo)).toEqual(["timbrado"]);
  });

  it("resalta un contexto en uso cuando se le cambia el timbrado", () => {
    const plan = planBase();
    const snap = snapshotEspejo(plan);
    snap.contextos[0]!.timbrado = "00000001";
    snap.contextos[0]!.usuarios_asignados = 3;
    const d = buildDiff(plan, snap, target, archivo);

    expect(d.advertencias.map((x) => x.codigo)).toContain("CONTEXTO_EN_USO");
    expect(d.contextos[0]!.usuarios_asignados).toBe(3);
  });

  it("NO pisa el alias operativo que ya tiene valor", () => {
    const plan = planBase();
    const snap = snapshotEspejo(plan);
    snap.actividades[0]!.alias_operativo = "CHAPERIA";
    const d = buildDiff(plan, snap, target, archivo);

    expect(d.actividades[0]!.campos.some((x) => x.campo === "alias_operativo")).toBe(false);
  });
});

describe("buildDiff — aditividad y bloqueantes de estado", () => {
  it("lista las entidades que el archivo no trae, sin tocarlas (RN-10)", () => {
    const plan = planBase();
    const snap = snapshotEspejo(plan);
    snap.perfiles.push({ id: "extra", codigo: "PERFIL-VIEJO", descripcion: null, activo: true });
    const d = buildDiff(plan, snap, target, archivo);

    const huerfanas = d.advertencias.find((x) => x.codigo === "ENTIDADES_HUERFANAS");
    expect(huerfanas?.valor).toContain("perfil PERFIL-VIEJO");
    expect(d.resumen.no_tocados).toBe(1);
  });

  it("advierte la reactivacion de una entidad inactiva (RN-11)", () => {
    const plan = planBase();
    const snap = snapshotEspejo(plan);
    snap.establecimientos[0]!.activo = false;
    const d = buildDiff(plan, snap, target, archivo);

    expect(d.advertencias.map((x) => x.codigo)).toContain("REACTIVACION");
    expect(d.establecimientos[0]!.accion).toBe("ACTUALIZAR");
  });

  it("bloquea si el emisor vive en otro tenant (RN-02)", () => {
    const d = buildDiff(planBase(), { ...vacio, emisorEnOtroTenant: { tenant_id: "t9", tenant_nombre: "Otro" } }, target, archivo);
    expect(d.bloqueantes.map((x) => x.codigo)).toContain("FACTURADOR_EN_OTRO_TENANT");
    expect(d.puede_aplicar).toBe(false);
  });

  it("bloquea si el slug del tenant nuevo esta ocupado", () => {
    const nuevo: ImportTarget = { mode: "NUEVO", nombre: "Demo", slug: "demo", plan_codigo: "BASICO_MVP" };
    const d = buildDiff(planBase(), { ...vacio, slugOcupado: true }, nuevo, archivo);
    expect(d.bloqueantes.map((x) => x.codigo)).toContain("TENANT_SLUG_EXISTENTE");
  });

  it("advierte si el RUC existente difiere del archivo", () => {
    const plan = planBase();
    const snap = snapshotEspejo(plan);
    snap.facturador!.ruc = "80000000-0";
    const d = buildDiff(plan, snap, target, archivo);
    expect(d.advertencias.map((x) => x.codigo)).toContain("RUC_DISTINTO");
  });
});

describe("computePreviewToken", () => {
  it("es estable ante el reordenamiento de los arrays del plan", () => {
    const a = planBase();
    const b = planBase();
    b.establecimientos.reverse();
    b.puntos.reverse();
    b.actividades.reverse();
    b.perfiles.reverse();
    b.contextos.reverse();

    expect(computePreviewToken(b, target, vacio)).toBe(computePreviewToken(a, target, vacio));
  });

  it("cambia si cambia el estado de la base", () => {
    const plan = planBase();
    expect(computePreviewToken(plan, target, snapshotEspejo(plan))).not.toBe(computePreviewToken(plan, target, vacio));
  });

  it("cambia si cambia el destino", () => {
    const plan = planBase();
    const otro: ImportTarget = { mode: "NUEVO", nombre: "X", slug: "x", plan_codigo: "BASICO_MVP" };
    expect(computePreviewToken(plan, otro, vacio)).not.toBe(computePreviewToken(plan, target, vacio));
  });

  it("tiene forma de sha256 hexadecimal", () => {
    expect(computePreviewToken(planBase(), target, vacio)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("overrides de documento_nro", () => {
  it("se aplican solo a los contextos nuevos", () => {
    const plan = planBase();
    const d = buildDiff(plan, vacio, target, archivo, { "A45203-E001-P001-FE-PTO": "0000950" });
    const conOverride = d.contextos.find((c) => c.clave.perfil === "A45203-E001-P001-FE-PTO");
    expect(conOverride?.documento_nro_sugerido).toBe("0000950");
    expect(conOverride?.campos.find((x) => x.campo === "documento_nro")?.nuevo).toBe("0000950");
  });
});
