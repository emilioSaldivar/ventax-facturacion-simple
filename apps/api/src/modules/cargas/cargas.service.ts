import crypto from "node:crypto";
import { HttpError } from "../../shared/errors/http-error";
import type { OperationalContextResponse } from "../context/context.types";
import {
  FiscalGatewayError,
  type FeCarga,
  type FeCargaComprobanteFiltros,
  type FeCargaErrorDetails,
  type FiscalArtifactResponse,
  type FeCargaLoteLista,
  type FiscalGateway
} from "../fiscal-gateway/fiscal-gateway.types";
import { proximaSincronizacionMs } from "./cargas.mapeo";
import type {
  CargaComprobantesResponse,
  CargaInutilizacionResponse,
  CargaListFilters,
  CargaMasivaListResponse,
  CargaMasivaRecord,
  CargaMasivaResponse,
  CargaRepository
} from "./cargas.types";

export interface CargasDeps {
  repository: CargaRepository;
  /** Gateway con la clave de consumidor del facturador. Sin clave: `SIN_CLAVE_DE_CONSUMIDOR`. */
  gatewayFor: (facturadorId: string) => Promise<FiscalGateway>;
}

const ROLES_INTERNOS = new Set(["SOPORTE_INTERNO", "ADMIN_INTERNO"]);

export function esRolInterno(context: OperationalContextResponse): boolean {
  return ROLES_INTERNOS.has(context.user.role);
}

function noHabilitada(): HttpError {
  return new HttpError(409, "CONFLICT", "La carga por archivo no esta habilitada para este facturador. Contacta a soporte.", {
    reason: "CARGA_MASIVA_NO_HABILITADA_EN_FE"
  });
}

function detallesFe(error: FiscalGatewayError): FeCargaErrorDetails | null {
  const details = error.details as Partial<FeCargaErrorDetails> | undefined;
  return details && typeof details.status === "number" ? (details as FeCargaErrorDetails) : null;
}

/** PLAN 5.3: conserva codigo y mensaje de FE. FE caido o clave invalida es `FE_NO_DISPONIBLE`. */
export function traducirErrorFe(error: unknown): unknown {
  if (!(error instanceof FiscalGatewayError)) return error;
  const fe = detallesFe(error);
  const extra = { fe_code: fe?.fe_code ?? null, ...(fe?.details ?? {}), ...(fe?.retry_after_seconds ? { retry_after_seconds: fe.retry_after_seconds } : {}) };
  const mensaje = fe?.message ?? error.message;

  switch (fe?.status) {
    case 403:
      return new HttpError(403, "FORBIDDEN", mensaje, extra);
    case 404:
      return noHabilitada();
    case 413:
      return new HttpError(413, "PAYLOAD_TOO_LARGE", mensaje, extra);
    case 415:
      return new HttpError(415, "VALIDATION_ERROR", mensaje, extra);
    case 422:
      return new HttpError(422, "VALIDATION_ERROR", mensaje, extra);
    case 429:
      return new HttpError(429, "CONFLICT", mensaje, extra);
    default:
      return new HttpError(502, "INTERNAL_ERROR", "El servicio fiscal no esta disponible en este momento. Intenta de nuevo en unos minutos.", {
        reason: "FE_NO_DISPONIBLE",
        gateway_code: error.code
      });
  }
}

export function toCargaResponse(row: CargaMasivaRecord): CargaMasivaResponse {
  const snap = row.fe_snapshot ?? {};
  return {
    id: row.id,
    fe_carga_id: row.fe_carga_id,
    estado: row.estado,
    nombre_archivo: row.nombre_archivo,
    tamano_bytes: row.tamano_bytes,
    numeracion: row.numeracion,
    totales: row.totales,
    acciones: row.acciones,
    motivos: row.motivos ?? [],
    fechas: {
      recibida_en: snap.recibida_en ?? null,
      validada_en: snap.validada_en ?? null,
      confirmada_en: snap.confirmada_en ?? null,
      iniciada_en: snap.iniciada_en ?? null,
      finalizada_en: snap.finalizada_en ?? null,
      cancelada_en: snap.cancelada_en ?? null
    },
    contexto: {
      perfil: snap.perfil ?? null,
      establecimiento: snap.establecimiento ?? null,
      punto: snap.punto ?? null,
      actividad: snap.actividad ?? null
    },
    subida_por: { id: row.subida_por, display_name: row.subida_por_nombre },
    confirmada_por: row.confirmada_por ? { id: row.confirmada_por, display_name: row.confirmada_por_nombre } : null,
    cancelada_por: row.cancelada_por ? { id: row.cancelada_por, display_name: row.cancelada_por_nombre } : null,
    sincronizada_en: row.sincronizada_en ? new Date(row.sincronizada_en).toISOString() : null,
    sync_error: row.sync_error,
    created_at: new Date(row.created_at).toISOString()
  };
}

