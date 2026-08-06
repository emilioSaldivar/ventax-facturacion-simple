/**
 * Catalogo de causas SIFEN -> categoria de accion (SPEC_BACKOFFICE_ALINEACION_FE_v0.2,
 * seccion 2.5). Data-driven y extensible: cada entrada mapea codigos/patrones del
 * resultado SIFEN a una categoria (USUARIO puede resolverlo el operador, SOPORTE
 * requiere escalar) mas el texto en lenguaje simple que ve el usuario.
 *
 * Sin match -> SOPORTE (RN-V4 del SPEC: el usuario nunca queda sin salida).
 */

export type AccionSugerida = "REINTENTAR" | "CORREGIR_REEMITIR" | "CREAR_NCE" | "CONTACTAR_SOPORTE";

export interface CausaSifen {
  categoria: "USUARIO" | "SOPORTE";
  titulo: string;
  descripcion: string;
  acciones: AccionSugerida[];
}

interface CatalogoEntry {
  codes?: string[];
  pattern?: RegExp;
  causa: CausaSifen;
}

const CATALOGO: CatalogoEntry[] = [
  {
    // 1306: caso ya conocido hoy en getRejectedSifenMessage (frontend) — migrado aca.
    codes: ["1306"],
    causa: {
      categoria: "USUARIO",
      titulo: "Receptor no valido en el ambiente de pruebas",
      descripcion:
        "SIFEN (homologacion) rechazo el documento porque el receptor no esta habilitado para pruebas. " +
        "Use un receptor existente en Marangatu test o uno ya validado previamente.",
      acciones: ["CORREGIR_REEMITIR"]
    }
  },
  {
    codes: ["0160", "0161", "0162"],
    causa: {
      categoria: "USUARIO",
      titulo: "Datos del cliente incorrectos",
      descripcion: "El RUC o los datos del cliente no coinciden con lo registrado ante la SET. Corrija el documento del cliente y vuelva a emitir.",
      acciones: ["CORREGIR_REEMITIR"]
    }
  },
  {
    pattern: /timbrado|numeraci[oó]n/i,
    causa: {
      categoria: "SOPORTE",
      titulo: "Problema de timbrado o numeración",
      descripcion: "Hay un inconveniente con el timbrado o la numeración fiscal asignada. Esto requiere revisión de soporte.",
      acciones: ["CONTACTAR_SOPORTE"]
    }
  }
];

const DEFAULT_CAUSA_SOPORTE: CausaSifen = {
  categoria: "SOPORTE",
  titulo: "Necesita revisión de soporte",
  descripcion: "No pudimos determinar automáticamente la causa del rechazo. Comparta los datos de abajo con soporte para que lo revisen.",
  acciones: ["CONTACTAR_SOPORTE"]
};

export function resolveCausaSifen(code: string | null, message: string | null): CausaSifen {
  if (code) {
    const byCode = CATALOGO.find((entry) => entry.codes?.includes(code));
    if (byCode) {
      return byCode.causa;
    }
  }
  if (message) {
    const byPattern = CATALOGO.find((entry) => entry.pattern?.test(message));
    if (byPattern) {
      return byPattern.causa;
    }
  }
  return DEFAULT_CAUSA_SOPORTE;
}
