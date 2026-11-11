export const ivaTipos = ["IVA_10", "IVA_5", "EXENTA"] as const;
export type IvaTipo = (typeof ivaTipos)[number];

/** SPEC_CATALOGO_MONEDA_v0.1 RN-04: monedas admitidas; sumar otra no requiere migracion. */
export const monedasCatalogo = ["PYG", "USD"] as const;
export type MonedaCatalogo = (typeof monedasCatalogo)[number];

export interface CatalogoItem {
  id: string;
  codigo: string;
  descripcion: string;
  precio_unitario: number;
  moneda: string;
  iva_tipo: IvaTipo;
  activo: boolean;
}

export interface CatalogoItemUpsertInput {
  codigo?: string | null;
  descripcion: string;
  precio_unitario: number;
  moneda?: string;
  iva_tipo?: IvaTipo;
  activo?: boolean;
}

export interface CatalogoItemPersistInput {
  codigo: string;
  descripcion: string;
  precio_unitario: number;
  moneda: MonedaCatalogo;
  iva_tipo: IvaTipo;
  activo: boolean;
}

export interface CatalogoItemListResponse {
  items: CatalogoItem[];
  total: number;
}

export interface CatalogoRepository {
  search(input: { facturadorId: string; q: string; limit: number; moneda?: MonedaCatalogo }): Promise<CatalogoItem[]>;
  list(input: { facturadorId: string; q?: string; activo?: boolean; moneda?: MonedaCatalogo; limit: number; offset: number }): Promise<CatalogoItemListResponse>;
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
