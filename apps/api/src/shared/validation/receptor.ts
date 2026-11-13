/**
 * SPEC_VALIDACIONES_RECEPTOR_v0.1: reglas RV-01 a RV-07 sobre los datos del receptor,
 * aplicadas antes de llamar a FE. Espejo exacto en `apps/web-operacion/src/lib/validacionReceptor.ts`:
 * cualquier cambio aca va tambien alla, con la misma tabla de casos (TASKS VAL-002).
 */

export type ResultadoValidacion = { ok: true } | { ok: false; mensaje: string };

const OK: ResultadoValidacion = { ok: true };
const error = (mensaje: string): ResultadoValidacion => ({ ok: false, mensaje });

/**
 * Modulo 11 de SIFEN, como `calcularDigitoVerificadorModulo11` de FE (segel-rc4.32):
 * cada letra se expande a los digitos de su codigo ASCII ("A" -> "65") y se pondera
 * digito por digito, de derecha a izquierda, con factores 2..11 que vuelven a 2.
 */
export function calcularDvRuc(base: string): number {
  const digitos = base
    .toUpperCase()
    .split("")
    .map((c) => (/[0-9]/.test(c) ? c : String(c.charCodeAt(0))))
    .join("");
  let factor = 2;
  let suma = 0;
  for (let i = digitos.length - 1; i >= 0; i -= 1) {
    suma += Number(digitos[i]) * factor;
    factor = factor === 11 ? 2 : factor + 1;
  }
  const resto = suma % 11;
  return resto > 1 ? 11 - resto : 0;
}

/** RV-07: mayusculas, sin puntos ni espacios; el guion del RUC se conserva. */
export function normalizarDocumento(tipo: string, valor: string): string {
  const limpio = valor.trim().toUpperCase().replace(/[.\s]/g, "");
  return tipo === "RUC" ? limpio : limpio.replace(/-/g, "");
}

export function normalizarTelefono(valor: string | null | undefined): string | null {
  const digitos = (valor ?? "").replace(/\D/g, "");
  return digitos ? digitos : null;
}

export function normalizarNombre(valor: string): string {
  return valor.trim().replace(/\s+/g, " ");
}

export function normalizarCorreo(valor: string | null | undefined): string | null {
  const recortado = (valor ?? "").trim();
  return recortado ? recortado : null;
}

/**
 * SPEC_DIRECCION_RECEPTOR_v0.1 RN-06: saltos de linea y tabulaciones pasan a espacio (xmlgen los borraria sin
 * espacio), se juntan los espacios y las comillas tipograficas de los teclados pasan a ' y ".
 */
export function normalizarDireccion(valor: string | null | undefined): string | null {
  const recortado = (valor ?? "")
    .replace(/[\u2018\u2019\u201a\u2032]/g, "'")
    .replace(/[\u201c\u201d\u201e\u2033]/g, '"')
    .trim()
    .replace(/\s+/g, " ");
  return recortado ? recortado : null;
}

/** RV-01. Recibe el valor ya normalizado con `normalizarDocumento("RUC", ...)`. */
export function validarRuc(valor: string): ResultadoValidacion {
  const m = /^([0-9A-Z]+)-(\d)$/.exec(valor);
  if (!m) {
    // D-2: FS no calcula el DV por su cuenta (un digito mal tipeado en la base pasaria como valido).
    return error("Falta el dígito verificador del RUC. Escribilo con guion, por ejemplo 80012345-0.");
  }
  const base = m[1] ?? "";
  const dv = m[2] ?? "";
  if (base.length < 3 || base.length > 8) {
    return error("El RUC tiene que tener entre 3 y 8 caracteres antes del guion.");
  }
  const esperado = calcularDvRuc(base);
  if (Number(dv) !== esperado) {
    return error(`El RUC ${valor} no es válido: el dígito verificador que corresponde es ${esperado}.`);
  }
  return OK;
}

