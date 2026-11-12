import {
  calculateDocumentTotalsMoneda,
  decimalesDeMoneda,
  repartirMontoPorTasa,
  saldoEmitible,
  type MontosPorTasa,
  type TaxTotals
} from "@facturacion-simple/shared";
import type { DocumentoEstado, DocumentoResponse, FacturaItemPreview } from "./facturas.types";

/**
 * SPEC_NOTA_CREDITO_POR_MONTO_v0.1 (guia de FE v0.52 §67). Reglas de servidor de la nota de credito por monto: saldo
 * sobre el total neto (D-3, D-4) y armado de las lineas por tasa (RN-05, D-7). El reparto es la funcion compartida.
 */

export const MOTIVOS_NOTA_CREDITO_MONTO = [3, 4, 8] as const;
export type MotivoNotaCreditoMonto = (typeof MOTIVOS_NOTA_CREDITO_MONTO)[number];

/** D-7: lo que el cliente lee en el KUDE en cada linea. */
export const DESCRIPCION_LINEA_MONTO: Record<MotivoNotaCreditoMonto, string> = {
  3: "Descuento posterior sobre la factura",
  4: "Bonificación sobre la factura",
  8: "Ajuste de precio sobre la factura"
};

const CODIGO_LINEA_MONTO: Record<"IVA_10" | "IVA_5" | "EXENTA", string> = {
  IVA_10: "AJ-IVA10",
  IVA_5: "AJ-IVA5",
  EXENTA: "AJ-EXE"
};

/** D-3: estados de FS equivalentes a REJECTED, CANCELLED y VOIDED de FE; el resto (en cola incluida) cuenta. */
const ESTADOS_QUE_NO_CUENTAN = new Set<DocumentoEstado>(["RECHAZADA", "ANULADA", "CANCELADO_LOCAL"]);

export function notasQueCuentanMonto(notas: DocumentoResponse[], facturaId: string): DocumentoResponse[] {
  return notas.filter(
    (nota) => nota.tipo === "NOTA_CREDITO" && nota.documento_relacionado_id === facturaId && !ESTADOS_QUE_NO_CUENTAN.has(nota.estado)
  );
}

export interface SaldoMonto {
  total_factura: number;
  acreditado: number;
  /** Lo que todavia se puede acreditar, ya bajado a lo emitible (D-4). */
  saldo: number;
}

export function calcularSaldoMonto(totalFactura: number, notas: DocumentoResponse[], facturaId: string, moneda: string): SaldoMonto {
  const escala = 10 ** decimalesDeMoneda(moneda);
  const enteros = (valor: number) => Math.round(Number(valor) * escala);
  const acreditado = notasQueCuentanMonto(notas, facturaId).reduce((suma, nota) => suma + enteros(nota.totals?.total ?? 0), 0);
  const total = enteros(totalFactura);
  return {
    total_factura: total / escala,
    acreditado: acreditado / escala,
    saldo: saldoEmitible(Math.max(0, total - acreditado) / escala, moneda)
  };
}

/** RN-05 y D-7: una linea por tasa con parte > 0, cantidad 1 y el precio de la parte. */
export function armarLineasMonto(
  monto: number,
  tasas: MontosPorTasa,
  moneda: string,
  motivoCodigo: MotivoNotaCreditoMonto
): { items: FacturaItemPreview[]; totals: TaxTotals } | null {
  const partes = repartirMontoPorTasa(monto, tasas, moneda);
  if (partes.length === 0) return null;
  const calculo = calculateDocumentTotalsMoneda(
    partes.map((parte) => ({
      codigo: CODIGO_LINEA_MONTO[parte.iva_tipo],
      descripcion: DESCRIPCION_LINEA_MONTO[motivoCodigo],
      cantidad: 1,
      precio_unitario: parte.importe,
      iva_tipo: parte.iva_tipo
    })),
    moneda
  );
  return {
    items: calculo.items.map((item) => ({ ...item, codigo: item.codigo ?? null, catalogo_item_id: null })),
    totals: calculo.totals
  };
}

export function esNotaPorMonto(nota: Pick<DocumentoResponse, "nce_modo">): boolean {
  return nota.nce_modo === "MONTO";
}
