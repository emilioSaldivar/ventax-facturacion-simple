// SPEC_NOTA_CREDITO_UNIFICADA_v0.1 (PLAN 4): estado del editor de nota de credito y armado del pedido. La vista previa
// usa el mismo calculo que la API para emitir (packages/shared), importado por ruta relativa como notaCreditoMonto.ts.
import {
  armarNotaCombinada,
  type AcreditacionPedida,
  type ItemFacturaNc,
  type NotaCombinadaArmada,
  type PedidoNotaCombinada,
  type TipoAcreditacion
} from "../../../../packages/shared/src/money/nota-credito-combinada";
import type { NotaCreditoSaldoResponse } from "../tipos";

export type { NotaCombinadaArmada, TipoAcreditacion };

/** Motivos SIFEN (E401) que admite la nota, con el texto que ve el operador (RN-07). */
export const MOTIVOS_NOTA_CREDITO = [
  { codigo: 1, etiqueta: "Devolución y ajuste de precios" },
  { codigo: 2, etiqueta: "Devolución" },
  { codigo: 3, etiqueta: "Descuento" },
  { codigo: 4, etiqueta: "Bonificación" },
  { codigo: 8, etiqueta: "Ajuste de precio" }
] as const;

export type MotivoCodigoNc = (typeof MOTIVOS_NOTA_CREDITO)[number]["codigo"];

export interface FormularioNotaCredito {
  /** Cantidad a devolver por linea, como la escribe el operador (punto decimal). */
  devolver: Record<number, string>;
  /** Acreditacion por linea (monto o %, segun `modoAcreditar`). */
  acreditar: Record<number, string>;
  modoAcreditar: TipoAcreditacion;
  totalTexto: string;
  modoTotal: TipoAcreditacion;
}

export const FORMULARIO_VACIO: FormularioNotaCredito = { devolver: {}, acreditar: {}, modoAcreditar: "PORCENTAJE", totalTexto: "", modoTotal: "MONTO" };

export interface CuerpoNotaCredito {
  motivo: string;
  combinada?: true;
  motivo_codigo?: MotivoCodigoNc;
  lineas?: Array<{ line_no: number; cantidad?: number; acreditacion?: AcreditacionPedida }>;
  acreditacion_total?: AcreditacionPedida;
}

/** Lineas de la factura con lo que queda por acreditar, en la forma del calculo compartido. */
export function itemsDesdeSaldo(saldo: NotaCreditoSaldoResponse): ItemFacturaNc[] {
  return saldo.lineas.map((linea) => ({
    line_no: linea.line_no,
    codigo: linea.codigo,
    descripcion: linea.descripcion,
    cantidad: linea.cantidad_facturada,
    precio_unitario: linea.precio_unitario,
    iva_tipo: linea.iva_tipo as ItemFacturaNc["iva_tipo"],
    ...(linea.descuento ? { descuento: linea.descuento } : {}),
    ...(linea.descuento_global ? { descuento_global: linea.descuento_global } : {}),
    subtotal: linea.importe_neto,
    cantidad_disponible: linea.saldo,
    importe_disponible: linea.saldo_importe
  }));
}

function numero(texto: string | undefined): number | null {
  const limpio = (texto ?? "").trim();
  if (!limpio) return null;
  const valor = Number(limpio);
  return Number.isFinite(valor) ? valor : NaN;
}

/** Pedido a partir de lo cargado en la grilla; los campos vacios o en 0 no se mandan. */
export function pedidoDesdeFormulario(saldo: NotaCreditoSaldoResponse, form: FormularioNotaCredito): PedidoNotaCombinada {
  const lineas: NonNullable<PedidoNotaCombinada["lineas"]> = [];
  for (const linea of saldo.lineas) {
    const cantidad = numero(form.devolver[linea.line_no]);
    const valor = numero(form.acreditar[linea.line_no]);
    const conCantidad = cantidad !== null && cantidad !== 0;
    const conAcreditacion = valor !== null && valor !== 0;
    if (!conCantidad && !conAcreditacion) continue;
    lineas.push({
      line_no: linea.line_no,
      ...(conCantidad ? { cantidad } : {}),
      ...(conAcreditacion ? { acreditacion: { tipo: form.modoAcreditar, valor: valor! } } : {})
    });
  }
  const total = numero(form.totalTexto);
  return {
    lineas,
    ...(total !== null && total !== 0 ? { acreditacion_total: { tipo: form.modoTotal, valor: total } } : {})
  };
}

