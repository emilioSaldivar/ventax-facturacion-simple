// Orquestacion del import: preview y apply comparten toda la cadena y difieren solo en el cierre.

import { env } from "../../../config/env";
import { HttpError } from "../../../shared/errors/http-error";
import { buildDiff, computePreviewToken } from "./fe-config.diff";
import { buildImportPlan } from "./fe-config.mapper";
import { parseFeConfig, unwrapValores, type FeConfigFormatHint } from "./fe-config.parser";
import type { ImportRepository } from "./import.repository";
import type { ImportDiff, ImportPlan, ImportSnapshot, ImportTarget, MapperContext, TextosOverrides } from "./import.types";

export interface ImportArchivoInput {
  filename: string;
  format: FeConfigFormatHint;
  content: string;
}

export interface ImportPreviewInput extends ImportArchivoInput {
  target: ImportTarget;
}

export interface ImportApplyInput extends ImportPreviewInput {
  preview_token: string;
  permitir_ambiente_distinto: boolean;
  documento_nro_overrides: Record<string, string>;
  /** Actividad elegida por `ref`, para los contextos sin actividad fija (SPEC v0.2 seccion 6.3). */
  actividad_overrides: Record<string, string>;
  /** Textos visibles de las entidades que se crean (SPEC v0.3 RN-32). */
  textos_overrides?: TextosOverrides;
  /** RN-34: reemplazar los textos visibles existentes por los del archivo. */
  adoptar_textos_archivo?: boolean;
  /** RN-33: obligatoria si el facturador se crea o no tiene clave. Nunca se devuelve ni se audita. */
  api_key?: string;
}

export interface ImportApplyResponse extends ImportDiff {
  aplicado: true;
  tenant_id: string;
  facturador_id: string;
  aplicado_en: string;
  proximos_pasos: string[];
}

/** Lee del entorno lo que el mapper necesita para las validaciones de coherencia. */
export function mapperContextFromEnv(hoy = new Date().toISOString().slice(0, 10)): MapperContext {
  return {
    feApiEnv: env.FE_API_ENV === "prod" ? "prod" : "test",
    feApiBaseUrl: env.FE_API_BASE_URL,
    sendProfileCode: env.FE_SEND_EMISSION_PROFILE_CODE !== false,
    hoy
  };
}

function preparar(input: ImportPreviewInput, ctx: MapperContext) {
  const parsed = parseFeConfig({ filename: input.filename, content: input.content, format: input.format });
  const plan = buildImportPlan(parsed.document, ctx);
  return { parsed, plan };
}

export async function previewFacturadorImport(
  input: ImportPreviewInput,
  deps: { repository: ImportRepository; ctx?: MapperContext }
): Promise<ImportDiff> {
  const ctx = deps.ctx ?? mapperContextFromEnv();
  const { parsed, plan } = preparar(input, ctx);
  const snapshot = await deps.repository.loadSnapshot(input.target, plan.emisor.emisor_id);

  const diff = buildDiff(plan, snapshot, input.target, { nombre: input.filename, formato: parsed.format });
  // La vista previa responde 200 aun con bloqueantes: el operador ve el informe completo.
  return { ...diff, referencias: parsed.referencias };
}

