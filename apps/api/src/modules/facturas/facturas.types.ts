import type { AccionSugerida } from "./sifen-causa-catalogo";
import type { FiscalCancelStatus } from "../fiscal-gateway/fiscal-gateway.types";
import type { TaxCalculatedLine, TaxTotals, TipoIva } from "@facturacion-simple/shared";
import type { ClienteNaturaleza, DocumentoIdentidadTipo } from "../clientes/clientes.types";
import type {
  FiscalDeliveryMode,
  FiscalEmitFacturaRequest,
  FiscalEmitFacturaResponse,
  FiscalEmitNotaCreditoRequest,
  FiscalEmitNotaCreditoResponse,
  FiscalBatchTransmissionInfo,
  FiscalEnvioModo
} from "../fiscal-gateway/fiscal-gateway.types";

export const condicionesVenta = ["CONTADO", "CREDITO"] as const;
export type CondicionVenta = (typeof condicionesVenta)[number];

export interface FacturaClienteInput {
  cliente_id?: string | null;
  documento_tipo: DocumentoIdentidadTipo;
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
  iva_tipo?: TipoIva;
}

export interface FacturaPreviewInput {
  condicion_venta: CondicionVenta;
  /** SPEC_MONEDA_EXTRANJERA_v0.1: ISO 4217; sin el campo, PYG. */
  moneda?: string;
  /** Cotizacion a guaranies de toda la factura; obligatoria fuera de PYG. */
  tipo_cambio?: number | null;
  tipo_transaccion?: 1 | 2 | 3;
  credito_plazo_dias?: number | null;
  cliente: FacturaClienteInput;
  items: FacturaItemInput[];
}

export interface FacturaItemPreview extends TaxCalculatedLine {
  catalogo_item_id: string | null;
}

export interface FacturaPreviewResponse {
  items: FacturaItemPreview[];
  totals: TaxTotals;
}

export type DocumentoEstado =
  | "EMITIENDO"
  | "EMITIDA"
  | "PENDIENTE_SIFEN"
  | "RECHAZADA"
  | "ERROR_OPERATIVO"
  | "ERROR_TEMPORAL"
  | "ANULADA"
  | "CANCELADO_LOCAL";

/** SPEC_DOCUMENTOS_ESCRITORIO_v0.1, fase B1: la nota de remision llega por la carga masiva. */
export type DocumentoTipo = "FACTURA" | "NOTA_CREDITO" | "NOTA_REMISION";
export type DocumentoTipoOperativo = CondicionVenta | "NOTA_CREDITO";
export type EmailStatus = "NOT_APPLICABLE" | "DELEGATED" | "PENDING" | "SENT" | "FAILED" | "UNKNOWN";
export type { FiscalBatchTransmissionInfo, FiscalEnvioModo };

export interface DeliverySummary {
  public_url: string | null;
  whatsapp_url: string | null;
  email_status: EmailStatus;
  artifacts: {
    kude_pdf: {
      available: boolean;
      url: string | null;
    };
    xml: {
      available: boolean;
      url: string | null;
    };
  };
}

/**
 * Estado de accion derivado (SPEC_BACKOFFICE_ALINEACION_FE_v0.2, seccion 2.4): capa
 * "intuitiva" para que el operador sepa que hacer sin conocer los codigos SIFEN.
 * Exactamente 4 valores — nunca mas, nunca menos (RN-V4).
 */
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
  acciones_sugeridas: AccionSugerida[];
  soporte_payload: DocumentoAccionSoportePayload | null;
}

/** SPEC_CORRECCION_INUTILIZACION_RECHAZADAS_v0.1, fase A: la otra punta de una correccion. */
export interface DocumentoVinculo {
  id: string;
  numero_fiscal: string | null;
  estado: DocumentoEstado;
}

export type DocumentoInutilizacionStatus = "ACCEPTED" | "REJECTED" | "FAILED";

/** SPEC_CORRECCION_INUTILIZACION_RECHAZADAS_v0.1, RN-B4: ultimo intento de inutilizar el numero. */
export interface DocumentoInutilizacion {
  status: DocumentoInutilizacionStatus;
  evento_id: string | null;
  motivo: string | null;
  rejection_code: string | null;
  rejection_message: string | null;
  intentos: number;
  last_at: string | null;
}

export interface DocumentoCancelacion {
  status: FiscalCancelStatus;
  rejection_code: string | null;
  rejection_message: string | null;
  /** `null` cuando no hubo rechazo; FE solo lo informa con REJECTED. */
  retryable: boolean | null;
  intentos: number;
  last_at: string | null;
}

