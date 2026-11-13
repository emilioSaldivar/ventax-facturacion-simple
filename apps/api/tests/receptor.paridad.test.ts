import { describe, expect, it } from "vitest";
import * as api from "../src/shared/validation/receptor";
import * as web from "../../web-operacion/src/lib/validacionReceptor";

// TASKS_VALIDACIONES_RECEPTOR_v0.1 VAL-002 y VAL-005: la web valida igual que la API.
describe("paridad de validaciones del receptor entre API y web", () => {
  const receptores = [
    { documento_tipo: "RUC", documento: "80012345-0", razon_social: "Empresa SA" },
    { documento_tipo: "RUC", documento: " 80012345 - 0 ", razon_social: "Empresa   SA", telefono: "+595 (981) 123-456", email: " a@b.com " },
    { documento_tipo: "RUC", documento: "80012345-1", razon_social: "Empresa SA" },
    { documento_tipo: "RUC", documento: "80012345", razon_social: "Empresa SA" },
    { documento_tipo: "RUC", documento: "xxx", razon_social: "Sin nombre" },
    { documento_tipo: "RUC", documento: "A123456-5", razon_social: "Extranjero SA" },
    { documento_tipo: "RUC", documento: "12-3", razon_social: "Empresa SA" },
    { documento_tipo: "CI", documento: "1.234.567", razon_social: "Juan Perez" },
    { documento_tipo: "CI", documento: "123456A", razon_social: "Ana" },
    { documento_tipo: "PASAPORTE", documento: "AB 123456", razon_social: "John Smith", email: "john @mail.com" },
    { documento_tipo: "CI", documento: "1234567", razon_social: "Juan Perez", telefono: "12345", email: "juan@mail" },
    { documento_tipo: "CI", documento: "1234567", razon_social: "Juan Perez", direccion: "x".repeat(256) },
    { documento_tipo: "INNOMINADO", documento: "0", razon_social: "Sin Nombre" },
    // SPEC_DIRECCION_RECEPTOR_v0.1 RN-03 y RN-06.
    { documento_tipo: "CI", documento: "1234567", razon_social: "Juan Perez", direccion: "Avda. Mcal. López Nº 1234 (esq. Brasil) - Dpto. 3/B" },
    { documento_tipo: "CI", documento: "1234567", razon_social: "Juan Perez", direccion: "Cerro\nleon\tc/ “alejo” garcía" },
    { documento_tipo: "CI", documento: "1234567", razon_social: "Juan Perez", direccion: "Casa 🏠 azul" },
    { documento_tipo: "CI", documento: "1234567", razon_social: "Juan Perez", direccion: "Ruta 2\u0007 Km 30" },
    { documento_tipo: "CI", documento: "1234567", razon_social: "Juan Perez", direccion: "Ruta 2", numero_casa: "12a", departamento: 1, ciudad: 1 }
  ];

  it.each(receptores)("%j da el mismo resultado", (receptor) => {
    expect(web.revisarReceptor(receptor)).toEqual(api.revisarReceptor(receptor));
  });

  it("mismo DV para todas las bases de prueba", () => {
    for (const base of ["80012345", "4543629", "80044279", "80136968", "80120841", "5057016", "A123456", "ZZ9"]) {
      expect(web.calcularDvRuc(base)).toBe(api.calcularDvRuc(base));
    }
  });

  it("mismo domicilio completo", () => {
    const casos = [
      { direccion: "Calle 1", numero_casa: "0", departamento: 1, ciudad: 1 },
      { direccion: "Calle 1", numero_casa: "0", departamento: 1, ciudad: null },
      { direccion: null, numero_casa: "0", departamento: 1, ciudad: 1 },
      { direccion: "Calle 1", numero_casa: "1234567", departamento: 1, ciudad: 1 }
    ];
    for (const c of casos) expect(web.domicilioCompleto(c)).toBe(api.domicilioCompleto(c));
  });

  it("mismo numero de casa", () => {
    for (const v of ["0", "123456", "ABC", "1234567"]) expect(web.validarNumeroCasa(v)).toEqual(api.validarNumeroCasa(v));
  });
});
