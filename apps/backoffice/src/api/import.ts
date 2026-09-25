import { apiPost } from "./client";

// Tipos espejo del contrato: spec/openapi.yaml, schemas FacturadorImport*.

export type AccionDiff = "CREAR" | "ACTUALIZAR" | "SIN_CAMBIOS" | "USAR_EXISTENTE";
export type NivelHallazgo = "BLOQUEANTE" | "ADVERTENCIA" | "IGNORADO";

export interface Hallazgo {
  nivel: NivelHallazgo;
  codigo: string;
  mensaje: string;
  ruta?: string;
  valor?: unknown;
  sugerencia?: string;
}

export interface CampoDiff {
  campo: string;
  actual: unknown;
  nuevo: unknown;
}

export interface EntidadDiff {
  codigo: string;
  accion: AccionDiff;
  id: string | null;
  campos: CampoDiff[];
}

export interface PuntoDiff extends EntidadDiff {
  establecimiento_codigo: string;
}

export interface ActividadOpcion {
  codigo: string;
  descripcion: string | null;
}

export interface ContextoDiff {
  clave: { actividad: string; establecimiento: string; punto: string; perfil: string };
  /** Actividad efectiva del contexto: la del archivo, o la elegida si el perfil no la fija. */
  actividad_codigo: string;
  actividad_editable: boolean;
  actividad_opciones: ActividadOpcion[];
  accion: AccionDiff;
  id: string | null;
  campos: CampoDiff[];
  documento_nro_sugerido: string;
  documento_nro_editable: boolean;
  documento_nro_preservado: boolean;
  usuarios_asignados: number;
}

export interface TimbradoElegido {
  numero: string;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  motivo: string;
}

export type ImportTarget =
  | { mode: "EXISTENTE"; tenant_id: string }
  | { mode: "NUEVO"; nombre: string; slug: string; plan_codigo: string };

export interface ImportDiff {
  contrato: { version: string; generado_en: string | null; archivo: string; formato: string };
  preview_token: string;
  puede_aplicar: boolean;
  tenant: { accion: AccionDiff; id: string | null; nombre: string; slug: string; plan_codigo: string | null };
  facturador: { accion: AccionDiff; id: string | null; emisor_id: string; campos: CampoDiff[] };
  establecimientos: EntidadDiff[];
  puntos: PuntoDiff[];
  actividades: EntidadDiff[];
  perfiles: EntidadDiff[];
  contextos: ContextoDiff[];
  timbrado_elegido: TimbradoElegido | null;
  resumen: { crear: number; actualizar: number; sin_cambios: number; no_tocados: number };
  bloqueantes: Hallazgo[];
  advertencias: Hallazgo[];
  ignorados: Hallazgo[];
  referencias: Record<string, string>;
}

export interface ImportApplyResponse extends ImportDiff {
  aplicado: true;
  tenant_id: string;
  facturador_id: string;
  aplicado_en: string;
  proximos_pasos: string[];
}

export interface ImportArchivo {
  filename: string;
  format: "json" | "yaml" | "auto";
  content: string;
}

export function postImportPreview(input: ImportArchivo & { target: ImportTarget }): Promise<ImportDiff> {
  return apiPost<ImportDiff>("/backoffice/facturadores/import/preview", input);
}

export function postImportApply(
  input: ImportArchivo & {
    target: ImportTarget;
    preview_token: string;
    permitir_ambiente_distinto?: boolean;
    documento_nro_overrides?: Record<string, string>;
    actividad_overrides?: Record<string, string>;
  }
): Promise<ImportApplyResponse> {
  return apiPost<ImportApplyResponse>("/backoffice/facturadores/import/apply", input);
}
