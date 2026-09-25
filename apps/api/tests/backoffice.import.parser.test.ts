import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { HttpError } from "../src/shared/errors/http-error";
import {
  detectFormat,
  esVersionSoportada,
  parseFeConfig,
  unwrapValores
} from "../src/modules/backoffice/import/fe-config.parser";

const FIXTURES = join(__dirname, "fixtures");
const readFixture = (name: string) => readFileSync(join(FIXTURES, name), "utf8");

describe("unwrapValores", () => {
  it("desenvuelve un wrapper simple y guarda su referencia", () => {
    const refs: Record<string, string> = {};
    const result = unwrapValores({ version: { valor: "v0.1", referencia: "GUIA.md#x" } }, "$", refs);

    expect(result).toEqual({ version: "v0.1" });
    expect(refs).toEqual({ "$.version": "GUIA.md#x" });
  });

  it("desenvuelve dentro de arrays, con la ruta indexada", () => {
    const refs: Record<string, string> = {};
    const result = unwrapValores(
      { items: [{ codigo: { valor: "001", referencia: "GUIA.md#a" } }] },
      "$",
      refs
    );

    expect(result).toEqual({ items: [{ codigo: "001" }] });
    expect(refs).toEqual({ "$.items[0].codigo": "GUIA.md#a" });
  });

  it("NO desenvuelve un objeto de negocio que casualmente tenga una clave `valor`", () => {
    const nodo = { valor: 100, moneda: "PYG" };
    expect(unwrapValores(nodo)).toEqual(nodo);
  });

  it("preserva null, primitivos y valores no envueltos", () => {
    const refs: Record<string, string> = {};
    const result = unwrapValores(
      { a: { valor: null, referencia: "r" }, b: "texto plano", c: 7, d: false },
      "$",
      refs
    );

    expect(result).toEqual({ a: null, b: "texto plano", c: 7, d: false });
    expect(refs).toEqual({ "$.a": "r" });
  });

  it("desenvuelve valores anidados dentro de un wrapper", () => {
    const refs: Record<string, string> = {};
    const result = unwrapValores(
      { alcance: { valor: [{ emisor_id: "5057016-1", env: "prod" }], referencia: "GUIA.md#z" } },
      "$",
      refs
    );

    expect(result).toEqual({ alcance: [{ emisor_id: "5057016-1", env: "prod" }] });
    expect(refs).toEqual({ "$.alcance": "GUIA.md#z" });
  });
});

describe("detectFormat", () => {
  it("respeta el hint explicito por encima de la extension", () => {
    expect(detectFormat("config.yaml", "{}", "json")).toBe("json");
    expect(detectFormat("config.json", "a: 1", "yaml")).toBe("yaml");
  });

  it("resuelve por extension cuando el hint es auto", () => {
    expect(detectFormat("config.json", "", "auto")).toBe("json");
    expect(detectFormat("config.yaml", "", "auto")).toBe("yaml");
    expect(detectFormat("config.yml", "", "auto")).toBe("yaml");
  });

  it("cae al primer caracter util cuando la extension no dice nada", () => {
    expect(detectFormat("config.txt", "  \n {\"a\":1}")).toBe("json");
    expect(detectFormat("config.txt", "contrato:\n  version: v0.1")).toBe("yaml");
  });
});

describe("parseFeConfig — higiene de entrada", () => {
  it("tolera BOM y CRLF", () => {
    const conBomYCrlf = "﻿" + readFixture("fe-config-v0.1.yaml").replace(/\n/g, "\r\n");
    const parsed = parseFeConfig({ filename: "config.yaml", content: conBomYCrlf });

    expect(parsed.document.emisor.emisor_id).toBe("5057016-1");
  });

  it("rechaza un JSON invalido con 400 y el formato detectado", () => {
    try {
      parseFeConfig({ filename: "config.json", content: "{ roto" });
      throw new Error("deberia haber lanzado");
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError);
      const http = error as HttpError;
      expect(http.statusCode).toBe(400);
      expect((http.details as { formato: string }).formato).toBe("json");
    }
  });

  it("rechaza un YAML invalido con 400 e informa la linea", () => {
    try {
      // Indentacion inconsistente: la libreria lanza YAMLParseError con `linePos`.
      // (Un `: sin clave` NO sirve como caso invalido: `yaml` lo acepta como clave nula.)
      parseFeConfig({ filename: "config.yaml", content: "a:\n  - b\n c: 1\n" });
      throw new Error("deberia haber lanzado");
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError);
      const http = error as HttpError;
      expect(http.statusCode).toBe(400);
      expect((http.details as { formato: string }).formato).toBe("yaml");
      expect((http.details as { linea: number | null }).linea).toBeGreaterThan(0);
    }
  });

  it("rechaza un documento que no es un objeto", () => {
    expect(() => parseFeConfig({ filename: "config.json", content: "[1,2,3]" })).toThrow(HttpError);
  });
});

