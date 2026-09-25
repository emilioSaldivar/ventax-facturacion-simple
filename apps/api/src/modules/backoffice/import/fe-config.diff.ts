// Diff entre el plan del archivo y el estado actual de la base.
//
// Dos responsabilidades:
//   1. Decidir, por entidad, si se CREA, se ACTUALIZA o queda SIN_CAMBIOS. La identidad es
//      siempre por codigo (RN-03), alineada con los indices unicos parciales de la 0004.
//   2. Producir el `preview_token`: la huella de lo que el operador vio, para que `apply`
//      pueda rechazar una confirmacion sobre datos que cambiaron (RN-15).
//
// Agrega ademas los bloqueantes que dependen del estado de la base y que el mapper no puede
// conocer: emisor en otro tenant, slug ocupado.

import { createHash } from "node:crypto";
import type {
  AccionDiff,
  CampoDiff,
  ContextoDiff,
  EntidadDiff,
  Hallazgo,
  ImportDiff,
  ImportPlan,
  ImportSnapshot,
  ImportTarget,
  PuntoDiff,
  ResumenDiff,
  SnapshotContexto
} from "./import.types";

/** Compara solo los campos que el import escribe; `null` del archivo nunca borra un valor existente. */
function diffCampos(pares: Array<[string, unknown, unknown]>): CampoDiff[] {
  const campos: CampoDiff[] = [];
  for (const [campo, actual, nuevo] of pares) {
    if (nuevo === null || nuevo === undefined) continue;
    if (actual !== nuevo) campos.push({ campo, actual: actual ?? null, nuevo });
  }
  return campos;
}

function accionDe(existe: boolean, campos: CampoDiff[]): AccionDiff {
  if (!existe) return "CREAR";
  return campos.length > 0 ? "ACTUALIZAR" : "SIN_CAMBIOS";
}

function claveContexto(c: { actividad_codigo: string; establecimiento_codigo: string; punto_codigo: string; perfil_codigo: string }): string {
  return `${c.actividad_codigo}|${c.establecimiento_codigo}|${c.punto_codigo}|${c.perfil_codigo}`;
}

function claveSnapshotContexto(c: SnapshotContexto): string {
  return `${c.actividad_codigo}|${c.establecimiento_codigo}|${c.punto_codigo}|${c.perfil_codigo}`;
}

/**
 * JSON canonico: claves ordenadas en todo nivel. Los arrays ya llegan ordenados por su clave
 * de identidad, de modo que reordenar el archivo no cambia el token.
 */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    const src = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(src).sort()) out[key] = canonical(src[key]);
    return out;
  }
  return value;
}

export function computePreviewToken(plan: ImportPlan, target: ImportTarget, snapshot: ImportSnapshot): string {
  const huella = {
    target,
    emisor: plan.emisor,
    establecimientos: [...plan.establecimientos].sort((a, b) => a.codigo.localeCompare(b.codigo)),
    puntos: [...plan.puntos].sort((a, b) =>
      `${a.establecimiento_codigo}${a.codigo}`.localeCompare(`${b.establecimiento_codigo}${b.codigo}`)
    ),
    actividades: [...plan.actividades].sort((a, b) => a.codigo.localeCompare(b.codigo)),
    perfiles: [...plan.perfiles].sort((a, b) => a.codigo.localeCompare(b.codigo)),
    contextos: [...plan.contextos].sort((a, b) => claveContexto(a).localeCompare(claveContexto(b))),
    timbrado: plan.timbradoElegido,
    // Del snapshot solo entran los ids: si una fila cambio de identidad, el token cambia.
    snapshotIds: {
      tenant: snapshot.tenant?.id ?? null,
      facturador: snapshot.facturador?.id ?? null,
      establecimientos: snapshot.establecimientos.map((x) => x.id).sort(),
      puntos: snapshot.puntos.map((x) => x.id).sort(),
      actividades: snapshot.actividades.map((x) => x.id).sort(),
      perfiles: snapshot.perfiles.map((x) => x.id).sort(),
      contextos: snapshot.contextos.map((x) => x.id).sort()
    }
  };
  return createHash("sha256").update(JSON.stringify(canonical(huella))).digest("hex");
}