export async function applyFacturadorImport(
  input: ImportApplyInput,
  usuarioId: string,
  deps: { repository: ImportRepository; ctx?: MapperContext }
): Promise<ImportApplyResponse> {
  const ctx = deps.ctx ?? mapperContextFromEnv();
  const { parsed, plan } = preparar(input, ctx);
  const snapshot = await deps.repository.loadSnapshot(input.target, plan.emisor.emisor_id);

  const overrides = validarOverrides(input.documento_nro_overrides, plan, snapshot);
  const actividades = validarActividadOverrides(input.actividad_overrides, plan, snapshot);
  const textos = validarTextosOverrides(input.textos_overrides ?? {}, plan, snapshot);
  const adoptarTextos = input.adoptar_textos_archivo === true;
  const diff = buildDiff(
    plan,
    snapshot,
    input.target,
    { nombre: input.filename, formato: parsed.format },
    overrides.aplicables,
    actividades.aplicables,
    { textos: textos.aplicables, adoptarTextos }
  );

  // El plan viaja al repositorio con actividad y textos ya resueltos: el SQL no decide nada
  // sobre overrides (PLAN v0.2 F6, PLAN v0.3 §1.3).
  const t = textos.aplicables;
  const planEfectivo: ImportPlan = {
    ...plan,
    emisor: { ...plan.emisor, nombre_fantasia: t.nombre_fantasia ?? plan.emisor.nombre_fantasia },
    establecimientos: plan.establecimientos.map((e) => ({ ...e, nombre: t.establecimientos?.[e.codigo] ?? e.nombre })),
    puntos: plan.puntos.map((p) => ({ ...p, nombre: t.puntos?.[`${p.establecimiento_codigo}-${p.codigo}`] ?? p.nombre })),
    contextos: plan.contextos.map((c) => ({
      ...c,
      actividad_codigo: actividades.aplicables[c.ref] ?? c.actividad_codigo,
      alias_operativo: t.contextos?.[c.ref] ?? c.alias_operativo
    }))
  };

  // RN-16: el bloqueo por ambiente se puede forzar, y queda registrado en la auditoria.
  const ambienteForzado =
    input.permitir_ambiente_distinto && diff.bloqueantes.some((b) => b.codigo === "AMBIENTE_DISTINTO");
  const bloqueantes = ambienteForzado
    ? diff.bloqueantes.filter((b) => b.codigo !== "AMBIENTE_DISTINTO")
    : diff.bloqueantes;

  if (bloqueantes.length > 0) {
    throw new HttpError(409, "CONFLICT", "El archivo tiene problemas que impiden aplicarlo.", {
      motivo: "IMPORT_BLOQUEADO",
      bloqueantes
    });
  }

  // RN-33: un facturador sin clave no puede emitir; no se crea ni se deja asi. Se rechaza antes
  // de abrir la transaccion, sin escribir nada.
  const apiKey = input.api_key?.trim() || null;
  if (!apiKey && !snapshot.facturador?.has_api_key) {
    throw new HttpError(422, "VALIDATION_ERROR", "Falta la API key del consumidor FE: es obligatoria para este facturador.", {
      motivo: "API_KEY_REQUERIDA"
    });
  }

  const resultado = await deps.repository.applyImport({
    plan: planEfectivo,
    target: input.target,
    diff,
    previewToken: input.preview_token,
    documentoNroOverrides: overrides.aplicables,
    adoptarTextos,
    apiKey,
    usuarioId,
    archivo: { nombre: input.filename, formato: parsed.format },
    payload: unwrapValores(JSON.parse(JSON.stringify(parsed.document))),
    ambienteForzado,
    recomputeToken: (actual) => computePreviewToken(plan, input.target, actual)
  });

  return {
    ...diff,
    facturador: { ...diff.facturador, has_api_key: true },
    referencias: parsed.referencias,
    advertencias: [...diff.advertencias, ...overrides.advertencias, ...actividades.advertencias, ...textos.advertencias],
    bloqueantes: [],
    puede_aplicar: true,
    aplicado: true,
    ...resultado,
    proximos_pasos: proximosPasos(diff)
  };
}

/**
 * RN-22/RN-25: la actividad solo se puede elegir en contextos NUEVOS de perfiles que no la fijan,
 * y unicamente entre las opciones que el grupo aporta.
 */
function validarActividadOverrides(
  overrides: Record<string, string>,
  plan: ReturnType<typeof buildImportPlan>,
  snapshot: Awaited<ReturnType<ImportRepository["loadSnapshot"]>>
): { aplicables: Record<string, string>; advertencias: ImportDiff["advertencias"] } {
  const aplicables: Record<string, string> = {};
  const advertencias: ImportDiff["advertencias"] = [];

  const ignorar = (perfil: string, valor: string, motivo: string) =>
    advertencias.push({
      nivel: "ADVERTENCIA",
      codigo: "OVERRIDE_IGNORADO",
      mensaje: `Actividad "${valor}" indicada para el perfil "${perfil}": ${motivo}`,
      valor
    });

  for (const [perfil, valor] of Object.entries(overrides ?? {})) {
    const contexto = plan.contextos.find((c) => c.ref === perfil);
    if (!contexto) {
      ignorar(perfil, valor, "el archivo no define ese perfil.");
      continue;
    }
    if (!contexto.actividad_editable) {
      ignorar(perfil, valor, "el perfil ya fija su actividad economica.");
      continue;
    }
    if (!contexto.actividad_opciones.some((o) => o.codigo === valor)) {
      ignorar(perfil, valor, "no esta entre las actividades del grupo de ese perfil.");
      continue;
    }
    const yaExiste = snapshot.contextos.some(
      (x) =>
        x.actividad_codigo === valor &&
        x.establecimiento_codigo === contexto.establecimiento_codigo &&
        x.punto_codigo === contexto.punto_codigo &&
        x.perfil_codigo === contexto.perfil_codigo
    );
    if (yaExiste) {
      ignorar(perfil, valor, "ese contexto ya existe y no se modifica.");
      continue;
    }
    aplicables[perfil] = valor;
  }

  return { aplicables, advertencias };
}

