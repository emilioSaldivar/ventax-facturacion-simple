/** SPEC_COMPRADOR_INNOMINADO_v0.1: comprador sin nombre (MT150 D208 = 5), como lo documenta FE. */
import type { FacturaClienteInput } from "../tipos";

export const INNOMINADO_DOCUMENTO = "0";
export const INNOMINADO_NOMBRE = "Sin Nombre";
/** RN-04: NT024 / SIFEN 1321, sobre el total en guaranies. */
export const TOPE_INNOMINADO_GS = 7_000_000;

export const MENSAJE_TOPE_INNOMINADO =
  "Una factura sin nombre tiene que ser menor a Gs. 7.000.000. Identificá al comprador con su RUC o CI.";

/** RN-06. */
export const AVISO_NOTA_CREDITO_INNOMINADA =
  "SIFEN no admite nota de crédito de una factura sin nombre. Para anularla, usá Anular dentro de las 48 horas.";

export function esClienteInnominado(cliente: Pick<FacturaClienteInput, "documento_tipo"> | null | undefined): boolean {
  return cliente?.documento_tipo === "INNOMINADO";
}
