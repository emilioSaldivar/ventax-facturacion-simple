// Orquestacion del import: preview y apply comparten toda la cadena y difieren solo en el cierre.

import { env } from "../../../config/env";
import { HttpError } from "../../../shared/errors/http-error";
import { buildDiff, computePreviewToken } from "./fe-config.diff";
import { buildImportPlan } from "./fe-config.mapper";
import { parseFeConfig, unwrapValores, type FeConfigFormatHint } from "./fe-config.parser";
import type { ImportRepository } from "./import.repository";
import type { ImportDiff, ImportTarget, MapperContext } from "./import.types";

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
  /** Actividad elegida por perfil, para los contextos sin actividad fija (SPEC v0.2 seccion 6.3). */
  actividad_overrides: Record<string, string>;
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
  const diff = buildDiff(
    plan,
    snapshot,
    input.target,
    { nombre: input.filename, formato: parsed.format },
    overrides.aplicables,
    actividades.aplicables
  );

  // El plan viaja al repositorio con la actividad ya resuelta: el SQL no decide nada (PLAN v0.2 F6).
  const planEfectivo = {
    ...plan,
    contextos: plan.contextos.map((c) => ({
      ...c,
      actividad_codigo: actividades.aplicables[c.perfil_codigo] ?? c.actividad_codigo
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

  const resultado = await deps.repository.applyImport({
    plan: planEfectivo,
    target: input.target,
    diff,
    previewToken: input.preview_token,
    documentoNroOverrides: overrides.aplicables,
    usuarioId,
    archivo: { nombre: input.filename, formato: parsed.format },
    payload: unwrapValores(JSON.parse(JSON.stringify(parsed.document))),
    ambienteForzado,
    recomputeToken: (actual) => computePreviewToken(plan, input.target, actual)
  });

  return {
    ...diff,
    referencias: parsed.referencias,
    advertencias: [...diff.advertencias, ...overrides.advertencias, ...actividades.advertencias],
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
    const contexto = plan.contextos.find((c) => c.perfil_codigo === perfil);
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
    const contexto = plan.contextos.find((c) => c.perfil_codigo === perfil);
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

function proximosPasos(diff: ImportDiff): string[] {
  const pasos: string[] = [];
  if (diff.advertencias.some((a) => a.codigo === "API_KEY_AUSENTE")) {
    pasos.push("Cargar la API key de FE en el panel del facturador.");
  }
  pasos.push("Crear el usuario operativo y asignarle un perfil de emision.");
  if (diff.advertencias.some((a) => a.codigo === "TIMBRADO_VENCIDO")) {
    pasos.push("Actualizar el timbrado vencido antes de emitir.");
  }
  return pasos;
}