/** RV-01 y RV-02. `tipo` es el tipo de documento del receptor; `valor`, ya normalizado. */
export function validarDocumento(tipo: string, valor: string): ResultadoValidacion {
  if (tipo === "INNOMINADO") return OK;
  if (tipo === "RUC") return validarRuc(valor);
  if (!valor) return error("Falta el número de documento.");
  if (tipo === "CI") {
    return /^\d{1,20}$/.test(valor) ? OK : error("La cédula lleva solo números, hasta 20.");
  }
  return /^[0-9A-Z]{1,20}$/.test(valor) ? OK : error("El documento lleva solo letras y números, hasta 20, sin espacios ni guiones.");
}

/** RV-03. Recibe el valor normalizado (null = sin correo). */
export function validarCorreo(valor: string | null, max = 240): ResultadoValidacion {
  if (valor === null) return OK;
  const valido =
    valor.length <= max &&
    !/[\s\u0000-\u001f]/.test(valor) &&
    /^[^@]+@[^@]+\.[^@.]+$/.test(valor) &&
    !valor.includes("..");
  return valido ? OK : error("El correo no es válido. Revisá que no tenga espacios y que tenga la forma nombre@dominio.com.");
}

/** RV-04. Recibe el valor normalizado (solo digitos, null = sin telefono). */
export function validarTelefono(valor: string | null): ResultadoValidacion {
  if (valor === null) return OK;
  return /^\d{6,15}$/.test(valor) ? OK : error("El teléfono tiene que tener entre 6 y 15 números. Ejemplo: 0981123456.");
}

/** RV-05. Recibe el valor normalizado. */
export function validarNombre(valor: string): ResultadoValidacion {
  return valor.length >= 4 && valor.length <= 255 ? OK : error("El nombre o razón social tiene que tener entre 4 y 255 caracteres.");
}

/**
 * SPEC_DIRECCION_RECEPTOR_v0.1 RN-06 (FS-154, regla acordada con FE): letras con o sin tilde, ñ, digitos,
 * espacio y . , / - º ª ° # ( ) ' " &. Los saltos de linea ya llegan como espacio (`normalizarDireccion`).
 */
