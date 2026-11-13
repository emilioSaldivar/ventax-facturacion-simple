import { decimalesDeMoneda, type TaxTotals } from "@facturacion-simple/shared";
import type { CondicionVenta, FacturaClienteInput, FacturaDocumentoTipo, FacturaItemPreview } from "./facturas.types";

/**
 * SPEC_NOTA_CREDITO_FACTURA_EXTERNA_v0.1 D-2, PLAN 3. Lee una factura del `xml_rde` que devuelve la consulta de FE a
 * SIFEN (guia §31): el DE tal cual lo firmo su emisor, sin prefijos de namespace. Se lee por bloque (`gDatRec`,
 * `gTotSub`, cada `gCamItem`, ...) y despues la hoja dentro del bloque: los nombres son unicos dentro de cada bloque.
 * Los importes salen del XML (los que SIFEN aprobo); solo se redondean a la unidad de la moneda.
 */

export type CodigoLecturaRde = "CAMPO_FALTANTE" | "IVA_PARCIAL_NO_SOPORTADO";

export class LecturaRdeError extends Error {
  constructor(
    public readonly codigo: CodigoLecturaRde,
    message: string
  ) {
    super(message);
    this.name = "LecturaRdeError";
  }
}

export interface FacturaLeidaDeRde {
  /** `iTiDE` (1 = factura electronica). */
  tipo_de: number;
  emisor: { ruc: string; dv: string };
  timbrado: string;
  numero_fiscal: string;
  /** `AAAA-MM-DD` de `dFeEmiDE`. */
  fecha_emision: string;
  condicion_venta: CondicionVenta;
  moneda: string;
  tipo_cambio: number | null;
  /** Receptor en el formato de FS; `exterior` = del exterior o B2F (D-8). */
  receptor: FacturaClienteInput & { exterior: boolean };
  items: FacturaItemPreview[];
  totals: TaxTotals;
}

function bloques(xml: string, tag: string): string[] {
  return [...xml.matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "g"))].map((m) => m[1]!);
}

function bloque(xml: string, tag: string): string | null {
  return bloques(xml, tag)[0] ?? null;
}

function hoja(xml: string | null, tag: string): string | null {
  if (!xml) return null;
  const m = new RegExp(`<${tag}>([^<]*)</${tag}>`).exec(xml);
  return m ? m[1]!.trim() : null;
}

function requerida(xml: string | null, tag: string): string {
  const valor = hoja(xml, tag);
  if (valor === null || valor === "") throw new LecturaRdeError("CAMPO_FALTANTE", `XML sin <${tag}>`);
  return valor;
}

const numero = (texto: string | null): number => (texto ? Number(texto) : 0);

const DOCUMENTO_NO_CONTRIBUYENTE: Record<string, FacturaDocumentoTipo> = {
  "1": "CI",
  "2": "PASAPORTE",
  "3": "CEDULA_EXTRANJERA",
  "5": "INNOMINADO"
};

