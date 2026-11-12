// Catalogo fijo de los documentos que se emiten (SPEC_UX_RESTO_APP_v0.1 A.2, RN-01; PLAN §2, URA-003).
// FS calcula el estado con su contexto; nunca consulta a FE para pintar el menu. Habilitar un tipo es cambiar su
// `estado` y darle una vista (FS-55 nota de debito, FS-56 nota de remision manual, FS-57 autofactura).
import type { NombreIcono } from "../components/Icono";
import type { OperationalContextResponse, OperationView } from "../tipos";

export type TipoEmision = "FACTURA" | "NOTA_CREDITO" | "NOTA_DEBITO" | "NOTA_REMISION" | "AUTOFACTURA";
// NO_HABILITADO (SPEC_NOTA_REMISION_v0.1 RN-02b, 2026-11-12): el tipo ya existe en FS pero este facturador no lo
// tiene configurado en FE (permiso o numerador); se ve en gris, sin entrada, distinto de "Proximamente" (no implementado).
export type EstadoTipoEmision = "DISPONIBLE" | "POR_PLANILLA" | "PROXIMAMENTE" | "NO_HABILITADO";

/** Estados sin entrada: el boton va deshabilitado y un clic no navega ni consulta la API (RN-02). */
export const sinEntrada = (estado: EstadoTipoEmision): boolean => estado === "PROXIMAMENTE" || estado === "NO_HABILITADO";

export interface DefinicionTipoEmision {
  tipo: TipoEmision;
  etiquetaMenu: string;
  etiquetaSingular: string;
  descripcion: string;
  icono: NombreIcono;
  /** Vista de la app que abre; null mientras el tipo no se emite en FS. */
  vista: OperationView | null;
  estado: (context: OperationalContextResponse | null) => EstadoTipoEmision;
}

export const ETIQUETA_ESTADO_TIPO: Record<Exclude<EstadoTipoEmision, "DISPONIBLE">, string> = {
  POR_PLANILLA: "Por planilla",
  PROXIMAMENTE: "Próximamente",
  NO_HABILITADO: "No habilitado"
};

export const TIPOS_EMISION: DefinicionTipoEmision[] = [
  {
    tipo: "FACTURA",
    etiquetaMenu: "Nueva factura",
    etiquetaSingular: "Factura",
    descripcion: "Crear factura electrónica",
    icono: "factura",
    vista: "invoice",
    estado: () => "DISPONIBLE"
  },
  {
    tipo: "NOTA_CREDITO",
    etiquetaMenu: "Notas de crédito",
    etiquetaSingular: "Nota de crédito",
    descripcion: "Devolución total o parcial de una factura aprobada",
    icono: "credito",
    vista: "credit-note",
    estado: () => "DISPONIBLE"
  },
  {
    tipo: "NOTA_DEBITO",
    etiquetaMenu: "Notas de débito",
    etiquetaSingular: "Nota de débito",
    descripcion: "Suma un importe a una factura",
    icono: "debito",
    vista: null,
    estado: () => "PROXIMAMENTE"
  },
  {
    tipo: "NOTA_REMISION",
    etiquetaMenu: "Notas de remisión",
    etiquetaSingular: "Nota de remisión",
    descripcion: "Traslado de mercadería",
    icono: "remision",
    // URA-006: espacio propio (Emitidas y Por planilla).
    vista: "remision",
    // SPEC_NOTA_REMISION_v0.1 RN-01, RN-02 y RN-02b: con NRE_EMIT y numerador se emite desde la app; si no, por
    // planilla; sin ninguna de las dos, "No habilitado" (ya implementado, falta configuracion en FE).
    estado: (context) =>
      context?.nota_remision_habilitada ? "DISPONIBLE" : context?.carga_masiva_habilitada ? "POR_PLANILLA" : "NO_HABILITADO"
  },
  {
    tipo: "AUTOFACTURA",
    etiquetaMenu: "Autofacturas",
    etiquetaSingular: "Autofactura",
    descripcion: "Compra a quien no emite factura",
    icono: "autofactura",
    vista: null,
    estado: () => "PROXIMAMENTE"
  }
];

/** Tipos que Documentos muestra como pestaña "Próximamente" (los que todavia no tienen ninguna forma de entrar). */
export const TIPOS_PROXIMAMENTE = TIPOS_EMISION.filter((t) => t.vista === null).map((t) => t.etiquetaMenu);