/** RN-11, D-12: operador, solo su contexto; rol interno, todo el facturador. */
function puedeVer(context: OperationalContextResponse, carga: CargaMasivaRecord): boolean {
  return esRolInterno(context) || carga.actividad_punto_perfil_id === context.actividad_punto_perfil_id;
}

async function cargaVisible(context: OperationalContextResponse, id: string, repository: CargaRepository): Promise<CargaMasivaRecord> {
  const carga = await repository.findById(id, context.facturador.id);
  if (!carga || !puedeVer(context, carga)) {
    throw new HttpError(404, "NOT_FOUND", "Carga no encontrada.");
  }
  return carga;
}

function yaSubidaEnOtroContexto(): HttpError {
  return new HttpError(
    409,
    "CONFLICT",
    "Este archivo ya fue subido en otro contexto de este facturador. Quien lo subio debe cancelarlo, o contacta a soporte.",
    { reason: "ARCHIVO_YA_SUBIDO_EN_OTRO_CONTEXTO" }
  );
}

function primerSync(feCarga: Pick<FeCarga, "estado" | "confirmada_en" | "acciones">): Date | null {
  return proximaSincronizacionMs(feCarga.estado, feCarga.confirmada_en, Date.now(), feCarga.acciones) === null
    ? null
    : new Date(Date.now() + 5000);
}

export interface SubirCargaInput {
  contenido: Buffer;
  contentType: "text/csv" | "application/zip";
  nombreArchivo?: string;
}

export async function subirCarga(context: OperationalContextResponse, input: SubirCargaInput, deps: CargasDeps): Promise<CargaMasivaResponse> {
  const { repository } = deps;
  const facturadorId = context.facturador.id;
  const sha256 = crypto.createHash("sha256").update(input.contenido).digest("hex");

  // D-13: no molesta a FE con un archivo que FS ya conoce.
  const conocida = await repository.findActivaPorSha(facturadorId, sha256);
  if (conocida) {
    if (!puedeVer(context, conocida)) throw yaSubidaEnOtroContexto();
    await repository.registrarEvento(conocida, context.user.id, "CARGA_SUBIDA", {
      fe_carga_id: conocida.fe_carga_id,
      nombre_archivo: input.nombreArchivo ?? null,
      tamano_bytes: input.contenido.length,
      sha256,
      repetida: true
    });
    return { ...toCargaResponse(conocida), repetida: true };
  }

  const gateway = await deps.gatewayFor(facturadorId);
  const perfil = context.fiscal_context.perfil_emision_codigo;
  const conPerfil = perfil !== "NO_REQUERIDO";
  const pedido = {
    contenido: input.contenido,
    contentType: input.contentType,
    emisorId: context.facturador.emisor_id,
    numeracion: context.fiscal_context.numeracion_facturas ?? "SERVICIO",
    actividadEconomicaCodigo: context.fiscal_context.actividad_economica_codigo,
    nombreArchivo: input.nombreArchivo,
    ...(conPerfil
      ? { emissionProfileCode: perfil }
      : { establecimiento: context.fiscal_context.establecimiento, punto: context.fiscal_context.punto_expedicion })
  };

  let resultado;
  try {
    try {
      resultado = await gateway.crearCarga(pedido);
    } catch (error) {
      // FE reconoce los mismos bytes como la misma carga: reintentar una vez no duplica.
      if (!(error instanceof FiscalGatewayError) || error.code !== "TIMEOUT") throw error;
      resultado = await gateway.crearCarga(pedido);
    }
  } catch (error) {
    throw traducirErrorFe(error);
  }

  const { carga: feCarga, creada } = resultado;
  const existente = creada ? null : await repository.findByFeCargaId(facturadorId, feCarga.carga_id);
  if (existente && !puedeVer(context, existente)) throw yaSubidaEnOtroContexto();

  const fila =
    existente ??
    (await repository.crear({
      tenantId: context.tenant.id,
      facturadorId,
      actividadPuntoPerfilId: context.actividad_punto_perfil_id,
      feCarga,
      tamanoBytes: input.contenido.length,
      sha256,
      subidaPor: context.user.id,
      syncNextAt: primerSync(feCarga)
    }));

  await repository.registrarEvento(fila, context.user.id, "CARGA_SUBIDA", {
    fe_carga_id: feCarga.carga_id,
    nombre_archivo: input.nombreArchivo ?? null,
    tamano_bytes: input.contenido.length,
    sha256,
    repetida: !creada
  });
  return { ...toCargaResponse(fila), repetida: !creada };
}

