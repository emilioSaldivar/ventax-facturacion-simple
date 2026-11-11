// Formatos compartidos (PAUTAS_FRONTEND_v0.1 P-E4). URA-022 empieza con el numero correlativo; URA-023 mueve aca el
// resto de los formatos de main.tsx.
import type { TipoIva } from "../tipos";

/** Numero de presupuesto, pedido o recibo con siete cifras: 12 -> "0000012". */
export function numeroCorrelativo(numero: number | string): string {
  return String(numero).padStart(7, "0");
}

export function formatHora(iso: string | null | undefined): string {
  if (!iso) return "";
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return "";
  return fecha.toLocaleTimeString("es-PY", { hour: "2-digit", minute: "2-digit" });
}

export function fmtFecha(iso: string | null | undefined): string {
  if (!iso) return "";
  const match = iso.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  return iso;
}

export function buildWhatsAppShareUrl(publicUrl: string, phone: string): string {
  const digits = normalizeParaguayWhatsAppDigits(phone);
  const text = encodeURIComponent(`Comprobante Segel: ${publicUrl}`);
  if (!digits) {
    return `https://wa.me/?text=${text}`;
  }
  return `https://wa.me/${digits}?text=${text}`;
}

export function normalizeParaguayWhatsAppDigits(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (!digits) {
    return "";
  }
  if (digits.startsWith("00")) {
    return digits.slice(2);
  }
  if (digits.startsWith("595")) {
    return digits;
  }
  if (digits.startsWith("09")) {
    return `595${digits.slice(1)}`;
  }
  if (digits.startsWith("9") && digits.length === 9) {
    return `595${digits}`;
  }
  if (digits.startsWith("0")) {
    return `595${digits.slice(1)}`;
  }
  return digits;
}

/** RN-04: guaranies sin decimales; otra moneda con su codigo y 2 decimales ("USD 1.234,50"). */
export function formatMonto(value: number, moneda: string | undefined | null): string {
  if (!moneda || moneda === "PYG") return formatGuaranies(value);
  return `${moneda} ${new Intl.NumberFormat("es-PY", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}`;
}

/** Cantidad para mostrar: "2", "1,5", "0,125" (sin ceros de relleno). */
export function formatCantidad(valor: number | string): string {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return String(valor);
  return new Intl.NumberFormat("es-PY", { maximumFractionDigits: 4 }).format(numero);
}

export function formatGuaranies(value: number): string {
  return new Intl.NumberFormat("es-PY", {
    style: "currency",
    currency: "PYG",
    maximumFractionDigits: 0
  }).format(value);
}

export function formatYmdFromDate(date: Date): string {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatShortDate(value: string | null): string {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return date.toLocaleDateString("es-PY");
}

export function formatUltimaVerificacion(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return "hace instantes";
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffHours = Math.round(diffMin / 60);
  if (diffHours < 24) return `hace ${diffHours} h`;
  const diffDays = Math.round(diffHours / 24);
  return `hace ${diffDays} d`;
}

/** Iniciales para el avatar de la barra (hasta dos letras). */
export function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  const primera = partes[0] ?? "";
  const ultima = partes[partes.length - 1] ?? "";
  const letras = partes.length >= 2 ? primera.slice(0, 1) + ultima.slice(0, 1) : primera.slice(0, 2);
  return letras.toUpperCase();
}

export function firstText(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  return null;
}

// Convencion del proyecto para campos numericos enteros (montos, cantidades): el input
// muestra el valor con puntos de miles (es-PY) mientras se escribe, pero el estado de
// React y el payload enviado al backend siempre son digitos/numero puro, sin puntos.
export function normalizeIntegerInput(value: string): string {
  return value.replace(/[^\d]/g, "");
}

export function formatIntegerInput(value: string): string {
  const digits = normalizeIntegerInput(value);
  if (!digits) {
    return "";
  }
  return Number(digits).toLocaleString("es-PY");
}

/** Digitos y un separador decimal (coma o punto), hasta `decimales`; se guarda con punto. Precio: 2; cantidad: 4. */
export function normalizeDecimalInput(value: string, decimales = 2): string {
  const limpio = value.replace(/[^\d.,]/g, "").replace(",", ".");
  const [entero, ...resto] = limpio.split(".");
  if (resto.length === 0) return entero ?? "";
  return `${entero ?? ""}.${resto.join("").replace(/\./g, "").slice(0, decimales)}`;
}

/** SPEC_MONEDA_EXTRANJERA_v0.1, RN-06 (MT150 E711): cantidad mayor que cero con hasta 4 decimales. */
export function cantidadValida(valor: number): boolean {
  return Number.isFinite(valor) && valor > 0 && Math.abs(valor * 10000 - Math.round(valor * 10000)) < 1e-6;
}

export function formatIva(value: TipoIva): string {
  if (value === "IVA_10") {
    return "IVA 10%";
  }
  if (value === "IVA_5") {
    return "IVA 5%";
  }
  return "Exenta";
}
