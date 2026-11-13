import { describe, expect, it } from "vitest";
import { digitoVerificadorCdc, mismoEmisorDelCdc, normalizarCdc, numeroFiscalDelCdc, partesDelCdc, validarCdcFactura } from "./cdc";

// SPEC_NOTA_CREDITO_FACTURA_EXTERNA_v0.1 RN-01 (TASKS NCX-001). CDC reales del emisor del ensayo (5057016-1) en SIFEN
// test, copiados del Postgres del stack local el 2026-11-12 (PLAN §0: nunca de memoria). Facturas (01) y NC (05).
const REALES = [
  "01050570161001001101066712026111210175744287",
  "05050570161001001101003412026111214303408548",
  "01050570161001001101066612026111211177608659",
  "05050570161001001101003312026111216695167876",
  "05050570161001001101003212026111219152293318",
  "01050570161001001101066512026111215911136102",
  "01050570161001001101066412026111215915155594",
  "01050570161001001101066312026111210989272891",
  "01050570161001001101066212026111214330148364",
  "01050570161001001101066112026111216172219853",
  "01050570161001001101066012026111217597555022",
  "01050570161001001101065912026111211641835010"
];
const FACTURA_1010665 = "01050570161001001101066512026111215911136102";
const NC_1010034 = "05050570161001001101003412026111214303408548";

describe("CDC compartido", () => {
  it("el DV modulo 11 coincide en los 12 CDC reales", () => {
    for (const cdc of REALES) expect(digitoVerificadorCdc(cdc.slice(0, 43)), cdc).toBe(Number(cdc[43]));
  });

  it("lee las partes de la factura 1010665 (dCodSeg 591113610 y dDVId 2 del rDE)", () => {
    expect(partesDelCdc(FACTURA_1010665)).toEqual({
      tipo: "01",
      ruc: "05057016",
      dv: "1",
      establecimiento: "001",
      punto: "001",
      numero: "1010665",
      tipo_contribuyente: "1",
      fecha: "2026-11-12",
      tipo_emision: "1",
      codigo_seguridad: "591113610",
      dv_cdc: "2"
    });
    expect(numeroFiscalDelCdc(FACTURA_1010665)).toBe("001-001-1010665");
  });

  it("normaliza espacios y guiones del KUDE", () => {
    const agrupado = FACTURA_1010665.replace(/(\d{4})(?=\d)/g, "$1 ");
    expect(normalizarCdc(agrupado)).toBe(FACTURA_1010665);
    expect(validarCdcFactura(agrupado.replace(/ /g, "-"), "5057016-1")).toBeNull();
  });

  it("rechaza formato, DV, tipo y emisor con su motivo", () => {
    const dvMalo = FACTURA_1010665.slice(0, 43) + String((Number(FACTURA_1010665[43]) + 1) % 10);
    expect(validarCdcFactura("0105057016", "5057016-1")).toMatchObject({ motivo: "CDC_FORMATO" });
    expect(validarCdcFactura(dvMalo, "5057016-1")).toMatchObject({ motivo: "CDC_DV" });
    expect(validarCdcFactura(NC_1010034, "5057016-1")).toMatchObject({ motivo: "CDC_NO_ES_FACTURA" });
    expect(validarCdcFactura(FACTURA_1010665, "80026570-0")).toMatchObject({ motivo: "CDC_OTRO_EMISOR" });
  });

  it("compara el emisor sin ceros a la izquierda", () => {
    expect(mismoEmisorDelCdc({ ruc: "05057016", dv: "1" }, "5057016-1")).toBe(true);
    expect(mismoEmisorDelCdc({ ruc: "80026570", dv: "0" }, "80026570-0")).toBe(true);
    expect(mismoEmisorDelCdc({ ruc: "05057016", dv: "1" }, "5057016-2")).toBe(false);
  });
});
