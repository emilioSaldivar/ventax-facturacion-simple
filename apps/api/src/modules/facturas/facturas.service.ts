import crypto from "node:crypto";
import { env } from "../../config/env";
import { calculateDocumentTotalsMoneda, type TaxInputLine, type TaxTotals } from "@facturacion-simple/shared";
import { HttpError } from "../../shared/errors/http-error";
import { logger } from "../../shared/logging/logger";
import { deriveAccion, esNotaTrabada, puedeReintentarEmision } from "./facturas.accion";
import { clasificarRespuestaNotaCredito, type ClasificacionNotaCredito } from "./nota-credito.clasificacion";
import { notifyAccionRequerida } from "./facturas.notificaciones";
import {
  buscarCodigoSifen,
  leerNumeracionDelCdc,
  mismoEmisor,
  numeroComparable,
  puedeInutilizar
} from "./facturas.inutilizacion";
import {
  armarLineasNotaCredito,
  esNotaParcial,
  saldoAcreditablePorLinea,
  tieneSaldo,
  validarLineasPedidas,
  type LineaNotaCreditoPedida,
  type SaldoLinea
} from "./nota-credito-parcial";
import type { ClienteRepository, ClienteResponse } from "../clientes/clientes.types";
import type { OperationalContextRepository, OperationalContextResponse } from "../context/context.types";
import {
  FiscalGatewayError,
  type FiscalGateway,
  type FiscalEmitFacturaRequest,
  type FiscalEmitNotaRemisionRequest,
  type FiscalEmitFacturaResponse,
  type FiscalEmitNotaCreditoRequest,
  type FiscalEmitNotaCreditoResponse,
  type FiscalIdempotencyReconciliationItem,
  type FiscalIdempotencyReconciliationItemResult,
  type FiscalDocumentoTotalesResponse
} from "../fiscal-gateway/fiscal-gateway.types";
import type {
  BatchPendientesGestionResponse,
  DocumentoDecisionResponse,
  DocumentoEstado,
  DocumentoEventosListResponse,
  DocumentoGestionCreateDerivedResponse,
  DocumentoGestionResendResponse,
  DocumentoGestionVoidResponse,
  DocumentoListFilters,
  DocumentoListResponse,
  DocumentoResponse,
  DocumentoValidateCdcImpactResponse,
  FacturaItemPreview,
  FacturaPreviewInput,
  FacturaPreviewResponse,
  FacturaRepository,
  NotaCreditoCandidateListResponse,
  ReconciliacionFiscalResponse
} from "./facturas.types";
import { INNOMINADO_DOCUMENTO, INNOMINADO_NOMBRE, TOPE_INNOMINADO_GS } from "./facturas.types";

export function previewFactura(
  _context: OperationalContextResponse,
  rawInput: FacturaPreviewInput
): FacturaPreviewResponse {
  const input = normalizarClienteInnominado(rawInput);
  validateCliente(input);

  const taxLines: TaxInputLine[] = input.items.map((item) => {
    const descripcion = item.descripcion.trim();
    if (!descripcion) {
      throw new HttpError(400, "VALIDATION_ERROR", "Descripcion de item requerida.");
    }

    return {
      codigo: item.codigo?.trim() || null,
      descripcion,
      cantidad: item.cantidad,
      precio_unitario: item.precio_unitario,
      iva_tipo: item.iva_tipo ?? "IVA_10"
    };
  });

  try {
    // SPEC_MONEDA_EXTRANJERA_v0.1, RN-03: fuera de PYG, presentacion con 2 decimales.
    const calculated = calculateDocumentTotalsMoneda(taxLines, input.moneda ?? "PYG");
    const items: FacturaItemPreview[] = calculated.items.map((item, index) => ({
      ...item,
      catalogo_item_id: input.items[index]?.catalogo_item_id?.trim() || null
    }));

    validarTopeInnominado(input, calculated.totals.total);

    return {
      items,
      totals: calculated.totals
    };
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }
    if (error instanceof Error) {
      throw new HttpError(400, "VALIDATION_ERROR", error.message);
    }
    throw error;
  }
}

function validateCliente(input: FacturaPreviewInput): void {
  if (!input.cliente.documento.trim()) {
    throw new HttpError(400, "VALIDATION_ERROR", "Documento de cliente requerido.");
  }

  if (!input.cliente.razon_social.trim()) {
    throw new HttpError(400, "VALIDATION_ERROR", "Razon social de cliente requerida.");
  }
}

/** SPEC_COMPRADOR_INNOMINADO_v0.1, RN-03: documento y nombre los fija el servidor; sin agenda ni naturaleza. */
export function normalizarClienteInnominado(input: FacturaPreviewInput): FacturaPreviewInput {
  if (input.cliente.documento_tipo !== "INNOMINADO") {
    return input;
  }
  return {
    ...input,
    cliente: {
      ...input.cliente,
      cliente_id: null,
      documento: INNOMINADO_DOCUMENTO,
      razon_social: INNOMINADO_NOMBRE,
      naturaleza: null
    }
  };
}

export const MENSAJE_TOPE_INNOMINADO =
  "Una factura sin nombre tiene que ser menor a Gs. 7.000.000. Identificá al comprador con su RUC o CI.";

/** RN-04: NT024 / SIFEN 1321. Fuera de PYG el tope es sobre el total por el tipo de cambio. */
function validarTopeInnominado(input: FacturaPreviewInput, total: number): void {
  if (input.cliente.documento_tipo !== "INNOMINADO") {
    return;
  }
  const moneda = input.moneda ?? "PYG";
  const totalGs = moneda === "PYG" ? total : Math.round(total * Number(input.tipo_cambio ?? 0));
  if (totalGs >= TOPE_INNOMINADO_GS) {
    throw new HttpError(400, "VALIDATION_ERROR", MENSAJE_TOPE_INNOMINADO, { reason: "INNOMINADO_SOBRE_TOPE", tope: TOPE_INNOMINADO_GS, total_gs: totalGs });
  }
}

async function resolveFacturaInputCliente(
  context: OperationalContextResponse,
  rawInput: FacturaPreviewInput,
  clienteRepository?: ClienteRepository
): Promise<FacturaPreviewInput> {
  const input = normalizarClienteInnominado(rawInput);
  const clienteId = input.cliente.cliente_id?.trim();

  if (!clienteId || !clienteRepository) {
    return input;
  }

  const agendaCliente = await clienteRepository.findByIdForFacturador({
    clienteId,
    facturadorId: context.facturador.id
  });

  if (!agendaCliente) {
    throw new HttpError(404, "NOT_FOUND", "Cliente no encontrado en la agenda del facturador.");
  }

  return {
    ...input,
    cliente: {
      ...input.cliente,
      direccion: firstNonBlank(input.cliente.direccion, agendaCliente.direccion),
      telefono: firstNonBlank(input.cliente.telefono, agendaCliente.telefono),
      email: firstNonBlank(input.cliente.email, agendaCliente.email),
      naturaleza: input.cliente.naturaleza ?? agendaCliente.naturaleza
    }
  };
}

function firstNonBlank(primary: string | null | undefined, fallback: ClienteResponse["email"]): string | null {
  const normalized = primary?.trim();
  if (normalized) {
    return normalized;
  }
  return fallback?.trim() || null;
}

export async function listDocumentos(
  context: OperationalContextResponse,
  filters: DocumentoListFilters,
  repository: FacturaRepository
): Promise<DocumentoListResponse> {
  const result = await repository.list({
    facturadorId: context.facturador.id,
    filters
  });
  return { ...result, items: result.items.map(withAccion) };
}

export function withAccion(documento: DocumentoResponse): DocumentoResponse {
  const { accion, accion_detalle } = deriveAccion(documento);
  return {
    ...documento,
    accion,
    accion_detalle,
    puede_reintentar_emision: puedeReintentarEmision(documento),
    puede_inutilizar: puedeInutilizar(documento)
  };
}

export async function listNotaCreditoCandidates(
  context: OperationalContextResponse,
  filters: Pick<DocumentoListFilters, "q" | "limit" | "offset">,
  repository: FacturaRepository
): Promise<NotaCreditoCandidateListResponse> {
  const result = await repository.list({
    facturadorId: context.facturador.id,
    filters: {
      q: filters.q,
      limit: filters.limit,
      offset: filters.offset,
      tipo: "FACTURA"
    }
  });

  const relatedResult = await repository.list({
    facturadorId: context.facturador.id,
    filters: {
      limit: 100,
      offset: 0,
      tipo: "NOTA_CREDITO"
    }
  });
  // SPEC_NOTA_CREDITO_PARCIAL_v0.1, RN-06: una factura con notas vivas sigue elegible mientras le quede saldo.
  // Las rechazadas no cuentan (SPEC_NOTA_CREDITO_TRABADA_v0.1, RN-02).
  const creditedFacturaIds = new Set(
    result.items
      .filter((factura) => relatedResult.items.some((nota) => nota.documento_relacionado_id === factura.id && nota.estado !== "RECHAZADA"))
      .filter((factura) => !tieneSaldo(saldoAcreditablePorLinea(factura, relatedResult.items)))
      .map((factura) => factura.id)
  );

  return {
    total: result.total,
    items: result.items.map((documento) => {
      const motivo = getNotaCreditoIneligibility(documento, creditedFacturaIds);
      return {
        documento,
        elegible: motivo === null,
        motivo_no_elegible: motivo
      };
    })
  };
}

function getNotaCreditoIneligibility(documento: DocumentoResponse, creditedFacturaIds: Set<string>): string | null {
  if (documento.tipo !== "FACTURA") {
    return "Solo una factura puede originar nota de credito.";
  }
  if (documento.estado !== "EMITIDA") {
    return "La factura debe estar emitida.";
  }
  if (esFacturaInnominada(documento)) {
    return MENSAJE_NOTA_CREDITO_INNOMINADA;
  }
  if (!documento.cdc) {
    return "La factura no tiene CDC confirmado.";
  }
  if (creditedFacturaIds.has(documento.id)) {
    return "La factura ya esta acreditada por completo.";
  }
  if ((documento.totals?.anticipo ?? 0) > 0) {
    return MENSAJE_NOTA_CREDITO_CON_ANTICIPO;
  }
  if (documento.moneda && documento.moneda !== "PYG" && !env.FE_NC_MONEDA_EXTRANJERA) {
    return MENSAJE_NOTA_CREDITO_MONEDA_EXTRANJERA;
  }
  return null;
}

/** SPEC_COMPRADOR_INNOMINADO_v0.1, RN-06: SIFEN rechaza con 1331 la NC sobre una factura sin nombre (FE 422). */
export const MENSAJE_NOTA_CREDITO_INNOMINADA =
  "SIFEN no admite nota de crédito de una factura sin nombre. Para anularla, usá Anular dentro de las 48 horas.";

export function esFacturaInnominada(documento: Pick<DocumentoResponse, "cliente">): boolean {
  return documento.cliente?.documento_tipo === "INNOMINADO";
}

