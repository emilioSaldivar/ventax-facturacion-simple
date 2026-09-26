import { describe, expect, it } from "vitest";

import { HttpError } from "../src/shared/errors/http-error";
import {
  createDocumentoDerived,
  esRolSoporteInterno,
  getDocumentoDecision,
  getDocumentoEventos,
  getReconciliacionFiscal,
  retryDocumentoSameCdc,
  validateDocumentoCdcImpact,
  voidDocumentoNumber
} from "../src/modules/facturas/facturas.service";
import type { FacturaRepository } from "../src/modules/facturas/facturas.types";
import type { FiscalGateway } from "../src/modules/fiscal-gateway/fiscal-gateway.types";
import type { OperationalContextResponse } from "../src/modules/context/context.types";

/**
 * SEG-003 — fija la equivalencia de comportamiento de la lista blanca de soporte interno
 * (SPEC_SEGMENTACION_PERFIL_EMISION §0 / CA-1) y protege el invariante hacia adelante:
 * un rol desconocido no obtiene permisos de soporte por descarte.
 */

const GATE_PASSED = "GATE_PASSED";

/**
 * Cualquier acceso a repositorio o gateway significa que la autorizacion ya dejo pasar
 * la llamada. Lanzar un centinela permite distinguir "paso el guard" de "fue rechazado"
 * sin montar los stubs completos de cada operacion fiscal.
 */
function throwingProxy<T extends object>(): T {
  return new Proxy({} as T, {
    get() {
      return () => {
        throw new Error(GATE_PASSED);
      };
    }
  });
}

const baseContext: OperationalContextResponse = {
  user: {
    id: "11111111-1111-4111-8111-111111111111",
    username: "usuario",
    display_name: "Usuario",
    role: "OPERADOR_FACTURACION"
  },
  tenant: { id: "22222222-2222-4222-8222-222222222222", name: "Tenant Demo", status: "ACTIVE" },
  facturador: {
    id: "33333333-3333-4333-8333-333333333333",
    emisor_id: "80136968-1",
    razon_social: "Facturador Demo",
    ruc: "80136968-1"
  },
  fiscal_context: {
    establecimiento: "001",
    punto_expedicion: "001",
    perfil_emision_codigo: "SERV",
    actividad_economica_codigo: "82110",
    actividad_economica_descripcion: "Servicios administrativos",
    timbrado: "80136968",
    timbrado_inicio: "2025-12-30",
    documento_nro: "0000000",
    credito_plazo_dias: 30,
    tipo_transaccion_default: 2,
    fiscal_envio_modo: "BATCH",
    batch_enabled: true
  },
  actividad_punto_perfil_id: "55555555-5555-4555-8555-555555555555"
};

function contextWithRole(role: string): OperationalContextResponse {
  return { ...baseContext, user: { ...baseContext.user, role: role as OperationalContextResponse["user"]["role"] } };
}

const documentoId = "44444444-4444-4444-8444-444444444444";

/** Las siete operaciones protegidas por soporte interno en facturas.service.ts. */
const operacionesProtegidas: Array<{
  nombre: string;
  invocar: (context: OperationalContextResponse) => Promise<unknown>;
}> = [
  {
    nombre: "getDocumentoEventos",
    invocar: (context) =>
      getDocumentoEventos(context, documentoId, throwingProxy<FacturaRepository>(), throwingProxy<FiscalGateway>())
  },
  {
    nombre: "getDocumentoDecision",
    invocar: (context) =>
      getDocumentoDecision(context, documentoId, throwingProxy<FacturaRepository>(), throwingProxy<FiscalGateway>())
  },
  {
    nombre: "getReconciliacionFiscal",
    invocar: (context) =>
      getReconciliacionFiscal(
        context,
        { offset: 0, limit: 10 },
        throwingProxy<FiscalGateway>(),
        throwingProxy<FacturaRepository>()
      )
  },
  {
    nombre: "validateDocumentoCdcImpact",
    invocar: (context) =>
      validateDocumentoCdcImpact(
        context,
        documentoId,
        undefined,
        throwingProxy<FacturaRepository>(),
        throwingProxy<FiscalGateway>()
      )
  },
  {
    nombre: "retryDocumentoSameCdc",
    invocar: (context) =>
      retryDocumentoSameCdc(
        context,
        documentoId,
        undefined,
        throwingProxy<FacturaRepository>(),
        throwingProxy<FiscalGateway>()
      )
  },
  {
    nombre: "createDocumentoDerived",
    invocar: (context) =>
      createDocumentoDerived(
        context,
        documentoId,
        undefined,
        throwingProxy<FacturaRepository>(),
        throwingProxy<FiscalGateway>()
      )
  },
  {
    nombre: "voidDocumentoNumber",
    invocar: (context) =>
      voidDocumentoNumber(
        context,
        documentoId,
        { motivo: "Prueba de autorizacion" },
        throwingProxy<FacturaRepository>(),
        throwingProxy<FiscalGateway>()
      )
  }
];

async function resultadoDelGuard(
  operacion: (typeof operacionesProtegidas)[number],
  role: string
): Promise<"RECHAZADO" | "AUTORIZADO"> {
  try {
    await operacion.invocar(contextWithRole(role));
  } catch (error) {
    if (error instanceof HttpError && error.statusCode === 403 && error.code === "FORBIDDEN") {
      return "RECHAZADO";
    }
    return "AUTORIZADO";
  }
  return "AUTORIZADO";
}

describe("esRolSoporteInterno", () => {
  it("acepta los dos roles internos y rechaza al operador", () => {
    expect(esRolSoporteInterno("SOPORTE_INTERNO")).toBe(true);
    expect(esRolSoporteInterno("ADMIN_INTERNO")).toBe(true);
    expect(esRolSoporteInterno("OPERADOR_FACTURACION")).toBe(false);
  });

  it("rechaza cualquier rol desconocido en lugar de concederle permisos por descarte", () => {
    for (const role of ["CONSULTA_FACTURADOR", "ROL_FUTURO", "", "soporte_interno", "ADMIN"]) {
      expect(esRolSoporteInterno(role), role).toBe(false);
    }
  });
});

describe("autorizacion de soporte interno en facturas.service", () => {
  it.each(operacionesProtegidas.map((operacion) => [operacion.nombre, operacion] as const))(
    "%s conserva el comportamiento de los tres roles actuales",
    async (_nombre, operacion) => {
      expect(await resultadoDelGuard(operacion, "OPERADOR_FACTURACION")).toBe("RECHAZADO");
      expect(await resultadoDelGuard(operacion, "SOPORTE_INTERNO")).toBe("AUTORIZADO");
      expect(await resultadoDelGuard(operacion, "ADMIN_INTERNO")).toBe("AUTORIZADO");
    }
  );

  it.each(operacionesProtegidas.map((operacion) => [operacion.nombre, operacion] as const))(
    "%s rechaza un rol desconocido",
    async (_nombre, operacion) => {
      expect(await resultadoDelGuard(operacion, "CONSULTA_FACTURADOR")).toBe("RECHAZADO");
      expect(await resultadoDelGuard(operacion, "ROL_FUTURO")).toBe("RECHAZADO");
    }
  );
});
