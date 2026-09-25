import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseFeConfig } from "../src/modules/backoffice/import/fe-config.parser";
import {
  advertencias,
  bloqueantes,
  buildImportPlan,
  ignorados
} from "../src/modules/backoffice/import/fe-config.mapper";
import type { MapperContext } from "../src/modules/backoffice/import/import.types";

const FIXTURES = join(__dirname, "fixtures");
const leer = (name: string) => readFileSync(join(FIXTURES, name), "utf8");

const ctxProd: MapperContext = {
  feApiEnv: "prod",
  feApiBaseUrl: "https://fe-api.ventax.app",
  sendProfileCode: true,
  hoy: "2026-09-19"
};
const ctxTest: MapperContext = { ...ctxProd, feApiEnv: "test", feApiBaseUrl: "http://localhost:9988" };

function plan(fixture: string, ctx: MapperContext = ctxProd) {
  const parsed = parseFeConfig({ filename: fixture, content: leer(fixture) });
  return buildImportPlan(parsed.document, ctx);
}

const codigos = (items: ReturnType<typeof bloqueantes>) => items.map((x) => x.codigo).sort();

describe("buildImportPlan — fixture real de produccion (5057016-1)", () => {
  const p = plan("fe-config-v0.1.json");

  it("no produce bloqueantes", () => {
    expect(codigos(bloqueantes(p))).toEqual([]);
  });

  it("mapea el emisor y usa el emisor_id tambien como RUC", () => {
    expect(p.emisor).toMatchObject({
      emisor_id: "5057016-1",
      ruc: "5057016-1",
      razon_social: "EMILIO MATIAS SALDIVAR CAPUTO",
      nombre_fantasia: "EMILIO SALDIVAR",
      ambiente: "prod"
    });
  });

  it("mapea 1 establecimiento con sus 2 puntos", () => {
    expect(p.establecimientos).toHaveLength(1);
    expect(p.establecimientos[0]).toMatchObject({ codigo: "001", nombre: "CASA MATRIZ ITÁ" });
    expect(p.puntos.map((x) => x.codigo)).toEqual(["001", "002"]);
    expect(p.puntos.every((x) => x.establecimiento_codigo === "001")).toBe(true);
  });

  it("deriva el alias operativo de la actividad desde su descripcion", () => {
    const act = p.actividades.find((a) => a.codigo === "45203");
    expect(act?.alias_operativo).toBe("TALLERES DE CHAPERÍA Y PINTURA");
  });

  it("deriva un contexto por cada item de perfiles_emision (RN-06)", () => {
    expect(p.contextos).toHaveLength(2);
    expect(p.contextos[0]).toMatchObject({
      actividad_codigo: "45203",
      establecimiento_codigo: "001",
      punto_codigo: "001",
      perfil_codigo: "A45203-E001-P001-FE-PTO",
      timbrado: "18861677",
      timbrado_inicio: "2026-05-19",
      documento_nro_sugerido: "0000001",
      credito_plazo_dias: 30
    });
  });

  it("elige el unico timbrado vigente e informa el motivo", () => {
    expect(p.timbradoElegido).toMatchObject({ numero: "18861677", motivo: "unico timbrado vigente del archivo" });
  });

  it("advierte que FE no verifico su propia URL", () => {
    expect(codigos(advertencias(p))).toContain("URL_NO_VERIFICADA");
  });

  it("reporta los campos sin destino, con su ruta", () => {
    const rutas = ignorados(p).map((x) => x.ruta);
    expect(rutas).toContain("$.servicio.base_url");
    expect(rutas).toContain("$.envio.modos_habilitados");
    expect(rutas).toContain("$.perfiles_emision.items[].tipo_documento");
    expect(rutas).toContain("$.consumidor[].permisos");
    // serie_fiscal viene en null: una ruta ausente o vacia NO se reporta
    expect(rutas).not.toContain("$.numeracion.serie_fiscal");
  });
});

describe("coherencia con el deployment", () => {
  it("bloquea un archivo de test contra un deployment prod (RN-16)", () => {
    const p = plan("fe-config-ambiente-test.json", ctxProd);
    expect(codigos(bloqueantes(p))).toContain("AMBIENTE_DISTINTO");
  });

  it("no bloquea cuando el ambiente coincide", () => {
    const p = plan("fe-config-ambiente-test.json", ctxTest);
    expect(codigos(bloqueantes(p))).not.toContain("AMBIENTE_DISTINTO");
  });

  it("advierte cuando la URL del archivo no es la del deployment", () => {
    const p = plan("fe-config-v0.1.json", { ...ctxProd, feApiBaseUrl: "https://otra.example.com" });
    expect(codigos(advertencias(p))).toContain("BASE_URL_DISTINTA");
  });

  it("advierte cuando el contrato es viejo", () => {
    const p = plan("fe-config-v0.1.json", { ...ctxProd, hoy: "2027-01-01" });
    expect(codigos(advertencias(p))).toContain("CONTRATO_ANTIGUO");
  });
});

describe("perfiles y contextos", () => {
  it("bloquea si no hay perfiles y el deployment envia el codigo a FE (RN-08)", () => {
    const p = plan("fe-config-sin-perfiles.json", { ...ctxTest, sendProfileCode: true });
    expect(codigos(bloqueantes(p))).toContain("SIN_CONTEXTOS");
    expect(p.contextos).toHaveLength(0);
  });

  it("solo advierte si el deployment no envia el codigo de perfil", () => {
    const p = plan("fe-config-sin-perfiles.json", { ...ctxTest, sendProfileCode: false });
    expect(codigos(bloqueantes(p))).not.toContain("SIN_CONTEXTOS");
    expect(codigos(advertencias(p))).toContain("SIN_CONTEXTOS");
  });

  it("bloquea un perfil cuyos codigos llegan en null por entidad inactiva en FE", () => {
    const p = plan("fe-config-referencia-rota.json", ctxTest);
    const roto = bloqueantes(p).find((x) => x.codigo === "REFERENCIA_INTERNA_ROTA");
    expect(roto).toBeDefined();
    expect(roto?.sugerencia).toContain("inactivo");
    // el perfil valido igual se mapea; solo se descarta el contexto roto
    expect(p.contextos).toHaveLength(1);
  });
});

