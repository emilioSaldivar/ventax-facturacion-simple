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
}

export interface FiscalContext {
  establecimiento: string;
  punto_expedicion: string;
  perfil_emision_codigo: string;
  actividad_economica_codigo: string;
  actividad_economica_descripcion: string | null;
}

export interface OperationalContextResponse {
  user: UserSummary;
  tenant: TenantSummary;
  facturador: FacturadorSummary;
  fiscal_context: FiscalContext;
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
}