function rechazarNotaCreditoInnominada(documento: Pick<DocumentoResponse, "cliente">): void {
  if (esFacturaInnominada(documento)) {
    throw new HttpError(409, "CONFLICT", MENSAJE_NOTA_CREDITO_INNOMINADA, { reason: "NOTA_CREDITO_INNOMINADA" });
  }
}

/** SPEC_TOTALES_FE_EN_CARGA_v0.1, RN-08: FE no admite la nota total por referencia con anticipo. */
export const MENSAJE_NOTA_CREDITO_CON_ANTICIPO = "Esta factura tiene anticipo: la nota de credito se gestiona con soporte.";

/** SPEC_MONEDA_EXTRANJERA_v0.1, D-1: FE `segel-rc4.25` emite toda nota de credito en guaranies. */
export const MENSAJE_NOTA_CREDITO_MONEDA_EXTRANJERA = "La nota de credito de una factura en moneda extranjera se gestiona con soporte.";

export async function getDocumentoById(
  context: OperationalContextResponse,
  documentoId: string,
  repository: FacturaRepository
): Promise<DocumentoResponse> {
  const documento = await repository.findById({
    facturadorId: context.facturador.id,
    documentoId
  });

  if (!documento) {
    throw new HttpError(404, "NOT_FOUND", "Documento no encontrado.");
  }

  return withAccion(documento);
}

export async function refreshDocumentoStatus(
  context: OperationalContextResponse,
  documentoId: string,
  repository: FacturaRepository,
  gateway: FiscalGateway
): Promise<DocumentoResponse> {
  // SPEC_NOTA_CREDITO_TRABADA_v0.1, RN-05: consultar una nota trabada pisaria su marca y FE no la mueve sola;
  // verificarla es reintentar con la misma clave, que es idempotente.
  const actual = await repository.findById({ facturadorId: context.facturador.id, documentoId });
  if (actual && esNotaTrabada(actual)) {
    return reintentarNotaCredito(context, actual, repository, gateway);
  }
  const updated = await refreshFiscalStatusForDocumento(context.facturador.id, documentoId, repository, gateway);
  return withAccion(updated);
}

/**
 * Nucleo del refresh de estado fiscal, sin depender del contexto operativo de un
 * usuario autenticado — usado tanto por el endpoint manual (refreshDocumentoStatus)
 * como por el worker de verificacion automatica (F9), que solo tiene facturadorId
 * y documentoId (SPEC_BACKOFFICE_ALINEACION_FE_v0.2, seccion 2.3 / D-2 del TASKS).
 */
export async function refreshFiscalStatusForDocumento(
  facturadorId: string,
  documentoId: string,
  repository: FacturaRepository,
  gateway: FiscalGateway,
  options: { omitirRefreshEnLote?: boolean } = {}
): Promise<DocumentoResponse> {
  const documento = await repository.findById({ facturadorId, documentoId });
  if (!documento) {
    throw new HttpError(404, "NOT_FOUND", "Documento no encontrado.");
  }

  let documentUuid = documento.document_uuid;

  if (!documentUuid) {
    const cdc = documento.cdc;
    if (!cdc) {
      throw new HttpError(409, "CONFLICT", "Documento sin identidad fiscal canonica. Requiere sincronizacion.");
    }

    // Documento emitido con cdc pero sin document_uuid local — resolverlo via CDC
    // y persistirlo antes de continuar con el refresh.
    try {
      const byCdc = await gateway.resolveDocumentoByCdc(cdc);
      documentUuid = byCdc.document_uuid;
      await repository.bulkUpdateDocumentUuidByCdc([{ cdc, documentUuid }]);
    } catch (error) {
      if (error instanceof FiscalGatewayError) {
        throw new HttpError(
          error.code === "TIMEOUT" ? 504 : 502,
          "INTERNAL_ERROR",
          "No se pudo resolver la identidad fiscal del documento.",
          { gateway_code: error.code }
        );
      }
      throw error;
    }
  }

  // Paso SIFEN, best-effort (SPEC_ESTADO_FISCAL_CANONICO_v0.1 RN-02/RN-03): pide a FE una consulta
  // fresca y trae codigo y mensaje para explicar la causa. No decide el estado.
  // FS-11: una consulta con refresh en FE puede devolver una factura cancelada a aprobada (FE-02).
  // Un documento anulado no se vuelve a consultar en SIFEN.
  const anulado = documento.estado === "ANULADA";

  // FS-24, RN-24.2: con el documento en lote, FE ya consulta a SIFEN por su cuenta. Solo el worker
  // lo pide; el boton "Verificar estado fiscal" siempre consulta (RN-24.5). Si esta lectura falla,
  // sigue el flujo normal.
  if (options.omitirRefreshEnLote && !anulado) {
    const enLote = await gateway.getDocumentoCanonico(documentUuid).catch(() => null);
    if (enLote && (enLote.status === "SENT_BATCH" || enLote.status === "QUEUED_BATCH")) {
      const actualizado = await repository.updateFiscalStatus({
        facturadorId,
        documentoId,
        estado: enLote.estado ?? documento.estado,
        fiscalStatus: mergeFiscalStatus(documento.fiscal_status, { canonical: enLote.raw }),
        fiscalStatusRaw: enLote.status,
        sifenResultCode: null,
        sifenResultMessage: null
      });
      if (!actualizado) {
        throw new HttpError(404, "NOT_FOUND", "Documento no encontrado.");
      }
      return actualizado;
    }
  }

  let refreshed: Awaited<ReturnType<FiscalGateway["refreshFacturaStatus"]>> | null = null;
  try {
    refreshed = anulado ? null : await gateway.refreshFacturaStatus({ documentUuid });
  } catch (error) {
    if (!(error instanceof FiscalGatewayError)) {
      throw error;
    }
    logger.warn({ documentoId, gateway_code: error.code }, "refresh fiscal: consulta SIFEN fallo, se usa solo el estado canonico");
  }

  try {
    // Paso canonico, obligatorio (RN-01): el estado lo decide el `status` de FE.
    const canonico = await gateway.getDocumentoCanonico(documentUuid);
    if (anulado && canonico.estado !== "ANULADA") {
      logger.warn({ documentoId, status: canonico.status }, "refresh fiscal: documento anulado con otro estado en FE; se conserva anulado.");
    }
    if (!canonico.estado) {
      logger.warn({ documentoId, status: canonico.status }, "refresh fiscal: status canonico desconocido, se conserva el estado");
    }

    // RN-03 (contrato canonico): actualizar cdc si FE informa uno distinto al almacenado.
    const cdcVigente = canonico.current_cdc ?? refreshed?.current_cdc ?? null;
    const cdcActualizado = cdcVigente && cdcVigente !== documento.cdc ? cdcVigente : undefined;

    const estadoFinal = anulado ? "ANULADA" : canonico.estado ?? documento.estado;

    // FS-20: el refresh de un rechazado solo responde 0420. El motivo real esta guardado en FE.
    let motivo: Awaited<ReturnType<FiscalGateway["getMotivoRechazo"]>> = null;
    if (estadoFinal === "RECHAZADA") {
      try {
        motivo = await gateway.getMotivoRechazo(documentUuid);
      } catch (error) {
        logger.warn({ documentoId, err: error }, "refresh fiscal: no se pudo leer el motivo del rechazo.");
      }
    }
    // Sin motivo disponible, 0420 sirve solo si no hay nada mejor guardado: nunca pisa una causa real.
    const codigoConsulta = estadoFinal === "RECHAZADA" && refreshed?.result_code === "0420" && documento.sifen_result_code ? null : refreshed;

    const updated = await repository.updateFiscalStatus({
      facturadorId,
      documentoId,
      estado: estadoFinal,
      fiscalStatus: mergeFiscalStatus(documento.fiscal_status, { ...(refreshed?.raw ?? {}), canonical: canonico.raw }),
      cdc: cdcActualizado,
      fiscalStatusRaw: canonico.status,
      sifenResultCode: motivo?.code ?? codigoConsulta?.result_code ?? null,
      sifenResultMessage: motivo?.code ? motivo.message : codigoConsulta?.result_message ?? null
    });

    if (!updated) {
      throw new HttpError(404, "NOT_FOUND", "Documento no encontrado.");
    }

    // SPEC_MONEDA_EXTRANJERA_v0.1, A-2: con el documento aprobado se guardan los totales oficiales de FE.
    return await guardarTotalesFe(facturadorId, updated, repository, gateway);
  } catch (error) {
    if (error instanceof FiscalGatewayError) {
      throw new HttpError(
        error.code === "TIMEOUT" ? 504 : 502,
        "INTERNAL_ERROR",
        error.code === "TIMEOUT" ? "Timeout al refrescar estado fiscal." : "No se pudo refrescar estado fiscal.",
        {
          gateway_code: error.code,
          details: error.details ?? null
        }
      );
    }
    throw error;
  }
}

/** FE limita la conciliacion por idempotencia a rangos de 7 dias (guia de consumidores, 10.2). */
const VENTANA_IDEMPOTENCIA_MS = 7 * 24 * 60 * 60 * 1000;
const MARGEN_IDEMPOTENCIA_MS = 5 * 60 * 1000;

/**
 * Ventanas a consultar (PLAN_REINTENTO_EMISION_CONFIRMADO_v0.1 §2.2): la de creacion y, si el
 * documento tiene mas de 7 dias, tambien los ultimos 7 dias, porque un reintento manual
 * posterior pudo haber creado el documento en FE fuera de la primera ventana.
 */
export function ventanasIdempotencia(createdAt: Date, now: Date): Array<{ from: Date; to: Date }> {
  const from = new Date(createdAt.getTime() - MARGEN_IDEMPOTENCIA_MS);
  const to = new Date(Math.min(now.getTime(), from.getTime() + VENTANA_IDEMPOTENCIA_MS));
  const ventanas = [{ from, to }];
  if (now.getTime() - createdAt.getTime() > VENTANA_IDEMPOTENCIA_MS) {
    ventanas.push({ from: new Date(now.getTime() - VENTANA_IDEMPOTENCIA_MS), to: now });
  }
  return ventanas;
}

export interface RetryEmisionDeps {
  /** Gateway con la clave de consumidor del facturador: `/conciliacion/idempotency` la exige. */
  consumerGateway: FiscalGateway;
  /** Gateway con la clave compartida: `/documentos/:uuid/sifen` la exige. */
  sharedGateway: FiscalGateway;
  feEnv: "test" | "prod";
  now?: () => Date;
}

/**
 * "Reintentar emision" (SPEC_REINTENTO_EMISION_CONFIRMADO_v0.1): solo para documentos que FE
 * nunca recibio, y solo despues de que FE lo confirme por idempotencia. Nunca reencola a ciegas.
 */