describe("parseFeConfig — fixture real del emisor 5057016-1", () => {
  const parsed = parseFeConfig({
    filename: "fe-config-v0.1.json",
    content: readFixture("fe-config-v0.1.json")
  });

  it("desenvuelve el emisor y sus datos", () => {
    expect(parsed.format).toBe("json");
    expect(parsed.document.emisor).toMatchObject({
      emisor_id: "5057016-1",
      razon_social: "EMILIO MATIAS SALDIVAR CAPUTO",
      nombre_fantasia: "EMILIO SALDIVAR",
      ambiente: "prod"
    });
  });

  it("conserva la estructura de establecimientos y puntos", () => {
    expect(parsed.document.establecimientos).toHaveLength(1);
    const establecimiento = parsed.document.establecimientos[0]!;
    expect(establecimiento.codigo).toBe("001");
    expect(establecimiento.puntos_expedicion.map((p) => p.codigo)).toEqual(["001", "002"]);
  });

  it("expone los perfiles con la tupla completa del contexto", () => {
    const items = parsed.document.perfiles_emision?.items ?? [];
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      codigo: "A45203-E001-P001-FE-PTO",
      actividad_codigo: "45203",
      establecimiento_codigo: "001",
      punto_codigo: "001",
      // codigo SIFEN crudo, no "FE"
      tipo_documento: "1"
    });
  });

  it("acepta los null de numeracion con autoridad SERVICE", () => {
    expect(parsed.document.numeracion).toMatchObject({
      autoridad: "SERVICE",
      documento_nro_requerido: false,
      serie_fiscal: null,
      rango_min: null,
      rango_max: null
    });
  });

  it("recolecta las referencias a la guia por ruta", () => {
    expect(parsed.referencias["$.emisor.razon_social"]).toContain("GUIA_INTEGRACION_CONSUMIDORES.md#");
    expect(Object.keys(parsed.referencias).length).toBeGreaterThan(30);
  });

  it("deja `guia_referencia` tal cual: no viene envuelto", () => {
    expect(parsed.document.contrato.guia_referencia).toBe("GUIA_INTEGRACION_CONSUMIDORES.md");
  });
});

describe("paridad JSON / YAML (CA-3 del SPEC)", () => {
  const json = parseFeConfig({ filename: "fe-config-v0.1.json", content: readFixture("fe-config-v0.1.json") });
  const yaml = parseFeConfig({ filename: "fe-config-v0.1.yaml", content: readFixture("fe-config-v0.1.yaml") });

  it("produce el mismo documento en ambos formatos", () => {
    // `generado_en` se excluye a proposito: los dos fixtures son exportaciones reales
    // tomadas con 6 segundos de diferencia. Cuando se disponga de un par exportado en
    // la misma corrida, este `omit` puede quitarse y el test se vuelve mas estricto.
    const sinGeneradoEn = (doc: typeof json.document) => ({
      ...doc,
      contrato: { ...doc.contrato, generado_en: undefined }
    });

    expect(sinGeneradoEn(yaml.document)).toEqual(sinGeneradoEn(json.document));
  });

  it("produce el mismo mapa de referencias", () => {
    expect(yaml.referencias).toEqual(json.referencias);
  });

  it("detecta correctamente cada formato", () => {
    expect(json.format).toBe("json");
    expect(yaml.format).toBe("yaml");
  });
});

describe("esVersionSoportada", () => {
  it("acepta v0.1 y rechaza el resto", () => {
    expect(esVersionSoportada("v0.1")).toBe(true);
    expect(esVersionSoportada(" v0.1 ")).toBe(true);
    expect(esVersionSoportada("v0.2")).toBe(false);
    expect(esVersionSoportada(null)).toBe(false);
    expect(esVersionSoportada(undefined)).toBe(false);
  });
});
