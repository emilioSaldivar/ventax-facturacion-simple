import type { DocumentoRemision } from "./facturas.types";

/**
 * SPEC_DOCUMENTOS_ESCRITORIO_v0.1, fase B1 (RN-08). Descripciones del motivo de la nota de remision tal como las
 * publica FE en su catalogo `NRE_MOTIVO` (MT150 E501/E502, `segel-rc4.21`). Solo para mostrar: FS no valida motivos.
 */
const MOTIVOS: Record<number, string> = {
  1: "Traslado por ventas",
  2: "Traslado por consignación",
  3: "Exportación",
  4: "Traslado por compra",
  5: "Importación",
  6: "Traslado por devolución",
  7: "Traslado entre locales de la empresa",
  8: "Traslado de bienes por transformación",
  9: "Traslado de bienes por reparación",
  10: "Traslado por emisor móvil",
  11: "Exhibición o Demostración",
  12: "Participación en ferias",
  13: "Traslado de encomienda",
  14: "Decomiso",
  99: "Otro"
};

const texto = (valor: unknown): string | null => (typeof valor === "string" && valor.trim() ? valor.trim() : null);
const numero = (valor: unknown): number | null => (typeof valor === "number" && Number.isFinite(valor) ? valor : null);
const objeto = (valor: unknown): Record<string, unknown> | null =>
  valor && typeof valor === "object" && !Array.isArray(valor) ? (valor as Record<string, unknown>) : null;

/** Resume el `detalle` de FE guardado en `fiscal_request_snapshot`. Sin detalle, todo en null. */
export function resumenRemision(snapshot: unknown): DocumentoRemision {
  const detalle = objeto(snapshot);
  const remision = objeto(detalle?.remision);
  const transporte = objeto(detalle?.transporte);
  const vehiculo = Array.isArray(transporte?.vehiculos) ? objeto(transporte!.vehiculos[0]) : null;
  const motivo = numero(remision?.motivo);
  const descripcionPropia = texto(remision?.descripcion);
  return {
    motivo,
    motivo_descripcion: motivo === null ? null : motivo === 99 && descripcionPropia ? `Otro: ${descripcionPropia}` : MOTIVOS[motivo] ?? null,
    inicio_traslado: texto(transporte?.inicioTraslado),
    fin_traslado: texto(transporte?.finTraslado),
    kilometros: numero(remision?.kilometros),
    transportista: texto(objeto(transporte?.transportista)?.nombre),
    vehiculo: vehiculo ? [texto(vehiculo.tipo), texto(vehiculo.marca), texto(vehiculo.matricula) ?? texto(vehiculo.numeroIdentificacion)].filter(Boolean).join(" · ") || null : null
  };
}