export async function retryDocumentoEmission(
  context: OperationalContextResponse,
  documentoId: string,
  repository: FacturaRepository,
  deps: RetryEmisionDeps
): Promise<DocumentoResponse> {
  const documento = await getDocumentoById(context, documentoId, repository);

  // RN-05: un documento con identidad fiscal ya llego a FE.
  if (!puedeReintentarEmision(documento)) {
    if (documento.document_uuid || documento.cdc) {
      throw new HttpError(
        409,
        "CONFLICT",
        "Este documento ya fue recibido por facturacion electronica. Usa 'Verificar estado fiscal'."
      );
    }
    throw new HttpError(409, "CONFLICT", "Solo documentos con error temporal o pendiente SIFEN pueden reintentarse.");
  }

  const idempotencyKey = documento.external_ref;
  if (!idempotencyKey) {
    throw new HttpError(409, "CONFLICT", "No pudimos confirmar la emision de esta factura. Contacta a soporte.", {
      motivo: "REQUIERE_SOPORTE",
      result: "SIN_IDEMPOTENCY_KEY"
    });
  }

  const confirmacion = await confirmarRecepcionFiscal(context, documento, idempotencyKey, deps);

  if (confirmacion.result === "NOT_IMPACTED") {
    const retried = await repository.retryPendingEmission({
      facturadorId: context.facturador.id,
      documentoId,
      requestedBy: context.user.id
    });
    if (!retried) {
      throw new HttpError(409, "CONFLICT", "La emision ya se esta procesando. Espera unos segundos y verifica el estado.");
    }
    return withAccion(retried);
  }

  if (confirmacion.result === "IMPACTED" && confirmacion.item?.document_uuid) {
    const item = confirmacion.item;
    const adoptado = await repository.adoptarDocumentoFiscalExistente({
      facturadorId: context.facturador.id,
      documentoId,
      requestedBy: context.user.id,
      documentUuid: item.document_uuid as string,
      fiscalDocumentId: item.document_id,
      cdc: item.current_cdc,
      numeroFiscal: item.nro_factura,
      fiscalStatus: {
        action: "ADOPTED_FROM_IDEMPOTENCY",
        requested_by: context.user.id,
        idempotency: { ...item }
      }
    });
    if (!adoptado) {
      throw new HttpError(409, "CONFLICT", "El documento cambio mientras se procesaba. Recarga y verifica el estado.");
    }

    try {
      const refrescado = await refreshFiscalStatusForDocumento(context.facturador.id, documentoId, repository, deps.sharedGateway);
      return withAccion(refrescado);
    } catch (error) {
      // El documento ya quedo adoptado y agendado: el worker lo verifica en 5 minutos.
      logger.warn({ err: error, documentoId }, "reintento de emision: refresh posterior a la adopcion fallo");
      return withAccion(adoptado);
    }
  }

  // DUPLICATE_CONFLICT, INVALID_KEY o IMPACTED sin uuid: no hay forma segura de seguir (RN-04).
  throw new HttpError(409, "CONFLICT", "No pudimos confirmar la emision de esta factura. Contacta a soporte.", {
    motivo: "REQUIERE_SOPORTE",
    result: confirmacion.result,
    idempotency_key: idempotencyKey
  });
}

async function confirmarRecepcionFiscal(
  context: OperationalContextResponse,
  documento: DocumentoResponse,
  idempotencyKey: string,
  deps: RetryEmisionDeps
): Promise<{ result: FiscalIdempotencyReconciliationItemResult; item: FiscalIdempotencyReconciliationItem | null }> {
  const now = deps.now?.() ?? new Date();
  const createdAt = documento.created_at ? new Date(documento.created_at) : now;

  for (const ventana of ventanasIdempotencia(createdAt, now)) {
    let item: FiscalIdempotencyReconciliationItem | undefined;
    try {
      const response = await deps.consumerGateway.reconcileByIdempotencyKeys({
        emisorId: context.facturador.emisor_id,
        env: deps.feEnv,
        from: ventana.from.toISOString(),
        to: ventana.to.toISOString(),
        idempotencyKeys: [idempotencyKey]
      });
      item = response.items.find((candidato) => candidato.idempotency_key === idempotencyKey);
    } catch (error) {
      if (error instanceof FiscalGatewayError) {
        logger.warn({ documentoId: documento.id, gateway_code: error.code }, "reintento de emision: conciliacion por idempotencia no disponible");
        throw new HttpError(
          503,
          "INTERNAL_ERROR",
          "No pudimos confirmar con facturacion electronica si la factura llego. Intenta de nuevo en unos minutos.",
          { motivo: "CONFIRMACION_NO_DISPONIBLE", gateway_code: error.code }
        );
      }
      throw error;
    }

    if (!item) {
      throw new HttpError(
        503,
        "INTERNAL_ERROR",
        "No pudimos confirmar con facturacion electronica si la factura llego. Intenta de nuevo en unos minutos.",
        { motivo: "CONFIRMACION_NO_DISPONIBLE", gateway_code: "INVALID_RESPONSE" }
      );
    }
    if (item.result !== "NOT_IMPACTED") {
      return { result: item.result, item };
    }
  }

  return { result: "NOT_IMPACTED", item: null };
}

/**
 * Errores de evento que FE devuelve como 409. Traducirlos importa: envolverlos en un 502 generico
 * oculta el detalle util antes de que llegue a quien opera (checklist de FE, punto 5).
 * `EVENT_ALREADY_EXISTS` es el caso mas claro: significa que la factura YA esta anulada.
 */
const ERRORES_EVENTO: Record<string, { status: number; mensaje: string }> = {
  EVENT_ALREADY_EXISTS: { status: 409, mensaje: "La factura ya esta anulada en SIFEN." },
  EVENT_IN_PROGRESS: { status: 409, mensaje: "Hay una anulacion en curso para esta factura. Espera unos segundos y volve a consultar." },
  CANCEL_WINDOW_EXPIRED: { status: 409, mensaje: "Pasó el plazo para anular desde la aprobación (48 horas la factura, 168 horas la nota de remisión)." },
  INVALID_DOCUMENT_STATUS: { status: 409, mensaje: "El documento no esta aprobado en SIFEN, asi que no se puede anular." }
};

function codigoErrorEvento(error: FiscalGatewayError): string | null {
  const detalles = error.details as { body?: { error?: unknown } } | null | undefined;
  const codigo = detalles?.body?.error;
  return typeof codigo === "string" && codigo in ERRORES_EVENTO ? codigo : null;
}

export async function cancelDocumento(
  context: OperationalContextResponse,
  documentoId: string,
  input: { motivo: string; reintentar?: boolean },
  repository: FacturaRepository,
  gateway: FiscalGateway
): Promise<DocumentoResponse> {
  const motivo = input.motivo.trim();
  if (!motivo) {
    throw new HttpError(400, "VALIDATION_ERROR", "Motivo de cancelacion requerido.");
  }

  const documento = await getDocumentoById(context, documentoId, repository);

  // SPEC_NOTA_REMISION_v0.1 RN-26: la nota de remision tambien se anula (FE admite 168 horas para ella).
  if ((documento.tipo !== "FACTURA" && documento.tipo !== "NOTA_REMISION") || documento.estado !== "EMITIDA" || !documento.cdc) {
    throw new HttpError(409, "CONFLICT", "Documento no elegible para cancelacion.");
  }

  // SIFEN rechaza ~15% de las cancelaciones de forma no determinista. Un rechazo con
  // `retryable` no bloquea: se reintenta el mismo CDC en el mismo endpoint (SPEC RN-03).
  if (documento.cancelacion?.status === "REJECTED" && !documento.cancelacion.retryable && !input.reintentar) {
    throw new HttpError(409, "CONFLICT", "La anulacion fue rechazada de forma definitiva por SIFEN.", {
      rejection: documento.cancelacion
    });
  }

  try {
    const cancelled = await gateway.cancelFactura({
      emisor_id: context.facturador.emisor_id,
      cdc: documento.cdc,
      motivo
    });

    // RN-01/RN-04: unicamente ACCEPTED anula. REJECTED deja la factura vigente, FAILED la deja
    // indeterminada, y UNKNOWN es un estado que el contrato todavia no define.
    const anula = cancelled.status === "ACCEPTED";

    // Dato pedido por FE para entender el 0100: cuanto paso desde el documento hasta la cancelacion.
    if (cancelled.status === "REJECTED") {
      logger.warn(
        { documentoId, rejection_code: cancelled.rejection?.code ?? null, segundos_desde_creacion: documento.created_at ? Math.round((Date.now() - new Date(documento.created_at).getTime()) / 1000) : null },
        "cancelacion rechazada por SIFEN"
      );
    }

    const updated = await repository.cancelDocumento({
      facturadorId: context.facturador.id,
      documentoId,
      requestedBy: context.user.id,
      anula,
      cancelacion: {
        status: cancelled.status,
        rejectionCode: cancelled.rejection?.code ?? null,
        rejectionMessage: cancelled.rejection?.message ?? null,
        retryable: cancelled.rejection ? cancelled.rejection.retryable : null
      },
      fiscalStatus: {
        ...cancelled.raw,
        event_id: cancelled.event_id,
        cancelacion_motivo: motivo
      }
    });

    if (!updated) {
      throw new HttpError(404, "NOT_FOUND", "Documento no encontrado.");
    }

    return withAccion(updated);
  } catch (error) {
    if (error instanceof FiscalGatewayError) {
      const codigo = codigoErrorEvento(error);
      if (codigo) {
        // Ya esta anulada: se reconcilia el estado local en vez de limitarse a informar el conflicto.
        if (codigo === "EVENT_ALREADY_EXISTS") {
          const reconciliado = await reconciliarCancelacionAceptada(
            context,
            documentoId,
            documento.document_uuid,
            repository,
            gateway
          );
          if (reconciliado) {
            return reconciliado;
          }
        }
        const { status, mensaje } = ERRORES_EVENTO[codigo]!;
        throw new HttpError(status, "CONFLICT", mensaje, { evento: codigo });
      }

      throw new HttpError(
        error.code === "TIMEOUT" ? 504 : 502,
        "INTERNAL_ERROR",
        error.code === "TIMEOUT" ? "Timeout al cancelar documento fiscal." : "No se pudo cancelar documento fiscal.",
        {
          gateway_code: error.code,
          details: error.details ?? null
        }
      );
    }
    throw error;
  }
}

/**
 * Una factura esta anulada SOLO si hay un evento `CANCEL` con `status: ACCEPTED` (RN-01).
 * Mirar solo el `type` es incorrecto: un CANCEL puede estar REJECTED.
 */
async function reconciliarCancelacionAceptada(
  context: OperationalContextResponse,
  documentoId: string,
  documentUuid: string | null,
  repository: FacturaRepository,
  gateway: FiscalGateway
): Promise<DocumentoResponse | null> {
  if (!documentUuid) {
    return null;
  }

  try {
    const eventos = await gateway.getDocumentoEventos(documentUuid);
    const aceptado = eventos.events.find((e) => e.type === "CANCEL" && e.status === "ACCEPTED");
    if (!aceptado) {
      return null;
    }

    const updated = await repository.cancelDocumento({
      facturadorId: context.facturador.id,
      documentoId,
      requestedBy: context.user.id,
      anula: true,
      cancelacion: { status: "ACCEPTED", rejectionCode: null, rejectionMessage: null, retryable: null },
      fiscalStatus: { reconciliado_desde: "eventos", event_id: aceptado.event_id, response: aceptado.response }
    });

    return updated ? withAccion(updated) : null;
  } catch {
    // La reconciliacion es best-effort: si falla, se informa el 409 original.
    return null;
  }
}

