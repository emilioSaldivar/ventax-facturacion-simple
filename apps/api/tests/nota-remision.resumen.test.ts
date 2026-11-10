import { describe, expect, it } from "vitest";
import { resumenRemision } from "../src/modules/facturas/nota-remision.resumen";

describe("resumen de la nota de remision (SPEC_DOCUMENTOS_ESCRITORIO_v0.1, RN-08)", () => {
  it("toma motivo, traslado, transportista y vehiculo del detalle de FE", () => {
    expect(resumenRemision({
      remision: { motivo: 7, kilometros: 12 },
      transporte: { inicioTraslado: "2026-11-10", finTraslado: "2026-11-11", transportista: { nombre: "Transportes X" }, vehiculos: [{ tipo: "Camion", marca: "Volvo", matricula: "ABC123" }] }
    })).toEqual({
      motivo: 7,
      motivo_descripcion: "Traslado entre locales de la empresa",
      inicio_traslado: "2026-11-10",
      fin_traslado: "2026-11-11",
      kilometros: 12,
      transportista: "Transportes X",
      vehiculo: "Camion · Volvo · ABC123"
    });
  });

  it("motivo 99 con su descripcion; sin detalle, todo en null", () => {
    expect(resumenRemision({ remision: { motivo: 99, descripcion: "Muestras" } }).motivo_descripcion).toBe("Otro: Muestras");
    expect(resumenRemision(null)).toMatchObject({ motivo: null, motivo_descripcion: null, transportista: null, vehiculo: null });
  });
});
