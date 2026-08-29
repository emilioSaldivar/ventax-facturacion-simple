import type { FiscalGateway } from "../fiscal-gateway/fiscal-gateway.types";
import { logger } from "../../shared/logging/logger";
import { refreshFiscalStatusForDocumento } from "./facturas.service";
import { deriveAccion } from "./facturas.accion";
import { notifyAccionRequerida } from "./facturas.notificaciones";
import type { FacturaRepository, PendingVerificacion } from "./facturas.types";

/**
 * Backoff del worker de verificacion fiscal (SPEC_BACKOFFICE_ALINEACION_FE_v0.2, seccion
 * 2.3, definido con el usuario el 2026-07-31): primer check temprano a los 5 minutos
 * (aprovecha que las emisiones BATCH transmiten en ~60s), luego crece hasta 24h.
 * Indexado por `verificacion_attempts` DESPUES del claim (1-based): el primer check
 * automatico (5m) ya lo agenda el repository al emitir/completar, por lo que el primer
 * valor de este arreglo es el SEGUNDO check.
 */
const BACKOFF_MS = [
  30 * 60 * 1000, // intento 1 -> proximo check en 30m
  60 * 60 * 1000, // intento 2 -> 1h
  6 * 60 * 60 * 1000, // intento 3 -> 6h
  12 * 60 * 60 * 1000, // intento 4 -> 12h
  24 * 60 * 60 * 1000 // intento 5+ -> 24h (se repite indefinidamente hasta el corte)
];

const DIAS_CORTE_VERIFICACION = 30;

function nextBackoffMs(attempts: number): number {
  const index = Math.min(Math.max(attempts, 1), BACKOFF_MS.length) - 1;
  return BACKOFF_MS[index] ?? BACKOFF_MS[BACKOFF_MS.length - 1]!;
}

/**
 * El backend fiscal autentica con dos sistemas de clave disjuntos, sin fallback en
 * ninguna direccion (SPEC_ALINEACION_CLAVE_VERIFICACION_FISCAL_v0.1):
 *
 * - clave COMPARTIDA (`FE_API_KEY`, middleware `requireApiKey`): `/documentos/*`,
 *   `/consultar/*`, `/files/*`, `/evento/*`, `/nota-credito`;
 * - clave de CONSUMIDOR (`facturadores.fe_consumer_api_key`, middleware
 *   `requireApiConsumer` + permisos): `/factura`, `/conciliacion/*`, `/recibos/*`.
 *
 * Este worker solo golpea rutas del primer grupo (`/documentos/:uuid/sifen` y, cuando
 * el documento no tiene `document_uuid` local, `/documentos/by-cdc/:cdc`), asi que usa
 * el gateway de clave compartida — el mismo que ya usa el refresh manual. Mandar la
 * clave de consumidor aca devuelve `401 API key invalida`: tener el permiso
 * `SIFEN_STATUS_READ` no habilita estas rutas porque pertenece al otro sistema.
 */
export function startVerificacionFiscalWorker(options: {
  repository: FacturaRepository;
  gateway: FiscalGateway;
  intervalMs: number;
  batchSize: number;
}): () => void {
  let running = false;

  async function processOne(item: PendingVerificacion): Promise<void> {
    const gateway = options.gateway;

    let resultingEstado = item.estado;
    try {
      const updated = await refreshFiscalStatusForDocumento(item.facturadorId, item.documentoId, options.repository, gateway);
      resultingEstado = updated.estado;

      // Seccion 2.9: notificar por correo, a lo sumo una vez por documento, cuando la
      // verificacion deja el documento en un estado de accion que requiere intervencion.
      if (!item.accionNotificadaAt) {
        const { accion, accion_detalle } = deriveAccion(updated);
        if (accion === "REQUIERE_ACCION" || accion === "REQUIERE_SOPORTE") {
          try {
            await notifyAccionRequerida(
              item.facturadorId,
              updated,
              accion_detalle,
              accion === "REQUIERE_SOPORTE",
              options.repository
            );
          } catch (notifyError) {
            logger.error({ err: notifyError, documentoId: item.documentoId }, "verificacion fiscal: fallo al notificar accion requerida");
          }
          // Se marca aunque el envio haya fallado (RN-V3-like: nunca reintentar spam por
          // el mismo cambio de estado; el error ya quedo logueado arriba).
          await options.repository.markAccionNotificada(item.documentoId);
        }
      }
    } catch (error) {
      // RN-V3: un fallo de verificacion automatica nunca es visible al usuario ni
      // cambia el estado — se loguea y se reprograma igual con el mismo backoff.
      logger.error({ err: error, documentoId: item.documentoId, facturadorId: item.facturadorId }, "verificacion fiscal worker: fallo al refrescar estado");
    }

    const ageDays = (Date.now() - new Date(item.createdAt).getTime()) / (1000 * 60 * 60 * 24);
    const esEstadoTerminal = resultingEstado !== "PENDIENTE_SIFEN" && resultingEstado !== "EMITIENDO";

    if (esEstadoTerminal) {
      // RN-V1: no hay nada mas que verificar — se retira de la agenda.
      await options.repository.scheduleNextVerificacion({ documentoId: item.documentoId, nextAt: null, attempts: item.attempts });
      return;
    }

    if (ageDays > DIAS_CORTE_VERIFICACION) {
      // Seccion 2.3: pasado el corte, deja de verificarse automaticamente — deriveAccion
      // ya lo refleja como REQUIERE_SOPORTE por antiguedad.
      await options.repository.scheduleNextVerificacion({ documentoId: item.documentoId, nextAt: null, attempts: item.attempts });
      return;
    }

    const nextAt = new Date(Date.now() + nextBackoffMs(item.attempts));
    await options.repository.scheduleNextVerificacion({ documentoId: item.documentoId, nextAt, attempts: item.attempts });
  }

  async function tick(): Promise<void> {
    if (running) {
      return;
    }

    running = true;
    try {
      const batch = await options.repository.claimNextVerificacion(options.batchSize);
      for (const item of batch) {
        await processOne(item);
      }
    } catch (error) {
      logger.error({ err: error }, "verificacion fiscal worker failed");
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