export async function getDocumentoEventos(
  context: OperationalContextResponse,
  documentoId: string,
  repository: FacturaRepository,
  gateway: FiscalGateway
): Promise<DocumentoEventosListResponse> {
  assertInternalSupportRole(context, "Historial fiscal avanzado disponible solo para soporte interno.");

  const documento = await getDocumentoById(context, documentoId, repository);
  if (!documento.document_uuid) {
    throw new HttpError(409, "CONFLICT", "Documento sin identidad fiscal canonica. Requiere sincronizacion.");
  }

  try {
    const response = await gateway.getDocumentoEventos(documento.document_uuid);
    return {
      documento_id: documento.id,
      cdc: documento.cdc,
      events: response.events
    };
  } catch (error) {
    if (error instanceof FiscalGatewayError) {
      throw new HttpError(
        error.code === "TIMEOUT" ? 504 : 502,
        "INTERNAL_ERROR",
        error.code === "TIMEOUT" ? "Timeout al consultar historial fiscal." : "No se pudo consultar historial fiscal.",
        {
          gateway_code: error.code,
          details: error.details ?? null
        }
      );
    }
    throw error;
  }
}

export async function getDocumentoDecision(
  context: OperationalContextResponse,
  documentoId: string,
  repository: FacturaRepository,
  gateway: FiscalGateway
): Promise<DocumentoDecisionResponse> {
  assertInternalSupportRole(context, "Autogestion avanzada disponible solo para soporte interno.");

  const documento = await getDocumentoById(context, documentoId, repository);

  try {
    const response = await gateway.getDocumentoDecisionByDocumentId({
      emisorId: context.facturador.emisor_id,
      documentId: documento.fiscal_document_id ?? documento.id
    });

    return {
      documento_id: documento.id,
      emisor_id: response.emisor_id,
      env: response.env,
      cdc: response.cdc,
      nro_factura: response.nro_factura,
      status: response.status,
      transmission_evidence: response.transmission_evidence,
      number_state: response.number_state,
      decision_confidence: response.decision_confidence,
      reason_codes: response.reason_codes,
      recommended_action: response.recommended_action,
      next_step_hint: response.next_step_hint,
      escalation_required: response.escalation_required,
      allowed_actions: response.allowed_actions
    };
  } catch (error) {
    if (error instanceof FiscalGatewayError) {
      throw new HttpError(
        error.code === "TIMEOUT" ? 504 : 502,
        "INTERNAL_ERROR",
        error.code === "TIMEOUT" ? "Timeout al consultar decision operativa." : "No se pudo consultar decision operativa.",
        {
          gateway_code: error.code,
          details: error.details ?? null
        }
      );
    }
    throw error;
  }
}

export async function getBatchPendientesGestion(
  context: OperationalContextResponse,
  input: { limit: number; offset: number },
  gateway: FiscalGateway
): Promise<BatchPendientesGestionResponse> {
  try {
    const response = await gateway.getBatchPendientesByEmisor({
      emisorId: context.facturador.emisor_id,
      limit: input.limit,
      offset: input.offset
    });

    return {
      documents_pending: response.documents.length,
      batches_pending: response.batches.length,
      documents: response.documents,
      batches: response.batches
    };
  } catch (error) {
    if (error instanceof FiscalGatewayError) {
      throw new HttpError(
        error.code === "TIMEOUT" ? 504 : 502,
        "INTERNAL_ERROR",
        error.code === "TIMEOUT"
          ? "Timeout al consultar documentos en espera de confirmacion."
          : "No se pudo consultar documentos en espera de confirmacion.",
        {
          gateway_code: error.code,
          details: error.details ?? null
        }
      );
    }
    throw error;
  }
}

export async function getReconciliacionFiscal(
  context: OperationalContextResponse,
  input: { offset: number; limit: number; q?: string },
  gateway: FiscalGateway,
  repository: FacturaRepository
): Promise<ReconciliacionFiscalResponse> {
  assertInternalSupportRole(context, "Comparar con registro fiscal disponible solo para soporte interno.");

  try {
    const response = await gateway.getFacturalistaByEmisor({
      emisorId: context.facturador.emisor_id,
      offset: input.offset,
      limit: input.limit,
      q: input.q
    });

    // RN-05: actualización oportunista de document_uuid para registros que aún no lo tienen
    const itemsConUuid = response.items.filter(
      (item): item is typeof item & { cdc: string; document_uuid: string } =>
        Boolean(item.document_uuid) && Boolean(item.cdc)
    );
    if (itemsConUuid.length > 0) {
      repository
        .bulkUpdateDocumentUuidByCdc(
          itemsConUuid.map((item) => ({ cdc: item.cdc, documentUuid: item.document_uuid }))
        )
        .catch(() => {
          // fallo en actualización oportunista no bloquea la respuesta
        });
    }

    return {
      items: response.items,
      next: response.next
    };
  } catch (error) {
    if (error instanceof FiscalGatewayError) {
      throw new HttpError(
        error.code === "TIMEOUT" ? 504 : 502,
        "INTERNAL_ERROR",
        error.code === "TIMEOUT" ? "Timeout al comparar con registro fiscal." : "No se pudo comparar con registro fiscal.",
        {
          gateway_code: error.code,
          details: error.details ?? null
        }
      );
    }
    throw error;
  }
}

/**
 * Roles con permisos de soporte interno. Es una lista blanca a proposito: un rol
 * nuevo no debe heredar estos permisos por descarte (SPEC_SEGMENTACION_PERFIL_EMISION §0).
 */
const ROLES_SOPORTE_INTERNO: ReadonlySet<string> = new Set(["SOPORTE_INTERNO", "ADMIN_INTERNO"]);

export function esRolSoporteInterno(role: string): boolean {
  return ROLES_SOPORTE_INTERNO.has(role);
}

function assertInternalSupportRole(context: OperationalContextResponse, message: string): void {
  if (!esRolSoporteInterno(context.user.role)) {
    throw new HttpError(403, "FORBIDDEN", message);
  }
}

function assertWithinWindowOrThrow(documento: DocumentoResponse, maxHours: number, actionLabel: string): void {
  if (!documento.created_at) {
    throw new HttpError(409, "CONFLICT", `${actionLabel} requiere fecha operativa del documento para validar ventana.`);
  }
  const createdAt = new Date(documento.created_at);
  if (Number.isNaN(createdAt.getTime())) {
    throw new HttpError(409, "CONFLICT", `${actionLabel} requiere fecha operativa valida del documento para validar ventana.`);
  }
  const elapsedHours = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60);
  if (elapsedHours > maxHours) {
    throw new HttpError(409, "CONFLICT", `${actionLabel} fuera de ventana operativa (${maxHours}h).`);
  }
}

export async function validateDocumentoCdcImpact(
  context: OperationalContextResponse,
  documentoId: string,
  input: { json_input?: Record<string, unknown> } | undefined,
  repository: FacturaRepository,
  gateway: FiscalGateway
): Promise<DocumentoValidateCdcImpactResponse> {
  assertInternalSupportRole(context, "Autogestion avanzada disponible solo para soporte interno.");
  const documento = await getDocumentoById(context, documentoId, repository);
  assertWithinWindowOrThrow(documento, 72, "Prevalidacion CDC");
  try {
    const response = await gateway.validateDocumentoCdcImpactByDocumentId({
      emisorId: context.facturador.emisor_id,
      documentId: documento.fiscal_document_id ?? documento.id,
      json_input: input?.json_input
    });
    return {
      documento_id: documento.id,
      current_cdc: response.current_cdc,
      candidate_cdc: response.candidate_cdc,
      cdc_impact: response.cdc_impact,
      reason: response.reason,
      allowed_actions: response.allowed_actions
    };
  } catch (error) {
    if (error instanceof FiscalGatewayError) {
      throw new HttpError(error.code === "TIMEOUT" ? 504 : 502, "INTERNAL_ERROR", "No se pudo prevalidar impacto CDC.", {
        gateway_code: error.code,
        details: error.details ?? null
      });
    }
    throw error;
  }
}

type GestionActionInput = {
  mode?: "SYNC" | "BATCH" | "AUTO";
  send_now?: boolean;
  comment?: string;
  json_input?: Record<string, unknown>;
};

export async function retryDocumentoSameCdc(
  context: OperationalContextResponse,
  documentoId: string,
  input: GestionActionInput | undefined,
  repository: FacturaRepository,
  gateway: FiscalGateway
): Promise<DocumentoGestionResendResponse> {
  assertInternalSupportRole(context, "Autogestion avanzada disponible solo para soporte interno.");
  const documento = await getDocumentoById(context, documentoId, repository);
  assertWithinWindowOrThrow(documento, 72, "Reintento con mismo CDC");
  try {
    const response = await gateway.retryDocumentoSameCdcByDocumentId({
      emisorId: context.facturador.emisor_id,
      documentId: documento.fiscal_document_id ?? documento.id,
      ...input
    });
    await repository.appendAuditEvent({
      facturadorId: context.facturador.id,
      documentoId: documento.id,
      requestedBy: context.user.id,
      eventType: "FACTURA_GESTION_RETRY_SAME_CDC",
      metadata: {
        mode: input?.mode ?? null,
        send_now: typeof input?.send_now === "boolean" ? input.send_now : null,
        comment: input?.comment ?? null,
        accepted_by_sifen: response.accepted_by_sifen,
        status: response.status,
        revision_number: response.revision_number,
        queued_for_batch: response.queued_for_batch
      }
    });
    return {
      documento_id: documento.id,
      status: response.status,
      revision_number: response.revision_number,
      accepted_by_sifen: response.accepted_by_sifen,
      cdc: response.cdc,
      queued_for_batch: response.queued_for_batch
    };
  } catch (error) {
    if (error instanceof FiscalGatewayError) {
      throw new HttpError(error.code === "TIMEOUT" ? 504 : 502, "INTERNAL_ERROR", "No se pudo reintentar el documento con el mismo CDC.", {
        gateway_code: error.code,
        details: error.details ?? null
      });
    }
    throw error;
  }
}

