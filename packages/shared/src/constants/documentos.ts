export const tiposDocumentoElectronico = ["FACTURA", "NOTA_CREDITO"] as const;
export type TipoDocumentoElectronico = (typeof tiposDocumentoElectronico)[number];

export const condicionesVenta = ["CONTADO", "CREDITO"] as const;
export type CondicionVenta = (typeof condicionesVenta)[number];

export const tiposIva = ["IVA_10", "IVA_5", "EXENTA"] as const;
export type TipoIva = (typeof tiposIva)[number];

export const estadosDocumento = [
  "PENDIENTE_SIFEN",
  "EMITIDA",
  "RECHAZADA",
  "ERROR_TEMPORAL",
  "ERROR_OPERATIVO",
  "CANCELADA"
] as const;
export type EstadoDocumento = (typeof estadosDocumento)[number];

