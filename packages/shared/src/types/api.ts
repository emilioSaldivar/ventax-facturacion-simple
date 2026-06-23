export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "AUTH_REQUIRED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INTERNAL_ERROR"
  | "ONBOARDING_REQUIRED";

export interface ApiErrorResponse {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: unknown;
    requestId?: string;
  };
}

export interface HealthResponse {
  status: "ok";
  service: "facturacion-simple-api";
  timestamp: string;
}

export interface UserSummary {
  id: string;
  username: string;
  display_name: string | null;
  role: "OPERADOR_FACTURACION" | "SOPORTE_INTERNO" | "ADMIN_INTERNO";
}

export interface AuthResponse {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  user: UserSummary;
  pending_actions?: string[];
}
