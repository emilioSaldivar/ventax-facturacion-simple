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

export type ViewState = "checking-session" | "login" | "loading-context" | "operacion" | "onboarding" | "select-perfil";

export type OperationView = "status" | "invoice" | "credit-note" | "remision" | "documents" | "catalog" | "clients" | "notas" | "recibos";

export type CondicionVenta = "CONTADO" | "CREDITO";

export type TipoTransaccionServicio = 1 | 2 | 3;

export type DocumentoIdentidadTipo = "RUC" | "CI" | "PASAPORTE" | "CEDULA_EXTRANJERA" | "NO_ESPECIFICADO";
/** SPEC_COMPRADOR_INNOMINADO_v0.1: la factura admite ademas el comprador sin nombre; la agenda no. */
export type FacturaDocumentoTipo = DocumentoIdentidadTipo | "INNOMINADO";

export type TipoIva = "IVA_10" | "IVA_5" | "EXENTA";

export type DocumentoEstado = "EMITIENDO" | "EMITIDA" | "PENDIENTE_SIFEN" | "RECHAZADA" | "ERROR_OPERATIVO" | "ERROR_TEMPORAL" | "ANULADA" | "CANCELADO_LOCAL";

export type BeforeInstallPromptChoice = { outcome: "accepted" | "dismissed"; platform?: string };

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<BeforeInstallPromptChoice>;
  prompt: () => Promise<void>;
}

export interface DocumentoPerfilEmision {
  establecimiento: string;
  punto_expedicion: string;
  perfil_emision_codigo: string;
  alias: string | null;
}

export interface OperationalContextResponse {
  user: UserSummary;
  tenant: {
    id: string;
    name: string;
    status: "ACTIVE" | "SUSPENDED" | "CANCELLED";
  };
  facturador: {
    id: string;
    emisor_id: string;
    razon_social: string;
    ruc: string;
    nombre_fantasia?: string | null;
  };
  fiscal_context: {
    establecimiento: string;
    punto_expedicion: string;
    perfil_emision_codigo: string;
    perfil_emision_alias?: string | null;
    actividad_economica_codigo: string;
    actividad_economica_descripcion: string | null;
    actividad_economica_alias?: string | null;
    timbrado: string;
    timbrado_inicio: string;
    documento_nro: string;
    credito_plazo_dias: number;
    tipo_transaccion_default?: TipoTransaccionServicio;
    numeracion_facturas?: "SERVICIO" | "CLIENTE";
    fiscal_envio_modo?: "BATCH" | "SYNC";
    batch_enabled?: boolean | null;
  };
  carga_masiva_habilitada?: boolean;
  nc_moneda_extranjera_habilitada?: boolean;
  display?: {
    titulo_operativo: string;
  };
}

export interface ReadinessResponse {
  ready: boolean;
  checks: Array<{
    code: string;
    ok: boolean;
    message: string;
  }>;
}

export type ClienteNaturaleza = "FISICA" | "JURIDICA";

export interface FacturaClienteInput {
  cliente_id?: string | null;
  documento_tipo: FacturaDocumentoTipo;
  documento: string;
  razon_social: string;
  direccion?: string | null;
  telefono?: string | null;
  email?: string | null;
  naturaleza?: ClienteNaturaleza | null;
}

export interface FacturaItemInput {
  catalogo_item_id?: string | null;
  codigo?: string | null;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  iva_tipo: TipoIva;
}

export interface FacturaPreviewRequest {
  condicion_venta: CondicionVenta;
  /** SPEC_MONEDA_EXTRANJERA_v0.1. Sin el campo, PYG. */
  moneda?: MonedaFactura;
  tipo_cambio?: number | null;
  tipo_transaccion: TipoTransaccionServicio;
  credito_plazo_dias?: number | null;
  cliente: FacturaClienteInput;
  items: FacturaItemInput[];
}

export interface FacturaPreviewResponse {
  items: Array<FacturaItemInput & {
    line_no: number;
    subtotal: number;
    base_imponible: number;
    iva_monto: number;
    catalogo_item_id: string | null;
  }>;
  totals: {
    subtotal: number;
    total_sin_iva: number;
    iva_5: number;
    iva_10: number;
    total_iva: number;
    total: number;
    /** SPEC_TOTALES_FE_EN_CARGA_v0.1: facturas de carga con descuentos, anticipos o IVA exonerado. */
    descuento?: number;
    anticipo?: number;
    nota_credito_por_referencia?: boolean;
    /** SPEC_MONEDA_EXTRANJERA_v0.1, A-2: "FE" con los totales oficiales del documento aprobado. */
    fuente?: "FS" | "FE";
    total_guaranies?: number;
    redondeo?: number;
  };
}