/**
 * Usuario que emitio el documento. `facturas_operativas.usuario_id` es `not null`, asi que
 * el historico completo tiene emisor; se modela nullable para que un usuario borrado
 * logicamente no rompa la lectura (SPEC_SEGMENTACION_PERFIL_EMISION RN-13).
 */
export interface DocumentoEmisor {
  id: string;
  username: string;
  display_name: string | null;
}

export interface DocumentoRemision {
  motivo: number | null;
  motivo_descripcion: string | null;
  inicio_traslado: string | null;
  fin_traslado: string | null;
  kilometros: number | null;
  transportista: string | null;
  vehiculo: string | null;
}

/** SPEC_MULTIPERFIL_USUARIO_v0.1 §E.7: punto por el que se emitio el documento. */
export interface DocumentoPerfilEmision {
  establecimiento: string;
  punto_expedicion: string;
  perfil_emision_codigo: string;
  alias: string | null;
}

export interface DocumentoResponse {
  id: string;
  document_uuid: string | null;
  /** null en documentos historicos sin perfil atribuido. */
  perfil_emision?: DocumentoPerfilEmision | null;
  tipo: DocumentoTipo;
  estado: DocumentoEstado;
  /** Null en una nota de remision. */
  condicion_venta: CondicionVenta | null;
  /** SPEC_MONEDA_EXTRANJERA_v0.1: moneda de todos los montos del documento. */
  moneda: string;
  tipo_cambio: number | null;
  /** Solo en una nota de remision: resumen del detalle que informo FE. */
  remision?: DocumentoRemision | null;
  numero_fiscal: string | null;
  cdc: string | null;
  fiscal_document_id: string | null;
  external_ref: string | null;
  fiscal_envio_modo: FiscalEnvioModo;
  delivery_mode?: FiscalDeliveryMode | null;
  fiscal_idempotent?: boolean | null;
  batch: FiscalBatchTransmissionInfo | null;
  cliente: FacturaClienteInput;
  items: FacturaItemPreview[];
  totals: TaxTotals;
  fiscal_status: Record<string, unknown> | null;
  /** Status crudo del backend fiscal en la ultima verificacion (APPROVED, QUEUED_BATCH, ...). */
  fiscal_status_raw: string | null;
  /** Codigo SIFEN estructurado de la ultima verificacion (dCodRes). */
  sifen_result_code: string | null;
  /** Mensaje SIFEN estructurado de la ultima verificacion (dMsgRes). */
  sifen_result_message: string | null;
  /** Ultima verificacion contra el backend fiscal (manual o automatica), ISO 8601. */
  sifen_last_checked_at: string | null;
  documento_relacionado_id: string | null;
  nce_motivo: string | null;
  /** Quien emitio el documento. Ver DocumentoEmisor. */
  emitido_por: DocumentoEmisor | null;
  /** Resultado del ultimo intento de anulacion. `null` si nunca se intento. */
  cancelacion: DocumentoCancelacion | null;
  delivery: DeliverySummary;
  created_at: string | null;
  /** La factura vino de una carga masiva (SPEC_CARGA_MASIVA_FACTURAS_v0.1). */
  carga?: { id: string; numero_archivo: string | null } | null;
  /** Derivado en el service (deriveAccion), no persistido — ver DocumentoAccion. */
  accion?: DocumentoAccion;
  accion_detalle?: DocumentoAccionDetalle;
  /** SPEC_REINTENTO_EMISION_CONFIRMADO_v0.1 RN-01: unica condicion de visibilidad de "Reintentar emision". */
  puede_reintentar_emision?: boolean;
  /** SPEC_CORRECCION_INUTILIZACION_RECHAZADAS_v0.1, RN-A4: factura que esta corrige. */
  corrige_a?: DocumentoVinculo | null;
  /** RN-A4: correccion de esta factura. */
  corregida_por?: DocumentoVinculo | null;
  /** RN-B4. */
  inutilizacion?: DocumentoInutilizacion | null;
  /** RN-B1, derivado en el service. */
  puede_inutilizar?: boolean;
}

