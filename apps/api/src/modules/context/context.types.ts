import type { PerfilDisponible, UserSummary } from "@facturacion-simple/shared";

export type { PerfilDisponible };

export interface TenantSummary {
  id: string;
  name: string;
  status: "ACTIVE" | "SUSPENDED" | "CANCELLED";
}

export interface FacturadorSummary {
  id: string;
  emisor_id: string;
  razon_social: string;
  ruc: string;
  nombre_fantasia?: string | null;
}

export interface FiscalContext {
  establecimiento: string;
  punto_expedicion: string;
  perfil_emision_codigo: string;
  perfil_emision_alias?: string | null;
  actividad_economica_codigo: string;
  actividad_economica_descripcion: string | null;
  actividad_economica_alias?: string | null;
  timbrado: string;
  timbrado_inicio: string;
  documento_nro: string;
  credito_plazo_dias: number;
  tipo_transaccion_default: 1 | 2 | 3;
  /**
   * Forma de numerar las facturas de este contexto (SPEC_CARGA_MASIVA_FACTURAS_v0.1 RN-21).
   * Ausente equivale a SERVICIO: la numera facturacion-electronica.
   */
  numeracion_facturas?: "SERVICIO" | "CLIENTE";
  fiscal_envio_modo?: "BATCH" | "SYNC" | "AUTO";
  batch_enabled?: boolean | null;
}

export interface OperationalDisplay {
  titulo_operativo: string;
}

export interface OperationalContextResponse {
  user: UserSummary;
  tenant: TenantSummary;
  facturador: FacturadorSummary;
  fiscal_context: FiscalContext;
  display?: OperationalDisplay;
  /** La instancia tiene la carga masiva encendida (CARGA_MASIVA_ENABLED). Solo en GET /me/context. */
  carga_masiva_habilitada?: boolean;
  /** FE admite la nota de credito en la moneda de la factura (FE_NC_MONEDA_EXTRANJERA, SPEC_MONEDA_EXTRANJERA_v0.1 D-1). Solo en GET /me/context. */
  nc_moneda_extranjera_habilitada?: boolean;
  /** Interno, no documentado en spec/openapi.yaml: usado solo por facturas.service.ts para persistir tipo_transaccion_default. */
  actividad_punto_perfil_id: string;
}

export interface ReadinessCheck {
  code: string;
  ok: boolean;
  message: string;
}

export interface ReadinessResponse {
  ready: boolean;
  checks: ReadinessCheck[];
}

export interface OperationalContextRepository {
  /** SPEC_MULTIPERFIL_USUARIO_v0.1: con `operacionConfigId`, solo esa configuracion. */
  getOperationalContext(userId: string, operacionConfigId?: string | null): Promise<OperationalContextResponse | null>;
  getReadinessChecks(userId: string, operacionConfigId?: string | null): Promise<ReadinessCheck[]>;
  listPerfilesDisponibles(userId: string): Promise<PerfilDisponible[]>;
  updateTipoTransaccionDefault(actividadPuntoPerfilId: string, valor: 1 | 2 | 3): Promise<void>;
}
