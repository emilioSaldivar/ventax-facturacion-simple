import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LecturaRdeError, leerFacturaDeRde } from "../src/modules/facturas/de-sifen.lectura";

// SPEC_NOTA_CREDITO_FACTURA_EXTERNA_v0.1 D-2 (TASKS NCX-003). Fixture: `xml_rde` real de la factura 001-001-1010665
// consultada con GET /v1/consultar/de-sifen en fe-segel (SIFEN test) el 2026-11-12; nombre, direccion, telefono y
// correo del emisor saneados (el lector no los usa).
const RDE = fs.readFileSync(path.join(__dirname, "fixtures", "rde-factura-1010665.xml"), "utf8");

describe("lectura del rDE", () => {
  it("lee la factura 1010665: numero, fecha, emisor, receptor, moneda", () => {
    const f = leerFacturaDeRde(RDE);
    expect(f).toMatchObject({
      tipo_de: 1,
      emisor: { ruc: "5057016", dv: "1" },
      timbrado: "05057016",
      numero_fiscal: "001-001-1010665",
      fecha_emision: "2026-11-12",
      condicion_venta: "CONTADO",
      moneda: "PYG",
      tipo_cambio: null,
      receptor: { documento_tipo: "RUC", documento: "80026570-0", razon_social: "SEGEL SA", naturaleza: "JURIDICA", exterior: false }
    });
  });

  it("lee las tres lineas con descuentos e IVA", () => {
    const { items } = leerFacturaDeRde(RDE);
    expect(items.map((i) => [i.codigo, i.cantidad, i.precio_unitario, i.descuento ?? 0, i.descuento_global ?? 0, i.subtotal, i.iva_tipo, i.base_imponible, i.iva_monto])).toEqual([
      ["L001", 2, 100000, 10000, 14168, 165832, "IVA_10", 150757, 15076],
      ["L002", 1, 52330, 0, 3707, 48623, "IVA_5", 46308, 2315],
      ["L003", 1, 30000, 0, 2125, 27875, "EXENTA", 27875, 0]
    ]);
    // El prorrateo del global suma el descuento global de la factura.
    expect(items.reduce((s, i) => s + (i.descuento_global ?? 0), 0)).toBe(20000);
  });

  it("lee los totales: tasas iguales a /totales de FE (165.833 / 48.623 / 27.875) y total 242.300", () => {
    const { totals } = leerFacturaDeRde(RDE);
    expect(totals).toMatchObject({
      subtotal: 282330,
      descuento: 40000,
      descuento_global: 20000,
      total: 242300,
      redondeo: 30,
      iva_10: 15076,
      iva_5: 2315,
      total_iva: 17391,
      total_sin_iva: 224909,
      gravada_10: 150757,
      gravada_5: 46308,
      exenta: 27875,
      exonerada: 0,
      total_guaranies: 242300,
      fuente: "SIFEN"
    });
    expect(totals.gravada_10! + totals.iva_10).toBe(165833);
    expect(totals.gravada_5! + totals.iva_5).toBe(48623);
  });

  it("receptor no contribuyente (CI) y del exterior", () => {
    const ci = RDE.replace(/<gDatRec>[\s\S]*?<\/gDatRec>/, "<gDatRec><iNatRec>2</iNatRec><iTiOpe>2</iTiOpe><cPaisRec>PRY</cPaisRec><iTipIDRec>1</iTipIDRec><dNumIDRec>1234567</dNumIDRec><dNomRec>JUAN PEREZ</dNomRec></gDatRec>");
    expect(leerFacturaDeRde(ci).receptor).toMatchObject({ documento_tipo: "CI", documento: "1234567", razon_social: "JUAN PEREZ", exterior: false });
    const ext = ci.replace("<cPaisRec>PRY</cPaisRec>", "<cPaisRec>ARG</cPaisRec>").replace("<iTipIDRec>1</iTipIDRec>", "<iTipIDRec>2</iTipIDRec>");
    expect(leerFacturaDeRde(ext).receptor).toMatchObject({ documento_tipo: "PASAPORTE", exterior: true });
    const innominado = ci.replace("<iTipIDRec>1</iTipIDRec>", "<iTipIDRec>5</iTipIDRec>");
    expect(leerFacturaDeRde(innominado).receptor.documento_tipo).toBe("INNOMINADO");
  });

  it("rechaza IVA gravado parcial y XML sin bloques", () => {
    const parcial = RDE.replace("<iAfecIVA>1</iAfecIVA>", "<iAfecIVA>4</iAfecIVA>");
    expect(() => leerFacturaDeRde(parcial)).toThrow(LecturaRdeError);
    expect(() => leerFacturaDeRde(parcial)).toThrow(/parcial/);
    expect(() => leerFacturaDeRde("<rDE></rDE>")).toThrow(LecturaRdeError);
  });
});
