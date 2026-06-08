import { apiGet, apiPost, apiPatch } from "./client";

export interface Facturador {
  id: string;
  tenant_id: string;
  emisor_id: string;
  ruc: string;
  razon_social: string;
  nombre_fantasia: string | null;
  activo: boolean;
}

export interface FacturadorCreateInput {
  emisor_id: string;
  ruc: string;
  razon_social: string;
  nombre_fantasia?: string | null;
}

export interface FacturadorUpdateInput {
  razon_social?: string;
  ruc?: string;
  nombre_fantasia?: string | null;
  activo?: boolean;
}

export interface ReadinessChecks {
  tenant_activo: boolean;
  suscripcion_activa: boolean;
  facturador_activo: boolean;
  contextos_activos: number;
  usuarios_operativos: number;
  fiscal_backend_available: boolean;
}

export interface FacturadorReadiness {
  facturador_id: string;
  checks: ReadinessChecks;
  ready: boolean;
}

export function listFacturadores(tenantId: string): Promise<Facturador[]> {
  return apiGet<Facturador[]>(`/backoffice/tenants/${tenantId}/facturadores`);
}

export function getFacturador(id: string): Promise<Facturador> {
  return apiGet<Facturador>(`/backoffice/facturadores/${id}`);
}

export function createFacturador(tenantId: string, input: FacturadorCreateInput): Promise<Facturador> {
  return apiPost<Facturador>(`/backoffice/tenants/${tenantId}/facturadores`, input);
}

export function updateFacturador(id: string, input: FacturadorUpdateInput): Promise<Facturador> {
  return apiPatch<Facturador>(`/backoffice/facturadores/${id}`, input);
}

export function getFacturadorReadiness(id: string): Promise<FacturadorReadiness> {
  return apiGet<FacturadorReadiness>(`/backoffice/facturadores/${id}/readiness`);
}
