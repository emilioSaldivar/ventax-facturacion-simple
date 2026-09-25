// Mapeo del documento FE al plan de import, con el catalogo de hallazgos.
//
// Division de responsabilidades (PLAN fase 2): **zod valida forma, el mapper valida negocio.**
// El esquema acepta `null` y ausencia en todo escalar; aca se decide si eso es un problema,
// con que nivel y con que mensaje accionable. Nada de esto toca la base: los bloqueantes que
// dependen del estado (emisor en otro tenant, slug ocupado) los agrega el diff.

import { esVersionSoportada } from "./fe-config.parser";
import type { FeConfigDocument, FeConfigPerfilItem, FeConfigTimbrado } from "./fe-config.contract";
import {
  CREDITO_PLAZO_DIAS_DEFAULT,
  DOCUMENTO_NRO_INICIAL,
  PERMISOS_MINIMOS,
  type ActividadOpcion,
  type Hallazgo,
  type ImportPlan,
  type MapperContext,
  type PlanContexto,
  type TimbradoElegido
} from "./import.types";

const RE_CODIGO_3 = /^[0-9]{3}$/;
const RE_EMISOR_ID = /^[0-9]{3,8}-[0-9]$/;
const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const DIAS_CONTRATO_ANTIGUO = 30;

class Hallazgos {
  private readonly items: Hallazgo[] = [];

  bloqueante(codigo: string, mensaje: string, extra: Partial<Hallazgo> = {}): void {
    this.items.push({ nivel: "BLOQUEANTE", codigo, mensaje, ...extra });
  }

  advertencia(codigo: string, mensaje: string, extra: Partial<Hallazgo> = {}): void {
    this.items.push({ nivel: "ADVERTENCIA", codigo, mensaje, ...extra });
  }

  ignorado(ruta: string, valor: unknown, motivo: string): void {
    this.items.push({ nivel: "IGNORADO", codigo: "SIN_DESTINO", mensaje: motivo, ruta, valor });
  }

  all(): Hallazgo[] {
    return this.items;
  }
}

