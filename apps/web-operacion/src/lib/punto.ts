// Como se nombra un punto de expedicion en la interfaz (PAUTAS_FRONTEND_v0.1 P-P1, P-E3; SPEC_UX_RESTO_APP_v0.1 D-11).
// titulo_operativo y perfil_emision_alias traen la descripcion fiscal larga del perfil: no se usan como titulo.

export interface PuntoDeExpedicion {
  establecimiento: string;
  punto_expedicion: string;
}

/** "001-002" (sin cambios desde main.tsx). */
export function etiquetaPunto(perfil: PuntoDeExpedicion): string {
  return `${perfil.establecimiento}-${perfil.punto_expedicion}`;
}

/** "Punto 001-002". */
export function nombrePunto(perfil: PuntoDeExpedicion): string {
  return `Punto ${etiquetaPunto(perfil)}`;
}

/** Actividad economica del punto, como texto secundario. */
export function actividadPunto(perfil: { actividad_economica_alias?: string | null; actividad_economica_descripcion?: string | null }): string {
  return perfil.actividad_economica_alias?.trim() || perfil.actividad_economica_descripcion?.trim() || "";
}

/** Numero del documento con su punto cuando el usuario trabaja con mas de uno: "001-002-0008487". */
export function numeroConPunto(
  documento: { numero_fiscal: string | null; perfil_emision?: PuntoDeExpedicion | null },
  mostrarPunto: boolean
): string | null {
  if (!documento.numero_fiscal) return null;
  return mostrarPunto && documento.perfil_emision ? `${etiquetaPunto(documento.perfil_emision)}-${documento.numero_fiscal}` : documento.numero_fiscal;
}
