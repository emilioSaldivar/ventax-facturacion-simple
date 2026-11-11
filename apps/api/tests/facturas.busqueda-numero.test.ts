// SPEC_UX_RESTO_APP_v0.1 RN-12 (URA-025): que textos se interpretan como numero completo EEE-PPP-NNNNNNN.
import { describe, expect, it } from "vitest";
import { interpretarNumeroCompleto } from "../src/modules/facturas/busqueda-numero";

describe("interpretarNumeroCompleto", () => {
  it("lee el numero con guiones", () => {
    expect(interpretarNumeroCompleto("001-001-1010006")).toEqual({ establecimiento: "001", punto: "001", numero: "1010006" });
  });

  it("lee el numero sin guiones y con espacios alrededor", () => {
    expect(interpretarNumeroCompleto(" 0010021010006 ")).toEqual({ establecimiento: "001", punto: "002", numero: "1010006" });
  });

  it("acepta un numero corto (prefijo o sin ceros a la izquierda)", () => {
    expect(interpretarNumeroCompleto("001-002-8487")).toEqual({ establecimiento: "001", punto: "002", numero: "8487" });
  });

  it("no toma como numero un RUC, un nombre, un numero suelto ni un CDC", () => {
    expect(interpretarNumeroCompleto("80026570-0")).toBeNull();
    expect(interpretarNumeroCompleto("SEGEL SA")).toBeNull();
    expect(interpretarNumeroCompleto("1010006")).toBeNull();
    expect(interpretarNumeroCompleto("0010011010")).toBeNull();
    expect(interpretarNumeroCompleto("001001-1010006")).toBeNull();
    expect(interpretarNumeroCompleto("01800265700001001101000612026111011123456780")).toBeNull();
    expect(interpretarNumeroCompleto("001-001-12345678")).toBeNull();
    expect(interpretarNumeroCompleto("")).toBeNull();
    expect(interpretarNumeroCompleto(undefined)).toBeNull();
  });
});
