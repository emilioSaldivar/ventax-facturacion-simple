export const documentoIdentidadTipos = ["RUC", "CI", "PASAPORTE", "CEDULA_EXTRANJERA", "NO_ESPECIFICADO"] as const;
export type DocumentoIdentidadTipo = (typeof documentoIdentidadTipos)[number];

export interface ClienteUpsertInput {
  documento_tipo: DocumentoIdentidadTipo;
  documento: string;
  razon_social: string;
  direccion?: string | null;
  telefono?: string | null;
  email?: string | null;
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
}

export interface ClienteResponse extends ClienteSearchResult {
  cliente_id: string;
  activo: boolean;
}

export interface ClienteListResponse {
  items: ClienteResponse[];
  total: number;
}

export interface ClienteRepository {
  search(input: { tenantId: string; facturadorId: string; q: string; limit: number }): Promise<ClienteSearchResult[]>;
  list(input: { facturadorId: string; q?: string; limit: number; offset: number }): Promise<ClienteListResponse>;
  findByIdForFacturador(input: { clienteId: string; facturadorId: string }): Promise<ClienteResponse | null>;
  upsertForFacturador(input: {
    tenantId: string;
    facturadorId: string;
    userId: string;
    data: ClienteUpsertInput;
  }): Promise<ClienteResponse>;
  updateForFacturador(input: {
    clienteId: string;
    facturadorId: string;
    userId: string;
    data: ClienteUpsertInput;
  }): Promise<ClienteResponse | null>;
}
