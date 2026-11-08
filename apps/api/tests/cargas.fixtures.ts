import type { OperationalContextResponse } from "../src/modules/context/context.types";
import type { CargaMasivaRecord, CargaRepository, FacturaDeCarga } from "../src/modules/cargas/cargas.types";

export const PERFIL_A = "55555555-5555-4555-8555-555555555555";
export const PERFIL_B = "66666666-6666-4666-8666-666666666666";

export function contexto(overrides: Partial<OperationalContextResponse> = {}, numeracion: "SERVICIO" | "CLIENTE" = "SERVICIO"): OperationalContextResponse {
  return {
    user: { id: "11111111-1111-4111-8111-111111111111", username: "operador", display_name: "Operador", role: "OPERADOR_FACTURACION" },
    tenant: { id: "22222222-2222-4222-8222-222222222222", name: "Tenant", status: "ACTIVE" },
    facturador: { id: "33333333-3333-4333-8333-333333333333", emisor_id: "80136968-1", razon_social: "Facturador", ruc: "80136968-1" },
    fiscal_context: {
      establecimiento: "001",
      punto_expedicion: "002",
      perfil_emision_codigo: "SERV",
      actividad_economica_codigo: "82110",
      actividad_economica_descripcion: "Servicios",
      timbrado: "80136968",
      timbrado_inicio: "2025-12-30",
      documento_nro: "0000000",
      credito_plazo_dias: 30,
      tipo_transaccion_default: 2,
      numeracion_facturas: numeracion
    },
    actividad_punto_perfil_id: PERFIL_A,
    ...overrides
  };
}

export class FakeCargaRepository implements CargaRepository {
  filas = new Map<string, CargaMasivaRecord>();
  eventos: Array<{ id: string; usuarioId: string | null; tipo: string; metadata?: Record<string, unknown> }> = [];
  facturas = new Map<string, FacturaDeCarga>();
  documentos = new Map<string, string>();
  apiKey: string | null = "clave-consumidor";
  private secuencia = 0;

  async findById(id: string, facturadorId: string) {
    const fila = this.filas.get(id);
    return fila && fila.facturador_id === facturadorId ? fila : null;
  }

  async findActivaPorSha(facturadorId: string, sha256: string) {
    return [...this.filas.values()].find((f) => f.facturador_id === facturadorId && f.sha256 === sha256 && !["RECHAZADA", "CANCELADA"].includes(f.estado)) ?? null;
  }

  async findByFeCargaId(facturadorId: string, feCargaId: string) {
    return [...this.filas.values()].find((f) => f.facturador_id === facturadorId && f.fe_carga_id === feCargaId) ?? null;
  }

  async crear(input: Parameters<CargaRepository["crear"]>[0]) {
    const existente = await this.findByFeCargaId(input.facturadorId, input.feCarga.carga_id);
    if (existente) return existente;
    this.secuencia += 1;
    const fila: CargaMasivaRecord = {
      id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(this.secuencia).padStart(12, "0")}`,
      tenant_id: input.tenantId,
      facturador_id: input.facturadorId,
      actividad_punto_perfil_id: input.actividadPuntoPerfilId,
      fe_carga_id: input.feCarga.carga_id,
      nombre_archivo: input.feCarga.nombre_archivo,
      tamano_bytes: input.tamanoBytes,
      sha256: input.sha256,
      numeracion: input.feCarga.numeracion,
      estado: input.feCarga.estado,
      totales: input.feCarga.totales,
      acciones: input.feCarga.acciones,
      motivos: input.feCarga.motivos ?? [],
      fe_snapshot: input.feCarga,
      subida_por: input.subidaPor,
      confirmada_por: null,
      cancelada_por: null,
      subida_por_nombre: "Operador",
      confirmada_por_nombre: null,
      cancelada_por_nombre: null,
      sincronizada_hasta: null,
      sincronizada_en: null,
      sync_next_at: input.syncNextAt,
      sync_error: null,
      created_at: new Date()
    };
    this.filas.set(fila.id, fila);
    return fila;
  }

  async list(facturadorId: string, filtros: Parameters<CargaRepository["list"]>[1]) {
    const items = [...this.filas.values()].filter(
      (f) =>
        f.facturador_id === facturadorId &&
        (!filtros.actividadPuntoPerfilId || f.actividad_punto_perfil_id === filtros.actividadPuntoPerfilId) &&
        (!filtros.estados?.length || filtros.estados.includes(f.estado))
    );
    return { items, total: items.length };
  }

  async actualizarDesdeFe(id: string, feCarga: Parameters<CargaRepository["actualizarDesdeFe"]>[1], cambios: Parameters<CargaRepository["actualizarDesdeFe"]>[2] = {}) {
    const fila = this.filas.get(id)!;
    this.filas.set(id, {
      ...fila,
      estado: feCarga.estado,
      totales: feCarga.totales,
      acciones: feCarga.acciones,
      motivos: feCarga.motivos ?? [],
      fe_snapshot: { ...fila.fe_snapshot, ...feCarga },
      sincronizada_en: new Date(),
      sync_error: null,
      confirmada_por: cambios.confirmadaPor ?? fila.confirmada_por,
      cancelada_por: cambios.canceladaPor ?? fila.cancelada_por,
      sync_next_at: cambios.syncNextAt !== undefined ? cambios.syncNextAt : fila.sync_next_at
    });
  }

  async marcarSyncError(id: string, mensaje: string, syncNextAt?: Date) {
    const fila = this.filas.get(id)!;
    this.filas.set(id, { ...fila, sync_error: mensaje, sync_next_at: syncNextAt ?? fila.sync_next_at });
  }

  async finalizarSync(id: string, cambios: { sincronizadaHasta: string | null; syncNextAt: Date | null }) {
    const fila = this.filas.get(id)!;
    this.filas.set(id, {
      ...fila,
      sincronizada_hasta: cambios.sincronizadaHasta ? new Date(cambios.sincronizadaHasta) : fila.sincronizada_hasta,
      sync_next_at: cambios.syncNextAt
    });
  }

  async contarCorreosPendientes(carga: { fe_carga_id: string }) {
    return [...this.facturas.entries()].filter(([ref, f]) => ref.startsWith(`carga:${carga.fe_carga_id}:`) && f.emailEstado === "PENDING").length;
  }

  async claimNextCargasSync() {
    return [...this.filas.values()];
  }

  async registrarEvento(carga: Parameters<CargaRepository["registrarEvento"]>[0], usuarioId: string | null, tipo: string, metadata?: Record<string, unknown>) {
    this.eventos.push({ id: carga.id, usuarioId, tipo, metadata });
  }

  async getFacturadorApiKey() {
    return this.apiKey;
  }

  async documentosPorUuid(_facturadorId: string, uuids: string[]) {
    return new Map(uuids.filter((u) => this.documentos.has(u)).map((u) => [u, this.documentos.get(u)!]));
  }

  async incorporarFacturas(_carga: CargaMasivaRecord, facturas: FacturaDeCarga[]) {
    for (const factura of facturas) this.facturas.set(factura.externalRef, factura);
  }
}

export const CSV_TITULOS = "numero_comprobante;referencia_venta;receptor_email;item_codigo";

export function csv(...filas: string[]): Buffer {
  return Buffer.from([CSV_TITULOS, ...filas].join("\n"), "utf8");
}
