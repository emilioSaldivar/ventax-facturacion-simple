import crypto from "node:crypto";
import { HttpError } from "../../shared/errors/http-error";
import { hashPassword } from "../auth/password.service";
import type {
  BackofficeOperationConfigInput,
  BackofficeOperationConfigResponse,
  BackofficeRepository,
  BackofficeUserCreateInput,
  BackofficeUserPasswordResetInput,
  BackofficeUserResponse
} from "./backoffice.types";

export async function createBackofficeUser(
  tenantId: string,
  input: BackofficeUserCreateInput,
  repository: BackofficeRepository
): Promise<BackofficeUserResponse> {
  const username = normalizeUsername(input.username);
  const displayName = normalizeOptional(input.display_name);
  const temporaryPassword = normalizePassword(input.temporary_password) ?? generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);

  const user = await repository.createUser({
    tenantId,
    username,
    displayName,
    passwordHash,
    role: input.role
  });

  return {
    ...user,
    temporary_password: temporaryPassword
  };
}

export async function resetBackofficeUserPassword(
  userId: string,
  input: BackofficeUserPasswordResetInput,
  repository: BackofficeRepository
): Promise<BackofficeUserResponse> {
  const temporaryPassword = normalizePassword(input.temporary_password) ?? generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);
  const user = await repository.resetPassword({
    userId,
    passwordHash
  });

  if (!user) {
    throw new HttpError(404, "NOT_FOUND", "Usuario no encontrado.");
  }

  return {
    ...user,
    temporary_password: temporaryPassword
  };
}

export async function assignBackofficeOperationConfig(
  userId: string,
  input: BackofficeOperationConfigInput,
  repository: BackofficeRepository
): Promise<BackofficeOperationConfigResponse> {
  const data = normalizeOperationConfig(input);
  const config = await repository.assignOperationConfig({
    userId,
    data
  });

  if (!config) {
    throw new HttpError(404, "NOT_FOUND", "Usuario o configuracion operativa no encontrada.");
  }

  return config;
}

function normalizeUsername(username: string): string {
  const normalized = username.trim().toLowerCase();

  if (!/^[a-z0-9._-]{3,120}$/.test(normalized)) {
    throw new HttpError(400, "VALIDATION_ERROR", "Username invalido.");
  }

  return normalized;
}

function normalizeOptional(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizePassword(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }

  if (normalized.length < 10 || normalized.length > 120) {
    throw new HttpError(400, "VALIDATION_ERROR", "Password temporal debe tener entre 10 y 120 caracteres.");
  }

  return normalized;
}

function generateTemporaryPassword(): string {
  return `Vtx-${crypto.randomBytes(9).toString("base64url")}`;
}

function normalizeOperationConfig(input: BackofficeOperationConfigInput): BackofficeOperationConfigInput {
  return {
    tenant_id: normalizeUuidish(input.tenant_id, "Tenant requerido."),
    facturador_id: normalizeUuidish(input.facturador_id, "Facturador requerido."),
    emisor_id: normalizeRequired(input.emisor_id, "Emisor requerido."),
    establecimiento: normalizeCode(input.establecimiento, "Establecimiento invalido."),
    punto_expedicion: normalizeCode(input.punto_expedicion, "Punto de expedicion invalido."),
    perfil_emision_codigo: normalizeRequired(input.perfil_emision_codigo, "Perfil de emision requerido."),
    actividad_economica_codigo: normalizeRequired(input.actividad_economica_codigo, "Actividad economica requerida.")
  };
}

function normalizeUuidish(value: string, message: string): string {
  const normalized = normalizeRequired(value, message);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
    throw new HttpError(400, "VALIDATION_ERROR", message);
  }
  return normalized;
}

function normalizeCode(value: string, message: string): string {
  const normalized = normalizeRequired(value, message);
  if (!/^[0-9]{3}$/.test(normalized)) {
    throw new HttpError(400, "VALIDATION_ERROR", message);
  }
  return normalized;
}

function normalizeRequired(value: string, message: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new HttpError(400, "VALIDATION_ERROR", message);
  }
  return normalized;
}
