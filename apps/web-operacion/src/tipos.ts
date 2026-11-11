// Tipos de datos de la API compartidos por la app del operador (PLAN_UX_RESTO_APP_v0.1 §10.9).

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
  /** SPEC_MULTIPERFIL_USUARIO_v0.1 §B.1: viene con pending_actions SELECT_PERFIL. */
  perfiles?: PerfilDisponible[];
}

/** SPEC_MULTIPERFIL_USUARIO_v0.1 §B.4 */
export interface PerfilDisponible {
  operacion_config_id: string;
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
  documento_nro: string | null;
  activo_en_sesion: boolean;
}

export interface ApiValidationDetails {
  formErrors?: string[];
  fieldErrors?: Record<string, string[]>;
}

export interface ApiErrorResponse {
  error?: {
    code?: string;
    message?: string;
    details?: ApiValidationDetails;
  };
  message?: string;
}
