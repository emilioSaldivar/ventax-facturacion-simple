import { decimalesDeMoneda } from "./moneda";
import { repartirMontoPorTasa, type MontosPorTasa } from "./nota-credito-monto";

/**
 * SPEC_NOTA_CREDITO_UNIFICADA_v0.1 (PLAN 1). Arma la nota de credito combinada: devoluciones por cantidad,
 * acreditaciones por item (monto o %) y acreditacion sobre el total (monto o %), con los topes de D-4 y D-5.
 * La usan la pantalla (vista previa) y la API (emision): una sola implementacion. Las cuentas van en enteros de la
 * unidad minima de la moneda (guaranies o centavos) para no acumular error de coma flotante.
 */

export type TipoAcreditacion = "MONTO" | "PORCENTAJE";
export type OrigenLineaNc = "DEVOLUCION" | "ACREDITACION_LINEA" | "ACREDITACION_TOTAL";
type IvaNc = "IVA_10" | "IVA_5" | "EXENTA";

export interface AcreditacionPedida {
  tipo: TipoAcreditacion;
  valor: number;
}

export interface PedidoNotaCombinada {
  lineas?: Array<{ line_no: number; cantidad?: number | null; acreditacion?: AcreditacionPedida | null }>;
  acreditacion_total?: AcreditacionPedida | null;
}

/** Linea de la factura con lo que queda por acreditar (saldo por item, RN-08). */
export interface ItemFacturaNc {
  line_no: number;
  codigo: string | null;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  iva_tipo: IvaNc;
  /** Descuento por unidad de la factura. */
  descuento?: number;
  /** Prorrateo del descuento global de la linea entera. */
  descuento_global?: number;
  /** Importe neto de la linea en la factura. */
  subtotal: number;
  cantidad_disponible: number;
  importe_disponible: number;
}

export interface LineaNotaCombinada {
  origen: OrigenLineaNc;
  linea_factura: number | null;
  codigo: string;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  iva_tipo: IvaNc;
  /** Descuento por unidad copiado de la factura (solo devoluciones, con descuentos habilitados en la NC). */
  descuento?: number;
  /** Importe neto de la linea en la nota. */
  importe: number;
}

export interface ErrorNotaCombinada {
  line_no: number | null;
  campo: "cantidad" | "acreditacion" | "acreditacion_total" | "total";
  mensaje: string;
}

export interface NotaCombinadaArmada {
  lineas: LineaNotaCombinada[];
  devolucion: number;
  acreditacion_lineas: number;
  acreditacion_total: number;
  total: number;
  /** En PYG, el total bajado a multiplo de 50 como lo emite FE (D-3); en otra moneda, igual al total. */
  total_redondeado: number;
  redondeo: number;
  motivo_sugerido: 1 | 2 | 3;
  errores: ErrorNotaCombinada[];
}

export interface EntradaNotaCombinada {
  moneda: string;
  items: ItemFacturaNc[];
  /** Montos por tasa de la factura (§67); null si no se conocen (no se puede acreditar sobre el total). */
  tasas: MontosPorTasa | null;
  /** Saldo neto emitible de la factura (D-5). */
  saldo: number;
  pedido: PedidoNotaCombinada;
  /** `FE_NC_DESCUENTOS`: la NC puede llevar el descuento de la linea (D-6). */
  descuentosEnNc: boolean;
}

/** Importe para los mensajes al operador, como lo muestra la pantalla ("Gs. 150.000", "USD 18,08"). */
function importeLegible(valor: number, moneda: string): string {
  const decimales = decimalesDeMoneda(moneda);
  const numero = new Intl.NumberFormat("es-PY", { minimumFractionDigits: decimales, maximumFractionDigits: decimales }).format(valor);
  return `${moneda === "PYG" ? "Gs." : moneda} ${numero}`;
}

function cantidadLegible(valor: number): string {
  return new Intl.NumberFormat("es-PY", { maximumFractionDigits: 4 }).format(valor);
}

const CODIGO_TASA: Record<IvaNc, string> = { IVA_10: "AJ-IVA10", IVA_5: "AJ-IVA5", EXENTA: "AJ-EXE" };

export function porcentajeValido(valor: number): boolean {
  return Number.isFinite(valor) && valor > 0 && valor <= 100 && Math.abs(valor * 100 - Math.round(valor * 100)) < 1e-6;
}

