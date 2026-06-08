import { apiGet, apiPost, apiPatch } from "./client";

export interface ContextoRef {
  id: string;
  codigo: string;
  descripcion?: string | null;
  alias_operativo?: string | null;
  nombre?: string | null;
}

export interface Contexto {
  id: string;
  facturador_id: string;
  actividad: ContextoRef & { alias_operativo: string | null };
  establecimiento: ContextoRef;
  punto_expedicion: ContextoRef;
  perfil_emision: ContextoRef;
  timbrado: string | null;
  timbrado_inicio: string | null;
  documento_nro: string | null;
  credito_plazo_dias: number;
  alias_operativo: string | null;
  activo: boolean;
}

export interface ContextoCreateInput {
  actividad_id: string;
  establecimiento_id: string;
  punto_expedicion_id: string;
  perfil_emision_id: string;
  timbrado?: string | null;
  timbrado_inicio?: string | null;
  documento_nro?: string | null;
  credito_plazo_dias?: number | null;
  alias_operativo?: string | null;
}

export interface ContextoUpdateInput {
  timbrado?: string | null;
  timbrado_inicio?: string | null;
  documento_nro?: string | null;
  credito_plazo_dias?: number | null;
  alias_operativo?: string | null;
  activo?: boolean;
}

export function listContextos(facturadorId: string): Promise<Contexto[]> {
  return apiGet<Contexto[]>(`/backoffice/facturadores/${facturadorId}/contextos`);
}

export function getContexto(id: string): Promise<Contexto> {
  return apiGet<Contexto>(`/backoffice/contextos/${id}`);
}

export function createContexto(facturadorId: string, input: ContextoCreateInput): Promise<Contexto> {
  return apiPost<Contexto>(`/backoffice/facturadores/${facturadorId}/contextos`, input);
}

export function updateContexto(id: string, input: ContextoUpdateInput): Promise<Contexto> {
  return apiPatch<Contexto>(`/backoffice/contextos/${id}`, input);
}
