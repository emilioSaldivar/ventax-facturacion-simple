export type NotaTipo = 'PRESUPUESTO' | 'PEDIDO';
export type NotaEstado = 'BORRADOR' | 'EMITIDO';
export type NotaFilaTipo = 'CONTEXTO' | 'ITEM' | 'ITEM_SIN_PRECIO';

export interface NotaFilaRecord {
  id: string;
  nota_id: string;
  orden: number;
  fila_tipo: NotaFilaTipo;
  descripcion: string;
  cantidad: number | null;
  precio_unitario: number | null;
  precio_total: number | null;
}

export interface NotaRecord {
  id: string;
  facturador_id: string;
  tipo: NotaTipo;
  numero: number | null;
  estado: NotaEstado;
  fecha_emision: string | null;
  cliente_nombre: string;
  cliente_ruc: string | null;
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
}

export interface NotaCreateInput {
  tipo: NotaTipo;
  cliente_nombre: string;
  cliente_ruc?: string | null;
  items: NotaFilaInput[];
}

export interface NotaUpdateInput {
  cliente_nombre?: string;
  cliente_ruc?: string | null;
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
  findByVerificationToken(token: string): Promise<NotaRecord | null>;
  getFacturadorParaPdf(facturadorId: string): Promise<FacturadorParaPdf | null>;
}
