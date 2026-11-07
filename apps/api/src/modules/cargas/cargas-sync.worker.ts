import { logger } from "../../shared/logging/logger";
import type { FiscalGateway } from "../fiscal-gateway/fiscal-gateway.types";
import { cargaTieneDocumentos, comprobanteAFactura, proximaSincronizacionMs } from "./cargas.mapeo";
import type { CargaMasivaRecord, CargaRepository, FacturaDeCarga } from "./cargas.types";

const CARGAS_POR_CICLO = 5;
const COMPROBANTES_POR_PAGINA = 200;
/**
 * Un comprobante que cambia mientras se recorren las paginas puede quedar con un `actualizado_en`
 * anterior al mas nuevo recibido. Se vuelve a pedir ese margen: incorporar es idempotente.
 */
const MARGEN_CURSOR_MS = 2 * 60 * 1000;

function cursorDesde(hasta: Date | null): string | undefined {
  return hasta ? new Date(new Date(hasta).getTime() - MARGEN_CURSOR_MS).toISOString() : undefined;
}

/** Una pasada por una carga. Un fallo de FE no cambia ningun estado y reintenta (RN-19). */
export async function sincronizarCarga(carga: CargaMasivaRecord, gateway: FiscalGateway, repository: CargaRepository): Promise<void> {
  const feCarga = await gateway.getCarga(carga.fe_carga_id);
  await repository.actualizarDesdeFe(carga.id, feCarga);

  let masNuevo: string | null = null;
  if (cargaTieneDocumentos(feCarga.estado)) {
    for (let page = 1; ; page += 1) {
      const lista = await gateway.listCargaComprobantes(carga.fe_carga_id, {
        actualizado_desde: cursorDesde(carga.sincronizada_hasta),
        detalle: true,
        page,
        limit: COMPROBANTES_POR_PAGINA
      });
      const facturas: FacturaDeCarga[] = [];
      for (const comprobante of lista.items) {
        if (!masNuevo || comprobante.actualizado_en > masNuevo) masNuevo = comprobante.actualizado_en;
        const factura = comprobanteAFactura(carga, comprobante);
        if (factura) facturas.push(factura);
      }
      await repository.incorporarFacturas(carga, facturas);
      if (page * COMPROBANTES_POR_PAGINA >= lista.total) break;
    }
  }

  const esperaMs = proximaSincronizacionMs(feCarga.estado, feCarga.confirmada_en);
  if (esperaMs !== null && feCarga.confirmada_en && Date.now() - new Date(feCarga.confirmada_en).getTime() > 72 * 60 * 60 * 1000) {
    logger.warn({ carga_id: carga.id, estado: feCarga.estado }, "carga masiva: mas de 72 h sin terminar");
  }
  await repository.finalizarSync(carga.id, {
    sincronizadaHasta: masNuevo,
    syncNextAt: esperaMs === null ? null : new Date(Date.now() + esperaMs)
  });
}

export function startCargasSyncWorker(options: {
  repository: CargaRepository;
  gatewayFor: (facturadorId: string) => Promise<FiscalGateway>;
  intervalMs: number;
}): () => void {
  let running = false;

  async function tick(): Promise<void> {
    if (running) return;
    running = true;
    try {
      const cargas = await options.repository.claimNextCargasSync(CARGAS_POR_CICLO);
      for (const carga of cargas) {
        try {
          await sincronizarCarga(carga, await options.gatewayFor(carga.facturador_id), options.repository);
        } catch (error) {
          const mensaje = error instanceof Error ? error.message : "Backend fiscal no disponible.";
          const esperaMs = proximaSincronizacionMs(carga.estado, null) ?? 5 * 60 * 1000;
          logger.error({ err: error, carga_id: carga.id }, "carga masiva: fallo al sincronizar");
          await options.repository.marcarSyncError(carga.id, mensaje, new Date(Date.now() + esperaMs));
        }
      }
    } catch (error) {
      logger.error({ err: error }, "carga masiva: fallo el worker de sincronizacion");
    } finally {
      running = false;
    }
  }

  const interval = setInterval(() => {
    void tick();
  }, options.intervalMs);
  void tick();

  return () => clearInterval(interval);
}
