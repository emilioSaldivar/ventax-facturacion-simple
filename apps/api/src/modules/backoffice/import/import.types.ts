// Tipos del import de configuracion fiscal.
//
// El `ImportPlan` se expresa SOLO en terminos de codigos, sin un solo UUID: el mapper no
// conoce la base. Los ids aparecen recien en el diff, que cruza el plan con el snapshot.

export type NivelHallazgo = "BLOQUEANTE" | "ADVERTENCIA" | "IGNORADO";

export interface Hallazgo {
  nivel: NivelHallazgo;
  /** Codigo estable del catalogo (SPEC seccion 9). Es lo que se testea y lo que se traduce. */
  codigo: string;
  /** Mensaje en espanol, orientado a la accion. */
  mensaje: string;
  /** Ruta JSON-path-ish dentro del archivo, cuando el hallazgo viene de un campo. */
  ruta?: string;
  valor?: unknown;
  sugerencia?: string;
}

export interface PlanEmisor {
  emisor_id: string;
  /** FE proyecta `emisor_id` desde `emisores.ruc_completo`: es el mismo dato. */
  ruc: string;
  razon_social: string;
  nombre_fantasia: string | null;
  ambiente: string | null;
}

export interface PlanEstablecimiento {
  codigo: string;
  nombre: string | null;
  direccion: string | null;
}

export interface PlanPunto {
  establecimiento_codigo: string;
  codigo: string;
  nombre: string | null;
}

export interface PlanActividad {
  codigo: string;
  descripcion: string | null;
  /** Solo se escribe al crear; al actualizar se preserva el alias que haya puesto el operador. */
  alias_operativo: string | null;
  /** No se persiste: sugiere la actividad de un perfil sin actividad fija (RN-23). */
  es_principal: boolean;
}

export interface PlanPerfil {
  codigo: string;
  descripcion: string | null;
}

export interface ActividadOpcion {
  codigo: string;
  descripcion: string | null;
}

export interface PlanContexto {
  /** Clave de identidad del contexto, en codigos. */
  actividad_codigo: string;
  establecimiento_codigo: string;
  punto_codigo: string;
  perfil_codigo: string;
  timbrado: string | null;
  timbrado_inicio: string | null;
  /** Sugerencia editable en la vista previa; solo se aplica al CREAR (RN-09). */
  documento_nro_sugerido: string;
  credito_plazo_dias: number;
  alias_operativo: string | null;
  /** true cuando el perfil no fija actividad y el operador puede elegirla (RN-22). */
  actividad_editable: boolean;
  /** Actividades del grupo que existen en el archivo. Vacio si el perfil fija actividad. */
  actividad_opciones: ActividadOpcion[];
}

export interface TimbradoElegido {
  numero: string;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  /** Por que se eligio este y no otro; se muestra en la vista previa. */
  motivo: string;
}

export interface PlanContrato {
  version: string;
  generado_en: string | null;
}

export interface ImportPlan {
  contrato: PlanContrato;
  emisor: PlanEmisor;
  establecimientos: PlanEstablecimiento[];
  puntos: PlanPunto[];
  actividades: PlanActividad[];
  perfiles: PlanPerfil[];
  contextos: PlanContexto[];
  timbradoElegido: TimbradoElegido | null;
  hallazgos: Hallazgo[];
}

/** Contexto del deployment que el mapper necesita para las validaciones de coherencia. */
export interface MapperContext {
  feApiEnv: "test" | "prod";
  feApiBaseUrl: string;
  sendProfileCode: boolean;
  /** ISO yyyy-mm-dd inyectado, para que los tests sean deterministas. */
  hoy: string;
}

export const DOCUMENTO_NRO_INICIAL = "0000001";
export const CREDITO_PLAZO_DIAS_DEFAULT = 30;

/** Permisos minimos esperados en la clave del consumidor (SPEC seccion 9.2). */
export const PERMISOS_MINIMOS = ["FACTURA_EMIT", "DOCUMENTO_READ", "SIFEN_STATUS_READ"] as const;

// ─── Snapshot del estado actual de la base ────────────────────────────────────

