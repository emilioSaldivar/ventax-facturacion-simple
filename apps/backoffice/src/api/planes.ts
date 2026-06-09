import { apiGet } from "./client";

export interface Plan {
  id: string;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  max_usuarios: number;
  max_facturadores: number;
}

export function listPlanes(): Promise<Plan[]> {
  return apiGet<Plan[]>("/backoffice/planes");
}
