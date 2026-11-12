import { decimalesDeMoneda, tieneDecimalesValidos } from "./moneda";

/**
 * SPEC_NOTA_CREDITO_POR_MONTO_v0.1 (guia de FE v0.52 §67). Reglas puras de la nota de credito por monto, compartidas
 * por la API (que emite) y la pantalla (que muestra el reparto antes de enviar).
 */

/** Totales netos de la factura segun `GET /v1/documentos/{uuid}/totales` de FE (solo los campos del reparto). */
export interface TotalesPorTasaFe {
  gravada_10: number;
  iva_10: number;
  gravada_5: number;
  iva_5: number;
  exenta: number;
  exonerada: number;
}

/** Monto de cada tasa con el IVA incluido (§67.2, paso 2). Lo exonerado va con lo exento. */
export interface MontosPorTasa {
  iva_10: number;
  iva_5: number;
  exenta: number;
}

export interface ParteMonto {
  iva_tipo: "IVA_10" | "IVA_5" | "EXENTA";
  importe: number;
}

/** En PYG el total de la nota se redondea hacia abajo a multiplos de 50 (§67.3). */
export const MULTIPLO_MONTO_PYG = 50;

export function montosPorTasa(totales: TotalesPorTasaFe, moneda: string = "PYG"): MontosPorTasa {
  const escala = 10 ** decimalesDeMoneda(moneda);
  const redondear = (valor: number) => Math.round(valor * escala) / escala;
  return {
    iva_10: redondear(totales.gravada_10 + totales.iva_10),
    iva_5: redondear(totales.gravada_5 + totales.iva_5),
    exenta: redondear(totales.exenta + totales.exonerada)
  };
}

/**
 * §67.2, pasos 3 y 4: parte de cada tasa = monto x tasa / suma, redondeada a la unidad de la moneda; la diferencia
 * del redondeo va a la ultima linea. Se omiten las partes en cero. Las cuentas se hacen en enteros (guaranies o
 * centavos) para no acumular error de coma flotante. Sin montos en ninguna tasa devuelve [].
 */
export function repartirMontoPorTasa(monto: number, tasas: MontosPorTasa, moneda: string = "PYG"): ParteMonto[] {
  const escala = 10 ** decimalesDeMoneda(moneda);
  const aEnteros = (valor: number) => Math.round(valor * escala);
  const montoEntero = aEnteros(monto);
  const pesos: Array<{ iva_tipo: ParteMonto["iva_tipo"]; peso: number }> = [
    { iva_tipo: "IVA_10", peso: aEnteros(tasas.iva_10) },
    { iva_tipo: "IVA_5", peso: aEnteros(tasas.iva_5) },
    { iva_tipo: "EXENTA", peso: aEnteros(tasas.exenta) }
  ];
  const suma = pesos.reduce((acumulado, tasa) => acumulado + Math.max(0, tasa.peso), 0);
  if (montoEntero <= 0 || suma <= 0) return [];
  const partes = pesos
    .filter((tasa) => tasa.peso > 0)
    .map((tasa) => ({ iva_tipo: tasa.iva_tipo, entero: Math.round((montoEntero * tasa.peso) / suma) }))
    .filter((parte) => parte.entero > 0);
  if (partes.length === 0) return [{ iva_tipo: pesos.find((tasa) => tasa.peso > 0)!.iva_tipo, importe: montoEntero / escala }];
  const diferencia = montoEntero - partes.reduce((acumulado, parte) => acumulado + parte.entero, 0);
  partes[partes.length - 1]!.entero += diferencia;
  return partes.filter((parte) => parte.entero > 0).map((parte) => ({ iva_tipo: parte.iva_tipo, importe: parte.entero / escala }));
}

/** SPEC RN-01: null si el monto vale; si no, el mensaje para el operador. */
export function validarMontoNotaCredito(monto: number, moneda: string = "PYG"): string | null {
  if (!Number.isFinite(monto) || monto <= 0) return "El monto tiene que ser mayor que cero.";
  if (decimalesDeMoneda(moneda) === 0) {
    if (!Number.isInteger(monto)) return "El monto en guaraníes no lleva decimales.";
    if (monto % MULTIPLO_MONTO_PYG !== 0) return `El monto tiene que ser múltiplo de ${MULTIPLO_MONTO_PYG} Gs.`;
    return null;
  }
  if (!tieneDecimalesValidos(monto, moneda)) return "El monto admite hasta 2 decimales.";
  return null;
}

/** SPEC D-4: un saldo menor que lo minimo emitible cuenta como cero. */
export function saldoEmitible(saldo: number, moneda: string = "PYG"): number {
  const minimo = decimalesDeMoneda(moneda) === 0 ? MULTIPLO_MONTO_PYG : 0.01;
  if (saldo < minimo - 1e-9) return 0;
  if (decimalesDeMoneda(moneda) === 0) return Math.floor(saldo / MULTIPLO_MONTO_PYG) * MULTIPLO_MONTO_PYG;
  return Math.floor(Math.round(saldo * 1000) / 10) / 100;
}