export async function createDocumentoDerived(
  context: OperationalContextResponse,
  documentoId: string,
  input: GestionActionInput | undefined,
  repository: FacturaRepository,
  gateway: FiscalGateway
): Promise<DocumentoGestionCreateDerivedResponse> {
  assertInternalSupportRole(context, "Autogestion avanzada disponible solo para soporte interno.");
  const documento = await getDocumentoById(context, documentoId, repository);
  assertWithinWindowOrThrow(documento, 72, "Creacion de DE derivado");
  try {
    const response = await gateway.createDocumentoDerivedByDocumentId({
      emisorId: context.facturador.emisor_id,
      documentId: documento.fiscal_document_id ?? documento.id,
      ...input
    });
    await repository.appendAuditEvent({
      facturadorId: context.facturador.id,
      documentoId: documento.id,
      requestedBy: context.user.id,
      eventType: "FACTURA_GESTION_CREATE_DERIVED",
      metadata: {
        mode: input?.mode ?? null,
        send_now: typeof input?.send_now === "boolean" ? input.send_now : null,
        comment: input?.comment ?? null,
        accepted_by_sifen: response.accepted_by_sifen,
        status: response.status,
        derived_document_id: response.derived_document_id
      }
    });
    return {
      source_document_id: documento.id,
      derived_document_id: response.derived_document_id,
      status: response.status,
      accepted_by_sifen: response.accepted_by_sifen,
      cdc: response.cdc,
      nro_factura: response.nro_factura
    };
  } catch (error) {
    if (error instanceof FiscalGatewayError) {
      throw new HttpError(error.code === "TIMEOUT" ? 504 : 502, "INTERNAL_ERROR", "No se pudo crear DE derivado.", {
        gateway_code: error.code,
        details: error.details ?? null
      });
    }
    throw error;
  }
}

export async function cancelDocumentoSend(
  context: OperationalContextResponse,
  documentoId: string,
  input: { comment?: string } | undefined,
  repository: FacturaRepository,
  gateway: FiscalGateway
): Promise<DocumentoResponse> {
  const documento = await getDocumentoById(context, documentoId, repository);

  if (documento.estado !== "PENDIENTE_SIFEN" && documento.estado !== "EMITIENDO") {
    throw new HttpError(409, "CONFLICT", "Solo documentos en espera de transmision pueden cancelarse antes del envio.");
  }

  try {
    const response = await gateway.cancelDocumentoSendByDocumentId({
      emisorId: context.facturador.emisor_id,
      documentId: documento.fiscal_document_id ?? documento.id,
      comment: input?.comment
    });

    await repository.appendAuditEvent({
      facturadorId: context.facturador.id,
      documentoId: documento.id,
      requestedBy: context.user.id,
      eventType: "FACTURA_GESTION_CANCEL_SEND",
      metadata: {
        comment: input?.comment ?? null,
        previous_status: response.previous_status,
        status: response.status,
        action_result: response.action_result,
        reason_codes: response.reason_codes
      }
    });

    const updated = await repository.updateFiscalStatus({
      facturadorId: context.facturador.id,
      documentoId: documento.id,
      estado: "CANCELADO_LOCAL",
      fiscalStatus: {
        ...response.raw,
        action_result: response.action_result,
        reason_codes: response.reason_codes,
        cancel_send_comment: input?.comment ?? null
      },
      fiscalStatusRaw: response.status
    });

    if (!updated) {
      throw new HttpError(404, "NOT_FOUND", "Documento no encontrado al persistir cancelacion local.");
    }

    return withAccion(updated);
  } catch (error) {
    if (error instanceof FiscalGatewayError) {
      if (error.code === "TRANSMISSION_EVIDENCE_DETECTED") {
        throw new HttpError(409, "CONFLICT", "El documento ya fue enviado a SIFEN. Si fue aprobado, use la opcion de anulacion fiscal.");
      }
      throw new HttpError(
        error.code === "TIMEOUT" ? 504 : 502,
        "INTERNAL_ERROR",
        error.code === "TIMEOUT" ? "Timeout al cancelar envio local." : "No se pudo cancelar el envio local.",
        { gateway_code: error.code, details: error.details ?? null }
      );
    }
    throw error;
  }
}

export async function voidDocumentoNumber(
  context: OperationalContextResponse,
  documentoId: string,
  input: { motivo: string },
  repository: FacturaRepository,
  gateway: FiscalGateway
): Promise<DocumentoGestionVoidResponse> {
  assertInternalSupportRole(context, "Autogestion avanzada disponible solo para soporte interno.");
  const documento = await getDocumentoById(context, documentoId, repository);
  assertWithinWindowOrThrow(documento, 360, "Inutilizacion de numeracion");
  try {
    const response = await gateway.voidDocumentoNumberByDocumentId({
      emisorId: context.facturador.emisor_id,
      documentId: documento.fiscal_document_id ?? documento.id,
      motivo: input.motivo
    });
    await repository.appendAuditEvent({
      facturadorId: context.facturador.id,
      documentoId: documento.id,
      requestedBy: context.user.id,
      eventType: "FACTURA_GESTION_VOID_NUMBER",
      metadata: {
        motivo: input.motivo,
        event_id: response.event_id,
        status: response.status
      }
    });
    return {
      documento_id: documento.id,
      event_id: response.event_id,
      status: response.status
    };
  } catch (error) {
    if (error instanceof FiscalGatewayError) {
      throw new HttpError(error.code === "TIMEOUT" ? 504 : 502, "INTERNAL_ERROR", "No se pudo inutilizar la numeracion.", {
        gateway_code: error.code,
        details: error.details ?? null
      });
    }
    throw error;
  }
}

export async function emitNotaCreditoTotal(
  context: OperationalContextResponse,
  facturaId: string,
  input: { motivo: string },
  repository: FacturaRepository,
  gateway: FiscalGateway,
  // SPEC_NOTA_CREDITO_TRABADA_v0.1, RN-01: la clave del navegador se acepta y se ignora; la deriva el servidor.
  _options: { idempotencyKey?: string } = {}
): Promise<{ documento: DocumentoResponse; reintento: boolean }> {
  const motivo = input.motivo.trim();
  if (!motivo) {
    throw new HttpError(400, "VALIDATION_ERROR", "Motivo de nota de credito requerido.");
  }

  const original = await getDocumentoById(context, facturaId, repository);
  if (original.tipo !== "FACTURA" || original.estado !== "EMITIDA" || !original.cdc) {
    throw new HttpError(409, "CONFLICT", "Factura no elegible para nota de credito.");
  }
  rechazarNotaCreditoInnominada(original);
  if (original.moneda && original.moneda !== "PYG" && !env.FE_NC_MONEDA_EXTRANJERA) {
    // D-1: FE anterior a rc4.27 saldria en guaranies con los precios en la moneda de la factura y consumiria el numero.
    throw new HttpError(409, "CONFLICT", MENSAJE_NOTA_CREDITO_MONEDA_EXTRANJERA, { reason: "NOTA_CREDITO_MONEDA_EXTRANJERA" });
  }
  if ((original.totals?.anticipo ?? 0) > 0) {
    // RN-08: FE no admite la nota total por referencia con anticipo, y las lineas de FS no la reproducen.
    throw new HttpError(409, "CONFLICT", MENSAJE_NOTA_CREDITO_CON_ANTICIPO, { reason: "NOTA_CREDITO_CON_ANTICIPO" });
  }

  // RN-02: a lo sumo una nota viva por factura. Una trabada se reintenta; las rechazadas abren otro intento.
  const notas = await repository.findNotasCreditoByOriginal({ facturadorId: context.facturador.id, documentoId: facturaId });
  const viva = notas.find((nota) => nota.estado !== "RECHAZADA");
  if (viva) {
    if (esNotaTrabada(viva)) {
      return { documento: await reintentarNotaCredito(context, viva, repository, gateway, original), reintento: true };
    }
    // SPEC_NOTA_CREDITO_PARCIAL_v0.1, RN-07: con una nota viva (total o parcial) no se acepta otra total.
    throw new HttpError(409, "CONFLICT", MENSAJE_NOTA_CREDITO_YA_EMITIDA, { reason: "NOTA_CREDITO_YA_EMITIDA" });
  }

  const intento = notas.length + 1;
  const externalRef = buildNotaCreditoExternalRef(context, facturaId, intento);
  const fiscalRequest = buildFiscalNotaCreditoRequest(context, original, motivo, externalRef);
  const clasificacion = await llamarNotaCredito(gateway, fiscalRequest);

  const created = await repository.createNotaCreditoFromFactura({
    tenantId: context.tenant.id,
    actividadPuntoPerfilId: context.actividad_punto_perfil_id,
    facturadorId: context.facturador.id,
    userId: context.user.id,
    original,
    motivo,
    externalRef,
    idempotencyKey: externalRef,
    fiscalRequest,
    fiscalResponse: clasificacion.fiscalResponse,
    fiscalError: clasificacion.fiscalError,
    estado: clasificacion.estado,
    trabada: clasificacion.trabada
  });
  // A-2: nota aprobada en el acto; la NC usa la clave compartida, la misma de `/totales`.
  const conTotales = await guardarTotalesFe(context.facturador.id, created, repository, gateway);
  return { documento: withAccion(conTotales), reintento: false };
}

export const MENSAJE_NOTA_CREDITO_YA_EMITIDA =
  "La factura ya tiene una nota de credito. Si queda saldo, emiti una nota parcial por lo que falta.";
export const MENSAJE_NOTA_CREDITO_SOLO_TOTAL = "Esta factura solo admite nota de credito total.";
export const MENSAJE_NOTA_CREDITO_TRABADA_PENDIENTE =
  "La factura tiene una nota de credito pendiente de reintento. Reintentala antes de emitir otra.";

/** POST /facturas/:id/nota-credito: sin `lineas`, la total de siempre; con `lineas`, la parcial. */
export async function emitNotaCredito(
  context: OperationalContextResponse,
  facturaId: string,
  input: { motivo: string; lineas?: LineaNotaCreditoPedida[] },
  repository: FacturaRepository,
  gateway: FiscalGateway
): Promise<{ documento: DocumentoResponse; reintento: boolean }> {
  if (!input.lineas || input.lineas.length === 0) {
    return emitNotaCreditoTotal(context, facturaId, { motivo: input.motivo }, repository, gateway);
  }
  return { documento: await emitNotaCreditoParcial(context, facturaId, { motivo: input.motivo, lineas: input.lineas }, repository, gateway), reintento: false };
}

