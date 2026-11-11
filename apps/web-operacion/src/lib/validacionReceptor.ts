/**
 * SPEC_VALIDACIONES_RECEPTOR_v0.1: espejo de `apps/api/src/shared/validation/receptor.ts`.
 * No editar solo aca: la prueba `apps/api/tests/receptor.paridad.test.ts` corre la misma tabla
 * de casos contra los dos archivos (TASKS VAL-002).
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

export function normalizarDireccion(valor: string | null | undefined): string | null {
  const recortado = (valor ?? "").trim().replace(/\s+/g, " ");
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

/** RV-06. Direccion normalizada (null = sin direccion). */
export function validarDireccion(valor: string | null): ResultadoValidacion {
  if (valor === null) return OK;
  return valor.length <= 255 ? OK : error("La dirección puede tener hasta 255 caracteres.");
}

/** RV-06. Numero de casa: hasta 6 digitos, "0" si no tiene. */
export function validarNumeroCasa(valor: string): ResultadoValidacion {
  return /^\d{1,6}$/.test(valor.trim()) ? OK : error("El número de casa son hasta 6 números; poné 0 si no tiene.");
}

export interface ReceptorAValidar {
  documento_tipo: string;
  documento: string;
  razon_social: string;
  direccion?: string | null;
  telefono?: string | null;
  email?: string | null;
}

export type CampoReceptor = "documento" | "razon_social" | "direccion" | "telefono" | "email";

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
  agregar("telefono", validarTelefono(normalizado.telefono ?? null));
  agregar("email", validarCorreo(normalizado.email ?? null, opciones.maxCorreo));
  return { normalizado, errores };
}

/** RV-11: mensajes de un cliente ya guardado que no cumple las reglas (vacio si cumple). */
export function observacionesReceptor(receptor: ReceptorAValidar): string[] {
  return revisarReceptor(receptor).errores.map((e) => e.mensaje);
}