export function leerFacturaDeRde(xmlRde: string): FacturaLeidaDeRde {
  const escala = 10 ** decimalesDeMoneda(hoja(xmlRde, "cMoneOpe") ?? "PYG");
  const redondear = (valor: number) => Math.round(valor * escala) / escala;

  const gTimb = bloque(xmlRde, "gTimb");
  const gEmis = bloque(xmlRde, "gEmis");
  const gOpeCom = bloque(xmlRde, "gOpeCom");
  const gDatRec = bloque(xmlRde, "gDatRec");
  const gTotSub = bloque(xmlRde, "gTotSub");
  if (!gTimb || !gEmis || !gDatRec || !gTotSub) {
    throw new LecturaRdeError("CAMPO_FALTANTE", "XML sin gTimb, gEmis, gDatRec o gTotSub");
  }
  const moneda = requerida(gOpeCom, "cMoneOpe");
  const tipoCambio = hoja(gOpeCom, "dTiCam");

  // Receptor (gDatRec, MT150 D2.2).
  const contribuyente = requerida(gDatRec, "iNatRec") === "1";
  const receptor: FacturaLeidaDeRde["receptor"] = contribuyente
    ? {
        documento_tipo: "RUC",
        documento: `${requerida(gDatRec, "dRucRec")}-${requerida(gDatRec, "dDVRec")}`,
        razon_social: requerida(gDatRec, "dNomRec"),
        naturaleza: hoja(gDatRec, "iTiContRec") === "1" ? "FISICA" : "JURIDICA",
        exterior: false
      }
    : {
        documento_tipo: DOCUMENTO_NO_CONTRIBUYENTE[hoja(gDatRec, "iTipIDRec") ?? ""] ?? "NO_ESPECIFICADO",
        documento: hoja(gDatRec, "dNumIDRec") ?? "0",
        razon_social: requerida(gDatRec, "dNomRec"),
        naturaleza: "FISICA",
        exterior: false
      };
  receptor.exterior = (hoja(gDatRec, "cPaisRec") ?? "PRY") !== "PRY" || hoja(gDatRec, "iTiOpe") === "4";
  const direccion = hoja(gDatRec, "dDirRec");
  const telefono = hoja(gDatRec, "dTelRec") ?? hoja(gDatRec, "dCelRec");
  const email = hoja(gDatRec, "dEmailRec");
  if (direccion) receptor.direccion = direccion;
  if (telefono) receptor.telefono = telefono;
  if (email) receptor.email = email;

  // Items (gCamItem). FS guarda el descuento por unidad y el prorrateo del global de la linea entera (tax.ts).
  const items: FacturaItemPreview[] = bloques(xmlRde, "gCamItem").map((item, indice) => {
    const gCamIVA = bloque(item, "gCamIVA");
    const afectacion = requerida(gCamIVA, "iAfecIVA");
    if (afectacion === "4") {
      throw new LecturaRdeError("IVA_PARCIAL_NO_SOPORTADO", `La linea ${indice + 1} tiene IVA gravado parcial`);
    }
    const tasa = hoja(gCamIVA, "dTasaIVA");
    const ivaTipo: FacturaItemPreview["iva_tipo"] = afectacion === "1" ? (tasa === "5" ? "IVA_5" : "IVA_10") : "EXENTA";
    const cantidad = Number(requerida(item, "dCantProSer"));
    const subtotal = redondear(numero(requerida(item, "dTotOpeItem")));
    const descuento = redondear(numero(hoja(item, "dDescItem")));
    const descuentoGlobal = redondear(numero(hoja(item, "dDescGloItem")) * cantidad);
    return {
      line_no: indice + 1,
      codigo: hoja(item, "dCodInt"),
      descripcion: requerida(item, "dDesProSer"),
      cantidad,
      precio_unitario: redondear(numero(requerida(item, "dPUniProSer"))),
      iva_tipo: ivaTipo,
      subtotal,
      base_imponible: ivaTipo === "EXENTA" ? subtotal : redondear(numero(hoja(gCamIVA, "dBasGravIVA"))),
      iva_monto: ivaTipo === "EXENTA" ? 0 : redondear(numero(hoja(gCamIVA, "dLiqIVAItem"))),
      ...(descuento > 0 ? { descuento } : {}),
      ...(descuentoGlobal > 0 ? { descuento_global: descuentoGlobal } : {}),
      catalogo_item_id: null
    };
  });
  if (items.length === 0) throw new LecturaRdeError("CAMPO_FALTANTE", "XML sin gCamItem");

  // Totales (gTotSub).
  const total = redondear(numero(requerida(gTotSub, "dTotGralOpe")));
  const totalIva = redondear(numero(hoja(gTotSub, "dTotIVA")));
  const descuentoTotal = redondear(numero(hoja(gTotSub, "dDescTotal")));
  const descuentoGlobalTotal = redondear(numero(hoja(gTotSub, "dTotDescGlotem")));
  const anticipo = redondear(numero(hoja(gTotSub, "dAnticipo")));
  const bruto = bloques(xmlRde, "gCamItem").reduce((suma, item) => suma + numero(hoja(item, "dTotBruOpeItem")), 0);
  const totals: TaxTotals = {
    subtotal: redondear(bruto),
    total_sin_iva: redondear(total - totalIva),
    iva_5: redondear(numero(hoja(gTotSub, "dIVA5"))),
    iva_10: redondear(numero(hoja(gTotSub, "dIVA10"))),
    total_iva: totalIva,
    total,
    ...(descuentoTotal > 0 ? { descuento: descuentoTotal } : {}),
    ...(descuentoGlobalTotal > 0 ? { descuento_global: descuentoGlobalTotal } : {}),
    ...(anticipo > 0 ? { anticipo } : {}),
    redondeo: redondear(numero(hoja(gTotSub, "dRedon"))),
    total_guaranies: moneda === "PYG" ? total : Math.round(numero(hoja(gTotSub, "dTotalGs"))),
    gravada_10: redondear(numero(hoja(gTotSub, "dBaseGrav10"))),
    gravada_5: redondear(numero(hoja(gTotSub, "dBaseGrav5"))),
    exenta: redondear(numero(hoja(gTotSub, "dSubExe"))),
    exonerada: redondear(numero(hoja(gTotSub, "dSubExo"))),
    fuente: "SIFEN"
  };

  return {
    tipo_de: Number(requerida(gTimb, "iTiDE")),
    emisor: { ruc: requerida(gEmis, "dRucEm"), dv: requerida(gEmis, "dDVEmi") },
    timbrado: requerida(gTimb, "dNumTim"),
    numero_fiscal: `${requerida(gTimb, "dEst")}-${requerida(gTimb, "dPunExp")}-${requerida(gTimb, "dNumDoc")}`,
    fecha_emision: requerida(xmlRde, "dFeEmiDE").slice(0, 10),
    condicion_venta: hoja(xmlRde, "iCondOpe") === "2" ? "CREDITO" : "CONTADO",
    moneda,
    tipo_cambio: tipoCambio ? Number(tipoCambio) : null,
    receptor,
    items,
    totals
  };
}