export function armarNotaCombinada(entrada: EntradaNotaCombinada): NotaCombinadaArmada {
  const escala = 10 ** decimalesDeMoneda(entrada.moneda);
  const enteros = (valor: number) => Math.round(valor * escala);
  const unidades = (entero: number) => entero / escala;
  const errores: ErrorNotaCombinada[] = [];
  const lineas: LineaNotaCombinada[] = [];
  const porLinea = new Map(entrada.items.map((item) => [item.line_no, item]));
  const montoValido = (valor: number) => Number.isFinite(valor) && valor > 0 && Math.abs(valor * escala - Math.round(valor * escala)) < 1e-6;
  const mensajeDecimales = escala === 1 ? "En guaraníes el monto va sin decimales." : "El monto admite hasta 2 decimales.";
  let devolucion = 0;
  let acreditacionLineas = 0;
  const vistas = new Set<number>();

  for (const pedida of entrada.pedido.lineas ?? []) {
    const item = porLinea.get(pedida.line_no);
    if (!item) {
      errores.push({ line_no: pedida.line_no, campo: "cantidad", mensaje: "La línea no existe en la factura." });
      continue;
    }
    if (vistas.has(pedida.line_no)) {
      errores.push({ line_no: pedida.line_no, campo: "cantidad", mensaje: "La línea está repetida." });
      continue;
    }
    vistas.add(pedida.line_no);
    const cantidad = pedida.cantidad ?? 0;
    let importeLinea = 0;

    // Devolucion: cantidad al precio de la factura; con descuentos, al neto (D-6).
    if (cantidad > 0) {
      const cantidadEscalada = Math.round(cantidad * 10_000);
      const tieneDescuento = (item.descuento ?? 0) > 0 || (item.descuento_global ?? 0) > 0;
      if (Math.abs(cantidad * 10_000 - cantidadEscalada) > 1e-6) {
        errores.push({ line_no: item.line_no, campo: "cantidad", mensaje: "La cantidad admite hasta 4 decimales." });
      } else if (cantidadEscalada > Math.round(item.cantidad_disponible * 10_000)) {
        errores.push({ line_no: item.line_no, campo: "cantidad", mensaje: `Supera lo que queda por devolver (${cantidadLegible(item.cantidad_disponible)}).` });
      } else if (tieneDescuento && !entrada.descuentosEnNc) {
        errores.push({ line_no: item.line_no, campo: "cantidad", mensaje: "Esta línea tiene descuento: ajustala por monto." });
      } else {
        // Descuento por unidad de la NC = el de la factura + su parte del global, para que la linea quede al neto.
        const globalPorUnidad = item.cantidad > 0 ? enteros((item.descuento_global ?? 0) / item.cantidad) : 0;
        const descuentoUnidad = tieneDescuento ? enteros(item.descuento ?? 0) + globalPorUnidad : 0;
        const precio = enteros(item.precio_unitario);
        const importe = Math.round(((precio - descuentoUnidad) * cantidadEscalada) / 10_000);
        importeLinea += importe;
        lineas.push({
          origen: "DEVOLUCION",
          linea_factura: item.line_no,
          codigo: item.codigo ?? `L${String(item.line_no).padStart(3, "0")}`,
          descripcion: item.descripcion,
          cantidad,
          precio_unitario: unidades(precio),
          iva_tipo: item.iva_tipo,
          ...(descuentoUnidad > 0 ? { descuento: unidades(descuentoUnidad) } : {}),
          importe: unidades(importe)
        });
      }
    } else if (pedida.cantidad != null && pedida.cantidad < 0) {
      errores.push({ line_no: item.line_no, campo: "cantidad", mensaje: "La cantidad tiene que ser mayor que cero." });
    }

    // Acreditacion del item: monto o % sobre su importe neto (D-2).
    const acreditacion = pedida.acreditacion;
    if (acreditacion && acreditacion.valor > 0) {
      let monto = 0;
      if (acreditacion.tipo === "PORCENTAJE") {
        if (!porcentajeValido(acreditacion.valor)) {
          errores.push({ line_no: item.line_no, campo: "acreditacion", mensaje: "El porcentaje va de 0,01 a 100." });
        } else {
          monto = Math.round((enteros(item.subtotal) * acreditacion.valor) / 100);
        }
      } else if (!montoValido(acreditacion.valor)) {
        errores.push({ line_no: item.line_no, campo: "acreditacion", mensaje: mensajeDecimales });
      } else {
        monto = enteros(acreditacion.valor);
      }
      if (monto > 0) {
        importeLinea += monto;
        const etiqueta = acreditacion.tipo === "PORCENTAJE" ? `${String(acreditacion.valor).replace(".", ",")} %` : "";
        lineas.push({
          origen: "ACREDITACION_LINEA",
          linea_factura: item.line_no,
          codigo: `AJ-L${String(item.line_no).padStart(3, "0")}`,
          descripcion: `Ajuste${etiqueta ? ` ${etiqueta}` : ""} · ${item.descripcion}`.slice(0, 2000),
          cantidad: 1,
          precio_unitario: unidades(monto),
          iva_tipo: item.iva_tipo,
          importe: unidades(monto)
        });
      }
    }

    // D-4: el item no se acredita por encima de lo que valia (menos lo ya acreditado sobre el).
    if (importeLinea > enteros(item.importe_disponible)) {
      errores.push({
        line_no: item.line_no,
        campo: "acreditacion",
        mensaje: `Supera lo disponible en este ítem (${importeLegible(unidades(enteros(item.importe_disponible)), entrada.moneda)}).`
      });
    }
    const devuelto = lineas.filter((l) => l.linea_factura === item.line_no && l.origen === "DEVOLUCION").reduce((s, l) => s + enteros(l.importe), 0);
    devolucion += devuelto;
    acreditacionLineas += importeLinea - devuelto;
  }

  // Acreditacion sobre el total: % sobre el saldo, repartida por tasa (§67, D-5).
  let acreditacionTotal = 0;
  const pedidaTotal = entrada.pedido.acreditacion_total;
  if (pedidaTotal && pedidaTotal.valor > 0) {
    let monto = 0;
    if (pedidaTotal.tipo === "PORCENTAJE") {
      if (!porcentajeValido(pedidaTotal.valor)) {
        errores.push({ line_no: null, campo: "acreditacion_total", mensaje: "El porcentaje va de 0,01 a 100." });
      } else {
        monto = Math.round((enteros(entrada.saldo) * pedidaTotal.valor) / 100);
      }
    } else if (!montoValido(pedidaTotal.valor)) {
      errores.push({ line_no: null, campo: "acreditacion_total", mensaje: mensajeDecimales });
    } else {
      monto = enteros(pedidaTotal.valor);
    }
    if (monto > 0) {
      if (!entrada.tasas) {
        errores.push({ line_no: null, campo: "acreditacion_total", mensaje: "No se conocen los montos por tasa de la factura." });
      } else {
        const partes = repartirMontoPorTasa(unidades(monto), entrada.tasas, entrada.moneda);
        if (partes.length === 0) {
          errores.push({ line_no: null, campo: "acreditacion_total", mensaje: "La factura no tiene montos para ajustar." });
        }
        for (const parte of partes) {
          lineas.push({
            origen: "ACREDITACION_TOTAL",
            linea_factura: null,
            codigo: CODIGO_TASA[parte.iva_tipo],
            descripcion: "Ajuste sobre el total de la factura",
            cantidad: 1,
            precio_unitario: parte.importe,
            iva_tipo: parte.iva_tipo,
            importe: parte.importe
          });
          acreditacionTotal += enteros(parte.importe);
        }
      }
    }
  }

  const total = devolucion + acreditacionLineas + acreditacionTotal;
  const totalRedondeado = escala === 1 ? Math.floor(total / 50) * 50 : total;
  if (total <= 0 && errores.length === 0) {
    errores.push({ line_no: null, campo: "total", mensaje: "Indicá qué se devuelve o se ajusta." });
  }
  if (totalRedondeado > enteros(entrada.saldo)) {
    errores.push({ line_no: null, campo: "total", mensaje: `El total de la nota supera el saldo de la factura (${importeLegible(entrada.saldo, entrada.moneda)}).` });
  }
  if (total > 0 && escala === 1 && totalRedondeado === 0) {
    errores.push({ line_no: null, campo: "total", mensaje: "En guaraníes la nota tiene que ser de al menos 50." });
  }
  const hayDevolucion = devolucion > 0;
  const hayAcreditacion = acreditacionLineas + acreditacionTotal > 0;
  return {
    lineas,
    devolucion: unidades(devolucion),
    acreditacion_lineas: unidades(acreditacionLineas),
    acreditacion_total: unidades(acreditacionTotal),
    total: unidades(total),
    total_redondeado: unidades(totalRedondeado),
    redondeo: unidades(total - totalRedondeado),
    motivo_sugerido: hayDevolucion && hayAcreditacion ? 1 : hayDevolucion ? 2 : 3,
    errores
  };
}
