import { apiGet, apiPost, apiPatch } from "./client";

export interface Actividad {
  id: string;
  facturador_id: string;
  tenant_id: string;
  codigo: string;
  descripcion: string | null;
  alias_operativo: string | null;
  activo: boolean;
}

export interface ActividadCreateInput {
  codigo: string;
  descripcion?: string | null;
  alias_operativo?: string | null;
}

export interface ActividadUpdateInput {
  descripcion?: string | null;
  alias_operativo?: string | null;
  activo?: boolean;
}

export function listActividades(facturadorId: string): Promise<Actividad[]> {
  return apiGet<Actividad[]>(`/backoffice/facturadores/${facturadorId}/actividades`);
}

export function getActividad(id: string): Promise<Actividad> {
  return apiGet<Actividad>(`/backoffice/actividades/${id}`);
}

export function createActividad(facturadorId: string, input: ActividadCreateInput): Promise<Actividad> {
  return apiPost<Actividad>(`/backoffice/facturadores/${facturadorId}/actividades`, input);
}

export function updateActividad(id: string, input: ActividadUpdateInput): Promise<Actividad> {
  return apiPatch<Actividad>(`/backoffice/actividades/${id}`, input);
}
