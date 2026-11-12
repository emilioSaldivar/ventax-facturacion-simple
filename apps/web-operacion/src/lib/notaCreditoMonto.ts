import type { NotaCreditoSaldoResponse } from "../tipos";

// SPEC_NOTA_CREDITO_POR_MONTO_v0.1 (PLAN 7): el reparto por tasa y la validacion del monto son los mismos que usa la
// API para emitir; se importan de la fuente del paquete compartido para no tener dos implementaciones.
export {
  MULTIPLO_MONTO_PYG,
  repartirMontoPorTasa,
  validarMontoNotaCredito,
  type MontosPorTasa,
  type ParteMonto
} from "../../../../packages/shared/src/money/nota-credito-monto";

/** Motivos SIFEN (E401) que admite la nota por monto, con el texto que ve el operador. */
export const TIPOS_AJUSTE_MONTO = [
  { codigo: 3, etiqueta: "Descuento" },
  { codigo: 4, etiqueta: "Bonificación" },
  { codigo: 8, etiqueta: "Ajuste de precio" }
] as const;

export type MotivoCodigoMonto = (typeof TIPOS_AJUSTE_MONTO)[number]["codigo"];

export type ModoNotaCredito = "TOTAL" | "PARCIAL" | "MONTO";

/** Modo con el que abre la ventana de nota de credito: el primero que la factura admite. */
export function modoInicialNotaCredito(saldo: NotaCreditoSaldoResponse): ModoNotaCredito {
  if (saldo.admite_total) return "TOTAL";
  if (saldo.admite_parcial) return "PARCIAL";
  return saldo.monto?.admite ? "MONTO" : "PARCIAL";
}
