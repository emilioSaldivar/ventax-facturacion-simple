export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "AUTH_REQUIRED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INTERNAL_ERROR"
  | "ONBOARDING_REQUIRED"
  | "EMAIL_REQUIRED"
  | "PAYLOAD_TOO_LARGE";

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
  /** SPEC_MULTIPERFIL_USUARIO_v0.1 §B.1: viene con `pending_actions: ["SELECT_PERFIL"]`. */
  perfiles?: PerfilDisponible[];
}

/** SPEC_MULTIPERFIL_USUARIO_v0.1 §B.4: una configuracion operativa emitible del usuario. */
export interface PerfilDisponible {
  operacion_config_id: string;
  /** SPEC_MULTIPERFIL_USUARIO_v0.2 A.3: la API siempre lo manda. */
  facturador_id?: string;
  establecimiento: string;
  punto_expedicion: string;
  perfil_emision_codigo: string;
  perfil_emision_alias: string | null;
  actividad_economica_codigo: string;
  actividad_economica_descripcion: string | null;
  actividad_economica_alias: string | null;
  titulo_operativo: string;
  timbrado: string;
  numeracion_facturas: "SERVICIO" | "CLIENTE";
  /** Solo con numeracion del servicio. */
  documento_nro: string | null;
  activo_en_sesion: boolean;
}
