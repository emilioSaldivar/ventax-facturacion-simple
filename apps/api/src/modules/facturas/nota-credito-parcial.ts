import { cantidadEscalada, calculateDocumentTotalsMoneda, type TaxTotals } from "@facturacion-simple/shared";
import type { DocumentoResponse, FacturaItemPreview } from "./facturas.types";

/**
 * SPEC_NOTA_CREDITO_PARCIAL_v0.1. Reglas puras de la nota de credito parcial con lineas: saldo acreditable por
 * linea (RN-06), validacion del pedido (RN-01) y armado de las lineas de la nota con el precio y el IVA de la
 * factura (RN-02). Las cantidades se cuentan escaladas a enteros (x 10.000) para no acumular error de coma flotante.
 */

export interface LineaNotaCreditoPedida {
  line_no: number;
  cantidad: number;
}

export interface SaldoLinea {
  line_no: number;
  descripcion: string;
  codigo: string | null;
  precio_unitario: number;
  iva_tipo: FacturaItemPreview["iva_tipo"];
  cantidad_facturada: number;
  cantidad_acreditada: number;
  saldo: number;
  /** SPEC_NOTA_CREDITO_UNIFICADA_v0.1 RN-08: importe neto de la linea en la factura. */
  importe_neto: number;
  /** RN-08: devoluciones (al neto) + acreditaciones sobre esta linea en notas vivas. */
  importe_acreditado: number;
  /** RN-08: lo que queda por acreditar sobre la linea (D-4). */
  saldo_importe: number;
  /** Descuento por unidad y prorrateo del global de la factura (D-6). */
  descuento?: number;
  descuento_global?: number;
}

const ESCALA = 10_000;
const escalar = (cantidad: number) => cantidadEscalada(cantidad) ?? Math.round(cantidad * ESCALA);
const desescalar = (escalada: number) => escalada / ESCALA;

/**
 * Notas que cuentan para el saldo: todas las de la factura salvo las rechazadas (D-2, RN-06). Las notas por monto no
 * acreditan cantidades de las lineas de la factura (SPEC_NOTA_CREDITO_POR_MONTO_v0.1, RN-07).
 */
export function notasQueDescuentan(notas: DocumentoResponse[], facturaId: string): DocumentoResponse[] {
  return notas.filter(
    (nota) =>
      nota.tipo === "NOTA_CREDITO" && nota.documento_relacionado_id === facturaId && nota.estado !== "RECHAZADA" && nota.nce_modo !== "MONTO"
  );
}

export function saldoAcreditablePorLinea(original: DocumentoResponse, notas: DocumentoResponse[]): SaldoLinea[] {
  const acreditadas = new Map<number, number>();
  const importes = new Map<number, number>();
  for (const nota of notasQueDescuentan(notas, original.id)) {
    for (const item of nota.items) {
      // SPEC_NOTA_CREDITO_UNIFICADA_v0.1 RN-06: en una nota combinada la linea de la factura va en `linea_factura`;
      // el reparto sobre el total no es de ninguna linea. En notas anteriores, `line_no` es la de la factura.
      if (item.origen_nc === "ACREDITACION_TOTAL") continue;
      const linea = item.linea_factura ?? item.line_no;
      importes.set(linea, (importes.get(linea) ?? 0) + Number(item.subtotal ?? 0));
      if (item.origen_nc === "ACREDITACION_LINEA") continue;
      acreditadas.set(linea, (acreditadas.get(linea) ?? 0) + escalar(Number(item.cantidad)));
    }
  }
  return original.items.map((item) => {
    const facturada = escalar(Number(item.cantidad));
    const acreditada = Math.min(acreditadas.get(item.line_no) ?? 0, facturada);
    const importeNeto = Number(item.subtotal ?? 0);
    const importeAcreditado = Math.min(importes.get(item.line_no) ?? 0, importeNeto);
    return {
      line_no: item.line_no,
      descripcion: item.descripcion,
      codigo: item.codigo ?? null,
      precio_unitario: Number(item.precio_unitario),
      iva_tipo: item.iva_tipo,
      cantidad_facturada: desescalar(facturada),
      cantidad_acreditada: desescalar(acreditada),
      saldo: desescalar(facturada - acreditada),
      importe_neto: importeNeto,
      importe_acreditado: importeAcreditado,
      saldo_importe: Math.round((importeNeto - importeAcreditado) * 100) / 100,
      ...((item.descuento ?? 0) > 0 ? { descuento: Number(item.descuento) } : {}),
      ...((item.descuento_global ?? 0) > 0 ? { descuento_global: Number(item.descuento_global) } : {})
    };
  });
}