describe("timbrados (RN-07)", () => {
  it("advierte y elige de forma determinista con varios vigentes", () => {
    const p = plan("fe-config-timbrados-multiples.json", ctxTest);
    const adv = advertencias(p).find((x) => x.codigo === "TIMBRADO_VIGENTE_MULTIPLE");
    expect(adv).toBeDefined();
    // fecha_inicio 2026-08-01 es mas reciente y ya aplica al 2026-09-19
    expect(p.timbradoElegido?.numero).toBe("18861677");
    expect(p.contextos.every((c) => c.timbrado === "18861677")).toBe(true);
  });

  it("bloquea si no hay vigentes y hay contextos para crear", () => {
    const p = plan("fe-config-sin-timbrado-vigente.json", ctxTest);
    expect(codigos(bloqueantes(p))).toContain("TIMBRADO_VIGENTE_AUSENTE");
    expect(p.timbradoElegido).toBeNull();
  });
});

describe("numeracion", () => {
  it("advierte cuando la autoridad es CLIENT y se propone el placeholder", () => {
    const p = plan("fe-config-autoridad-client.json", ctxTest);
    expect(codigos(advertencias(p))).toContain("NUMERACION_CLIENT");
    expect(p.contextos.every((c) => c.documento_nro_sugerido === "0000001")).toBe(true);
  });
});

describe("validaciones estructurales sobre documentos alterados", () => {
  const base = JSON.parse(leer("fe-config-v0.1.json")) as Record<string, any>;
  const clonar = () => JSON.parse(JSON.stringify(base)) as Record<string, any>;
  const planDe = (doc: Record<string, any>, ctx: MapperContext = ctxProd) => {
    const parsed = parseFeConfig({ filename: "x.json", content: JSON.stringify(doc) });
    return buildImportPlan(parsed.document, ctx);
  };

  it("CONTRATO_VERSION_NO_SOPORTADA", () => {
    const d = clonar();
    d.contrato.version.valor = "v0.2";
    expect(codigos(bloqueantes(planDe(d)))).toContain("CONTRATO_VERSION_NO_SOPORTADA");
  });

  it("EMISOR_ID_INVALIDO", () => {
    const d = clonar();
    d.emisor.emisor_id.valor = "no-es-un-ruc";
    expect(codigos(bloqueantes(planDe(d)))).toContain("EMISOR_ID_INVALIDO");
  });

  it("CAMPO_OBLIGATORIO_VACIO cuando la razon social llega en null", () => {
    const d = clonar();
    d.emisor.razon_social.valor = null;
    const b = bloqueantes(planDe(d));
    expect(codigos(b)).toContain("CAMPO_OBLIGATORIO_VACIO");
    expect(b.find((x) => x.codigo === "CAMPO_OBLIGATORIO_VACIO")?.ruta).toBe("$.emisor.razon_social");
  });

  it("CODIGO_INVALIDO cuando el establecimiento no son tres digitos", () => {
    const d = clonar();
    d.establecimientos[0].codigo.valor = "1";
    expect(codigos(bloqueantes(planDe(d)))).toContain("CODIGO_INVALIDO");
  });

  it("CODIGO_DUPLICADO con dos puntos iguales", () => {
    const d = clonar();
    d.establecimientos[0].puntos_expedicion[1].codigo.valor = "001";
    expect(codigos(bloqueantes(planDe(d)))).toContain("CODIGO_DUPLICADO");
  });

  it("CONTEXTO_DUPLICADO con dos perfiles que dan la misma tupla", () => {
    const d = clonar();
    d.perfiles_emision.items[1] = JSON.parse(JSON.stringify(d.perfiles_emision.items[0]));
    expect(codigos(bloqueantes(planDe(d)))).toContain("CONTEXTO_DUPLICADO");
  });

  it("REFERENCIA_INTERNA_ROTA cuando el perfil apunta a una actividad inexistente", () => {
    const d = clonar();
    d.perfiles_emision.items[0].actividad_codigo.valor = "99999";
    expect(codigos(bloqueantes(planDe(d)))).toContain("REFERENCIA_INTERNA_ROTA");
  });

  it("TIPO_DOCUMENTO_FE_AUSENTE", () => {
    const d = clonar();
    d.tipos_documento_habilitados.valor = ["NCE"];
    expect(codigos(advertencias(planDe(d)))).toContain("TIPO_DOCUMENTO_FE_AUSENTE");
  });

  it("PERMISOS_CONSUMIDOR_INCOMPLETOS cuando falta FACTURA_EMIT", () => {
    const d = clonar();
    d.consumidor[0].permisos.valor = ["DOCUMENTO_READ", "SIFEN_STATUS_READ"];
    expect(codigos(advertencias(planDe(d)))).toContain("PERMISOS_CONSUMIDOR_INCOMPLETOS");
  });

  it("PERMISOS_CONSUMIDOR_INCOMPLETOS cuando no hay consumidores", () => {
    const d = clonar();
    d.consumidor = [];
    expect(codigos(advertencias(planDe(d)))).toContain("PERMISOS_CONSUMIDOR_INCOMPLETOS");
  });
});
