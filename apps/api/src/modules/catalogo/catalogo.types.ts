export const ivaTipos = ["IVA_10", "IVA_5", "EXENTA"] as const;
export type IvaTipo = (typeof ivaTipos)[number];

export interface CatalogoItem {
  id: string;
  codigo: string;
  descripcion: string;
  precio_unitario: number;
  iva_tipo: IvaTipo;
  activo: boolean;
}

export interface CatalogoItemUpsertInput {
  codigo?: string | null;
  descripcion: string;
  precio_unitario: number;
  iva_tipo?: IvaTipo;
  activo?: boolean;
}

export interface CatalogoItemPersistInput {
  codigo: string;
  descripcion: string;
  precio_unitario: number;
  iva_tipo: IvaTipo;
  activo: boolean;
}

export interface CatalogoItemListResponse {
  items: CatalogoItem[];
  total: number;
}

export interface CatalogoRepository {
  search(input: { facturadorId: string; q: string; limit: number }): Promise<CatalogoItem[]>;
  list(input: { facturadorId: string; q?: string; activo?: boolean; limit: number; offset: number }): Promise<CatalogoItemListResponse>;
  create(input: {
    tenantId: string;
    facturadorId: string;
    userId: string;
    data: CatalogoItemPersistInput;
  }): Promise<CatalogoItem>;
  update(input: {
    itemId: string;
    facturadorId: string;
    userId: string;
    data: CatalogoItemPersistInput;
  }): Promise<CatalogoItem | null>;
  hardDelete(input: { itemId: string; facturadorId: string }): Promise<boolean>;
  existsByCodigo(input: { facturadorId: string; codigoNormalizado: string; excludeItemId?: string }): Promise<boolean>;
}
