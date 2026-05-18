export function normalizeDocumento(documento: string): string {
  return documento.trim().toUpperCase().replace(/[^0-9A-Z]/g, "");
}

export function normalizeOptional(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

