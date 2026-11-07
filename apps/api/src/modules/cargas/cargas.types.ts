import type { FeCarga, FeCargaAcciones, FeCargaComprobante, FeCargaEstado, FeCargaProblema, FeCargaTotales, FeNumeracion } from "../fiscal-gateway/fiscal-gateway.types";
import type { DocumentoEstado, FacturaClienteInput, FacturaItemPreview } from "../facturas/facturas.types";
import type { TaxTotals } from "@facturacion-simple/shared";

export interface CargaMasivaRecord {
  id: string;
  tenant_id: string;
  facturador_id: string;
  actividad_punto_perfil_id: string;
  fe_carga_id: string;
  nombre_archivo: string | null;
  tamano_bytes: number;
  sha256: string;
  numeracion: FeNumeracion;
  estado: FeCargaEstado;
  totales: FeCargaTotales | Record<string, never>;
  acciones: FeCargaAcciones | Record<string, never>;
  motivos: FeCargaProblema[];
  fe_snapshot: Partial<FeCarga>;
  subida_por: string;
  confirmada_por: string | null;
  cancelada_por: string | null;
  subida_por_nombre: string | null;
  confirmada_por_nombre: string | null;
  cancelada_por_nombre: string | null;
  sincronizada_hasta: Date | null;
  sincronizada_en: Date | null;
  sync_next_at: Date | null;
  sync_error: string | null;
  created_at: Date;
}

export interface CargaUsuarioRef {
  id: string;
  display_name: string | null;
}

export interface CargaMasivaResponse {
  id: string;
  fe_carga_id: string;
  estado: FeCargaEstado;
  nombre_archivo: string | null;
  tamano_bytes: number;
  numeracion: FeNumeracion;
  totales: FeCargaTotales | Record<string, never>;
  acciones: FeCargaAcciones | Record<string, never>;
  motivos: FeCargaProblema[];
  fechas: {
    recibida_en: string | null;
    validada_en: string | null;
    confirmada_en: string | null;
    iniciada_en: string | null;
    finalizada_en: string | null;
    cancelada_en: string | null;
  };
  contexto: {
    perfil: string | null;
    establecimiento: string | null;
    punto: string | null;
    actividad: string | null;
  };
  subida_por: CargaUsuarioRef;
  confirmada_por: CargaUsuarioRef | null;
  cancelada_por: CargaUsuarioRef | null;
  sincronizada_en: string | null;
  sync_error: string | null;
  created_at: string;
  /** Solo en la subida: el archivo ya se habia subido. */
  repetida?: boolean;
}

export interface CargaMasivaListResponse {
  items: CargaMasivaResponse[];
  total: number;
}

export type CargaComprobanteResponse = Omit<FeCargaComprobante, "detalle"> & {
  detalle?: FeCargaComprobante["detalle"];
  /** Documento de FS con ese `document_uuid`, si esta incorporado. */
  documento_id: string | null;
};

export interface CargaComprobantesResponse {
  carga_id: string;
  estado: FeCargaEstado;
  items: CargaComprobanteResponse[];
  page: number;
  limit: number;
  total: number;
}

export interface CargaListFilters {
  estados?: string[];
  desde?: string;
  hasta?: string;
  limit: number;
  offset: number;
  /** Operador: solo las de su contexto. Nulo para roles internos (RN-11). */
  actividadPuntoPerfilId: string | null;
}

export interface NuevaCargaInput {
  tenantId: string;
  facturadorId: string;
  actividadPuntoPerfilId: string;
  feCarga: FeCarga;
  tamanoBytes: number;
  sha256: string;
  subidaPor: string;
  syncNextAt: Date | null;
}

/** Comprobante listo para `facturas_operativas` (PLAN seccion 6). */
export interface FacturaDeCarga {
  externalRef: string;
  documentUuid: string;
  estado: Extract<DocumentoEstado, "PENDIENTE_SIFEN" | "EMITIDA" | "RECHAZADA" | "ANULADA">;
  /** El comprobante trae `documento_estado`: el estado es el vigente en FE, no el de su emision. */
  estadoVigente: boolean;
  fiscalStatusRaw: string;
  sifenCodigo: string | null;
  sifenMensaje: string | null;
  cdc: string | null;
  numeroFiscal: string | null;
  numeroArchivo: string | null;
  emailEstado: "PENDING" | "SENT" | "FAILED" | null;
  aprobadoEn: string | null;
  actualizadoEn: string;
  condicionVenta: "CONTADO" | "CREDITO";
  cliente: FacturaClienteInput;
  items: FacturaItemPreview[];
  totals: TaxTotals;
  requestSnapshot: unknown;
  responseSnapshot: Record<string, unknown>;
}

export type CargaEventoTipo = "CARGA_SUBIDA" | "CARGA_CONFIRMADA" | "CARGA_CANCELADA" | "CARGA_REINTENTADA";

export interface CargaRepository {
  findById(id: string, facturadorId: string): Promise<CargaMasivaRecord | null>;
  findActivaPorSha(facturadorId: string, sha256: string): Promise<CargaMasivaRecord | null>;
  findByFeCargaId(facturadorId: string, feCargaId: string): Promise<CargaMasivaRecord | null>;
  /** Crea la fila, o devuelve la existente si dos subidas del mismo archivo se cruzan. */
  crear(input: NuevaCargaInput): Promise<CargaMasivaRecord>;
  list(facturadorId: string, filtros: CargaListFilters): Promise<{ items: CargaMasivaRecord[]; total: number }>;
  actualizarDesdeFe(
    id: string,
    feCarga: Pick<FeCarga, "estado" | "totales" | "acciones" | "motivos"> & Partial<FeCarga>,
    cambios?: { confirmadaPor?: string; canceladaPor?: string; syncNextAt?: Date | null }
  ): Promise<void>;
  marcarSyncError(id: string, mensaje: string, syncNextAt?: Date): Promise<void>;
  finalizarSync(id: string, cambios: { sincronizadaHasta: string | null; syncNextAt: Date | null }): Promise<void>;
  claimNextCargasSync(limit: number): Promise<CargaMasivaRecord[]>;
  registrarEvento(carga: Pick<CargaMasivaRecord, "id" | "tenant_id" | "facturador_id">, usuarioId: string | null, tipo: CargaEventoTipo, metadata?: Record<string, unknown>): Promise<void>;
  getFacturadorApiKey(facturadorId: string): Promise<string | null>;
  documentosPorUuid(facturadorId: string, uuids: string[]): Promise<Map<string, string>>;
  /** Una transaccion por pagina. Idempotente por `(facturador_id, external_ref)`. */
  incorporarFacturas(carga: CargaMasivaRecord, facturas: FacturaDeCarga[]): Promise<void>;
}