export type DocumentoAccion = "OK" | "EN_PROCESO" | "REQUIERE_ACCION" | "REQUIERE_SOPORTE";

export interface DocumentoAccionSoportePayload {
  documento_id: string;
  document_uuid: string | null;
  cdc: string | null;
  numero_fiscal: string | null;
  sifen_result_code: string | null;
  sifen_result_message: string | null;
  fiscal_status_raw: string | null;
  created_at: string | null;
}

export interface DocumentoAccionDetalle {
  titulo: string;
  descripcion: string;
  acciones_sugeridas: Array<
    | "REINTENTAR"
    | "CORREGIR_REEMITIR"
    | "CREAR_NCE"
    | "CONTACTAR_SOPORTE"
    | "REINTENTAR_NOTA_CREDITO"
    | "NUEVA_NOTA_CREDITO"
    | "INUTILIZAR_NUMERO"
  >;
  soporte_payload: DocumentoAccionSoportePayload | null;
}

/** SPEC_CORRECCION_INUTILIZACION_RECHAZADAS_v0.1, RN-A4: la otra punta de una correccion. */
export interface DocumentoVinculo {
  id: string;
  numero_fiscal: string | null;
  estado: DocumentoEstado;
}

/** RN-B4: ultimo intento de inutilizar el numero desde FS. */
export interface DocumentoInutilizacion {
  status: "ACCEPTED" | "REJECTED" | "FAILED";
  evento_id: string | null;
  motivo: string | null;
  rejection_code: string | null;
  rejection_message: string | null;
  intentos: number;
  last_at: string | null;
}

export interface DocumentoCancelacion {
  status: "PENDING" | "ACCEPTED" | "REJECTED" | "FAILED" | "UNKNOWN";
  rejection_code: string | null;
  rejection_message: string | null;
  retryable: boolean | null;
  intentos: number;
  last_at: string | null;
}

/** SPEC_NOTA_CREDITO_PARCIAL_v0.1: GET /facturas/:id/nota-credito/saldo. */
export interface NotaCreditoSaldoResponse {
  moneda: string;
  admite_total: boolean;
  admite_parcial: boolean;
  motivo_no_parcial: string | null;
  lineas: Array<{
    line_no: number;
    descripcion: string;
    codigo: string | null;
    precio_unitario: number;
    iva_tipo: string;
    cantidad_facturada: number;
    cantidad_acreditada: number;
    saldo: number;
  }>;
}

