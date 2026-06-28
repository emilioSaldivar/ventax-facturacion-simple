export type NotaTipo = 'PRESUPUESTO' | 'PEDIDO';
export type NotaEstado = 'BORRADOR' | 'EMITIDO';
export type NotaEstadoComercial = 'PENDIENTE_RESPUESTA' | 'ACEPTADO' | 'RECHAZADO';
export type NotaFilaTipo = 'CONTEXTO' | 'ITEM' | 'ITEM_SIN_PRECIO';
export type NotaEstadoVisual = 'BORRADOR' | 'PENDIENTE' | 'VENCIDO' | 'ACEPTADO' | 'RECHAZADO';

export interface NotaFilaRecord {
  id: string;
  nota_id: string;
  orden: number;
  fila_tipo: NotaFilaTipo;
  descripcion: string;
  cantidad: number | null;
  precio_unitario: number | null;
  precio_total: number | null;
  catalog_item_id: string | null;
  catalog_iva_tipo: string | null;
}

export interface NotaRecord {
  id: string;
  facturador_id: string;
  tipo: NotaTipo;
  numero: number | null;
  estado: NotaEstado;
  estado_comercial: NotaEstadoComercial | null;
  fecha_emision: string | null;
  valido_hasta: string | null;
  cliente_nombre: string;
  cliente_ruc: string | null;
  observaciones: string | null;
  verification_token: string;
  emitido_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface NotaConItems extends NotaRecord {
  items: NotaFilaRecord[];
  total: number;
}

export interface NotaFilaInput {
  orden: number;
  fila_tipo: NotaFilaTipo;
  descripcion: string;
  cantidad?: number | null;
  precio_unitario?: number | null;
  catalog_item_id?: string | null;
}

export interface NotaCreateInput {
  tipo: NotaTipo;
  cliente_nombre: string;
  cliente_ruc?: string | null;
  valido_hasta?: string | null;
  observaciones?: string | null;
  items: NotaFilaInput[];
}

export interface NotaUpdateInput {
  cliente_nombre?: string;
  cliente_ruc?: string | null;
  valido_hasta?: string | null;
  observaciones?: string | null;
  items?: NotaFilaInput[];
}

export interface NotaListFilters {
  tipo?: NotaTipo;
  limit: number;
  offset: number;
}

export interface NotaListResponse {
  items: NotaRecord[];
  total: number;
}

export interface FacturadorParaPdf {
  razon_social: string;
  ruc: string;
  rubro_descripcion: string | null;
  logo_url: string | null;
  telefono: string | null;
  direccion: string | null;
}

export interface NotasRepository {
  create(facturadorId: string, input: NotaCreateInput): Promise<NotaConItems>;
  findById(id: string, facturadorId: string): Promise<NotaConItems | null>;
  list(facturadorId: string, filters: NotaListFilters): Promise<NotaListResponse>;
  update(id: string, facturadorId: string, input: NotaUpdateInput): Promise<NotaConItems>;
  emitir(id: string, facturadorId: string): Promise<NotaConItems>;
  softDelete(id: string, facturadorId: string): Promise<void>;
  findByVerificationToken(token: string): Promise<NotaConItems | null>;
  actualizarEstadoComercial(id: string, facturadorId: string, estado: NotaEstadoComercial): Promise<NotaRecord>;
  duplicar(id: string, facturadorId: string): Promise<NotaRecord>;
  getFacturadorParaPdf(facturadorId: string): Promise<FacturadorParaPdf | null>;
}
