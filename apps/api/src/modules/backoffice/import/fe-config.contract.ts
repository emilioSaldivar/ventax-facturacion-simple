// Contrato v0.1 del archivo de configuracion fiscal exportado por facturacion-electronica.
//
// Fuente de verdad: `ExportConfiguracionConsumidorService.project()` de ese repo
// (docs/SPEC_IMPORT_CONFIG_FACTURADOR_v0.1.md seccion 5.3, verificado contra el generador).
//
// Reglas de diseno (PLAN fase 2):
//   - El esquema se aplica DESPUES de desenvolver los wrappers {valor, referencia}.
//   - Tolerante a `null` y a ausencia en TODO campo escalar: el generador pasa cada valor
//     por `toNullableString()` y omite los que no estan en su allowlist. Un `null` en un
//     campo que nuestro modelo exige es un hallazgo del mapper, no un error de esquema.
//   - `.passthrough()` en la raiz y en los objetos anidados: una version futura de FE que
//     agregue claves no debe romper el import.

import { z } from "zod";

/** Versiones del contrato que este import sabe leer. */
export const CONTRATO_VERSIONES_SOPORTADAS = ["v0.1"] as const;

// ─── Primitivas tolerantes ────────────────────────────────────────────────────
// Nunca `.min(1)` sobre un escalar: la obligatoriedad la valida el mapper, con ruta
// y mensaje accionable (bloqueante CAMPO_OBLIGATORIO_VACIO).

const texto = z.string().trim().nullable().optional();
const booleano = z.boolean().nullable().optional();
/** Codigo de establecimiento o punto. El formato exacto lo valida el mapper (CODIGO_INVALIDO). */
const codigo = z.string().trim().nullable().optional();
/** Fecha ISO. El formato exacto lo valida el mapper. */
const fecha = z.string().trim().nullable().optional();
/** Numerico o string: FE exporta rangos como numero, pero el YAML puede traerlos como texto. */
const numeroOTexto = z.union([z.number(), z.string()]).nullable().optional();

// ─── Bloques ──────────────────────────────────────────────────────────────────

const contratoSchema = z
  .object({
    version: z.string().trim(),
    generado_en: texto,
    guia_referencia: texto,
    aviso_vigencia: texto
  })
  .passthrough();

const servicioSchema = z
  .object({
    base_url: texto,
    base_path: texto,
    ambiente_esperado: texto,
    url_verificada: booleano,
    aviso: texto
  })
  .passthrough();

const emisorSchema = z
  .object({
    emisor_id: texto,
    razon_social: texto,
    nombre_fantasia: texto,
    ambiente: texto
  })
  .passthrough();

const actividadSchema = z
  .object({
    codigo: texto,
    descripcion: texto,
    es_principal: booleano
  })
  .passthrough();

const puntoSchema = z
  .object({
    codigo: codigo,
    descripcion: texto
  })
  .passthrough();

const establecimientoSchema = z
  .object({
    codigo: codigo,
    denominacion: texto,
    direccion: texto,
    puntos_expedicion: z.array(puntoSchema).default([])
  })
  .passthrough();

const timbradoSchema = z
  .object({
    numero: texto,
    fecha_inicio: fecha,
    fecha_fin: fecha,
    vigente: booleano
  })
  .passthrough();

/**
 * Actividades que el XML declarara para este perfil (gActEco), en orden.
 * Informativo: el consumidor solo envia `emission_profile_code` (guia FE seccion 25.2).
 */
const grupoActividadSchema = z
  .object({
    codigo: texto,
    descripcion: texto
  })
  .passthrough();

const perfilItemSchema = z
  .object({
    codigo: texto,
    descripcion: texto,
    // Pueden llegar en `null`: FE filtra actividades, establecimientos y puntos por `activo`
    // antes de resolver el perfil, asi que un perfil apuntado a algo inactivo exporta null.
    // Es un caso operativo normal -> REFERENCIA_INTERNA_ROTA en el mapper.
    actividad_codigo: texto,
    establecimiento_codigo: codigo,
    punto_codigo: codigo,
    // Codigo SIFEN crudo ("1" = factura electronica). Sin destino en nuestro modelo.
    tipo_documento: texto,
    // Puede faltar: los archivos anteriores a la funcionalidad no lo traen (SPEC v0.2 seccion 6.1).
    grupo_actividades: z.array(grupoActividadSchema).default([])
  })
  .passthrough();

const perfilesEmisionSchema = z
  .object({
    // Derivado por FE como `perfiles.length > 1`. Informativo: el import usa `items`.
    requerido: booleano,
    items: z.array(perfilItemSchema).default([])
  })
  .passthrough();

const numeracionSchema = z
  .object({
    autoridad: texto,
    documento_nro_requerido: booleano,
    serie_fiscal: texto,
    rango_min: numeroOTexto,
    rango_max: numeroOTexto
  })
  .passthrough();

const envioSchema = z
  .object({
    modos_habilitados: z.array(z.string()).default([])
  })
  .passthrough();

const consumidorAlcanceSchema = z
  .object({
    emisor_id: texto,
    env: texto,
    activo: booleano
  })
  .passthrough();

const consumidorSchema = z
  .object({
    nombre: texto,
    permisos: z.array(z.string()).default([]),
    alcance: z.array(consumidorAlcanceSchema).default([])
  })
  .passthrough();

// ─── Documento ────────────────────────────────────────────────────────────────

export const feConfigSchema = z
  .object({
    // Unico campo estructuralmente obligatorio: sin version no se sabe como leer el resto.
    contrato: contratoSchema,
    servicio: servicioSchema.optional(),
    emisor: emisorSchema,
    actividades_economicas: z.array(actividadSchema).default([]),
    establecimientos: z.array(establecimientoSchema).default([]),
    timbrados: z.array(timbradoSchema).default([]),
    perfiles_emision: perfilesEmisionSchema.optional(),
    numeracion: numeracionSchema.optional(),
    envio: envioSchema.optional(),
    tipos_documento_habilitados: z.array(z.string()).default([]),
    consumidor: z.array(consumidorSchema).default([])
  })
  .passthrough();

export type FeConfigDocument = z.infer<typeof feConfigSchema>;
export type FeConfigEstablecimiento = z.infer<typeof establecimientoSchema>;
export type FeConfigPerfilItem = z.infer<typeof perfilItemSchema>;
export type FeConfigTimbrado = z.infer<typeof timbradoSchema>;
export type FeConfigActividad = z.infer<typeof actividadSchema>;
export type FeConfigConsumidor = z.infer<typeof consumidorSchema>;