export async function listarCargas(
  context: OperationalContextResponse,
  filtros: Omit<CargaListFilters, "actividadPuntoPerfilId">,
  deps: Pick<CargasDeps, "repository">
): Promise<CargaMasivaListResponse> {
  const { items, total } = await deps.repository.list(context.facturador.id, {
    ...filtros,
    actividadPuntoPerfilId: esRolInterno(context) ? null : context.actividad_punto_perfil_id
  });
  return { items: items.map(toCargaResponse), total };
}

/** RN-19: si FE falla, devuelve la copia local con la hora de la ultima actualizacion. */
export async function obtenerCarga(context: OperationalContextResponse, id: string, deps: CargasDeps): Promise<CargaMasivaResponse> {
  const carga = await cargaVisible(context, id, deps.repository);
  try {
    const gateway = await deps.gatewayFor(context.facturador.id);
    const feCarga = await gateway.getCarga(carga.fe_carga_id);
    // Una carga confirmada fuera de esta pantalla vuelve a la agenda del worker.
    const volverAAgenda =
      carga.sync_next_at === null && proximaSincronizacionMs(feCarga.estado, feCarga.confirmada_en, Date.now(), feCarga.acciones) !== null;
    await deps.repository.actualizarDesdeFe(carga.id, feCarga, volverAAgenda ? { syncNextAt: new Date() } : {});
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : "Backend fiscal no disponible.";
    await deps.repository.marcarSyncError(carga.id, mensaje);
  }
  return toCargaResponse((await deps.repository.findById(id, context.facturador.id))!);
}

export async function listarComprobantes(
  context: OperationalContextResponse,
  id: string,
  filtros: FeCargaComprobanteFiltros,
  deps: CargasDeps
): Promise<CargaComprobantesResponse> {
  const carga = await cargaVisible(context, id, deps.repository);
  const gateway = await deps.gatewayFor(context.facturador.id);
  let lista;
  try {
    lista = await gateway.listCargaComprobantes(carga.fe_carga_id, filtros);
  } catch (error) {
    throw traducirErrorFe(error);
  }
  const uuids = lista.items.map((item) => item.document_uuid).filter((uuid): uuid is string => Boolean(uuid));
  const documentos = await deps.repository.documentosPorUuid(context.facturador.id, uuids);
  return {
    ...lista,
    carga_id: carga.id,
    items: lista.items.map((item) => ({
      ...item,
      documento_id: item.document_uuid ? documentos.get(item.document_uuid) ?? null : null
    }))
  };
}

type Accion = "confirmar" | "cancelar" | "reintentar";

/** RN-08: la regla de cada accion la decide FE. Fuera de estado, se actualiza la copia local. */
export async function accionSobreCarga(
  context: OperationalContextResponse,
  id: string,
  accion: Accion,
  deps: CargasDeps
): Promise<CargaMasivaResponse> {
  const carga = await cargaVisible(context, id, deps.repository);
  const gateway = await deps.gatewayFor(context.facturador.id);

  let feCarga: FeCarga;
  try {
    feCarga =
      accion === "confirmar"
        ? await gateway.confirmarCarga(carga.fe_carga_id)
        : accion === "cancelar"
          ? await gateway.cancelarCarga(carga.fe_carga_id)
          : await gateway.reintentarCarga(carga.fe_carga_id);
  } catch (error) {
    const fe = error instanceof FiscalGatewayError ? detallesFe(error) : null;
    if (fe?.fe_code === "CARGA_ACCION_NO_ADMITIDA") {
      const estado = fe.details?.estado as FeCarga["estado"] | undefined;
      const acciones = fe.details?.acciones as FeCarga["acciones"] | undefined;
      if (estado && acciones) {
        await deps.repository.actualizarDesdeFe(carga.id, { estado, acciones, totales: carga.totales as FeCarga["totales"], motivos: carga.motivos });
      }
      throw new HttpError(409, "CONFLICT", fe.message ?? "La carga no admite esa accion en su estado actual.", {
        reason: "CARGA_ACCION_NO_ADMITIDA",
        estado,
        acciones
      });
    }
    throw traducirErrorFe(error);
  }

  await deps.repository.actualizarDesdeFe(carga.id, feCarga, {
    ...(accion === "confirmar" ? { confirmadaPor: context.user.id } : {}),
    ...(accion === "cancelar" ? { canceladaPor: context.user.id } : {}),
    // Un cambio de estado se sincroniza enseguida. Una carga cancelada del todo igual hace su ultima pasada.
    syncNextAt: new Date()
  });
  const tipo = accion === "confirmar" ? "CARGA_CONFIRMADA" : accion === "cancelar" ? "CARGA_CANCELADA" : "CARGA_REINTENTADA";
  await deps.repository.registrarEvento(carga, context.user.id, tipo, { fe_carga_id: carga.fe_carga_id, estado: feCarga.estado });
  return toCargaResponse((await deps.repository.findById(id, context.facturador.id))!);
}

