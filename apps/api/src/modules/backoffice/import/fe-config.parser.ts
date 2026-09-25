// Parseo del archivo de configuracion exportado por facturacion-electronica.
//
// Responsabilidad acotada (PLAN fase 2): texto -> documento desenvuelto y validado
// estructuralmente. Ninguna regla de negocio vive aca; eso es del mapper.

import { parse as parseYaml } from "yaml";
import { ZodError } from "zod";
import { HttpError } from "../../../shared/errors/http-error";
import { CONTRATO_VERSIONES_SOPORTADAS, feConfigSchema, type FeConfigDocument } from "./fe-config.contract";

export type FeConfigFormat = "json" | "yaml";
export type FeConfigFormatHint = FeConfigFormat | "auto";

export interface ParsedFeConfig {
  document: FeConfigDocument;
  format: FeConfigFormat;
  /** Ruta JSON-path-ish -> ancla de la guia FE. Es la trazabilidad que el wrapper aporta. */
  referencias: Record<string, string>;
}

/**
 * Claves que puede tener un envoltorio `{valor, referencia}`.
 * Un objeto solo se desenvuelve si tiene `valor` Y todas sus claves estan aca: asi un
 * objeto de negocio futuro que casualmente traiga un campo `valor` no se destruye.
 */
const WRAPPER_KEYS = new Set(["valor", "referencia", "nota", "fuente"]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isWrapper(node: Record<string, unknown>): boolean {
  if (!Object.prototype.hasOwnProperty.call(node, "valor")) {
    return false;
  }
  return Object.keys(node).every((key) => WRAPPER_KEYS.has(key));
}

/**
 * Desenvuelve recursivamente los `{valor, referencia}` y acumula las referencias por ruta.
 * `refs` se muta a proposito: es un acumulador, no un valor de retorno alternativo.
 */
export function unwrapValores(node: unknown, path = "$", refs: Record<string, string> = {}): unknown {
  if (Array.isArray(node)) {
    return node.map((item, index) => unwrapValores(item, `${path}[${index}]`, refs));
  }

  if (!isPlainObject(node)) {
    return node;
  }

  if (isWrapper(node)) {
    const referencia = node.referencia;
    if (typeof referencia === "string" && referencia.length > 0) {
      refs[path] = referencia;
    }
    return unwrapValores(node.valor, path, refs);
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    result[key] = unwrapValores(value, `${path}.${key}`, refs);
  }
  return result;
}

/** Quita BOM y normaliza saltos de linea antes de parsear. */
function normalizeText(content: string): string {
  return content.replace(/^﻿/, "").replace(/\r\n/g, "\n");
}

/**
 * Resuelve el formato: hint explicito -> extension del nombre -> primer caracter util.
 * El fallback es YAML porque todo JSON valido es YAML valido, pero no al reves.
 */
export function detectFormat(filename: string, content: string, hint: FeConfigFormatHint = "auto"): FeConfigFormat {
  if (hint === "json" || hint === "yaml") {
    return hint;
  }

  if (/\.json$/i.test(filename)) return "json";
  if (/\.ya?ml$/i.test(filename)) return "yaml";

  const firstChar = normalizeText(content).trimStart().charAt(0);
  return firstChar === "{" || firstChar === "[" ? "json" : "yaml";
}

function parseDocumentText(text: string, format: FeConfigFormat): unknown {
  if (format === "json") {
    try {
      return JSON.parse(text);
    } catch (error) {
      throw new HttpError(400, "VALIDATION_ERROR", "El archivo no es un JSON valido.", {
        formato: format,
        detalle: error instanceof Error ? error.message : String(error)
      });
    }
  }

  try {
    // `maxAliasCount` acota la expansion por anclas; `merge: false` desactiva las claves `<<`.
    return parseYaml(text, { maxAliasCount: 100, merge: false });
  } catch (error) {
    const linePos = (error as { linePos?: Array<{ line: number; col: number }> }).linePos;
    throw new HttpError(400, "VALIDATION_ERROR", "El archivo no es un YAML valido.", {
      formato: format,
      linea: linePos?.[0]?.line ?? null,
      columna: linePos?.[0]?.col ?? null,
      detalle: error instanceof Error ? error.message : String(error)
    });
  }
}

export function parseFeConfig(input: {
  filename: string;
  content: string;
  format?: FeConfigFormatHint;
}): ParsedFeConfig {
  const format = detectFormat(input.filename, input.content, input.format ?? "auto");
  const text = normalizeText(input.content);
  const raw = parseDocumentText(text, format);

  if (!isPlainObject(raw)) {
    throw new HttpError(400, "VALIDATION_ERROR", "El archivo no contiene un documento de configuracion.", {
      formato: format
    });
  }

  const referencias: Record<string, string> = {};
  const unwrapped = unwrapValores(raw, "$", referencias);

  try {
    const document = feConfigSchema.parse(unwrapped);
    return { document, format, referencias };
  } catch (error) {
    if (error instanceof ZodError) {
      throw new HttpError(400, "VALIDATION_ERROR", "El archivo no cumple el contrato de configuracion fiscal.", {
        formato: format,
        zod: error.flatten()
      });
    }
    throw error;
  }
}

/** Compuerta de compatibilidad. La decision de bloquear es del mapper; aca solo se consulta. */
export function esVersionSoportada(version: string | null | undefined): boolean {
  return typeof version === "string" && (CONTRATO_VERSIONES_SOPORTADAS as readonly string[]).includes(version.trim());
}