/** SPEC_NOTA_CREDITO_PARCIAL_v0.1: nota de credito por lineas y cantidades de la factura. */
export async function emitNotaCreditoParcial(
  context: OperationalContextResponse,
  facturaId: string,
  input: { motivo: string; lineas: LineaNotaCreditoPedida[] },
  repository: FacturaRepository,
  gateway: FiscalGateway
): Promise<DocumentoResponse> {
  const motivo = input.motivo.trim();
  if (!motivo) {
    throw new HttpError(400, "VALIDATION_ERROR", "Motivo de nota de credito requerido.");
  }
  const original = await getDocumentoById(context, facturaId, repository);
  if (original.tipo !== "FACTURA" || original.estado !== "EMITIDA" || !original.cdc) {
    throw new HttpError(409, "CONFLICT", "Factura no elegible para nota de credito.");
  }
  rechazarNotaCreditoInnominada(original);
  if (original.moneda && original.moneda !== "PYG" && !env.FE_NC_MONEDA_EXTRANJERA) {
    // RN-04 (D-4): misma bandera que la total.
    throw new HttpError(409, "CONFLICT", MENSAJE_NOTA_CREDITO_MONEDA_EXTRANJERA, { reason: "NOTA_CREDITO_MONEDA_EXTRANJERA" });
  }
  if ((original.totals?.anticipo ?? 0) > 0) {
    throw new HttpError(409, "CONFLICT", MENSAJE_NOTA_CREDITO_CON_ANTICIPO, { reason: "NOTA_CREDITO_CON_ANTICIPO" });
  }
  if (original.totals?.nota_credito_por_referencia) {
    // RN-03: FS no puede reproducir las lineas de una factura de carga con descuento o exonerado.
    throw new HttpError(409, "CONFLICT", MENSAJE_NOTA_CREDITO_SOLO_TOTAL, { reason: "NOTA_CREDITO_SOLO_TOTAL" });
  }

  const notas = await repository.findNotasCreditoByOriginal({ facturadorId: context.facturador.id, documentoId: facturaId });
  if (notas.some((nota) => nota.estado !== "RECHAZADA" && esNotaTrabada(nota))) {
    // D-2: una trabada puede terminar aprobada; otra encima podria pasarse del total.
    throw new HttpError(409, "CONFLICT", MENSAJE_NOTA_CREDITO_TRABADA_PENDIENTE, { reason: "NOTA_CREDITO_TRABADA" });
  }

  // RN-06: el saldo se calcula aca, no se confia en la pantalla.
  const saldos = saldoAcreditablePorLinea(original, notas);
  const errores = validarLineasPedidas(input.lineas, saldos);
  if (errores.length > 0) {
    throw new HttpError(400, "VALIDATION_ERROR", "Las lineas de la nota de credito no son validas.", { lineas: errores });
  }

  const { items, totals } = armarLineasNotaCredito(original, input.lineas);
  const intento = notas.length + 1;
  const externalRef = buildNotaCreditoExternalRef(context, facturaId, intento);
  const fiscalRequest = buildFiscalNotaCreditoRequest(context, original, motivo, externalRef, { items, totals });
  const clasificacion = await llamarNotaCredito(gateway, fiscalRequest);

  const created = await repository.createNotaCreditoFromFactura({
    tenantId: context.tenant.id,
    actividadPuntoPerfilId: context.actividad_punto_perfil_id,
    facturadorId: context.facturador.id,
    userId: context.user.id,
    original,
    motivo,
    externalRef,
    idempotencyKey: externalRef,
    items,
    totals,
    fiscalRequest,
    fiscalResponse: clasificacion.fiscalResponse,
    fiscalError: clasificacion.fiscalError,
    estado: clasificacion.estado,
    trabada: clasificacion.trabada
  });
  const conTotales = await guardarTotalesFe(context.facturador.id, created, repository, gateway);
  return withAccion(conTotales);
}

export interface NotaCreditoSaldoResponse {
  moneda: string;
  /** La total se ofrece solo sin notas vivas (RN-07). */
  admite_total: boolean;
  /** La parcial, con saldo, sin trabadas y sin `nota_credito_por_referencia` (RN-03, D-2). */
  admite_parcial: boolean;
  motivo_no_parcial: string | null;
  lineas: SaldoLinea[];
}

/** GET /facturas/:id/nota-credito/saldo: lo que la ventana de nota de credito necesita para ofrecer total o parcial. */
export async function getNotaCreditoSaldo(
  context: OperationalContextResponse,
  facturaId: string,
  repository: FacturaRepository
): Promise<NotaCreditoSaldoResponse> {
  const original = await getDocumentoById(context, facturaId, repository);
  if (original.tipo !== "FACTURA") {
    throw new HttpError(409, "CONFLICT", "Solo una factura puede originar nota de credito.");
  }
  const notas = await repository.findNotasCreditoByOriginal({ facturadorId: context.facturador.id, documentoId: facturaId });
  const vivas = notas.filter((nota) => nota.estado !== "RECHAZADA");
  const lineas = saldoAcreditablePorLinea(original, notas);
  const motivoNoParcial = original.totals?.nota_credito_por_referencia
    ? MENSAJE_NOTA_CREDITO_SOLO_TOTAL
    : vivas.some((nota) => esNotaTrabada(nota))
      ? MENSAJE_NOTA_CREDITO_TRABADA_PENDIENTE
      : !tieneSaldo(lineas)
        ? "La factura ya esta acreditada por completo."
        : null;
  return {
    moneda: original.moneda ?? "PYG",
    admite_total: vivas.length === 0,
    admite_parcial: motivoNoParcial === null,
    motivo_no_parcial: motivoNoParcial,
    lineas
  };
}

/**
 * SPEC_NOTA_CREDITO_TRABADA_v0.1, RN-05: vuelve a llamar a FE con la MISMA clave y los mismos datos.
 * Con `segel-rc4` FE completa la nota con el mismo numero; sin el, responde el mismo estado (RN-11).
 */
export async function reintentarNotaCredito(
  context: OperationalContextResponse,
  nota: DocumentoResponse,
  repository: FacturaRepository,
  gateway: FiscalGateway,
  originalCargada?: DocumentoResponse
): Promise<DocumentoResponse> {
  if (!esNotaTrabada(nota) || !nota.documento_relacionado_id || !nota.external_ref) {
    throw new HttpError(409, "CONFLICT", "La nota de credito no esta pendiente de reintento.");
  }
  const original = originalCargada ?? (await getDocumentoById(context, nota.documento_relacionado_id, repository));
  // SPEC_NOTA_CREDITO_PARCIAL_v0.1: una parcial se reintenta con sus mismas lineas y la misma clave.
  const parcial = esNotaParcial(nota, original) ? { items: nota.items, totals: nota.totals } : undefined;
  const fiscalRequest = buildFiscalNotaCreditoRequest(context, original, nota.nce_motivo ?? "", nota.external_ref, parcial);
  const clasificacion = await llamarNotaCredito(gateway, fiscalRequest);
  const actualizada = await repository.updateNotaCreditoTrasReintento({
    facturadorId: context.facturador.id,
    documentoId: nota.id,
    estado: clasificacion.estado,
    fiscalResponse: clasificacion.fiscalResponse,
    fiscalError: clasificacion.fiscalError,
    trabada: clasificacion.trabada
  });
  if (!actualizada) {
    throw new HttpError(404, "NOT_FOUND", "Nota de credito no encontrada.");
  }
  logger.info({ documentoId: nota.id, estado: actualizada.estado, trabada: clasificacion.trabada }, "nota de credito: reintento con la misma clave");
  return withAccion(actualizada);
}

export async function reintentarNotaCreditoPorId(
  context: OperationalContextResponse,
  notaId: string,
  repository: FacturaRepository,
  gateway: FiscalGateway
): Promise<DocumentoResponse> {
  const nota = await getDocumentoById(context, notaId, repository);
  return reintentarNotaCredito(context, nota, repository, gateway);
}

async function llamarNotaCredito(gateway: FiscalGateway, request: FiscalEmitNotaCreditoRequest): Promise<ClasificacionNotaCredito> {
  try {
    return normalizarCorreoNotaCredito(clasificarRespuestaNotaCredito(await gateway.emitNotaCredito(request)), request);
  } catch (error) {
    if (error instanceof FiscalGatewayError) {
      return clasificarRespuestaNotaCredito(error);
    }
    throw error;
  }
}

/**
 * SPEC_CORRECCIONES_ENSAYO_VOLUMEN_v0.1, CEV-3: el correo de la nota de credito se trata como el de la
 * factura. Si FE no informa el estado (FE anterior a 1fcb1bf) y el comprador tiene correo, queda PENDING:
 * la consulta del detalle lo resuelve a SENT, FAILED o NOT_APPLICABLE. Nunca queda UNKNOWN.
 */
export function normalizarCorreoNotaCredito(
  clasificacion: ClasificacionNotaCredito,
  request: Pick<FiscalEmitNotaCreditoRequest, "cliente">
): ClasificacionNotaCredito {
  const respuesta = clasificacion.fiscalResponse;
  if (!respuesta || (respuesta.email_status !== "UNKNOWN" && respuesta.email_status !== "DELEGATED")) return clasificacion;
  const tieneCorreo = Boolean(request.cliente?.email?.trim());
  return { ...clasificacion, fiscalResponse: { ...respuesta, email_status: tieneCorreo ? "PENDING" : "NOT_APPLICABLE" } };
}

export async function emitFacturaAgainstFiscalGateway(
  context: OperationalContextResponse,
  input: FacturaPreviewInput,
  repository: FacturaRepository,
  gateway: FiscalGateway,
  options: { idempotencyKey?: string; clienteRepository?: ClienteRepository } = {}
): Promise<DocumentoResponse> {
  if (options.idempotencyKey) {
    const existing = await repository.findByIdempotencyKey({
      facturadorId: context.facturador.id,
      idempotencyKey: options.idempotencyKey
    });

    if (existing) {
      if (existing.estado === "PENDIENTE_SIFEN") {
        return tryRefreshSilently(context, existing, repository, gateway);
      }
      return existing;
    }
  }

  const resolvedInput = await resolveFacturaInputCliente(context, input, options.clienteRepository);
  const preview = previewFactura(context, resolvedInput);
  const externalRef = buildExternalRef(context, options.idempotencyKey);
  const fiscalRequest = buildFiscalEmitRequest(context, resolvedInput, preview, externalRef);

  let fiscalResponse: FiscalEmitFacturaResponse | null = null;
  let fiscalError: Record<string, unknown> | null = null;
  let estado: DocumentoEstado = "EMITIENDO";

  try {
    fiscalResponse = await gateway.emitFactura(fiscalRequest);
    estado = fiscalResponse.estado;
  } catch (error) {
    if (error instanceof FiscalGatewayError) {
      estado = error.code === "TIMEOUT" ? "PENDIENTE_SIFEN" : "ERROR_TEMPORAL";
      fiscalError = {
        code: error.code,
        message: error.message,
        details: error.details ?? null
      };
    } else {
      throw error;
    }
  }

  return repository.createFromEmission({
    tenantId: context.tenant.id,
    actividadPuntoPerfilId: context.actividad_punto_perfil_id,
    facturadorId: context.facturador.id,
    userId: context.user.id,
    externalRef,
    idempotencyKey: options.idempotencyKey,
    input: resolvedInput,
    preview,
    fiscalRequest: fiscalRequest as unknown as Record<string, unknown>,
    fiscalResponse,
    fiscalError,
    estado
  });
}

