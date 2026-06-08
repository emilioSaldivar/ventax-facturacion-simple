import { apiGet, apiPost, apiPatch } from "./client";

export interface Perfil {
  id: string;
  facturador_id: string;
  tenant_id: string;
  codigo: string;
  descripcion: string | null;
  activo: boolean;
}

export interface PerfilCreateInput {
  codigo: string;
  descripcion?: string | null;
}

export interface PerfilUpdateInput {
  descripcion?: string | null;
  activo?: boolean;
}

export function listPerfiles(facturadorId: string): Promise<Perfil[]> {
  return apiGet<Perfil[]>(`/backoffice/facturadores/${facturadorId}/perfiles`);
}

export function getPerfil(id: string): Promise<Perfil> {
  return apiGet<Perfil>(`/backoffice/perfiles/${id}`);
}

export function createPerfil(facturadorId: string, input: PerfilCreateInput): Promise<Perfil> {
  return apiPost<Perfil>(`/backoffice/facturadores/${facturadorId}/perfiles`, input);
}

export function updatePerfil(id: string, input: PerfilUpdateInput): Promise<Perfil> {
  return apiPatch<Perfil>(`/backoffice/perfiles/${id}`, input);
}
