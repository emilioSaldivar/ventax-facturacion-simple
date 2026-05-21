import { describe, expect, it } from "vitest";
import { clearFiscalReadinessCacheForTests, getOperationalContext, getReadiness } from "../src/modules/context/context.service";
import { deriveTituloOperativo } from "../src/modules/context/context.repository";
import type { OperationalContextRepository, OperationalContextResponse, ReadinessCheck } from "../src/modules/context/context.types";
import type { FiscalGateway } from "../src/modules/fiscal-gateway/fiscal-gateway.types";

const contextFixture: OperationalContextResponse = {
  user: {
    id: "11111111-1111-4111-8111-111111111111",
    username: "operador",
    display_name: "Operador",
    role: "OPERADOR_FACTURACION"
  },
  tenant: {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Tenant Demo",
    status: "ACTIVE"
  },
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
    credito_plazo_dias: 30
  }
};

class FakeContextRepository implements OperationalContextRepository {
  constructor(
    private readonly context: OperationalContextResponse | null,
    private readonly checks: ReadinessCheck[]
  ) {}

  async getOperationalContext(): Promise<OperationalContextResponse | null> {
    return this.context;
  }

  async getReadinessChecks(): Promise<ReadinessCheck[]> {
    return this.checks;
  }
}

class FakeFiscalGateway implements FiscalGateway {
  public healthCalls = 0;

  constructor(
    private readonly ok: boolean,
    private readonly throws = false
  ) {}

  async health() {
    this.healthCalls += 1;
    if (this.throws) {
      throw new Error("timeout fiscal");
    }

    return {
      ok: this.ok,
      mode: "mock" as const,
      message: this.ok ? "Fiscal OK" : "Fiscal caido"
    };
  }

  async emitFactura() {
    throw new Error("not needed");
  }

  async emitNotaCredito() {
    throw new Error("not needed");
  }

  async refreshFacturaStatus() {
    throw new Error("not needed");
  }

  async cancelFactura() {
    throw new Error("not needed");
  }

  async getXml() {
    throw new Error("not needed");
  }

  async getKudePdf() {
    throw new Error("not needed");
  }
}

describe("context service", () => {
  it("derives operative title by activity profile without changing fiscal data", () => {
    expect(
      deriveTituloOperativo({
        actividadPerfilAlias: "Taller mecanico",
        nombreFantasia: "Autos Demo",
        actividadAlias: "Servicios",
        actividadDescripcion: "Servicios administrativos",
        razonSocial: "Facturador Demo S.A."
      })
    ).toBe("Taller mecanico");
  });

  it("falls back to trade name, activity and legal name for operative title", () => {
    expect(
      deriveTituloOperativo({
        actividadPerfilAlias: " ",
        nombreFantasia: "Autos Demo",
        actividadAlias: "Servicios",
        actividadDescripcion: "Servicios administrativos",
        razonSocial: "Facturador Demo S.A."
      })
    ).toBe("Autos Demo");
    expect(
      deriveTituloOperativo({
        nombreFantasia: null,
        actividadAlias: "Servicios",
        actividadDescripcion: "Servicios administrativos",
        razonSocial: "Facturador Demo S.A."
      })
    ).toBe("Servicios");
    expect(
      deriveTituloOperativo({
        nombreFantasia: null,
        actividadAlias: null,
        actividadDescripcion: null,
        razonSocial: "Facturador Demo S.A."
      })
    ).toBe("Facturador Demo S.A.");
  });

  it("returns operational context", async () => {
    const repo = new FakeContextRepository(contextFixture, []);

    await expect(getOperationalContext(contextFixture.user.id, repo)).resolves.toEqual(contextFixture);
  });

  it("rejects missing operational context", async () => {
    const repo = new FakeContextRepository(null, []);

    await expect(getOperationalContext(contextFixture.user.id, repo)).rejects.toMatchObject({
      statusCode: 409,
      code: "CONFLICT"
    });
  });

  it("marks readiness true when all checks pass", async () => {
    const repo = new FakeContextRepository(contextFixture, [
      { code: "tenant_activo", ok: true, message: "Tenant activo." },
      { code: "suscripcion_activa", ok: true, message: "Suscripcion activa." }
    ]);

    await expect(getReadiness(contextFixture.user.id, repo)).resolves.toEqual({
      ready: true,
      checks: [
        { code: "tenant_activo", ok: true, message: "Tenant activo." },
        { code: "suscripcion_activa", ok: true, message: "Suscripcion activa." }
      ]
    });
  });

  it("marks readiness false when one check fails", async () => {
    const repo = new FakeContextRepository(contextFixture, [
      { code: "tenant_activo", ok: true, message: "Tenant activo." },
      { code: "usuario_config_operativa", ok: false, message: "Falta configuracion operativa del usuario." }
    ]);

    const readiness = await getReadiness(contextFixture.user.id, repo);

    expect(readiness.ready).toBe(false);
  });

  it("adds cached fiscal backend readiness when gateway is provided", async () => {
    clearFiscalReadinessCacheForTests();
    const repo = new FakeContextRepository(contextFixture, [
      { code: "tenant_activo", ok: true, message: "Tenant activo." },
      { code: "suscripcion_activa", ok: true, message: "Suscripcion activa." }
    ]);
    const gateway = new FakeFiscalGateway(true);

    const first = await getReadiness(contextFixture.user.id, repo, gateway);
    const second = await getReadiness(contextFixture.user.id, repo, gateway);

    expect(first.ready).toBe(true);
    expect(first.checks).toContainEqual({
      code: "fiscal_backend_ready",
      ok: true,
      message: "Backend fiscal disponible (mock)."
    });
    expect(second.ready).toBe(true);
    expect(gateway.healthCalls).toBe(1);
  });

  it("marks readiness false when fiscal backend is unavailable", async () => {
    clearFiscalReadinessCacheForTests();
    const repo = new FakeContextRepository(contextFixture, [
      { code: "tenant_activo", ok: true, message: "Tenant activo." }
    ]);
    const gateway = new FakeFiscalGateway(false);

    const readiness = await getReadiness(contextFixture.user.id, repo, gateway);

    expect(readiness.ready).toBe(false);
    expect(readiness.checks).toContainEqual({
      code: "fiscal_backend_ready",
      ok: false,
      message: "Fiscal caido"
    });
  });

  it("keeps readiness response operational when fiscal health throws", async () => {
    clearFiscalReadinessCacheForTests();
    const repo = new FakeContextRepository(contextFixture, [
      { code: "tenant_activo", ok: true, message: "Tenant activo." }
    ]);
    const gateway = new FakeFiscalGateway(false, true);

    const readiness = await getReadiness(contextFixture.user.id, repo, gateway);

    expect(readiness.ready).toBe(false);
    expect(readiness.checks).toContainEqual({
      code: "fiscal_backend_ready",
      ok: false,
      message: "timeout fiscal"
    });
  });
});