export interface DocumentoResponse {
  id: string;
  /** SPEC_MULTIPERFIL_USUARIO_v0.1 §E.7: punto por el que se emitio; null en historicos. */
  perfil_emision?: DocumentoPerfilEmision | null;
  /** La factura vino de una carga masiva. */
  carga?: { id: string; numero_archivo: string | null } | null;
  tipo: "FACTURA" | "NOTA_CREDITO" | "NOTA_REMISION";
  estado: DocumentoEstado;
  /** Resultado del ultimo intento de anulacion; null si nunca se intento. */
  cancelacion?: DocumentoCancelacion | null;
  /** Null en una nota de remision. */
  condicion_venta: CondicionVenta | null;
  /** SPEC_MONEDA_EXTRANJERA_v0.1: moneda de todos los montos del documento. */
  moneda?: string;
  tipo_cambio?: number | null;
  /** SPEC_DOCUMENTOS_ESCRITORIO_v0.1, fase B1: solo en una nota de remision. */
  remision?: {
    motivo: number | null;
    motivo_descripcion: string | null;
    inicio_traslado: string | null;
    fin_traslado: string | null;
    kilometros: number | null;
    transportista: string | null;
    vehiculo: string | null;
  } | null;
  numero_fiscal: string | null;
  cdc: string | null;
  /** Identidad estable del documento en FE; el CDC puede cambiar (AGENTS.md). */
  document_uuid?: string | null;
  fiscal_document_id: string | null;
  external_ref: string | null;
  fiscal_envio_modo?: "BATCH" | "SYNC";
  delivery_mode?: "SYNC" | "BATCH" | "AUTO_FALLBACK_BATCH" | "SYNC_FALLBACK_BATCH" | null;
  fiscal_idempotent?: boolean | null;
  batch?: Record<string, unknown> | null;
  cliente: FacturaClienteInput;
  items: FacturaPreviewResponse["items"];
  totals: FacturaPreviewResponse["totals"];
  fiscal_status: Record<string, unknown> | null;
  fiscal_status_raw?: string | null;
  sifen_result_code?: string | null;
  sifen_result_message?: string | null;
  sifen_last_checked_at?: string | null;
  accion?: DocumentoAccion;
  accion_detalle?: DocumentoAccionDetalle;
  /** SPEC_REINTENTO_EMISION_CONFIRMADO_v0.1 RN-01: lo decide el backend, no la UI. */
  puede_reintentar_emision?: boolean;
  /** SPEC_CORRECCION_INUTILIZACION_RECHAZADAS_v0.1. Opcionales: respuestas previas no los traen. */
  corrige_a?: DocumentoVinculo | null;
  corregida_por?: DocumentoVinculo | null;
  inutilizacion?: DocumentoInutilizacion | null;
  puede_inutilizar?: boolean;
  documento_relacionado_id: string | null;
  nce_motivo: string | null;
  /** Quien emitio el documento. Opcional: respuestas previas al cambio no lo traen. */
  emitido_por?: { id: string; username: string; display_name: string | null } | null;
  delivery: {
    public_url: string | null;
    whatsapp_url: string | null;
    email_status: string;
    artifacts: {
      kude_pdf: { available: boolean; url: string | null };
      xml: { available: boolean; url: string | null };
    };
  };
  created_at: string | null;
}

export interface DocumentoListResponse {
  items: DocumentoResponse[];
  total: number;
}

export interface NotaCreditoCandidate {
  documento: DocumentoResponse;
  elegible: boolean;
  motivo_no_elegible: string | null;
}

export interface NotaCreditoCandidateListResponse {
  items: NotaCreditoCandidate[];
  total: number;
}

export interface DeliveryLinkResponse {
  public_url: string;
  whatsapp_url: string;
  token_status: "ACTIVE" | "REVOKED";
}

export interface EmailStatusResponse {
  status: DocumentoResponse["delivery"]["email_status"];
  message: string | null;
}

export interface DocumentoEventoResponse {
  event_id: string | null;
  type: string | null;
  status: string | null;
  created_at: string | null;
}

export interface DocumentoEventosListResponse {
  documento_id: string;
  cdc: string;
  events: DocumentoEventoResponse[];
}

export interface DocumentoDecisionResponse {
  documento_id: string;
  emisor_id: string;
  env: "test" | "prod";
  cdc: string | null;
  nro_factura: string | null;
  status: string;
  transmission_evidence: "YES" | "NO" | "UNKNOWN";
  number_state: "CONSUMED" | "REUSABLE" | "REQUIRES_VOID" | "UNCERTAIN";
  decision_confidence: "HIGH" | "MEDIUM" | "LOW";
  reason_codes: string[];
  recommended_action: "RETRY" | "CANCEL_SEND" | "CANCEL_FISCAL" | "VOID_NUMBER" | "WAIT_SYNC" | "NO_ACTION";
  next_step_hint: string | null;
  escalation_required: boolean;
  allowed_actions: Record<string, boolean>;
}

export interface DocumentoValidateCdcImpactResponse {
  documento_id: string;
  current_cdc: string | null;
  candidate_cdc: string | null;
  cdc_impact: "CDC_NO_CHANGE" | "CDC_CHANGE";
  reason: string | null;
  allowed_actions: Record<string, boolean>;
}

export interface DocumentoGestionResendResponse {
  documento_id: string;
  status: string;
  revision_number: number;
  accepted_by_sifen: boolean;
  cdc: string | null;
  queued_for_batch: boolean | null;
}

export interface DocumentoGestionCreateDerivedResponse {
  source_document_id: string;
  derived_document_id: string;
  status: string;
  accepted_by_sifen: boolean;
  cdc: string | null;
  nro_factura: string | null;
}

