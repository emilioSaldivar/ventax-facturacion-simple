import type { UserSummary } from "@facturacion-simple/shared";

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
  getOperationalContext(userId: string): Promise<OperationalContextResponse | null>;
  getReadinessChecks(userId: string): Promise<ReadinessCheck[]>;
  updateTipoTransaccionDefault(actividadPuntoPerfilId: string, valor: 1 | 2 | 3): Promise<void>;
}
