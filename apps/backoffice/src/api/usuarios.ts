import { apiGet, apiPost, apiPatch, apiPut, apiDelete } from "./client";

export interface UserOperationConfig {
  user_id: string;
  tenant_id: string;
  facturador_id: string;
  emisor_id: string;
  establecimiento: string;
  punto_expedicion: string;
  perfil_emision_codigo: string;
  actividad_economica_codigo: string;
  active: boolean;
}

export interface BackofficeUser {
  id: string;
  username: string;
  display_name: string | null;
  role: "OPERADOR_FACTURACION" | "SOPORTE_INTERNO" | "ADMIN_INTERNO";
  active: boolean;
  temporary_password?: string;
  operation_config: UserOperationConfig | null;
}

export interface UserCreateInput {
  tenant_id: string;
  username: string;
  display_name?: string | null;
  role: BackofficeUser["role"];
  temporary_password?: string | null;
}

export interface UserUpdateInput {
  display_name?: string | null;
  role?: BackofficeUser["role"];
  activo?: boolean;
}

export interface UserPasswordResetInput {
  temporary_password?: string | null;
}

export interface OperationConfigInput {
  tenant_id: string;
  facturador_id: string;
  emisor_id: string;
  establecimiento: string;
  punto_expedicion: string;
  perfil_emision_codigo: string;
  actividad_economica_codigo: string;
}

export function listUsers(params?: { tenant_id?: string; facturador_id?: string; role?: string }): Promise<BackofficeUser[]> {
  const qs = new URLSearchParams();
  if (params?.tenant_id) qs.set("tenant_id", params.tenant_id);
  if (params?.facturador_id) qs.set("facturador_id", params.facturador_id);
  if (params?.role) qs.set("role", params.role);
  return apiGet<BackofficeUser[]>(`/backoffice/users?${qs.toString()}`);
}

export function getUser(id: string): Promise<BackofficeUser> {
  return apiGet<BackofficeUser>(`/backoffice/users/${id}`);
}

export function createUser(input: UserCreateInput): Promise<BackofficeUser> {
  return apiPost<BackofficeUser>("/backoffice/users", input);
}

export function updateUser(id: string, input: UserUpdateInput): Promise<BackofficeUser> {
  return apiPatch<BackofficeUser>(`/backoffice/users/${id}`, input);
}

export function resetPassword(id: string, input: UserPasswordResetInput): Promise<BackofficeUser> {
  return apiPost<BackofficeUser>(`/backoffice/users/${id}/reset-password`, input);
}

export function assignOperationConfig(id: string, input: OperationConfigInput): Promise<UserOperationConfig> {
  return apiPut<UserOperationConfig>(`/backoffice/users/${id}/operation-config`, input);
}

export function deleteUser(id: string): Promise<void> {
  return apiDelete(`/backoffice/users/${id}`);
}
