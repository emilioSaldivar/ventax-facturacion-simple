import { describe, expect, it } from "vitest";
import { armarNotaCombinada, type ItemFacturaNc } from "./nota-credito-combinada";

// SPEC_NOTA_CREDITO_UNIFICADA_v0.1 (TASKS NCU-001). Factura de ejemplo del canvas (copia de 1010671, sin descuentos):
// 2 x 75.000 IVA 10, 1 x 31.500 IVA 5, 3 x 10.000 exento; total 211.500.
const items: ItemFacturaNc[] = [
  { line_no: 1, codigo: "L001", descripcion: "Servicio de chapería", cantidad: 2, precio_unitario: 75000, iva_tipo: "IVA_10", subtotal: 150000, cantidad_disponible: 2, importe_disponible: 150000 },
  { line_no: 2, codigo: "L002", descripcion: "Manual técnico", cantidad: 1, precio_unitario: 31500, iva_tipo: "IVA_5", subtotal: 31500, cantidad_disponible: 1, importe_disponible: 31500 },
  { line_no: 3, codigo: "L003", descripcion: "Insumos exentos", cantidad: 3, precio_unitario: 10000, iva_tipo: "EXENTA", subtotal: 30000, cantidad_disponible: 3, importe_disponible: 30000 }
];
const tasas = { iva_10: 150000, iva_5: 31500, exenta: 30000 };
const base = { moneda: "PYG", items, tasas, saldo: 211500, descuentosEnNc: false };

