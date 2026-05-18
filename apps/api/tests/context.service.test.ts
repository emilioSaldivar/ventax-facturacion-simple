import { describe, expect, it } from "vitest";
import { getOperationalContext, getReadiness } from "../src/modules/context/context.service";
import type { OperationalContextRepository, OperationalContextResponse, ReadinessCheck } from "../src/modules/context/context.types";

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
    actividad_economica_descripcion: "Servicios administrativos"
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

describe("context service", () => {
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
});