export async function enqueueFacturaEmission(
  context: OperationalContextResponse,
  input: FacturaPreviewInput,
  repository: FacturaRepository,
  options: {
    idempotencyKey?: string;
    clienteRepository?: ClienteRepository;
    contextRepository?: OperationalContextRepository;
    /** SPEC_CORRECCION_INUTILIZACION_RECHAZADAS_v0.1, RN-A1. */
    corrigeDocumentoId?: string | null;
  } = {}
): Promise<DocumentoResponse> {
  if (options.idempotencyKey) {
    const existing = await repository.findByIdempotencyKey({
      facturadorId: context.facturador.id,
      idempotencyKey: options.idempotencyKey
    });

    if (existing) {
      return withAccion(existing);
    }
  }

  // SPEC_CARGA_MASIVA_FACTURAS_v0.1 RN-22: en este punto el numero lo pone el archivo del
  // cliente. Una factura con numeracion de FE usaria el mismo numerador y los cruzaria.
  if (context.fiscal_context.numeracion_facturas === "CLIENTE") {
    throw new HttpError(
      409,
      "CONFLICT",
      "Este punto de expedicion emite facturas solo por carga de archivo. Usa Carga masiva, en Documentos.",
      { reason: "NUMERACION_DEL_CLIENTE" }
    );
  }

  const documentoRelacionadoId = options.corrigeDocumentoId
    ? await validarCorreccion(context, options.corrigeDocumentoId, repository)
    : null;

  const resolvedInput = await resolveFacturaInputCliente(context, input, options.clienteRepository);
  const preview = previewFactura(context, resolvedInput);
  const externalRef = buildExternalRef(context, options.idempotencyKey);
  const fiscalRequest = buildFiscalEmitRequest(context, resolvedInput, preview, externalRef);

  const created = await repository.createQueuedEmission({
    tenantId: context.tenant.id,
    actividadPuntoPerfilId: context.actividad_punto_perfil_id,
    facturadorId: context.facturador.id,
    userId: context.user.id,
    externalRef,
    idempotencyKey: options.idempotencyKey,
    input: resolvedInput,
    preview,
    fiscalRequest,
    documentoRelacionadoId
  });

  await persistTipoTransaccionDefault(context, resolvedInput.tipo_transaccion, options.contextRepository);

  return withAccion(created);
}

/** SPEC_CORRECCION_INUTILIZACION_RECHAZADAS_v0.1, RN-A2: solo una factura rechazada o con error, sin correccion. */
async function validarCorreccion(
  context: OperationalContextResponse,
  documentoId: string,
  repository: FacturaRepository
): Promise<string> {
  const original = await repository.findById({ facturadorId: context.facturador.id, documentoId });
  if (original?.corregida_por) {
    throw new HttpError(
      409,
      "CONFLICT",
      `Esta factura ya se corrigió con la factura ${original.corregida_por.numero_fiscal ?? "nueva"}.`,
      { reason: "CORRECCION_EXISTENTE" }
    );
  }
  if (!original || original.tipo !== "FACTURA" || (original.estado !== "RECHAZADA" && original.estado !== "ERROR_OPERATIVO")) {
    throw new HttpError(409, "CONFLICT", "Solo se corrige una factura rechazada o con error.", {
      reason: "CORRECCION_NO_ADMITIDA"
    });
  }
  return original.id;
}

/** Mensajes simples para los 409 de `/v1/evento/inutilizacionnumfactura` (RN-B5). */
const MENSAJES_INUTILIZACION: Record<string, string> = {
  EVENT_IN_PROGRESS: "Ya hay una inutilización de este número en curso. Espere unos minutos y vuelva a revisar.",
  RANGE_ALREADY_USED: "SIFEN tiene un documento aprobado con este número: no se puede inutilizar.",
  RANGE_POSSIBLY_CONSUMED:
    "El servicio fiscal todavía no confirmó el rechazo de este número. Verifique el estado fiscal y vuelva a intentar."
};

/**
 * SPEC_CORRECCION_INUTILIZACION_RECHAZADAS_v0.1, fase B. Inutiliza el numero de una factura rechazada
 * con la ruta de FE de clave compartida (D-1): emisor, establecimiento, punto y numero salen de la
 * factura guardada; del operador solo se toma el motivo (RN-B2).
 */
export async function inutilizarNumeroFactura(
  context: OperationalContextResponse,
  documentoId: string,
  input: { motivo: string },
  repository: FacturaRepository,
  gateway: FiscalGateway
): Promise<DocumentoResponse> {
  const documento = await getDocumentoById(context, documentoId, repository);
  if (!puedeInutilizar(documento)) {
    throw new HttpError(
      409,
      "CONFLICT",
      documento.inutilizacion?.status === "ACCEPTED"
        ? "El número de esta factura ya está inutilizado."
        : "Solo se inutiliza el número de una factura rechazada por SIFEN.",
      { reason: "INUTILIZACION_NO_ADMITIDA" }
    );
  }
  const numeracion = leerNumeracionDelCdc(documento.cdc);
  const numero = numeroComparable(documento.numero_fiscal);
  // SPEC_NOTA_REMISION_v0.1 RN-26: el CDC de una NRE empieza con 07 y se inutiliza con tipoDocumento "NRE".
  const tipoCdcEsperado = documento.tipo === "NOTA_REMISION" ? "07" : "01";
  if (!numeracion || numeracion.tipo !== tipoCdcEsperado || !mismoEmisor(context.facturador.emisor_id, numeracion) || numeracion.numero !== numero) {
    throw new HttpError(409, "CONFLICT", "No se pudo identificar el número fiscal de esta factura. Contacte a soporte.", {
      reason: "NUMERACION_NO_IDENTIFICADA"
    });
  }

  const registrar = async (
    status: "ACCEPTED" | "REJECTED" | "FAILED",
    eventoId: string | null,
    rejection: { code: string | null; message: string | null } = { code: null, message: null }
  ): Promise<DocumentoResponse> => {
    const actualizado = await repository.registrarInutilizacion({
      facturadorId: context.facturador.id,
      documentoId: documento.id,
      usuarioId: context.user.id,
      status,
      eventoId,
      motivo: input.motivo,
      numero: `${numeracion.establecimiento}-${numeracion.punto}-${numeracion.numero}`,
      rejectionCode: rejection.code,
      rejectionMessage: rejection.message
    });
    if (!actualizado) {
      throw new HttpError(404, "NOT_FOUND", "Documento no encontrado.");
    }
    return withAccion(actualizado);
  };

  let respuesta;
  try {
    respuesta = await gateway.inutilizarNumeracion({
      emisor_id: context.facturador.emisor_id,
      establecimiento: numeracion.establecimiento,
      puntoExpedicion: numeracion.punto,
      desdeNumero: numeracion.numero,
      hastaNumero: numeracion.numero,
      motivo: input.motivo,
      tipoDocumento: documento.tipo === "NOTA_REMISION" ? "NRE" : "FE"
    });
  } catch (error) {
    if (!(error instanceof FiscalGatewayError)) {
      throw error;
    }
    const details = (error.details ?? {}) as { status?: number; body?: Record<string, unknown> | null };
    const body = details.body ?? {};
    const feError = typeof body.error === "string" ? body.error : null;
    if (details.status === 409 && feError === "EVENT_ALREADY_EXISTS") {
      const feDetails = (body.details ?? {}) as Record<string, unknown>;
      const eventoId = feDetails.event_id === undefined || feDetails.event_id === null ? null : String(feDetails.event_id);
      return registrar("ACCEPTED", eventoId);
    }
    if (details.status === 409 || details.status === 422) {
      throw new HttpError(
        409,
        "CONFLICT",
        (feError ? MENSAJES_INUTILIZACION[feError] : undefined) ??
          (typeof body.message === "string" ? body.message : "El servicio fiscal no admitió la inutilización."),
        { reason: "INUTILIZACION_RECHAZADA_POR_FE", fe_error: feError }
      );
    }
    await registrar("FAILED", null);
    throw new HttpError(
      error.code === "TIMEOUT" ? 504 : 502,
      "INTERNAL_ERROR",
      "El servicio fiscal no respondió la inutilización. Puede volver a intentar.",
      { gateway_code: error.code }
    );
  }

  const aceptada = respuesta.status === "VOIDED" || respuesta.status === "ACCEPTED";
  return aceptada
    ? registrar("ACCEPTED", respuesta.event_id)
    : registrar("REJECTED", respuesta.event_id, buscarCodigoSifen(respuesta.sifen));
}

async function persistTipoTransaccionDefault(
  context: OperationalContextResponse,
  tipoTransaccion: 1 | 2 | 3 | undefined,
  contextRepository?: OperationalContextRepository
): Promise<void> {
  if (!contextRepository || !tipoTransaccion) {
    return;
  }

  try {
    await contextRepository.updateTipoTransaccionDefault(context.actividad_punto_perfil_id, tipoTransaccion);
  } catch (error) {
    logger.warn(
      { err: error, actividadPuntoPerfilId: context.actividad_punto_perfil_id },
      "No se pudo persistir tipo_transaccion_default (mejor esfuerzo, no afecta la factura encolada)"
    );
  }
}

/**
 * Backoff del worker de emision fiscal pre-emision (SPEC_CONTROL_REINTENTOS_EMISION_v0.1,
 * incidente AWAPURA 2026-08-14/24): indexado por attempts (1-based, ya incrementado por
 * claimNextPendingEmission antes de fallar). El primer valor (60s) preserva el
 * comportamiento anterior para el caso mas comun (fallo aislado que se autorresuelve).
 */
const EMISION_BACKOFF_SECONDS = [
  60, // intento 1 -> 1m
  5 * 60, // intento 2 -> 5m
  15 * 60, // intento 3 -> 15m
  30 * 60, // intento 4 -> 30m
  60 * 60, // intento 5 -> 1h
  2 * 60 * 60, // intento 6 -> 2h
  4 * 60 * 60, // intento 7 -> 4h
  6 * 60 * 60 // intento 8+ -> 6h (se repite hasta el corte)
];

const HORAS_CORTE_REINTENTO_EMISION = 24;

function nextEmisionBackoffSeconds(attempts: number): number {
  const index = Math.min(Math.max(attempts, 1), EMISION_BACKOFF_SECONDS.length) - 1;
  return EMISION_BACKOFF_SECONDS[index] ?? EMISION_BACKOFF_SECONDS[EMISION_BACKOFF_SECONDS.length - 1]!;
}

