import { apiGet, apiPost, apiPatch } from "./client";

export interface TenantSuscripcion {
  id: string;
  plan_codigo: string;
  plan_nombre: string;
  estado: string;
  fecha_inicio: string;
  fecha_fin: string | null;
}

export interface Tenant {
  id: string;
  nombre: string;
  slug: string;
  estado: string;
  activo: boolean;
  suscripcion: TenantSuscripcion | null;
}

export interface TenantCreateInput {
  nombre: string;
  slug: string;
  plan_codigo: string;
}

export interface TenantUpdateInput {
  nombre?: string;
  estado?: "ACTIVO" | "SUSPENDIDO";
}

export function listTenants(q?: string): Promise<Tenant[]> {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  return apiGet<Tenant[]>(`/backoffice/tenants?${params.toString()}`);
}

export function getTenant(id: string): Promise<Tenant> {
  return apiGet<Tenant>(`/backoffice/tenants/${id}`);
}

export function createTenant(input: TenantCreateInput): Promise<Tenant> {
  return apiPost<Tenant>("/backoffice/tenants", input);
}

export function updateTenant(id: string, input: TenantUpdateInput): Promise<Tenant> {
  return apiPatch<Tenant>(`/backoffice/tenants/${id}`, input);
}
