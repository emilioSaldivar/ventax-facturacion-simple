import type { FacturadorParaPdf } from "../notas/notas.types.js";

export type ReciboEstado = 'BORRADOR' | 'EMITIDO';
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
  forma_pago: ReciboFormaPago;
  referencia_bancaria: string | null;
  factura_id: string | null;
  factura_numero_display: string | null;
  verification_token: string;
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
  forma_pago?: ReciboFormaPago;
  referencia_bancaria?: string | null;
  factura_id?: string | null;
  factura_numero_display?: string | null;
}

export interface ReciboUpdateInput {
  fecha_cobro?: string;
  pagador_nombre?: string;
  pagador_documento_tipo?: string | null;
  pagador_documento?: string | null;
  concepto?: string;
  importe?: number;
  forma_pago?: ReciboFormaPago;
  referencia_bancaria?: string | null;
}

export interface ReciboListFilters {
  limit: number;
  offset: number;
}

export interface ReciboListResponse {
  items: ReciboRecord[];
  total: number;
}

export interface RecibosRepository {
  create(facturadorId: string, input: ReciboCreateInput): Promise<ReciboRecord>;
  findById(id: string, facturadorId: string): Promise<ReciboRecord | null>;
  list(facturadorId: string, filters: ReciboListFilters): Promise<ReciboListResponse>;
  update(id: string, facturadorId: string, input: ReciboUpdateInput): Promise<ReciboRecord>;
  emitir(id: string, facturadorId: string): Promise<ReciboRecord>;
  softDelete(id: string, facturadorId: string): Promise<void>;
  findByVerificationToken(token: string): Promise<ReciboRecord | null>;
  listByFactura(facturaId: string, facturadorId: string): Promise<ReciboRecord[]>;
  getFacturadorParaPdf(facturadorId: string): Promise<FacturadorParaPdf | null>;
}