const CARACTER_NO_PERMITIDO_DIRECCION = /[^\p{L}\p{M}0-9 .,/\-ºª°#()'"&]/gu;

export const MENSAJE_CARACTERES_DIRECCION = "Usá letras, números y . , / - º # ( ) ' \" &";

/** Caracteres de `valor` fuera de la regla RN-06, sin repetir y en el orden en que aparecen. */
export function caracteresNoPermitidosDireccion(valor: string): string[] {
  return [...new Set(valor.match(CARACTER_NO_PERMITIDO_DIRECCION) ?? [])];
}

/** RN-06, solo caracteres (cada pantalla aplica su propio largo). `que` nombra el campo en el mensaje. */
export function validarCaracteresDireccion(valor: string, que = "La dirección"): ResultadoValidacion {
  const malos = caracteresNoPermitidosDireccion(valor);
  if (malos.length === 0) return OK;
  const muestra = malos.map((c) => (/[\u0000-\u001f\u007f]/.test(c) ? "un carácter invisible" : c)).join(" ");
  return error(`${que} tiene caracteres no permitidos: ${muestra}. ${MENSAJE_CARACTERES_DIRECCION}`);
}

/** RV-06 y SPEC_DIRECCION_RECEPTOR_v0.1 RN-06. Direccion normalizada (null = sin direccion). */
export function validarDireccion(valor: string | null): ResultadoValidacion {
  if (valor === null) return OK;
  if (valor.length > 255) return error("La dirección puede tener hasta 255 caracteres.");
  return validarCaracteresDireccion(valor);
}

/** RV-06. Numero de casa: hasta 6 digitos, "0" si no tiene. */
export function validarNumeroCasa(valor: string): ResultadoValidacion {
  return /^\d{1,6}$/.test(valor.trim()) ? OK : error("El número de casa son hasta 6 números; poné 0 si no tiene.");
}

/**
 * SPEC_DIRECCION_RECEPTOR_v0.1: domicilio del receptor con los codigos de geografia del MT150 que publica FE.
 * Opcional: se envia a FE solo completo (RN-01); incompleto no es error (RN-02).
 */
export interface DomicilioReceptor {
  numero_casa?: string | null;
  departamento?: number | null;
  departamento_descripcion?: string | null;
  distrito?: number | null;
  distrito_descripcion?: string | null;
  ciudad?: number | null;
  ciudad_descripcion?: string | null;
}

/** RN-01: calle, numero de casa valido, departamento y ciudad. */
export function domicilioCompleto(receptor: { direccion?: string | null } & DomicilioReceptor): boolean {
  const numero = (receptor.numero_casa ?? "").trim();
  return Boolean(receptor.direccion?.trim()) && numero !== "" && validarNumeroCasa(numero).ok && Boolean(receptor.departamento) && Boolean(receptor.ciudad);
}

export interface ReceptorAValidar extends DomicilioReceptor {
  documento_tipo: string;
  documento: string;
  razon_social: string;
  direccion?: string | null;
  telefono?: string | null;
  email?: string | null;
}

export type CampoReceptor = "documento" | "razon_social" | "direccion" | "numero_casa" | "telefono" | "email";

/**
 * Normaliza (RV-07) y valida (RV-01 a RV-06) un receptor completo.
 * Devuelve el receptor normalizado y los errores por campo, en el orden del formulario.
 */
export function revisarReceptor<T extends ReceptorAValidar>(
  receptor: T,
  opciones: { maxCorreo?: number } = {}
): { normalizado: T; errores: Array<{ campo: CampoReceptor; mensaje: string }> } {
  const innominado = receptor.documento_tipo === "INNOMINADO";
  const normalizado: T = {
    ...receptor,
    documento: innominado ? receptor.documento : normalizarDocumento(receptor.documento_tipo, receptor.documento),
    razon_social: innominado ? receptor.razon_social : normalizarNombre(receptor.razon_social),
    ...(receptor.direccion !== undefined ? { direccion: normalizarDireccion(receptor.direccion) } : {}),
    ...(receptor.numero_casa !== undefined ? { numero_casa: (receptor.numero_casa ?? "").trim() || null } : {}),
    ...(receptor.telefono !== undefined ? { telefono: normalizarTelefono(receptor.telefono) } : {}),
    ...(receptor.email !== undefined ? { email: normalizarCorreo(receptor.email) } : {})
  };
  const errores: Array<{ campo: CampoReceptor; mensaje: string }> = [];
  const agregar = (campo: CampoReceptor, r: ResultadoValidacion) => {
    if (!r.ok) errores.push({ campo, mensaje: r.mensaje });
  };
  agregar("documento", validarDocumento(normalizado.documento_tipo, normalizado.documento));
  if (!innominado) agregar("razon_social", validarNombre(normalizado.razon_social));
  agregar("direccion", validarDireccion(normalizado.direccion ?? null));
  // RN-03: el numero de casa, si se escribio, tiene que ser valido; vacio no es error (RN-02).
  if (normalizado.numero_casa) agregar("numero_casa", validarNumeroCasa(normalizado.numero_casa));
  agregar("telefono", validarTelefono(normalizado.telefono ?? null));
  agregar("email", validarCorreo(normalizado.email ?? null, opciones.maxCorreo));
  return { normalizado, errores };
}

/** RV-11: mensajes de un cliente ya guardado que no cumple las reglas (vacio si cumple). */
export function observacionesReceptor(receptor: ReceptorAValidar): string[] {
  return revisarReceptor(receptor).errores.map((e) => e.mensaje);
}

/** Marca de los issues de Zod que llevan un mensaje para el operador (lo usa el error handler). */
export const ISSUE_OPERADOR = { operador: true } as const;

/** Agrega a un `ctx` de `superRefine` los errores de `revisarReceptor` con el `path` del campo. */
export function agregarErroresReceptor(
  ctx: { addIssue: (issue: { code: "custom"; path: (string | number)[]; message: string; params?: Record<string, unknown> }) => void },
  errores: Array<{ campo: CampoReceptor; mensaje: string }>,
  prefijo: (string | number)[] = [],
  nombres: Partial<Record<CampoReceptor, string>> = {}
): void {
  for (const e of errores) {
    ctx.addIssue({ code: "custom", path: [...prefijo, nombres[e.campo] ?? e.campo], message: e.mensaje, params: ISSUE_OPERADOR });
  }
}