export interface SnapshotFacturador {
  id: string;
  tenant_id: string;
  emisor_id: string;
  ruc: string;
  razon_social: string;
  nombre_fantasia: string | null;
  activo: boolean;
  has_api_key: boolean;
}

export interface SnapshotEntidad {
  id: string;
  codigo: string;
  activo: boolean;
}

export interface SnapshotEstablecimiento extends SnapshotEntidad {
  nombre: string | null;
  direccion: string | null;
}

export interface SnapshotPunto extends SnapshotEntidad {
  establecimiento_codigo: string;
  nombre: string | null;
}

export interface SnapshotActividad extends SnapshotEntidad {
  descripcion: string | null;
  alias_operativo: string | null;
}

export interface SnapshotPerfil extends SnapshotEntidad {
  descripcion: string | null;
}

export interface SnapshotContexto {
  id: string;
  actividad_codigo: string;
  establecimiento_codigo: string;
  punto_codigo: string;
  perfil_codigo: string;
  timbrado: string | null;
  timbrado_inicio: string | null;
  documento_nro: string | null;
  credito_plazo_dias: number;
  alias_operativo: string | null;
  activo: boolean;
  /** Cuantos usuarios operativos tienen este contexto asignado: se resalta en la vista previa. */
  usuarios_asignados: number;
}

export interface ImportSnapshot {
  tenant: { id: string; nombre: string; slug: string } | null;
  facturador: SnapshotFacturador | null;
  establecimientos: SnapshotEstablecimiento[];
  puntos: SnapshotPunto[];
  actividades: SnapshotActividad[];
  perfiles: SnapshotPerfil[];
  contextos: SnapshotContexto[];
  /** El emisor ya existe en OTRO tenant: bloqueante RN-02. */
  emisorEnOtroTenant: { tenant_id: string; tenant_nombre: string } | null;
  /** Modo NUEVO con un slug ya usado. */
  slugOcupado: boolean;
}

// ─── Destino del import ───────────────────────────────────────────────────────

export type ImportTarget =
  | { mode: "EXISTENTE"; tenant_id: string }
  | { mode: "NUEVO"; nombre: string; slug: string; plan_codigo: string };

// ─── Diff ─────────────────────────────────────────────────────────────────────

export type AccionDiff = "CREAR" | "ACTUALIZAR" | "SIN_CAMBIOS" | "USAR_EXISTENTE";

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

export interface ContextoDiff {
  clave: {
    actividad: string;
    establecimiento: string;
    punto: string;
    perfil: string;
  };
  /** Actividad efectiva del contexto: la del archivo, o la elegida cuando el perfil no la fija. */
  actividad_codigo: string;
  actividad_editable: boolean;
  actividad_opciones: ActividadOpcion[];
  accion: AccionDiff;
  id: string | null;
  campos: CampoDiff[];
  documento_nro_sugerido: string;
  documento_nro_editable: boolean;
  /** true cuando el contexto ya existe y su numeracion NO se pisa (RN-09). */
  documento_nro_preservado: boolean;
  usuarios_asignados: number;
}

export interface TenantDiff {
  accion: AccionDiff;
  id: string | null;
  nombre: string;
  slug: string;
  plan_codigo: string | null;
}

export interface FacturadorDiff {
  accion: AccionDiff;
  id: string | null;
  emisor_id: string;
  campos: CampoDiff[];
}

export interface ResumenDiff {
  crear: number;
  actualizar: number;
  sin_cambios: number;
  no_tocados: number;
}

export interface ImportDiff {
  contrato: { version: string; generado_en: string | null; archivo: string; formato: string };
  preview_token: string;
  puede_aplicar: boolean;
  tenant: TenantDiff;
  facturador: FacturadorDiff;
  establecimientos: EntidadDiff[];
  puntos: PuntoDiff[];
  actividades: EntidadDiff[];
  perfiles: EntidadDiff[];
  contextos: ContextoDiff[];
  timbrado_elegido: TimbradoElegido | null;
  resumen: ResumenDiff;
  bloqueantes: Hallazgo[];
  advertencias: Hallazgo[];
  ignorados: Hallazgo[];
  referencias: Record<string, string>;
}