export function tieneSaldo(saldos: SaldoLinea[]): boolean {
  return saldos.some((linea) => linea.saldo > 0);
}

export interface ErrorLineaNotaCredito {
  line_no: number;
  motivo: string;
  saldo?: number;
}

/** RN-01: lineas existentes, sin repetir, cantidad > 0 con hasta 4 decimales y no mayor que el saldo. */
export function validarLineasPedidas(pedidas: LineaNotaCreditoPedida[], saldos: SaldoLinea[]): ErrorLineaNotaCredito[] {
  const errores: ErrorLineaNotaCredito[] = [];
  const vistas = new Set<number>();
  const porLinea = new Map(saldos.map((linea) => [linea.line_no, linea]));
  for (const pedida of pedidas) {
    const saldo = porLinea.get(pedida.line_no);
    if (!saldo) {
      errores.push({ line_no: pedida.line_no, motivo: "La linea no existe en la factura." });
      continue;
    }
    if (vistas.has(pedida.line_no)) {
      errores.push({ line_no: pedida.line_no, motivo: "La linea esta repetida." });
      continue;
    }
    vistas.add(pedida.line_no);
    const escalada = cantidadEscalada(pedida.cantidad);
    if (escalada === null) {
      errores.push({ line_no: pedida.line_no, motivo: "La cantidad debe ser mayor que cero con hasta 4 decimales." });
      continue;
    }
    if (escalada > escalar(saldo.saldo)) {
      errores.push({ line_no: pedida.line_no, motivo: "La cantidad supera el saldo de la linea.", saldo: saldo.saldo });
    }
  }
  return errores;
}

/**
 * RN-02: lineas de la nota con la cantidad pedida y el precio e IVA de la factura; conservan el `line_no` de la
 * factura para poder sumar el saldo despues. Totales con el calculo de la moneda (presentacion, como la factura).
 */
export function armarLineasNotaCredito(
  original: DocumentoResponse,
  pedidas: LineaNotaCreditoPedida[]
): { items: FacturaItemPreview[]; totals: TaxTotals } {
  const origenes = pedidas.map((pedida) => {
    const item = original.items.find((candidato) => candidato.line_no === pedida.line_no);
    if (!item) throw new Error(`Linea ${pedida.line_no} inexistente.`);
    return { item, cantidad: pedida.cantidad };
  });
  const calculo = calculateDocumentTotalsMoneda(
    origenes.map(({ item, cantidad }) => ({
      codigo: item.codigo ?? null,
      descripcion: item.descripcion,
      cantidad,
      precio_unitario: Number(item.precio_unitario),
      iva_tipo: item.iva_tipo
    })),
    original.moneda ?? "PYG"
  );
  return {
    items: calculo.items.map((calculado, indice) => ({
      ...calculado,
      codigo: calculado.codigo ?? null,
      line_no: origenes[indice]!.item.line_no,
      catalogo_item_id: origenes[indice]!.item.catalogo_item_id ?? null
    })),
    totals: calculo.totals
  };
}

/**
 * Una nota es parcial si no repite exactamente las lineas y cantidades de su factura (la total las copia tal
 * cual). Sirve para que el reintento de una nota trabada mande lo mismo que la primera vez.
 */
export function esNotaParcial(nota: DocumentoResponse, original: DocumentoResponse): boolean {
  if (nota.items.length !== original.items.length) return true;
  const cantidades = new Map(original.items.map((item) => [item.line_no, escalar(Number(item.cantidad))]));
  return nota.items.some((item) => cantidades.get(item.line_no) !== escalar(Number(item.cantidad)));
}
