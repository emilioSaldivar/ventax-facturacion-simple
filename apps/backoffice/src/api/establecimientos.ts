import { apiGet, apiPost, apiPatch } from "./client";

export interface Establecimiento {
  id: string;
  facturador_id: string;
  tenant_id: string;
  codigo: string;
  nombre: string | null;
  direccion: string | null;
  activo: boolean;
}

export interface EstablecimientoCreateInput {
  codigo: string;
  nombre: string;
  direccion?: string | null;
}

export interface EstablecimientoUpdateInput {
  nombre?: string;
  direccion?: string | null;
  activo?: boolean;
}

export function listEstablecimientos(facturadorId: string): Promise<Establecimiento[]> {
  return apiGet<Establecimiento[]>(`/backoffice/facturadores/${facturadorId}/establecimientos`);
}

export function getEstablecimiento(id: string): Promise<Establecimiento> {
  return apiGet<Establecimiento>(`/backoffice/establecimientos/${id}`);
}

export function createEstablecimiento(facturadorId: string, input: EstablecimientoCreateInput): Promise<Establecimiento> {
  return apiPost<Establecimiento>(`/backoffice/facturadores/${facturadorId}/establecimientos`, input);
}

export function updateEstablecimiento(id: string, input: EstablecimientoUpdateInput): Promise<Establecimiento> {
  return apiPatch<Establecimiento>(`/backoffice/establecimientos/${id}`, input);
}