export function armarVistaPrevia(saldo: NotaCreditoSaldoResponse, form: FormularioNotaCredito): { pedido: PedidoNotaCombinada; armada: NotaCombinadaArmada } {
  const pedido = pedidoDesdeFormulario(saldo, form);
  const armada = armarNotaCombinada({
    moneda: saldo.moneda,
    items: itemsDesdeSaldo(saldo),
    tasas: saldo.monto.tasas,
    saldo: saldo.monto.saldo,
    descuentosEnNc: saldo.descuentos_en_nc ?? false,
    pedido
  });
  return { pedido, armada };
}

/** "Toda la factura": Devolver con el saldo de cada linea y sin acreditaciones (D-7). */
export function formularioTodaLaFactura(saldo: NotaCreditoSaldoResponse, actual: FormularioNotaCredito): FormularioNotaCredito {
  const devolver: Record<number, string> = {};
  for (const linea of saldo.lineas) {
    if (linea.saldo > 0) devolver[linea.line_no] = String(linea.saldo);
  }
  return { ...actual, devolver, acreditar: {}, totalTexto: "" };
}

/**
 * D-7: la factura entera, sin notas vivas y sin acreditaciones, sigue por la nota total de siempre (`{motivo}`: copia
 * o referencia a FE). Lo demas va como pedido combinado.
 */
export function esFacturaEntera(saldo: NotaCreditoSaldoResponse, pedido: PedidoNotaCombinada): boolean {
  if (!saldo.admite_total || pedido.acreditacion_total) return false;
  const lineas = pedido.lineas ?? [];
  if (lineas.some((linea) => linea.acreditacion)) return false;
  return saldo.lineas.every((linea) => {
    const pedida = lineas.find((l) => l.line_no === linea.line_no);
    return Math.abs((pedida?.cantidad ?? 0) - linea.cantidad_facturada) < 1e-9;
  });
}

export function cuerpoNotaCredito(
  saldo: NotaCreditoSaldoResponse,
  pedido: PedidoNotaCombinada,
  motivo: string,
  motivoCodigo: MotivoCodigoNc
): CuerpoNotaCredito {
  if (esFacturaEntera(saldo, pedido)) return { motivo };
  const lineas = (pedido.lineas ?? []).map((linea) => ({
    line_no: linea.line_no,
    ...(linea.cantidad ? { cantidad: linea.cantidad } : {}),
    ...(linea.acreditacion ? { acreditacion: linea.acreditacion } : {})
  }));
  return {
    motivo,
    combinada: true,
    motivo_codigo: motivoCodigo,
    // FS-143: con solo "Ajuste sobre el total" no hay lineas; un arreglo vacio lo rechazaba la API desplegada.
    ...(lineas.length > 0 ? { lineas } : {}),
    ...(pedido.acreditacion_total ? { acreditacion_total: pedido.acreditacion_total } : {})
  };
}

/** Importe por tasa de las lineas de la nota, para el desglose del Resumen. */
export function desglosePorTasa(armada: NotaCombinadaArmada): Array<{ iva_tipo: "IVA_10" | "IVA_5" | "EXENTA"; importe: number }> {
  const orden = ["IVA_10", "IVA_5", "EXENTA"] as const;
  return orden
    .map((iva_tipo) => ({ iva_tipo, importe: armada.lineas.filter((l) => l.iva_tipo === iva_tipo).reduce((s, l) => s + l.importe, 0) }))
    .filter((parte) => parte.importe > 0);
}
