import type { FiscalReciboResult } from "../fiscal-gateway/fiscal-gateway.types.js";

export type ReciboEstado = 'BORRADOR' | 'EMITIDO' | 'ANULADO';
export type ReciboFormaPago =
  | 'EFECTIVO'
  | 'TRANSFERENCIA'
  | 'CHEQUE'
  | 'TARJETA_CREDITO'
  | 'TARJETA_DEBITO'
  | 'OTRO';

export const FORMAS_PAGO: ReciboFormaPago[] = [
  'EFECTIVO', 'TRANSFERENCIA', 'CHEQUE',
  'TARJETA_CREDITO', 'TARJETA_DEBITO', 'OTRO',
];

/**
 * Cache local del recibo. La fuente de verdad legal es facturacion-electronica
 * (Recibos de Dinero Firmados Digitalmente, Ley N.º 6822/2021) — ver
 * SPEC_RECIBO_DINERO_v0.5.md seccion 3.1. Esta tabla refleja la ultima
 * respuesta conocida del backend fiscal para cada operacion de escritura.
 */
export interface ReciboRecord {
  id: string;
  facturador_id: string;
  numero: number | null;
  estado: ReciboEstado;
  fecha_cobro: string;
  pagador_nombre: string;
  pagador_documento_tipo: string | null;
  pagador_documento: string | null;
  concepto: string;
  importe: number;
  moneda: string;
  forma_pago: ReciboFormaPago;
  referencia_bancaria: string | null;
  referencia_documento_uuid: string | null;
  referencia_documento_numero_display: string | null;
  external_ref: string | null;
  idempotency_key: string | null;
  xml_hash: string | null;
  pdf_hash: string | null;
  anulacion_motivo: string | null;
  verification_token: string | null;
  emitido_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReciboCreateInput {
  fecha_cobro: string;
  pagador_nombre: string;
  pagador_documento_tipo?: string | null;
  pagador_documento?: string | null;
  concepto: string;
  importe: number;
  moneda?: string;
  forma_pago?: ReciboFormaPago;
  referencia_bancaria?: string | null;
  referencia_documento_uuid?: string | null;
  referencia_documento_numero_display?: string | null;
}

export interface ReciboUpdateInput {
  fecha_cobro?: string;
  pagador_nombre?: string;
  pagador_documento_tipo?: string | null;
  pagador_documento?: string | null;
  concepto?: string;
  importe?: number;
  moneda?: string;
  forma_pago?: ReciboFormaPago;
  referencia_bancaria?: string | null;
}

export interface ReciboAnularInput {
  motivo: string;
}

export interface ReciboListFilters {
  limit: number;
  offset: number;
}

export interface ReciboListResponse {
  items: ReciboRecord[];
  total: number;
}

export interface UpsertReciboFromFiscalInput {
  facturadorId: string;
  fiscal: FiscalReciboResult;
  /** No viene en la respuesta fiscal (solo el _display); se preserva del request original. */
  referenciaDocumentoUuid?: string | null;
  externalRef?: string | null;
  idempotencyKey?: string | null;
  fiscalRequestSnapshot?: unknown;
}

export interface RecibosRepository {
  upsertFromFiscal(input: UpsertReciboFromFiscalInput): Promise<ReciboRecord>;
  markDeleted(id: string, facturadorId: string): Promise<void>;
  findById(id: string, facturadorId: string): Promise<ReciboRecord | null>;
  list(facturadorId: string, filters: ReciboListFilters): Promise<ReciboListResponse>;
  findByIdempotencyKey(facturadorId: string, idempotencyKey: string): Promise<ReciboRecord | null>;
  findByVerificationToken(token: string): Promise<ReciboRecord | null>;
  listByReferenciaDocumento(documentoUuid: string, facturadorId: string): Promise<ReciboRecord[]>;
}