function texto(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

/** Campo que nuestro modelo exige: si llega vacio es un bloqueante con ruta, no un error de esquema. */
function requerido(value: unknown, ruta: string, etiqueta: string, h: Hallazgos): string | null {
  const t = texto(value);
  if (t === null) {
    h.bloqueante("CAMPO_OBLIGATORIO_VACIO", `${etiqueta} llega vacio en el archivo y es obligatorio.`, {
      ruta,
      sugerencia: "Completar el dato en facturacion-electronica y exportar de nuevo."
    });
  }
  return t;
}

function alias(valor: string | null): string | null {
  return valor === null ? null : valor.slice(0, 100);
}

// ─── RN-07: eleccion del timbrado ─────────────────────────────────────────────

function pickTimbrado(
  timbrados: FeConfigTimbrado[],
  hoy: string,
  hayContextos: boolean,
  h: Hallazgos
): TimbradoElegido | null {
  const vigentes = timbrados.filter((t) => t.vigente === true && texto(t.numero) !== null);

  if (vigentes.length === 0) {
    if (hayContextos) {
      h.bloqueante(
        "TIMBRADO_VIGENTE_AUSENTE",
        "El archivo no trae ningun timbrado vigente y hay contextos operativos para crear.",
        {
          ruta: "$.timbrados",
          sugerencia: "Sin timbrado el operador no puede emitir. Actualizar el timbrado en FE y exportar de nuevo."
        }
      );
    } else {
      h.advertencia("TIMBRADO_VIGENTE_AUSENTE", "El archivo no trae timbrados vigentes; no se modifica el timbrado actual.", {
        ruta: "$.timbrados"
      });
    }
    return null;
  }

  // Determinista: mayor fecha_inicio <= hoy, desempate por mayor fecha_fin, luego por numero.
  const ordenados = [...vigentes].sort((a, b) => {
    const ia = texto(a.fecha_inicio) ?? "";
    const ib = texto(b.fecha_inicio) ?? "";
    const aplicaA = ia !== "" && ia <= hoy;
    const aplicaB = ib !== "" && ib <= hoy;
    if (aplicaA !== aplicaB) return aplicaA ? -1 : 1;
    if (ia !== ib) return ib.localeCompare(ia);
    const fa = texto(a.fecha_fin) ?? "";
    const fb = texto(b.fecha_fin) ?? "";
    if (fa !== fb) return fb.localeCompare(fa);
    return (texto(b.numero) ?? "").localeCompare(texto(a.numero) ?? "");
  });

  const elegido = ordenados[0]!;
  const numero = texto(elegido.numero)!;
  const motivo =
    vigentes.length === 1
      ? "unico timbrado vigente del archivo"
      : "el vigente con fecha de inicio mas reciente que ya aplica";

  if (vigentes.length > 1) {
    h.advertencia("TIMBRADO_VIGENTE_MULTIPLE", `El archivo trae ${vigentes.length} timbrados vigentes; se eligio ${numero}.`, {
      ruta: "$.timbrados",
      valor: vigentes.map((t) => texto(t.numero)),
      sugerencia: "Verificar que sea el que corresponde antes de aplicar."
    });
  }

  const fechaFin = texto(elegido.fecha_fin);
  if (fechaFin !== null && RE_FECHA.test(fechaFin) && fechaFin < hoy) {
    h.advertencia("TIMBRADO_VENCIDO", `El timbrado elegido (${numero}) vencio el ${fechaFin}.`, {
      ruta: "$.timbrados",
      sugerencia: "Se importa igual, pero hay que corregirlo antes de emitir."
    });
  }

  return { numero, fecha_inicio: texto(elegido.fecha_inicio), fecha_fin: fechaFin, motivo };
}

// ─── RN-22 a RN-26: actividad del contexto ────────────────────────────────────

interface ActividadResuelta {
  /** Actividad efectiva con la que se crea el contexto. */
  actividad: string;
  /** true si el perfil no la fija y el operador puede cambiarla en la vista previa. */
  editable: boolean;
  /** Opciones ofrecidas; vacio cuando el perfil fija la actividad. */
  opciones: ActividadOpcion[];
}

/**
 * `actividad_codigo` en null tiene DOS causas y el archivo no dice cual es (`modo_actividad` no se
 * exporta). Lo que las separa en la practica es `grupo_actividades`:
 *
 *   - con grupo  -> perfil de actividad seleccionable: valido, el operador elige (RN-22).
 *   - sin grupo  -> no hay con que construir el contexto: bloquea (RN-26).
 */
function resolverActividad(
  item: FeConfigPerfilItem,
  codigoPerfil: string,
  ruta: string,
  actividades: ImportPlan["actividades"],
  h: Hallazgos
): ActividadResuelta | null {
  const conocidas = new Map(actividades.map((a) => [a.codigo, a.descripcion]));
  const fija = texto(item.actividad_codigo);

  if (fija !== null) {
    if (!conocidas.has(fija)) {
      h.bloqueante("REFERENCIA_INTERNA_ROTA", `El perfil "${codigoPerfil}" referencia la actividad ${fija}, que el archivo no define.`, {
        ruta,
        valor: fija
      });
      return null;
    }
    return { actividad: fija, editable: false, opciones: [] };
  }

  // Grupo declarado por FE, en el orden en que apareceran en el XML (gActEco).
  const grupo = (item.grupo_actividades ?? [])
    .map((g) => texto(g.codigo))
    .filter((c): c is string => c !== null);

  const desconocidas = grupo.filter((c) => !conocidas.has(c));
  for (const c of desconocidas) {
    h.advertencia("ACTIVIDAD_GRUPO_DESCONOCIDA", `La actividad ${c} del grupo del perfil "${codigoPerfil}" no figura entre las actividades del emisor.`, {
      ruta: `${ruta}.grupo_actividades`,
      valor: c,
      sugerencia: "No se ofrece como opcion. Revisar en FE si la actividad esta activa."
    });
  }

  const opciones: ActividadOpcion[] = grupo
    .filter((c) => conocidas.has(c))
    .map((c) => ({ codigo: c, descripcion: conocidas.get(c) ?? null }));

  if (opciones.length === 0) {
    h.bloqueante(
      "REFERENCIA_INTERNA_ROTA",
      `El perfil "${codigoPerfil}" no informa actividad_codigo y no trae un grupo de actividades que la reemplace.`,
      {
        ruta,
        sugerencia:
          "Puede ser un perfil apuntado a una entidad inactiva en FE, o un perfil de actividad seleccionable sin grupo configurado."
      }
    );
    return null;
  }

  // RN-23: la principal del archivo si esta en el grupo; si no, la primera, que es el orden del XML.
  const principal = actividades.find((a) => a.es_principal === true && opciones.some((o) => o.codigo === a.codigo));
  const sugerida = principal?.codigo ?? opciones[0]!.codigo;

  h.advertencia(
    "PERFIL_SIN_ACTIVIDAD_FIJA",
    `El perfil "${codigoPerfil}" no fija una actividad economica: FE la deja a eleccion del consumidor.`,
    {
      ruta,
      valor: opciones.map((o) => o.codigo),
      sugerencia: `Se propone ${sugerida}${principal ? " (la principal del emisor)" : " (la primera del grupo)"}. El contexto queda fijado en la que se elija; para otra, se agrega un contexto nuevo.`
    }
  );

  return { actividad: sugerida, editable: true, opciones };
}

// ─── RN-17: campos del archivo sin destino en nuestro modelo ──────────────────

function reportarIgnorados(doc: FeConfigDocument, h: Hallazgos): void {
  const rutas: Array<[unknown, string, string]> = [
    [doc.servicio?.base_url, "$.servicio.base_url", "La conexion fiscal es global del deployment (FE_API_BASE_URL)."],
    [doc.servicio?.base_path, "$.servicio.base_path", "La conexion fiscal es global del deployment."],
    [doc.servicio?.aviso, "$.servicio.aviso", "Texto informativo del exportador."],
    [doc.contrato.guia_referencia, "$.contrato.guia_referencia", "Texto informativo del exportador."],
    [doc.contrato.aviso_vigencia, "$.contrato.aviso_vigencia", "Texto informativo del exportador."],
    [doc.envio?.modos_habilitados, "$.envio.modos_habilitados", "El SaaS usa su propio outbox de emision."],
    [doc.tipos_documento_habilitados, "$.tipos_documento_habilitados", "Informativo."],
    [doc.numeracion?.serie_fiscal, "$.numeracion.serie_fiscal", "Sin columna en el modelo."],
    [doc.numeracion?.rango_min, "$.numeracion.rango_min", "Sin columna en el modelo."],
    [doc.numeracion?.rango_max, "$.numeracion.rango_max", "Sin columna en el modelo."]
  ];

  for (const [valor, ruta, motivo] of rutas) {
    // Una ruta ausente o vacia no se reporta: la lista se construye recorriendo el documento.
    if (valor === undefined || valor === null) continue;
    if (Array.isArray(valor) && valor.length === 0) continue;
    h.ignorado(ruta, valor, motivo);
  }

  if (doc.actividades_economicas.some((a) => a.es_principal !== undefined && a.es_principal !== null)) {
    h.ignorado(
      "$.actividades_economicas[].es_principal",
      true,
      "Sin columna propia; se usa para sugerir la actividad de un perfil sin actividad fija (RN-23)."
    );
  }

  // RN-21: informativo, no se persiste, pero el operador tiene que poder verlo.
  const grupos = doc.perfiles_emision?.items
    .filter((i) => (i.grupo_actividades ?? []).length > 0)
    .map((i) => ({
      perfil: texto(i.codigo),
      actividades: (i.grupo_actividades ?? []).map((g) => texto(g.codigo)).filter((c) => c !== null)
    })) ?? [];
  if (grupos.length > 0) {
    h.ignorado(
      "$.perfiles_emision.items[].grupo_actividades",
      grupos,
      "Informativo: son las actividades que FE declarara en el XML (gActEco). El SaaS persiste una actividad por contexto."
    );
  }

  const tipos = doc.perfiles_emision?.items.map((i) => texto(i.tipo_documento)).filter((t) => t !== null) ?? [];
  if (tipos.length > 0) {
    h.ignorado("$.perfiles_emision.items[].tipo_documento", tipos, "Codigo SIFEN crudo; el perfil ya es por punto.");
  }

  if (doc.consumidor.length > 0) {
    h.ignorado("$.consumidor[].permisos", doc.consumidor.map((c) => c.permisos), "La API key se administra aparte.");
    h.ignorado("$.consumidor[].alcance", doc.consumidor.map((c) => c.alcance), "La API key se administra aparte.");
  }
}

// ─── Validaciones de coherencia con el deployment ─────────────────────────────

function validarServicioYConsumidor(doc: FeConfigDocument, ctx: MapperContext, emisorId: string | null, h: Hallazgos): void {
  if (doc.servicio?.url_verificada === false) {
    h.advertencia("URL_NO_VERIFICADA", "FE no pudo confirmar la URL de su propia API en el archivo.", {
      ruta: "$.servicio.url_verificada",
      sugerencia: "No afecta al import: la URL que usamos es la del deployment."
    });
  }

  const baseUrl = texto(doc.servicio?.base_url);
  if (baseUrl !== null && baseUrl !== ctx.feApiBaseUrl) {
    h.advertencia("BASE_URL_DISTINTA", `La URL del archivo (${baseUrl}) no coincide con la del deployment.`, {
      ruta: "$.servicio.base_url",
      valor: baseUrl
    });
  }

  const ambienteArchivo = texto(doc.emisor.ambiente) ?? texto(doc.servicio?.ambiente_esperado);
  if (ambienteArchivo !== null && ambienteArchivo !== ctx.feApiEnv) {
    h.bloqueante(
      "AMBIENTE_DISTINTO",
      `El archivo es del ambiente "${ambienteArchivo}" y este deployment opera en "${ctx.feApiEnv}".`,
      {
        ruta: "$.emisor.ambiente",
        valor: ambienteArchivo,
        sugerencia: "Un facturador del ambiente equivocado hace que SIFEN rechace todas sus emisiones."
      }
    );
  }

  if (!doc.tipos_documento_habilitados.includes("FE")) {
    h.advertencia("TIPO_DOCUMENTO_FE_AUSENTE", "El emisor no tiene habilitada la factura electronica (FE).", {
      ruta: "$.tipos_documento_habilitados",
      valor: doc.tipos_documento_habilitados
    });
  }

  if (doc.consumidor.length === 0) {
    h.advertencia("PERMISOS_CONSUMIDOR_INCOMPLETOS", "El archivo no informa ningun consumidor con alcance sobre este emisor.", {
      ruta: "$.consumidor"
    });
    return;
  }

  const conAlcance = doc.consumidor.filter((c) =>
    c.alcance.some((a) => a.activo !== false && (emisorId === null || texto(a.emisor_id) === emisorId) && texto(a.env) === ctx.feApiEnv)
  );
  const candidatos = conAlcance.length > 0 ? conAlcance : doc.consumidor;
  const faltantes = PERMISOS_MINIMOS.filter((p) => !candidatos.some((c) => c.permisos.includes(p)));

  if (conAlcance.length === 0) {
    h.advertencia("PERMISOS_CONSUMIDOR_INCOMPLETOS", `Ningun consumidor tiene alcance activo sobre ${emisorId ?? "el emisor"} en ${ctx.feApiEnv}.`, {
      ruta: "$.consumidor[].alcance"
    });
  } else if (faltantes.length > 0) {
    h.advertencia("PERMISOS_CONSUMIDOR_INCOMPLETOS", `A la clave del consumidor le faltan permisos: ${faltantes.join(", ")}.`, {
      ruta: "$.consumidor[].permisos",
      valor: faltantes
    });
  } else {
    // RN-27: el export no informa si la clave esta activa y `consumidor[]` no filtra por ese estado
    // (hallazgo V010 del equipo de FE). Los permisos pueden estar validandose contra una clave inactiva.
    h.advertencia(
      "CONSUMIDOR_ESTADO_DESCONOCIDO",
      `Los permisos se verificaron contra ${conAlcance.length === 1 ? "el consumidor informado" : `${conAlcance.length} consumidores informados`}, pero el archivo no dice cual esta activo.`,
      {
        ruta: "$.consumidor",
        valor: conAlcance.map((c) => texto(c.nombre)),
        sugerencia: "Confirmar en FE cual es la clave vigente antes de cargarla en el facturador."
      }
    );
  }
}

function validarContrato(doc: FeConfigDocument, ctx: MapperContext, h: Hallazgos): string {
  const version = texto(doc.contrato.version) ?? "";
  if (!esVersionSoportada(version)) {
    h.bloqueante("CONTRATO_VERSION_NO_SOPORTADA", `Version de contrato no soportada: "${version || "(vacia)"}".`, {
      ruta: "$.contrato.version",
      valor: version,
      sugerencia: "Este import lee el contrato v0.1."
    });
  }

  const generadoEn = texto(doc.contrato.generado_en);
  if (generadoEn !== null) {
    const generado = Date.parse(generadoEn);
    const hoyMs = Date.parse(`${ctx.hoy}T00:00:00Z`);
    if (!Number.isNaN(generado) && hoyMs - generado > DIAS_CONTRATO_ANTIGUO * 86_400_000) {
      h.advertencia("CONTRATO_ANTIGUO", `El archivo se exporto el ${generadoEn.slice(0, 10)}; puede estar desactualizado.`, {
        ruta: "$.contrato.generado_en",
        sugerencia: "Conviene exportar de nuevo antes de aplicar."
      });
    }
  }

  return version;
}

// ─── Mapper ───────────────────────────────────────────────────────────────────

export function buildImportPlan(doc: FeConfigDocument, ctx: MapperContext): ImportPlan {
  const h = new Hallazgos();

  const version = validarContrato(doc, ctx, h);

  // --- Emisor (RN-05): emisor_id ES el RUC, FE lo proyecta desde emisores.ruc_completo ---
  const emisorId = requerido(doc.emisor.emisor_id, "$.emisor.emisor_id", "El identificador del emisor", h);
  if (emisorId !== null && !RE_EMISOR_ID.test(emisorId)) {
    h.bloqueante("EMISOR_ID_INVALIDO", `"${emisorId}" no tiene forma de RUC con digito verificador.`, {
      ruta: "$.emisor.emisor_id",
      valor: emisorId
    });
  }
  const razonSocial = requerido(doc.emisor.razon_social, "$.emisor.razon_social", "La razon social", h);

  // --- Establecimientos y puntos ---
  const establecimientos: ImportPlan["establecimientos"] = [];
  const puntos: ImportPlan["puntos"] = [];
  const codigosEst = new Set<string>();

  doc.establecimientos.forEach((est, i) => {
    const codigo = requerido(est.codigo, `$.establecimientos[${i}].codigo`, "El codigo del establecimiento", h);
    if (codigo === null) return;

    if (!RE_CODIGO_3.test(codigo)) {
      h.bloqueante("CODIGO_INVALIDO", `El codigo de establecimiento "${codigo}" no son tres digitos.`, {
        ruta: `$.establecimientos[${i}].codigo`,
        valor: codigo
      });
      return;
    }
    if (codigosEst.has(codigo)) {
      h.bloqueante("CODIGO_DUPLICADO", `El establecimiento "${codigo}" aparece mas de una vez.`, {
        ruta: `$.establecimientos[${i}].codigo`,
        valor: codigo
      });
      return;
    }
    codigosEst.add(codigo);
    establecimientos.push({ codigo, nombre: texto(est.denominacion), direccion: texto(est.direccion) });

    const codigosPunto = new Set<string>();
    est.puntos_expedicion.forEach((punto, j) => {
      const ruta = `$.establecimientos[${i}].puntos_expedicion[${j}].codigo`;
      const pc = requerido(punto.codigo, ruta, "El codigo del punto de expedicion", h);
      if (pc === null) return;
      if (!RE_CODIGO_3.test(pc)) {
        h.bloqueante("CODIGO_INVALIDO", `El codigo de punto "${pc}" no son tres digitos.`, { ruta, valor: pc });
        return;
      }
      if (codigosPunto.has(pc)) {
        h.bloqueante("CODIGO_DUPLICADO", `El punto "${pc}" aparece mas de una vez en el establecimiento ${codigo}.`, {
          ruta,
          valor: pc
        });
        return;
      }
      codigosPunto.add(pc);
      puntos.push({ establecimiento_codigo: codigo, codigo: pc, nombre: texto(punto.descripcion) });
    });
  });

  // --- Actividades ---
  const actividades: ImportPlan["actividades"] = [];
  const codigosAct = new Set<string>();
  doc.actividades_economicas.forEach((act, i) => {
    const codigo = requerido(act.codigo, `$.actividades_economicas[${i}].codigo`, "El codigo de actividad", h);
    if (codigo === null) return;
    if (codigosAct.has(codigo)) {
      h.bloqueante("CODIGO_DUPLICADO", `La actividad "${codigo}" aparece mas de una vez.`, {
        ruta: `$.actividades_economicas[${i}].codigo`,
        valor: codigo
      });
      return;
    }
    codigosAct.add(codigo);
    const descripcion = texto(act.descripcion);
    actividades.push({
      codigo,
      descripcion,
      alias_operativo: alias(descripcion),
      es_principal: act.es_principal === true
    });
  });

  // --- Perfiles y contextos (RN-06): cada item es un contexto operativo ---
  const perfiles: ImportPlan["perfiles"] = [];
  const contextosPreliminares: Array<Omit<PlanContexto, "timbrado" | "timbrado_inicio">> = [];
  const codigosPerfil = new Set<string>();
  const tuplas = new Set<string>();
  const items = doc.perfiles_emision?.items ?? [];

  items.forEach((item, i) => {
    const base = `$.perfiles_emision.items[${i}]`;
    const codigo = requerido(item.codigo, `${base}.codigo`, "El codigo del perfil de emision", h);
    if (codigo === null) return;

    if (!codigosPerfil.has(codigo)) {
      codigosPerfil.add(codigo);
      perfiles.push({ codigo, descripcion: texto(item.descripcion) });
    }

    const establecimiento = texto(item.establecimiento_codigo);
    const punto = texto(item.punto_codigo);

    // Establecimiento o punto en null: FE los filtra por `activo` antes de resolver el perfil.
    const rotos = [
      establecimiento === null ? "establecimiento_codigo" : null,
      punto === null ? "punto_codigo" : null
    ].filter((x): x is string => x !== null);

    if (rotos.length > 0) {
      h.bloqueante("REFERENCIA_INTERNA_ROTA", `El perfil "${codigo}" no informa ${rotos.join(", ")}.`, {
        ruta: base,
        valor: rotos,
        sugerencia: "Suele pasar cuando el perfil apunta a un establecimiento o punto inactivo en FE."
      });
      return;
    }

    // RN-22/RN-23/RN-25/RN-26: la actividad puede venir fijada, o quedar a eleccion del operador
    // cuando el perfil no la fija y el grupo la aporta.
    const resuelta = resolverActividad(item, codigo, base, actividades, h);
    if (resuelta === null) return;
    const { actividad, editable, opciones } = resuelta;

    const faltantes: string[] = [];
    if (!codigosEst.has(establecimiento!)) faltantes.push(`establecimiento ${establecimiento}`);
    if (!puntos.some((p) => p.establecimiento_codigo === establecimiento && p.codigo === punto)) {
      faltantes.push(`punto ${punto}`);
    }
    if (faltantes.length > 0) {
      h.bloqueante("REFERENCIA_INTERNA_ROTA", `El perfil "${codigo}" referencia ${faltantes.join(", ")}, que el archivo no define.`, {
        ruta: base,
        valor: faltantes
      });
      return;
    }

    const tupla = `${actividad}|${establecimiento}|${punto}|${codigo}`;
    if (tuplas.has(tupla)) {
      h.bloqueante("CONTEXTO_DUPLICADO", `Dos perfiles producen el mismo contexto (${tupla.replace(/\|/g, " / ")}).`, {
        ruta: base,
        valor: tupla
      });
      return;
    }
    tuplas.add(tupla);

    const descripcionPerfil = texto(item.descripcion);
    const descripcionActividad = actividades.find((a) => a.codigo === actividad)?.descripcion ?? null;
    contextosPreliminares.push({
      actividad_codigo: actividad,
      establecimiento_codigo: establecimiento!,
      punto_codigo: punto!,
      perfil_codigo: codigo,
      documento_nro_sugerido: DOCUMENTO_NRO_INICIAL,
      credito_plazo_dias: CREDITO_PLAZO_DIAS_DEFAULT,
      alias_operativo: alias(descripcionPerfil ?? descripcionActividad),
      actividad_editable: editable,
      actividad_opciones: opciones
    });
  });

  // RN-08: sin perfiles no se pueden inventar codigos si FE los valida en cada emision.
  if (items.length === 0) {
    if (ctx.sendProfileCode) {
      h.bloqueante("SIN_CONTEXTOS", "El archivo no trae perfiles de emision y este deployment los envia a FE en cada emision.", {
        ruta: "$.perfiles_emision.items",
        sugerencia: "Pedir a FE una exportacion que incluya perfiles_emision.items."
      });
    } else {
      h.advertencia("SIN_CONTEXTOS", "El archivo no trae perfiles de emision; no se crean contextos operativos.", {
        ruta: "$.perfiles_emision.items"
      });
    }
  }

  // --- Timbrado (RN-07) ---
  const timbradoElegido = pickTimbrado(doc.timbrados, ctx.hoy, contextosPreliminares.length > 0, h);

  const contextos: PlanContexto[] = contextosPreliminares.map((c) => ({
    ...c,
    timbrado: timbradoElegido?.numero ?? null,
    timbrado_inicio: timbradoElegido?.fecha_inicio ?? null
  }));

  // --- Numeracion (RN-09) ---
  const autoridad = texto(doc.numeracion?.autoridad);
  if (autoridad === "CLIENT" && doc.numeracion?.documento_nro_requerido === true && contextos.length > 0) {
    h.advertencia("NUMERACION_CLIENT", "La numeracion la asigna el cliente y el archivo no informa el proximo numero.", {
      ruta: "$.numeracion.autoridad",
      sugerencia: `Se propone ${DOCUMENTO_NRO_INICIAL} por contexto; verificar el numero real antes de emitir.`
    });
  }

  validarServicioYConsumidor(doc, ctx, emisorId, h);
  reportarIgnorados(doc, h);

  return {
    contrato: { version, generado_en: texto(doc.contrato.generado_en) },
    emisor: {
      emisor_id: emisorId ?? "",
      ruc: emisorId ?? "",
      razon_social: razonSocial ?? "",
      nombre_fantasia: texto(doc.emisor.nombre_fantasia),
      ambiente: texto(doc.emisor.ambiente)
    },
    establecimientos,
    puntos,
    actividades,
    perfiles,
    contextos,
    timbradoElegido,
    hallazgos: h.all()
  };
}

export function bloqueantes(plan: ImportPlan): Hallazgo[] {
  return plan.hallazgos.filter((x) => x.nivel === "BLOQUEANTE");
}

export function advertencias(plan: ImportPlan): Hallazgo[] {
  return plan.hallazgos.filter((x) => x.nivel === "ADVERTENCIA");
}

export function ignorados(plan: ImportPlan): Hallazgo[] {
  return plan.hallazgos.filter((x) => x.nivel === "IGNORADO");
}