/** Un override sobre un contexto que ya existe se ignora: RN-09 prohibe pisar la numeracion viva. */
function validarOverrides(
  overrides: Record<string, string>,
  plan: ReturnType<typeof buildImportPlan>,
  snapshot: Awaited<ReturnType<ImportRepository["loadSnapshot"]>>
): { aplicables: Record<string, string>; advertencias: ImportDiff["advertencias"] } {
  const aplicables: Record<string, string> = {};
  const advertencias: ImportDiff["advertencias"] = [];

  for (const [perfil, valor] of Object.entries(overrides ?? {})) {
    const contexto = plan.contextos.find((c) => c.ref === perfil);
    if (!contexto) {
      advertencias.push({
        nivel: "ADVERTENCIA",
        codigo: "OVERRIDE_IGNORADO",
        mensaje: `Se indico un numero para el perfil "${perfil}", que el archivo no define.`,
        valor
      });
      continue;
    }
    const yaExiste = snapshot.contextos.some(
      (x) =>
        x.actividad_codigo === contexto.actividad_codigo &&
        x.establecimiento_codigo === contexto.establecimiento_codigo &&
        x.punto_codigo === contexto.punto_codigo &&
        x.perfil_codigo === contexto.perfil_codigo
    );
    if (yaExiste) {
      advertencias.push({
        nivel: "ADVERTENCIA",
        codigo: "OVERRIDE_IGNORADO",
        mensaje: `El contexto "${perfil}" ya existe: su numeracion no se modifica.`,
        valor
      });
      continue;
    }
    aplicables[perfil] = valor;
  }

  return { aplicables, advertencias };
}

/**
 * RN-32: los textos visibles solo se editan en entidades que se crean. Un override sobre una
 * entidad existente, o sobre una que el archivo no define, se ignora con advertencia.
 */
function validarTextosOverrides(
  textos: TextosOverrides,
  plan: ImportPlan,
  snapshot: ImportSnapshot
): { aplicables: TextosOverrides; advertencias: ImportDiff["advertencias"] } {
  const aplicables: TextosOverrides = {};
  const advertencias: ImportDiff["advertencias"] = [];
  const ignorar = (que: string, valor: string, motivo: string) =>
    advertencias.push({ nivel: "ADVERTENCIA", codigo: "OVERRIDE_IGNORADO", mensaje: `Texto "${valor}" para ${que}: ${motivo}`, valor });

  if (textos.nombre_fantasia !== undefined) {
    if (snapshot.facturador) ignorar("el nombre visible", textos.nombre_fantasia, "el facturador ya existe; se edita en su detalle.");
    else aplicables.nombre_fantasia = textos.nombre_fantasia;
  }

  const porClave = (
    entrada: Record<string, string> | undefined,
    etiqueta: string,
    enPlan: (k: string) => boolean,
    enBase: (k: string) => boolean
  ): Record<string, string> | undefined => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(entrada ?? {})) {
      if (!enPlan(k)) ignorar(`${etiqueta} ${k}`, v, "el archivo no lo define.");
      else if (enBase(k)) ignorar(`${etiqueta} ${k}`, v, "ya existe; se edita en su detalle.");
      else out[k] = v;
    }
    return Object.keys(out).length > 0 ? out : undefined;
  };

  const claveCtx = (c: { actividad_codigo: string; establecimiento_codigo: string; punto_codigo: string; perfil_codigo: string }) =>
    `${c.actividad_codigo}|${c.establecimiento_codigo}|${c.punto_codigo}|${c.perfil_codigo}`;

  aplicables.establecimientos = porClave(
    textos.establecimientos,
    "el establecimiento",
    (k) => plan.establecimientos.some((e) => e.codigo === k),
    (k) => snapshot.establecimientos.some((e) => e.codigo === k)
  );
  aplicables.puntos = porClave(
    textos.puntos,
    "el punto",
    (k) => plan.puntos.some((p) => `${p.establecimiento_codigo}-${p.codigo}` === k),
    (k) => snapshot.puntos.some((p) => `${p.establecimiento_codigo}-${p.codigo}` === k)
  );
  aplicables.contextos = porClave(
    textos.contextos,
    "el contexto",
    (k) => plan.contextos.some((c) => c.ref === k),
    (k) => {
      const c = plan.contextos.find((x) => x.ref === k)!;
      return snapshot.contextos.some((x) => claveCtx(x) === claveCtx(c));
    }
  );

  return { aplicables, advertencias };
}

function proximosPasos(diff: ImportDiff): string[] {
  const pasos: string[] = [];
  pasos.push("Crear el usuario operativo y asignarle un perfil de emision.");
  if (diff.advertencias.some((a) => a.codigo === "TIMBRADO_VENCIDO")) {
    pasos.push("Actualizar el timbrado vencido antes de emitir.");
  }
  return pasos;
}