export async function processNextQueuedFiscalEmission(
  repository: FacturaRepository,
  gateway: FiscalGateway,
  gatewayWithKey?: (apiKey: string) => FiscalGateway
): Promise<DocumentoResponse | null> {
  const pending = await repository.claimNextPendingEmission();
  if (!pending) {
    return null;
  }

  const effectiveGateway = pending.facturadorApiKey && gatewayWithKey
    ? gatewayWithKey(pending.facturadorApiKey)
    : gateway;

  try {
    // SPEC_NOTA_REMISION_v0.1 RN-23: la nota de remision va a `/v1/nota-remision` y no tiene totales (no se piden).
    const esRemision = (pending.fiscalRequest as { tipo_documento?: string }).tipo_documento === "NOTA_REMISION";
    if (esRemision && !effectiveGateway.emitNotaRemision) {
      throw new FiscalGatewayError("UNAVAILABLE", "El gateway fiscal no admite la nota de remision.");
    }
    const response = esRemision
      ? await effectiveGateway.emitNotaRemision!(pending.fiscalRequest as FiscalEmitNotaRemisionRequest)
      : await effectiveGateway.emitFactura(pending.fiscalRequest as FiscalEmitFacturaRequest);
    const completado = await repository.completePendingEmission({
      outboxId: pending.outboxId,
      documentoId: pending.documentoId,
      response
    });
    if (esRemision) return completado;
    // A-2: aprobada en el acto (sincronico o mock); `gateway` es el de clave compartida, el de `/totales`.
    return completado ? await guardarTotalesFe(pending.facturadorId, completado, repository, gateway) : completado;
  } catch (error) {
    // SPEC_NOTA_REMISION_v0.1 RN-23 y RN-01b: un 4xx de FE a una remision (validacion que FS no reprodujo, o punto sin
    // numerador tipo 7) no se arregla reintentando: queda ERROR_OPERATIVO con el mensaje de FE y sin numero tomado.
    const esRemisionPendiente = (pending.fiscalRequest as { tipo_documento?: string }).tipo_documento === "NOTA_REMISION";
    const statusFe = error instanceof FiscalGatewayError ? (error.details as { status?: number } | undefined)?.status : undefined;
    if (esRemisionPendiente && error instanceof FiscalGatewayError && statusFe && [400, 404, 409, 422].includes(statusFe)) {
      const cuerpo = (error.details as { body?: { message?: unknown; error?: unknown } }).body;
      const mensajeFe = typeof cuerpo?.message === "string" ? cuerpo.message : typeof cuerpo?.error === "string" ? cuerpo.error : error.message;
      return repository.failPendingEmission({
        outboxId: pending.outboxId,
        documentoId: pending.documentoId,
        outboxEstado: "FAILED_PERM",
        estado: "ERROR_OPERATIVO",
        error: {
          code: "VALIDACION_FE",
          message: /numerador/i.test(mensajeFe)
            ? "Este punto de expedición todavía no tiene numeración para notas de remisión. Pedila a Segel."
            : `El servicio fiscal rechazó la nota de remisión: ${mensajeFe}`,
          details: error.details ?? null,
          recoverable: false,
          retry_after_seconds: null,
          suggested_action: "CORREGIR_Y_EMITIR"
        },
        retryAfterSeconds: 0
      });
    }
    if (error instanceof FiscalGatewayError) {
      const ageMs = Date.now() - new Date(pending.documentoCreatedAt).getTime();
      const cutover = ageMs >= HORAS_CORTE_REINTENTO_EMISION * 60 * 60 * 1000;
      // Sobrecarga de FE: la factura no se creo. Se espera lo que indica, sin marcarla como fallida.
      const sobrecarga = error.code === "EMISSION_OVERLOADED" && !cutover;
      const retryAfterSeconds = sobrecarga
        ? Number((error.details as { retry_after_seconds?: number }).retry_after_seconds ?? 5)
        : nextEmisionBackoffSeconds(pending.attempts);

      const updated = await repository.failPendingEmission({
        outboxId: pending.outboxId,
        documentoId: pending.documentoId,
        outboxEstado: cutover ? "FAILED_PERM" : "FAILED_TEMP",
        estado: sobrecarga ? "EMITIENDO" : cutover ? "ERROR_TEMPORAL" : error.code === "TIMEOUT" ? "PENDIENTE_SIFEN" : "ERROR_TEMPORAL",
        error: {
          code: error.code,
          message: error.message,
          details: error.details ?? null,
          recoverable: !cutover,
          retry_after_seconds: cutover ? null : retryAfterSeconds,
          suggested_action: cutover ? "CONTACTAR_SOPORTE" : error.code === "TIMEOUT" ? "REFRESH_OR_RETRY" : "RETRY_EMISSION"
        },
        retryAfterSeconds
      });

      if (updated && !pending.accionNotificadaAt) {
        const { accion, accion_detalle } = deriveAccion(updated);
        if (accion === "REQUIERE_ACCION" || accion === "REQUIERE_SOPORTE") {
          try {
            await notifyAccionRequerida(pending.facturadorId, updated, accion_detalle, accion === "REQUIERE_SOPORTE", repository);
          } catch (notifyError) {
            logger.error({ err: notifyError, documentoId: pending.documentoId }, "outbox emision: fallo al notificar accion requerida");
          }
          await repository.markAccionNotificada(pending.documentoId);
        }
      }

      return updated;
    }
    throw error;
  }
}

function buildFiscalEmitRequest(
  context: OperationalContextResponse,
  input: FacturaPreviewInput,
  preview: FacturaPreviewResponse,
  externalRef: string
): FiscalEmitFacturaRequest {
  return {
    external_ref: externalRef,
    condicion_venta: input.condicion_venta,
    tipo_transaccion: input.tipo_transaccion ?? 2,
    facturador: context.facturador,
    fiscal_context: {
      ...context.fiscal_context,
      credito_plazo_dias: input.credito_plazo_dias ?? context.fiscal_context.credito_plazo_dias,
      fiscal_envio_modo: context.fiscal_context.fiscal_envio_modo ?? "BATCH",
      batch_enabled: context.fiscal_context.batch_enabled ?? true
    },
    cliente: input.cliente,
    items: preview.items,
    totals: preview.totals,
    ...(input.moneda && input.moneda !== "PYG" ? { moneda: input.moneda, tipo_cambio: input.tipo_cambio ?? null } : {})
  };
}

function buildFiscalNotaCreditoRequest(
  context: OperationalContextResponse,
  original: DocumentoResponse,
  motivo: string,
  externalRef: string,
  // SPEC_NOTA_CREDITO_PARCIAL_v0.1: lineas y totales propios; nunca va por referencia (RN-03).
  parcial?: { items: FacturaItemPreview[]; totals: TaxTotals }
): FiscalEmitNotaCreditoRequest {
  if (!original.cdc) {
    throw new HttpError(409, "CONFLICT", "Factura sin CDC fiscal para nota de credito.");
  }

  return {
    external_ref: externalRef,
    facturador: context.facturador,
    fiscal_context: {
      ...context.fiscal_context,
      fiscal_envio_modo: context.fiscal_context.fiscal_envio_modo ?? "BATCH",
      batch_enabled: context.fiscal_context.batch_enabled ?? true
    },
    cliente: original.cliente,
    items: parcial?.items ?? original.items,
    totals: parcial?.totals ?? original.totals,
    motivo,
    factura_referencia: {
      documento_id: original.id,
      cdc: original.cdc,
      numero_fiscal: original.numero_fiscal
    },
    ...(parcial
      ? original.moneda && original.moneda !== "PYG"
        ? { moneda: original.moneda, tipo_cambio: original.tipo_cambio ?? null }
        : {}
      : // SPEC_MONEDA_EXTRANJERA_v0.1, D-1: en otra moneda va por referencia; FE toma moneda y tipo de cambio de la factura.
        original.totals?.nota_credito_por_referencia || (original.moneda && original.moneda !== "PYG")
        ? { por_referencia: true }
        : {})
  };
}

function mergeFiscalStatus(
  current: Record<string, unknown> | null,
  refreshed: Record<string, unknown>
): Record<string, unknown> {
  return {
    ...(current ?? {}),
    ...refreshed
  };
}

async function tryRefreshSilently(
  context: OperationalContextResponse,
  documento: DocumentoResponse,
  repository: FacturaRepository,
  gateway: FiscalGateway
): Promise<DocumentoResponse> {
  if (!documento.document_uuid && !documento.cdc) return documento;
  try {
    return await refreshDocumentoStatus(context, documento.id, repository, gateway);
  } catch {
    return documento;
  }
}

function buildExternalRef(context: OperationalContextResponse, idempotencyKey?: string): string {
  return idempotencyKey
    ? `fac_${crypto.createHash("sha256").update(`${context.facturador.id}:${idempotencyKey}`).digest("hex").slice(0, 32)}`
    : `fac_${crypto.randomUUID()}`;
}

/** SPEC_NOTA_CREDITO_TRABADA_v0.1, RN-01: misma factura y mismo intento dan siempre la misma clave. */
/**
 * SPEC_MONEDA_EXTRANJERA_v0.1, A-2 / RN-07: totales de FE (`gTotSub`) en el formato de FS. `total_sin_iva` sale de
 * `total - iva_total` (no de `gravada_*`). Descuento y anticipo solo si existen, como en la carga.
 */
export function totalesDesdeFe(fe: FiscalDocumentoTotalesResponse, previos?: TaxTotals | null): TaxTotals {
  const t = fe.totales;
  return {
    subtotal: t.bruto || t.total,
    total_sin_iva: redondearMonto(t.total - t.iva_total, fe.moneda),
    iva_5: t.iva_5,
    iva_10: t.iva_10,
    total_iva: t.iva_total,
    total: t.total,
    ...(t.descuento > 0 ? { descuento: t.descuento } : {}),
    ...(t.anticipo > 0 ? { anticipo: t.anticipo } : {}),
    ...(previos?.nota_credito_por_referencia ? { nota_credito_por_referencia: true } : {}),
    redondeo: t.redondeo,
    total_guaranies: fe.total_guaranies,
    fuente: "FE"
  };
}

function redondearMonto(valor: number, moneda: string): number {
  return moneda === "PYG" ? Math.round(valor) : Math.round(valor * 100) / 100;
}

/**
 * A-2: si el documento (factura o nota) esta aprobado y sus totales no son todavia los de FE, los pide a
 * `GET /totales` y los guarda. Nunca falla: si FE no responde, el documento queda con la vista previa y se
 * reintenta en el proximo refresco (RN-07).
 */
export async function guardarTotalesFe(
  facturadorId: string,
  documento: DocumentoResponse,
  repository: FacturaRepository,
  gateway: FiscalGateway
): Promise<DocumentoResponse> {
  if (documento.estado !== "EMITIDA" || !documento.document_uuid) return documento;
  if (documento.tipo !== "FACTURA" && documento.tipo !== "NOTA_CREDITO") return documento;
  if (documento.totals?.fuente === "FE") return documento;
  try {
    const fe = await gateway.getDocumentoTotales(documento.document_uuid);
    if (documento.moneda && fe.moneda !== documento.moneda) {
      logger.warn({ documentoId: documento.id, moneda_fs: documento.moneda, moneda_fe: fe.moneda }, "totales de FE: la moneda difiere; no se guardan");
      return documento;
    }
    const actualizado = await repository.updateTotals({
      facturadorId,
      documentoId: documento.id,
      totals: totalesDesdeFe(fe, documento.totals)
    });
    return actualizado ?? documento;
  } catch (error) {
    logger.warn({ err: error, documentoId: documento.id }, "totales de FE: no se pudieron guardar; se reintenta en el proximo refresco");
    return documento;
  }
}

export function buildNotaCreditoExternalRef(context: OperationalContextResponse, facturaId: string, intento: number): string {
  return `nce_${crypto.createHash("sha256").update(`${context.facturador.id}:${facturaId}:${intento}`).digest("hex").slice(0, 32)}`;
}

/** Superficie interna expuesta solo para tests. */
export const __testingCancelacion = { codigoErrorEvento, ERRORES_EVENTO };
