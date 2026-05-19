import type { UserSummary } from "@facturacion-simple/shared";

export interface BackofficeUserCreateInput {
  username: string;
  display_name?: string | null;
  role: UserSummary["role"];
  temporary_password?: string | null;
}

export interface BackofficeUserPasswordResetInput {
  temporary_password?: string | null;
}

export interface BackofficeOperationConfigInput {
  tenant_id: string;
  facturador_id: string;
  emisor_id: string;
  establecimiento: string;
  punto_expedicion: string;
  perfil_emision_codigo: string;
  actividad_economica_codigo: string;
}

export interface BackofficeOperationConfigResponse extends BackofficeOperationConfigInput {
  user_id: string;
  active: boolean;
}

export interface BackofficeUserResponse {
  id: string;
  username: string;
  display_name: string | null;
  role: UserSummary["role"];
  active: boolean;
  temporary_password?: string;
}

export interface BackofficeRepository {
  createUser(input: {
    tenantId: string;
    username: string;
    displayName: string | null;
    passwordHash: string;
    role: UserSummary["role"];
  }): Promise<Omit<BackofficeUserResponse, "temporary_password">>;
  resetPassword(input: {
    userId: string;
    passwordHash: string;
  }): Promise<Omit<BackofficeUserResponse, "temporary_password"> | null>;
  assignOperationConfig(input: {
    userId: string;
    data: BackofficeOperationConfigInput;
  }): Promise<BackofficeOperationConfigResponse | null>;
}