export interface DocumentoListFilters {
  tipo?: DocumentoTipo;
  tipo_operativo?: DocumentoTipoOperativo;
  estado?: DocumentoEstado;
  desde?: string;
  hasta?: string;
  q?: string;
  carga_id?: string;
  limit: number;
  offset: number;
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

export interface DocumentoEventoResponse {
  event_id: string | null;
  type: string | null;
  status: string | null;
  created_at: string | null;
}

export interface DocumentoEventosListResponse {
  documento_id: string;
  cdc: string | null;
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

export interface FacturaPersistInput {
  tenantId: string;
  facturadorId: string;
  userId: string;
  /** SPEC_MULTIPERFIL_USUARIO_v0.1 RN-05: perfil del contexto del pedido (la NC, el activo: D-1). */
  actividadPuntoPerfilId?: string | null;
  externalRef: string;
  idempotencyKey?: string;
  input: FacturaPreviewInput;
  preview: FacturaPreviewResponse;
  fiscalRequest: Record<string, unknown>;
  fiscalResponse: FiscalEmitFacturaResponse | null;
  fiscalError: Record<string, unknown> | null;
  estado: DocumentoEstado;
}

export interface NotaCreditoReintentoInput {
  facturadorId: string;
  documentoId: string;
  estado: DocumentoEstado;
  fiscalResponse: FiscalEmitNotaCreditoResponse | null;
  fiscalError: Record<string, unknown> | null;
  trabada: boolean;
}

export interface FacturaQueuedPersistInput {
  tenantId: string;
  facturadorId: string;
  userId: string;
  /** SPEC_MULTIPERFIL_USUARIO_v0.1 RN-05: perfil del contexto del pedido (la NC, el activo: D-1). */
  actividadPuntoPerfilId?: string | null;
  externalRef: string;
  idempotencyKey?: string;
  input: FacturaPreviewInput;
  preview: FacturaPreviewResponse;
  fiscalRequest: FiscalEmitFacturaRequest;
  /** SPEC_CORRECCION_INUTILIZACION_RECHAZADAS_v0.1, RN-A1: factura rechazada que se corrige. */
  documentoRelacionadoId?: string | null;
}

export interface InutilizacionPersistInput {
  facturadorId: string;
  documentoId: string;
  usuarioId: string;
  status: DocumentoInutilizacionStatus;
  eventoId: string | null;
  motivo: string;
  numero: string;
  rejectionCode: string | null;
  rejectionMessage: string | null;
}

export interface NotaCreditoPersistInput {
  tenantId: string;
  facturadorId: string;
  userId: string;
  /** SPEC_MULTIPERFIL_USUARIO_v0.1 RN-05: perfil del contexto del pedido (la NC, el activo: D-1). */
  actividadPuntoPerfilId?: string | null;
  original: DocumentoResponse;
  motivo: string;
  externalRef: string;
  idempotencyKey?: string;
  /** SPEC_NOTA_CREDITO_PARCIAL_v0.1: lineas y totales propios de la nota. Sin ellos, los de la factura (nota total). */
  items?: FacturaItemPreview[];
  totals?: TaxTotals;
  fiscalRequest: FiscalEmitNotaCreditoRequest;
  fiscalResponse: FiscalEmitNotaCreditoResponse | null;
  fiscalError: Record<string, unknown> | null;
  estado: DocumentoEstado;
  /** SPEC_NOTA_CREDITO_TRABADA_v0.1, RN-08: una nota trabada no se agenda para verificacion. */
  trabada?: boolean;
}

export interface PendingFiscalEmission {
  outboxId: string;
  documentoId: string;
  facturadorId: string;
  facturadorApiKey: string | null;
  fiscalRequest: FiscalEmitFacturaRequest;
  attempts: number;
  documentoCreatedAt: string;
  accionNotificadaAt: string | null;
}

/**
 * Documento en transito reclamado por el worker de verificacion fiscal (F9).
 *
 * No lleva la clave de consumidor del facturador a proposito: las rutas de consulta de
 * estado del backend fiscal exigen la clave compartida
 * (SPEC_ALINEACION_CLAVE_VERIFICACION_FISCAL_v0.1).
 */
export interface PendingVerificacion {
  documentoId: string;
  facturadorId: string;
  documentUuid: string;
  estado: DocumentoEstado;
  attempts: number;
  accionNotificadaAt: string | null;
  createdAt: string;
}

export interface FacturaRepository {
  findByIdempotencyKey(input: { facturadorId: string; idempotencyKey: string }): Promise<DocumentoResponse | null>;
  findById(input: { facturadorId: string; documentoId: string }): Promise<DocumentoResponse | null>;
  findNotaCreditoByOriginal(input: { facturadorId: string; documentoId: string }): Promise<DocumentoResponse | null>;
  /** Todas las notas de la factura, incluidas las rechazadas, por fecha de creacion (SPEC_NOTA_CREDITO_TRABADA_v0.1, RN-02). */
  findNotasCreditoByOriginal(input: { facturadorId: string; documentoId: string }): Promise<DocumentoResponse[]>;
  updateNotaCreditoTrasReintento(input: NotaCreditoReintentoInput): Promise<DocumentoResponse | null>;
  list(input: { facturadorId: string; filters: DocumentoListFilters }): Promise<DocumentoListResponse>;
  updateFiscalStatus(input: {
    facturadorId: string;
    documentoId: string;
    estado: DocumentoEstado;
    fiscalStatus: Record<string, unknown>;
    cdc?: string | null;
    fiscalStatusRaw?: string | null;
    sifenResultCode?: string | null;
    sifenResultMessage?: string | null;
  }): Promise<DocumentoResponse | null>;
  /** SPEC_MONEDA_EXTRANJERA_v0.1, A-2: guarda los totales oficiales de FE; no toca estado ni agenda. */
  updateTotals(input: { facturadorId: string; documentoId: string; totals: TaxTotals }): Promise<DocumentoResponse | null>;
  claimNextVerificacion(batchSize: number): Promise<PendingVerificacion[]>;
  scheduleNextVerificacion(input: { documentoId: string; nextAt: Date | null; attempts: number }): Promise<void>;
  /** Solo cambia documentos en PENDING: un estado final no retrocede. */
  updateEmailEstadoPendiente(documentoId: string, facturadorId: string, emailEstado: "NOT_APPLICABLE" | "SENT" | "FAILED"): Promise<void>;
  markAccionNotificada(documentoId: string): Promise<void>;
  getNotificationRecipients(facturadorId: string): Promise<string[]>;
  bulkUpdateDocumentUuidByCdc(items: Array<{ cdc: string; documentUuid: string }>): Promise<void>;
  createFromEmission(input: FacturaPersistInput): Promise<DocumentoResponse>;
  createQueuedEmission(input: FacturaQueuedPersistInput): Promise<DocumentoResponse>;
  createNotaCreditoFromFactura(input: NotaCreditoPersistInput): Promise<DocumentoResponse>;
  claimNextPendingEmission(): Promise<PendingFiscalEmission | null>;
  completePendingEmission(input: {
    outboxId: string;
    documentoId: string;
    response: FiscalEmitFacturaResponse;
  }): Promise<DocumentoResponse | null>;
  failPendingEmission(input: {
    outboxId: string;
    documentoId: string;
    outboxEstado: "FAILED_TEMP" | "FAILED_PERM";
    estado: DocumentoEstado;
    error: Record<string, unknown>;
    retryAfterSeconds: number;
  }): Promise<DocumentoResponse | null>;
  retryPendingEmission(input: {
    facturadorId: string;
    documentoId: string;
    requestedBy: string;
  }): Promise<DocumentoResponse | null>;
  /** Clave de consumidor de FE del facturador (`facturadores.fe_consumer_api_key`), si tiene. */
  getFacturadorApiKey(facturadorId: string): Promise<string | null>;
  /** SPEC_CORRECCION_INUTILIZACION_RECHAZADAS_v0.1, RN-B4: guarda el intento y lo deja en auditoria. */
  registrarInutilizacion(input: InutilizacionPersistInput): Promise<DocumentoResponse | null>;
  /**
   * FE confirmo por idempotencia que el documento ya existe (SPEC_REINTENTO_EMISION_CONFIRMADO_v0.1
   * RN-03): se adopta su identidad en vez de reencolar. Devuelve null si el documento ya tenia
   * identidad o no existe (carrera con el worker).
   */
  adoptarDocumentoFiscalExistente(input: {
    facturadorId: string;
    documentoId: string;
    requestedBy: string;
    documentUuid: string;
    fiscalDocumentId: string | null;
    cdc: string | null;
    numeroFiscal: string | null;
    fiscalStatus: Record<string, unknown>;
  }): Promise<DocumentoResponse | null>;
  cancelDocumento(input: {
    facturadorId: string;
    documentoId: string;
    requestedBy: string;
    /** Solo ACCEPTED anula: cualquier otro resultado deja el estado comercial intacto (RN-04). */
    anula: boolean;
    cancelacion: {
      status: FiscalCancelStatus;
      rejectionCode: string | null;
      rejectionMessage: string | null;
      retryable: boolean | null;
    };
    fiscalStatus: Record<string, unknown>;
  }): Promise<DocumentoResponse | null>;
  appendAuditEvent(input: {
    facturadorId: string;
    documentoId: string;
    requestedBy: string;
    eventType: string;
    metadata: Record<string, unknown>;
  }): Promise<void>;
}