export interface DocumentoGestionCancelSendResponse {
  documento_id: string;
  previous_status: string;
  status: string;
  action_result: string;
  reason_codes: string[];
  recommended_next_action: string;
}

export interface DocumentoGestionVoidResponse {
  documento_id: string;
  event_id: string | null;
  status: string;
}

export interface BatchPendientesGestionResponse {
  documents_pending: number;
  batches_pending: number;
  documents: Array<{
    document_id: string | null;
    cdc: string | null;
    nro_factura: string | null;
    status: string | null;
    fecha_emision: string | null;
    tipo_documento: string | null;
  }>;
  batches: Array<{
    batch_id: string | null;
    did: string | null;
    dProtConsLote: string | null;
    dCodRes: string | null;
    status: string | null;
    doc_count: number | null;
    result_code: string | null;
    result_message: string | null;
  }>;
}

export interface ReconciliacionFiscalResponse {
  items: Array<{
    document_id: string | null;
    cdc: string | null;
    nro_factura: string | null;
    status: string | null;
    fecha_emision: string | null;
    receptor_doc: string | null;
    receptor_nombre: string | null;
  }>;
  next: number | null;
}

export interface InvoiceLineDraft {
  id: string;
  catalogo_item_id: string | null;
  codigo: string;
  descripcion: string;
  cantidad: string;
  precio_unitario: string;
  iva_tipo: TipoIva;
  lockedFromCatalog: boolean;
}

export interface ClienteSearchResult {
  source: "AGENDA_FACTURADOR" | "IDENTIDAD_COMPARTIDA";
  cliente_id: string | null;
  documento_tipo: DocumentoIdentidadTipo;
  documento: string;
  razon_social: string;
  direccion: string | null;
  telefono: string | null;
  email: string | null;
  naturaleza: ClienteNaturaleza;
}

export interface ClienteResponse extends ClienteSearchResult {
  cliente_id: string;
  activo: boolean;
  /** SPEC_VALIDACIONES_RECEPTOR_v0.1 RV-11: motivos por los que el cliente tiene datos para corregir. */
  observaciones?: string[];
}

export interface ClienteListResponse {
  items: ClienteResponse[];
  total: number;
}

export interface DnitAutocompleteResponse {
  found: boolean;
  ambiguous: boolean;
  message?: string;
  cliente?: {
    documento_tipo: "RUC" | "CI";
    documento: string;
    razon_social: string;
    nombre: string | null;
    apellido: string | null;
    codigo_dnit: string | null;
    estado: string | null;
    naturaleza_sugerida: ClienteNaturaleza;
  };
}

export interface CatalogoItem {
  id: string;
  codigo: string;
  descripcion: string;
  /** Entero en PYG; hasta 2 decimales en otra moneda (SPEC_CATALOGO_MONEDA_v0.1 RN-03). */
  precio_unitario: number;
  moneda: string;
  iva_tipo: TipoIva;
  activo: boolean;
}

export interface CatalogoItemListResponse {
  items: CatalogoItem[];
  total: number;
}

export interface CatalogoDraft {
  codigo: string;
  descripcion: string;
  precio_unitario: string;
  moneda: "PYG" | "USD";
  iva_tipo: TipoIva;
  activo: boolean;
}

export interface InvoiceClientePrefillRequest {
  request_id: number;
  cliente: FacturaClienteInput;
}

// ─── Página pública de verificación de Notas ────────────────────────────────

export interface NotaPublicaPayload {
  valido: boolean;
  tipo?: "PRESUPUESTO" | "PEDIDO";
  numero?: number | null;
  fecha_emision?: string | null;
  valido_hasta?: string | null;
  cliente_nombre?: string;
  cliente_ruc?: string | null;
  observaciones?: string | null;
  estado_visual?: string;
  total?: number;
  items?: Array<{
    fila_tipo: string;
    descripcion: string;
    cantidad: number | null;
    precio_total: number | null;
  }>;
}

// ─── Página pública de verificación de Recibos ──────────────────────────────

export interface ReciboPublicaPayload {
  valido: boolean;
  numero?: number | null;
  fecha_cobro?: string;
  pagador_nombre?: string;
  concepto?: string;
  importe?: number;
  moneda?: string;
  forma_pago?: string;
  referencia_documento_numero_display?: string | null;
  estado?: "EMITIDO" | "ANULADO";
  emitido_at?: string | null;
}

