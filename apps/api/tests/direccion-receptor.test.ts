import { afterEach, describe, expect, it, vi } from "vitest";
import {
  domicilioCompleto,
  normalizarDireccion,
  revisarReceptor,
  validarDireccion
} from "../src/shared/validation/receptor";
import { leerCiudadesDeDepartamento, leerGeografia, limpiarCacheGeografia } from "../src/modules/geografia/geografia.service";
import type { FiscalGateway } from "../src/modules/fiscal-gateway/fiscal-gateway.types";

// SPEC_DIRECCION_RECEPTOR_v0.1 (FS-152, FS-154, FS-155), TASKS DIR-002, DIR-006 y DIR-007.
describe("direccion del receptor: caracteres (RN-06, CA-03)", () => {
  it.each([
    "Cerro leon c/ alejo garcia",
    "Avda. Mcal. López Nº 1234 (esq. Brasil) - Dpto. 3/B",
    "Ruta 2 Km 30 #45",
    "Itá Ybaté 1ª etapa, 2° piso & 'Lote' \"7\"",
    "Ñemby / San Lorenzo"
  ])("acepta %s", (direccion) => {
    expect(validarDireccion(normalizarDireccion(direccion))).toEqual({ ok: true });
  });

  it("rechaza emojis y caracteres de control con un mensaje que los nombra", () => {
    const emoji = validarDireccion(normalizarDireccion("Casa 🏠 azul"));
    expect(emoji.ok).toBe(false);
    if (!emoji.ok) expect(emoji.mensaje).toContain("🏠");
    const control = validarDireccion(normalizarDireccion("Ruta 2\u0007 Km 30"));
    expect(control.ok).toBe(false);
    if (!control.ok) expect(control.mensaje).toContain("un carácter invisible");
  });

  it("saltos de linea y tabulaciones pasan a espacio; comillas tipograficas a comunes; recorta", () => {
    expect(normalizarDireccion("  Cerro\nleon\r\n\tc/ “alejo” ‘garcia’  ")).toBe("Cerro leon c/ \"alejo\" 'garcia'");
    expect(normalizarDireccion("   ")).toBeNull();
  });

  it("maximo 255", () => {
    expect(validarDireccion("a".repeat(255)).ok).toBe(true);
    expect(validarDireccion("a".repeat(256)).ok).toBe(false);
  });
});

describe("domicilio (RN-01 a RN-03)", () => {
  it("completo solo con calle, numero valido, departamento y ciudad", () => {
    expect(domicilioCompleto({ direccion: "Calle 1", numero_casa: "0", departamento: 1, ciudad: 1 })).toBe(true);
    expect(domicilioCompleto({ direccion: "Calle 1", numero_casa: "", departamento: 1, ciudad: 1 })).toBe(false);
    expect(domicilioCompleto({ direccion: "Calle 1", numero_casa: "0", departamento: 1 })).toBe(false);
    expect(domicilioCompleto({ direccion: "", numero_casa: "0", departamento: 1, ciudad: 1 })).toBe(false);
    expect(domicilioCompleto({ direccion: "Calle 1", numero_casa: "1234567", departamento: 1, ciudad: 1 })).toBe(false);
  });

  it("incompleto no es error; un numero de casa invalido si", () => {
    const base = { documento_tipo: "CI", documento: "1234567", razon_social: "Juan Perez", direccion: "Calle 1" };
    expect(revisarReceptor({ ...base, departamento: 1 }).errores).toEqual([]);
    expect(revisarReceptor({ ...base, numero_casa: "12a" }).errores.map((e) => e.campo)).toEqual(["numero_casa"]);
  });
});

describe("geografia (RN-04, RN-07)", () => {
  afterEach(() => limpiarCacheGeografia());

  const gateway = (): FiscalGateway =>
    ({
      getGeografia: vi.fn(async (filtro: { departamento?: number; distrito?: number }) => {
        if (filtro.departamento === 11) return { version: "2026.11", items: [{ codigo: 101, descripcion: "LUQUE", departamento: 11 }, { codigo: 102, descripcion: "AREGUA", departamento: 11 }] };
        if (filtro.distrito === 101) return { version: "2026.11", items: [{ codigo: 9001, descripcion: "LUQUE", distrito: 101 }, { codigo: 6531, descripcion: "COLONIA SAN ALFREDO - MARIA AUXILIADORA", distrito: 101 }] };
        if (filtro.distrito === 102) return { version: "2026.11", items: [{ codigo: 9002, descripcion: "AREGUA", distrito: 102 }] };
        return { version: "2026.11", items: [] };
      })
    }) as unknown as FiscalGateway;

  it("ciudades por distrito sin las de mas de 30 caracteres (FS-155)", async () => {
    const r = await leerGeografia(gateway(), { distrito: 101 });
    expect(r.items.map((c) => c.codigo)).toEqual([9001]);
  });

  it("ciudades del departamento, unidas, con distrito y departamento, en orden alfabetico", async () => {
    const r = await leerCiudadesDeDepartamento(gateway(), 11);
    expect(r.items).toEqual([
      { codigo: 9002, descripcion: "AREGUA", distrito: 102, departamento: 11 },
      { codigo: 9001, descripcion: "LUQUE", distrito: 101, departamento: 11 }
    ]);
  });
});