/**
 * SPEC_CARGA_ATENCION_COMPROBANTES_v0.1. Inutiliza el numero de un comprobante con atencion. La regla
 * (que comprobante puede, que numero) la decide FE (RN-01). No exige contexto listo: no emite (RN-08).
 */
export async function inutilizarComprobante(
  context: OperationalContextResponse,
  id: string,
  orden: number,
  motivo: string,
  deps: CargasDeps
): Promise<CargaInutilizacionResponse> {
  const carga = await cargaVisible(context, id, deps.repository);
  const gateway = await deps.gatewayFor(context.facturador.id);

  let resultado;
  try {
    resultado = await gateway.inutilizarComprobanteCarga(carga.fe_carga_id, orden, motivo);
  } catch (error) {
    const fe = error instanceof FiscalGatewayError ? detallesFe(error) : null;
    // RN-04: los 409 y el 404 del comprobante traen el codigo de FE; la pantalla los muestra tal cual.
    if (fe?.status === 409) {
      throw new HttpError(409, "CONFLICT", fe.message ?? "No se pudo inutilizar el numero.", {
        reason: fe.fe_code ?? "CONFLICT",
        ...(fe.details ?? {})
      });
    }
    if (fe?.status === 404 && fe.fe_code === "COMPROBANTE_NOT_FOUND") {
      throw new HttpError(404, "NOT_FOUND", "Comprobante no encontrado en la carga.");
    }
    throw traducirErrorFe(error);
  }

  const { comprobante, evento } = resultado;
  await deps.repository.registrarEvento(carga, context.user.id, "CARGA_COMPROBANTE_INUTILIZADO", {
    fe_carga_id: carga.fe_carga_id,
    orden,
    numero: comprobante.inutilizacion?.numero ?? comprobante.atencion?.numero ?? null,
    motivo,
    evento_id: comprobante.inutilizacion?.evento_id ?? (typeof evento.event_id === "string" ? evento.event_id : null),
    evento_estado: comprobante.inutilizacion?.estado ?? (typeof evento.status === "string" ? evento.status : null)
  });

  // La carga puede cerrarse al resolverse el numero: se sincroniza enseguida para mostrarlo.
  try {
    const feCarga = await gateway.getCarga(carga.fe_carga_id);
    await deps.repository.actualizarDesdeFe(carga.id, feCarga, { syncNextAt: new Date() });
  } catch (error) {
    await deps.repository.marcarSyncError(carga.id, error instanceof Error ? error.message : "Backend fiscal no disponible.");
  }

  const documentos = comprobante.document_uuid
    ? await deps.repository.documentosPorUuid(context.facturador.id, [comprobante.document_uuid])
    : new Map<string, string>();
  return {
    evento,
    comprobante: {
      ...comprobante,
      documento_id: comprobante.document_uuid ? documentos.get(comprobante.document_uuid) ?? null : null
    }
  };
}

export async function descargarPlantilla(context: OperationalContextResponse, deps: CargasDeps): Promise<FiscalArtifactResponse> {
  const gateway = await deps.gatewayFor(context.facturador.id);
  try {
    const plantilla = await gateway.getPlantillaCarga();
    return { ...plantilla, filename: "plantilla-carga-facturas.csv" };
  } catch (error) {
    throw traducirErrorFe(error);
  }
}

export async function descargarResultado(context: OperationalContextResponse, id: string, deps: CargasDeps): Promise<FiscalArtifactResponse> {
  const carga = await cargaVisible(context, id, deps.repository);
  const gateway = await deps.gatewayFor(context.facturador.id);
  try {
    const resultado = await gateway.getCargaResultado(carga.fe_carga_id);
    const base = (carga.nombre_archivo ?? carga.fe_carga_id).replace(/\.(csv|zip)$/i, "").replace(/[^\w.-]+/g, "_");
    return { ...resultado, filename: `resultado-${base}.csv` };
  } catch (error) {
    throw traducirErrorFe(error);
  }
}

export async function obtenerLotes(context: OperationalContextResponse, id: string, deps: CargasDeps): Promise<FeCargaLoteLista> {
  if (!esRolInterno(context)) {
    throw new HttpError(403, "FORBIDDEN", "Permiso de soporte requerido.");
  }
  const carga = await cargaVisible(context, id, deps.repository);
  const gateway = await deps.gatewayFor(context.facturador.id);
  try {
    return { ...(await gateway.getCargaLotes(carga.fe_carga_id)), carga_id: carga.id };
  } catch (error) {
    throw traducirErrorFe(error);
  }
}