export interface TycCurrentData {
  id: string;
  version: string;
  document_content: string;
  context: {
    tenant_nombre: string | null;
    facturador_ruc: string | null;
    facturador_razon_social: string | null;
    plan_nombre: string | null;
    username: string;
    email: string | null;
  };
}

/** SPEC_UX_NUEVA_FACTURA_v0.1, RN-06: pasos del estado fiscal segun el estado del documento. */
export type ClasePaso = "hecho" | "activo" | "error" | "pendiente";

/** SPEC_MONEDA_EXTRANJERA_v0.1: monedas del editor de factura (las del paquete compartido). */
export type MonedaFactura = "PYG" | "USD" | "EUR" | "BRL";

export interface SifenSummary {
  code: string | null;
  message: string | null;
  status: string | null;
  processedAt: string | null;
}

// ─── Tipos locales del módulo notas ───────────────────────────────────────────

export type NotaTipo = "PRESUPUESTO" | "PEDIDO";

export type NotaEstado = "BORRADOR" | "EMITIDO";

export type NotaEstadoComercial = "PENDIENTE_RESPUESTA" | "ACEPTADO" | "RECHAZADO";

export type NotaEstadoVisual = "BORRADOR" | "PENDIENTE" | "VENCIDO" | "ACEPTADO" | "RECHAZADO";

export type NotaFilaTipo = "CONTEXTO" | "ITEM" | "ITEM_SIN_PRECIO";

export interface NotaFilaDraft {
  _id: string;
  fila_tipo: NotaFilaTipo;
  descripcion: string;
  cantidad: string;
  precio_unitario: string;
  catalog_item_id: string | null;
  catalog_iva_tipo: string | null;
}

export interface NotaClienteDraft {
  documento_tipo: "RUC" | "CI";
  documento: string;
  nombre: string;
  cliente_id: string | null;
}

export interface NotaListItem {
  id: string;
  tipo: NotaTipo;
  numero: number | null;
  estado: NotaEstado;
  estado_comercial: NotaEstadoComercial | null;
  fecha_emision: string | null;
  valido_hasta: string | null;
  cliente_nombre: string;
  cliente_ruc: string | null;
  observaciones: string | null;
  created_at: string;
  total?: number;
  verification_token?: string;
}

export interface NotaConItems extends NotaListItem {
  items: Array<{
    id: string;
    orden: number;
    fila_tipo: NotaFilaTipo;
    descripcion: string;
    cantidad: number | null;
    precio_unitario: number | null;
    precio_total: number | null;
    catalog_item_id: string | null;
    catalog_iva_tipo: string | null;
  }>;
  total: number;
}

export interface InvoiceInitialDraft {
  cliente_nombre: string;
  cliente_ruc: string | null;
  /** FS-28: cliente completo de la factura que se corrige. Si viene, manda sobre nombre y RUC. */
  cliente?: FacturaClienteInput;
  /** FS-28: numero de la factura rechazada que se corrige. */
  corrige_numero?: string | null;
  /** SPEC_CORRECCION_INUTILIZACION_RECHAZADAS_v0.1, RN-A1: id de la factura que se corrige. */
  corrige_documento_id?: string;
  items: Array<{
    descripcion: string;
    cantidad: number;
    precio_unitario: number;
    iva_tipo: TipoIva;
    catalog_item_id: string | null;
  }>;
}

// ─── Tipos locales del módulo recibos ────────────────────────────────────────

export type ReciboFormaPago = "EFECTIVO" | "TRANSFERENCIA" | "CHEQUE" | "TARJETA_CREDITO" | "TARJETA_DEBITO" | "OTRO";

export interface ReciboRecord {
  id: string;
  numero: number | null;
  estado: "BORRADOR" | "EMITIDO" | "ANULADO";
  fecha_cobro: string;
  pagador_nombre: string;
  pagador_documento_tipo: string | null;
  pagador_documento: string | null;
  concepto: string;
  importe: number;
  moneda?: string;
  forma_pago: ReciboFormaPago;
  referencia_bancaria: string | null;
  referencia_documento_uuid: string | null;
  referencia_documento_numero_display: string | null;
  anulacion_motivo: string | null;
  verification_token: string | null;
  emitido_at: string | null;
  created_at: string;
}