export function buildDiff(
  plan: ImportPlan,
  snapshot: ImportSnapshot,
  target: ImportTarget,
  archivo: { nombre: string; formato: string },
  overrides: Record<string, string> = {},
  /** Actividad elegida por perfil, para los contextos sin actividad fija (RN-22). */
  actividadOverrides: Record<string, string> = {}
): ImportDiff {
  const hallazgos: Hallazgo[] = [...plan.hallazgos];

  // --- Bloqueantes que dependen del estado de la base ---
  if (snapshot.emisorEnOtroTenant) {
    hallazgos.push({
      nivel: "BLOQUEANTE",
      codigo: "FACTURADOR_EN_OTRO_TENANT",
      mensaje: `El emisor ${plan.emisor.emisor_id} ya existe en el tenant "${snapshot.emisorEnOtroTenant.tenant_nombre}".`,
      sugerencia: "Un contribuyente vive en un solo tenant. Revisar el destino elegido."
    });
  }
  if (target.mode === "NUEVO" && snapshot.slugOcupado) {
    hallazgos.push({
      nivel: "BLOQUEANTE",
      codigo: "TENANT_SLUG_EXISTENTE",
      mensaje: `Ya existe un tenant con el slug "${target.slug}".`,
      sugerencia: "Elegir otro slug o seleccionar el tenant existente."
    });
  }

  // --- Tenant ---
  const tenant =
    target.mode === "EXISTENTE"
      ? {
          accion: "USAR_EXISTENTE" as AccionDiff,
          id: snapshot.tenant?.id ?? target.tenant_id,
          nombre: snapshot.tenant?.nombre ?? "",
          slug: snapshot.tenant?.slug ?? "",
          plan_codigo: null
        }
      : {
          accion: "CREAR" as AccionDiff,
          id: null,
          nombre: target.nombre,
          slug: target.slug,
          plan_codigo: target.plan_codigo
        };

  // --- Facturador ---
  const f = snapshot.facturador;
  const camposFacturador = f
    ? diffCampos([
        ["razon_social", f.razon_social, plan.emisor.razon_social],
        ["nombre_fantasia", f.nombre_fantasia, plan.emisor.nombre_fantasia],
        ["activo", f.activo, f.activo ? null : true]
      ])
    : diffCampos([
        ["razon_social", null, plan.emisor.razon_social],
        ["ruc", null, plan.emisor.ruc],
        ["nombre_fantasia", null, plan.emisor.nombre_fantasia]
      ]);

  if (f && f.ruc !== plan.emisor.ruc) {
    hallazgos.push({
      nivel: "ADVERTENCIA",
      codigo: "RUC_DISTINTO",
      mensaje: `El facturador existente tiene RUC "${f.ruc}" y el archivo informa "${plan.emisor.ruc}".`,
      sugerencia: "El RUC existente no se modifica; corregirlo a mano si corresponde."
    });
  }
  if (f && !f.has_api_key) {
    hallazgos.push({
      nivel: "ADVERTENCIA",
      codigo: "API_KEY_AUSENTE",
      mensaje: "El facturador no tiene cargada la API key de FE.",
      sugerencia: "Cargarla en el panel del facturador; sin ella no puede emitir."
    });
  } else if (!f) {
    hallazgos.push({
      nivel: "ADVERTENCIA",
      codigo: "API_KEY_AUSENTE",
      mensaje: "El facturador se crea sin API key de FE.",
      sugerencia: "Cargarla en el panel del facturador despues de aplicar."
    });
  }

  const facturador = {
    accion: accionDe(Boolean(f), camposFacturador),
    id: f?.id ?? null,
    emisor_id: plan.emisor.emisor_id,
    campos: camposFacturador
  };

  const reactivaciones: string[] = [];
  const marcarReactivacion = (tipo: string, codigo: string, activo: boolean) => {
    if (!activo) reactivaciones.push(`${tipo} ${codigo}`);
  };

  // --- Establecimientos ---
  const establecimientos: EntidadDiff[] = plan.establecimientos.map((e) => {
    const actual = snapshot.establecimientos.find((x) => x.codigo === e.codigo);
    if (actual) marcarReactivacion("establecimiento", e.codigo, actual.activo);
    const campos = actual
      ? diffCampos([
          ["nombre", actual.nombre, e.nombre],
          ["direccion", actual.direccion, e.direccion],
          ["activo", actual.activo, actual.activo ? null : true]
        ])
      : diffCampos([["nombre", null, e.nombre], ["direccion", null, e.direccion]]);
    return { codigo: e.codigo, accion: accionDe(Boolean(actual), campos), id: actual?.id ?? null, campos };
  });

  // --- Puntos ---
  const puntos: PuntoDiff[] = plan.puntos.map((p) => {
    const actual = snapshot.puntos.find(
      (x) => x.codigo === p.codigo && x.establecimiento_codigo === p.establecimiento_codigo
    );
    if (actual) marcarReactivacion("punto", p.codigo, actual.activo);
    const campos = actual
      ? diffCampos([["nombre", actual.nombre, p.nombre], ["activo", actual.activo, actual.activo ? null : true]])
      : diffCampos([["nombre", null, p.nombre]]);
    return {
      codigo: p.codigo,
      establecimiento_codigo: p.establecimiento_codigo,
      accion: accionDe(Boolean(actual), campos),
      id: actual?.id ?? null,
      campos
    };
  });

  // --- Actividades: el alias solo se escribe al crear (RN-05) ---
  const actividades: EntidadDiff[] = plan.actividades.map((a) => {
    const actual = snapshot.actividades.find((x) => x.codigo === a.codigo);
    if (actual) marcarReactivacion("actividad", a.codigo, actual.activo);
    const campos = actual
      ? diffCampos([
          ["descripcion", actual.descripcion, a.descripcion],
          ["alias_operativo", actual.alias_operativo, actual.alias_operativo === null ? a.alias_operativo : null],
          ["activo", actual.activo, actual.activo ? null : true]
        ])
      : diffCampos([["descripcion", null, a.descripcion], ["alias_operativo", null, a.alias_operativo]]);
    return { codigo: a.codigo, accion: accionDe(Boolean(actual), campos), id: actual?.id ?? null, campos };
  });

  // --- Perfiles ---
  const perfiles: EntidadDiff[] = plan.perfiles.map((pe) => {
    const actual = snapshot.perfiles.find((x) => x.codigo === pe.codigo);
    if (actual) marcarReactivacion("perfil", pe.codigo, actual.activo);
    const campos = actual
      ? diffCampos([
          ["descripcion", actual.descripcion, pe.descripcion],
          ["activo", actual.activo, actual.activo ? null : true]
        ])
      : diffCampos([["descripcion", null, pe.descripcion]]);
    return { codigo: pe.codigo, accion: accionDe(Boolean(actual), campos), id: actual?.id ?? null, campos };
  });

  // --- Contextos: el documento_nro existente NUNCA se pisa (RN-09) ---
  const contextos: ContextoDiff[] = plan.contextos.map((c) => {
    // La identidad usa la actividad EFECTIVA: un contexto creado con 47591 se reconoce por esa
    // actividad, no por el null que traia el archivo.
    const elegida = c.actividad_editable ? actividadOverrides[c.perfil_codigo] : undefined;
    const actividadEfectiva =
      elegida && c.actividad_opciones.some((o) => o.codigo === elegida) ? elegida : c.actividad_codigo;
    const clave = claveContexto({ ...c, actividad_codigo: actividadEfectiva });
    const actual = snapshot.contextos.find((x) => claveSnapshotContexto(x) === clave);
    const sugerido = overrides[c.perfil_codigo] ?? c.documento_nro_sugerido;

    const campos = actual
      ? diffCampos([
          ["timbrado", actual.timbrado, c.timbrado],
          ["timbrado_inicio", actual.timbrado_inicio, c.timbrado_inicio],
          ["alias_operativo", actual.alias_operativo, actual.alias_operativo === null ? c.alias_operativo : null],
          ["activo", actual.activo, actual.activo ? null : true]
        ])
      : diffCampos([
          ["timbrado", null, c.timbrado],
          ["timbrado_inicio", null, c.timbrado_inicio],
          ["documento_nro", null, sugerido],
          ["credito_plazo_dias", null, c.credito_plazo_dias],
          ["alias_operativo", null, c.alias_operativo]
        ]);

    if (actual) marcarReactivacion("contexto", c.perfil_codigo, actual.activo);

    if (actual && campos.some((x) => x.campo === "timbrado") && actual.usuarios_asignados > 0) {
      hallazgos.push({
        nivel: "ADVERTENCIA",
        codigo: "CONTEXTO_EN_USO",
        mensaje: `El contexto ${c.perfil_codigo} tiene ${actual.usuarios_asignados} usuario(s) operando y se le actualiza el timbrado.`,
        valor: clave
      });
    }

    return {
      clave: {
        actividad: actividadEfectiva,
        establecimiento: c.establecimiento_codigo,
        punto: c.punto_codigo,
        perfil: c.perfil_codigo
      },
      actividad_codigo: actividadEfectiva,
      actividad_editable: c.actividad_editable,
      actividad_opciones: c.actividad_opciones,
      accion: accionDe(Boolean(actual), campos),
      id: actual?.id ?? null,
      campos,
      documento_nro_sugerido: sugerido,
      documento_nro_editable: !actual,
      documento_nro_preservado: Boolean(actual),
      usuarios_asignados: actual?.usuarios_asignados ?? 0
    };
  });

  if (reactivaciones.length > 0) {
    hallazgos.push({
      nivel: "ADVERTENCIA",
      codigo: "REACTIVACION",
      mensaje: `El import reactiva ${reactivaciones.length} entidad(es) que estaban inactivas.`,
      valor: reactivaciones
    });
  }

  // --- Entidades en base que el archivo no trae: se listan y NO se tocan (RN-10) ---
  const huerfanas: string[] = [
    ...snapshot.establecimientos.filter((x) => !plan.establecimientos.some((y) => y.codigo === x.codigo)).map((x) => `establecimiento ${x.codigo}`),
    ...snapshot.puntos
      .filter((x) => !plan.puntos.some((y) => y.codigo === x.codigo && y.establecimiento_codigo === x.establecimiento_codigo))
      .map((x) => `punto ${x.establecimiento_codigo}/${x.codigo}`),
    ...snapshot.actividades.filter((x) => !plan.actividades.some((y) => y.codigo === x.codigo)).map((x) => `actividad ${x.codigo}`),
    ...snapshot.perfiles.filter((x) => !plan.perfiles.some((y) => y.codigo === x.codigo)).map((x) => `perfil ${x.codigo}`),
    ...snapshot.contextos
      .filter((x) => !plan.contextos.some((y) => claveContexto(y) === claveSnapshotContexto(x)))
      .map((x) => `contexto ${x.perfil_codigo}`)
  ];

  if (huerfanas.length > 0) {
    hallazgos.push({
      nivel: "ADVERTENCIA",
      codigo: "ENTIDADES_HUERFANAS",
      mensaje: `Hay ${huerfanas.length} entidad(es) en el sistema que el archivo no contiene. No se tocan.`,
      valor: huerfanas
    });
  }

  // --- Resumen ---
  const todas: AccionDiff[] = [
    tenant.accion,
    facturador.accion,
    ...establecimientos.map((x) => x.accion),
    ...puntos.map((x) => x.accion),
    ...actividades.map((x) => x.accion),
    ...perfiles.map((x) => x.accion),
    ...contextos.map((x) => x.accion)
  ];
  const resumen: ResumenDiff = {
    crear: todas.filter((x) => x === "CREAR").length,
    actualizar: todas.filter((x) => x === "ACTUALIZAR").length,
    sin_cambios: todas.filter((x) => x === "SIN_CAMBIOS" || x === "USAR_EXISTENTE").length,
    no_tocados: huerfanas.length
  };

  const bloqueantes = hallazgos.filter((x) => x.nivel === "BLOQUEANTE");

  return {
    contrato: {
      version: plan.contrato.version,
      generado_en: plan.contrato.generado_en,
      archivo: archivo.nombre,
      formato: archivo.formato
    },
    preview_token: computePreviewToken(plan, target, snapshot),
    puede_aplicar: bloqueantes.length === 0,
    tenant,
    facturador,
    establecimientos,
    puntos,
    actividades,
    perfiles,
    contextos,
    timbrado_elegido: plan.timbradoElegido,
    resumen,
    bloqueantes,
    advertencias: hallazgos.filter((x) => x.nivel === "ADVERTENCIA"),
    ignorados: hallazgos.filter((x) => x.nivel === "IGNORADO"),
    referencias: {}
  };
}