describe("nota de credito combinada", () => {
  it("canvas 04: devolver 1 del item 1, 10 % del item 2 y 5.000 sobre el total = 83.150, motivo 1", () => {
    const r = armarNotaCombinada({
      ...base,
      pedido: { lineas: [{ line_no: 1, cantidad: 1 }, { line_no: 2, acreditacion: { tipo: "PORCENTAJE", valor: 10 } }], acreditacion_total: { tipo: "MONTO", valor: 5000 } }
    });
    expect(r.errores).toEqual([]);
    expect(r.lineas.map((l) => [l.origen, l.linea_factura, l.codigo, l.cantidad, l.precio_unitario, l.iva_tipo])).toEqual([
      ["DEVOLUCION", 1, "L001", 1, 75000, "IVA_10"],
      ["ACREDITACION_LINEA", 2, "AJ-L002", 1, 3150, "IVA_5"],
      ["ACREDITACION_TOTAL", null, "AJ-IVA10", 1, 3546, "IVA_10"],
      ["ACREDITACION_TOTAL", null, "AJ-IVA5", 1, 745, "IVA_5"],
      ["ACREDITACION_TOTAL", null, "AJ-EXE", 1, 709, "EXENTA"]
    ]);
    expect(r.lineas[1]!.descripcion).toBe("Ajuste 10 % · Manual técnico");
    expect(r).toMatchObject({ devolucion: 75000, acreditacion_lineas: 3150, acreditacion_total: 5000, total: 83150, total_redondeado: 83150, redondeo: 0, motivo_sugerido: 1 });
  });

  it("motivo sugerido: solo devolucion 2, solo acreditacion 3", () => {
    expect(armarNotaCombinada({ ...base, pedido: { lineas: [{ line_no: 1, cantidad: 2 }] } }).motivo_sugerido).toBe(2);
    expect(armarNotaCombinada({ ...base, pedido: { acreditacion_total: { tipo: "MONTO", valor: 1000 } } }).motivo_sugerido).toBe(3);
  });

  it("% sobre el total se calcula sobre el saldo y se reparte por tasa (CA-04)", () => {
    const r = armarNotaCombinada({ ...base, pedido: { acreditacion_total: { tipo: "PORCENTAJE", valor: 10 } } });
    expect(r.acreditacion_total).toBe(21150);
    expect(r.lineas.reduce((s, l) => s + l.importe, 0)).toBe(21150);
  });

  it("redondeo PYG a 50 hacia abajo (D-3), sin bloquear", () => {
    const r = armarNotaCombinada({ ...base, pedido: { lineas: [{ line_no: 2, acreditacion: { tipo: "MONTO", valor: 3170 } }] } });
    expect(r).toMatchObject({ total: 3170, total_redondeado: 3150, redondeo: 20 });
    expect(r.errores).toEqual([]);
  });

  it("D-4: devolver todo el item y ademas acreditarle supera su importe", () => {
    const r = armarNotaCombinada({ ...base, pedido: { lineas: [{ line_no: 1, cantidad: 2, acreditacion: { tipo: "MONTO", valor: 20000 } }] } });
    expect(r.errores).toEqual([expect.objectContaining({ line_no: 1, campo: "acreditacion" })]);
  });

  it("D-4 con notas anteriores: la cantidad y el importe disponibles mandan", () => {
    const usado = items.map((i) => (i.line_no === 2 ? { ...i, importe_disponible: 28350 } : i));
    const r = armarNotaCombinada({ ...base, items: usado, pedido: { lineas: [{ line_no: 2, cantidad: 1 }] } });
    expect(r.errores[0]).toMatchObject({ line_no: 2, mensaje: expect.stringContaining("Gs. 28.350") });
    const sinCantidad = armarNotaCombinada({ ...base, items: items.map((i) => ({ ...i, cantidad_disponible: 0 })), pedido: { lineas: [{ line_no: 1, cantidad: 1 }] } });
    expect(sinCantidad.errores[0]).toMatchObject({ campo: "cantidad" });
  });

  it("D-5: total sobre el saldo; vacio; linea inexistente o repetida", () => {
    expect(armarNotaCombinada({ ...base, saldo: 50000, pedido: { lineas: [{ line_no: 1, cantidad: 1 }] } }).errores[0]).toMatchObject({ campo: "total" });
    expect(armarNotaCombinada({ ...base, pedido: {} }).errores[0]).toMatchObject({ campo: "total", mensaje: expect.stringContaining("Indicá") });
    expect(armarNotaCombinada({ ...base, pedido: { lineas: [{ line_no: 9, cantidad: 1 }] } }).errores[0]).toMatchObject({ line_no: 9 });
    expect(armarNotaCombinada({ ...base, pedido: { lineas: [{ line_no: 1, cantidad: 1 }, { line_no: 1, cantidad: 1 }] } }).errores[0]).toMatchObject({ mensaje: "La línea está repetida." });
  });

  it("validaciones de monto y porcentaje", () => {
    expect(armarNotaCombinada({ ...base, pedido: { acreditacion_total: { tipo: "MONTO", valor: 10.5 } } }).errores[0]).toMatchObject({ mensaje: "En guaraníes el monto va sin decimales." });
    expect(armarNotaCombinada({ ...base, pedido: { lineas: [{ line_no: 1, acreditacion: { tipo: "PORCENTAJE", valor: 150 } }] } }).errores[0]).toMatchObject({ campo: "acreditacion" });
  });

  it("D-6: linea con descuento sin la bandera se bloquea; con la bandera va al neto con el descuento por unidad", () => {
    // Factura del ejemplo de FE §67.5: linea 1 2 x 100.000 con 10.000 de descuento por unidad y 14.168 de global; neto 165.832.
    const conDescuento: ItemFacturaNc[] = [
      { line_no: 1, codigo: "L001", descripcion: "Artículo 10", cantidad: 2, precio_unitario: 100000, iva_tipo: "IVA_10", descuento: 10000, descuento_global: 14168, subtotal: 165832, cantidad_disponible: 2, importe_disponible: 165832 }
    ];
    const entrada = { moneda: "PYG", items: conDescuento, tasas: { iva_10: 165833, iva_5: 48623, exenta: 27875 }, saldo: 242300, pedido: { lineas: [{ line_no: 1, cantidad: 1 }] } };
    expect(armarNotaCombinada({ ...entrada, descuentosEnNc: false }).errores[0]).toMatchObject({ mensaje: "Esta línea tiene descuento: ajustala por monto." });
    const r = armarNotaCombinada({ ...entrada, descuentosEnNc: true });
    expect(r.errores).toEqual([]);
    // 10.000 + 14.168 / 2 = 17.084 por unidad; 100.000 - 17.084 = 82.916.
    expect(r.lineas[0]).toMatchObject({ precio_unitario: 100000, descuento: 17084, importe: 82916 });
  });

  it("USD: % con 2 decimales y sin regla de 50", () => {
    const usd: ItemFacturaNc[] = [{ line_no: 1, codigo: "L001", descripcion: "Consultoría", cantidad: 2, precio_unitario: 120.5, iva_tipo: "IVA_10", subtotal: 241, cantidad_disponible: 2, importe_disponible: 241 }];
    const r = armarNotaCombinada({ moneda: "USD", items: usd, tasas: { iva_10: 241, iva_5: 0, exenta: 0 }, saldo: 241, descuentosEnNc: false, pedido: { lineas: [{ line_no: 1, acreditacion: { tipo: "PORCENTAJE", valor: 7.5 } }] } });
    expect(r).toMatchObject({ total: 18.08, total_redondeado: 18.08, redondeo: 0 });
  });
});
