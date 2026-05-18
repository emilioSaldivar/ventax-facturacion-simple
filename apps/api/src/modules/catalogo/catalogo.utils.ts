import crypto from "node:crypto";

export function normalizeCodigo(codigo: string): string {
  return codigo.trim().toUpperCase().replace(/\s+/g, "");
}

export function generateAutoCodigo(): string {
  return `AUTO-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

