import { apiGet, apiPost, apiPatch } from "./client";

export interface Punto {
  id: string;
  establecimiento_id: string;
  facturador_id: string;
  tenant_id: string;
  codigo: string;
  nombre: string | null;
  activo: boolean;
}

export interface PuntoCreateInput {
  codigo: string;
  nombre?: string | null;
}

export interface PuntoUpdateInput {
  nombre?: string | null;
  activo?: boolean;
}

export function listPuntos(establecimientoId: string): Promise<Punto[]> {
  return apiGet<Punto[]>(`/backoffice/establecimientos/${establecimientoId}/puntos`);
}

export function getPunto(id: string): Promise<Punto> {
  return apiGet<Punto>(`/backoffice/puntos/${id}`);
}

export function createPunto(establecimientoId: string, input: PuntoCreateInput): Promise<Punto> {
  return apiPost<Punto>(`/backoffice/establecimientos/${establecimientoId}/puntos`, input);
}

export function updatePunto(id: string, input: PuntoUpdateInput): Promise<Punto> {
  return apiPatch<Punto>(`/backoffice/puntos/${id}`, input);
}
