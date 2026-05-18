import { describe, expect, it } from "vitest";
import {
  createCliente,
  listClientes,
  normalizeClienteInput,
  searchClientes,
  updateCliente
} from "../src/modules/clientes/clientes.service";
import type {
  ClienteListResponse,
  ClienteRepository,
  ClienteResponse,
  ClienteSearchResult,
  ClienteUpsertInput
} from "../src/modules/clientes/clientes.types";
import type { OperationalContextResponse } from "../src/modules/context/context.types";

const context: OperationalContextResponse = {
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

const clienteResponse: ClienteResponse = {
  source: "AGENDA_FACTURADOR",
  cliente_id: "44444444-4444-4444-8444-444444444444",
  documento_tipo: "RUC",
  documento: "80000000-1",
  razon_social: "Cliente Demo",
  direccion: null,
  telefono: null,
  email: null,
  activo: true
};

class FakeClienteRepository implements ClienteRepository {
  public lastSearchInput: unknown;
  public lastListInput: unknown;
  public lastUpsertInput: unknown;
  public lastUpdateInput: unknown;
  public updateResult: ClienteResponse | null = clienteResponse;

  async search(input: { tenantId: string; facturadorId: string; q: string; limit: number }): Promise<ClienteSearchResult[]> {
    this.lastSearchInput = input;
    return [clienteResponse];
  }

  async list(input: { facturadorId: string; q?: string; limit: number; offset: number }): Promise<ClienteListResponse> {
    this.lastListInput = input;
    return { items: [clienteResponse], total: 1 };
  }

  async upsertForFacturador(input: {
    tenantId: string;
    facturadorId: string;
    userId: string;
    data: ClienteUpsertInput;
  }): Promise<ClienteResponse> {
    this.lastUpsertInput = input;
    return { ...clienteResponse, ...input.data, cliente_id: clienteResponse.cliente_id, source: "AGENDA_FACTURADOR", activo: true };
  }

  async updateForFacturador(input: {
    clienteId: string;
    facturadorId: string;
    userId: string;
    data: ClienteUpsertInput;
  }): Promise<ClienteResponse | null> {
    this.lastUpdateInput = input;
    return this.updateResult;
  }
}

describe("clientes service", () => {
  it("normalizes input before creating client in facturador agenda", async () => {
    const repo = new FakeClienteRepository();

    const result = await createCliente(
      context,
      {
        documento_tipo: "RUC",
        documento: " 80000000-1 ",
        razon_social: " Cliente Demo ",
        direccion: " ",
        telefono: null,
        email: "cliente@example.com"
      },
      repo
    );

    expect(result).toMatchObject({
      documento: "80000000-1",
      razon_social: "Cliente Demo",
      email: "cliente@example.com"
    });
    expect(repo.lastUpsertInput).toMatchObject({
      tenantId: context.tenant.id,
      facturadorId: context.facturador.id,
      userId: context.user.id,
      data: {
        direccion: null
      }
    });
  });

  it("searches using tenant and facturador from operational context", async () => {
    const repo = new FakeClienteRepository();

    const result = await searchClientes(context, { q: "800", limit: 10 }, repo);

    expect(result.items).toHaveLength(1);
    expect(repo.lastSearchInput).toEqual({
      tenantId: context.tenant.id,
      facturadorId: context.facturador.id,
      q: "800",
      limit: 10
    });
  });

  it("lists agenda by facturador", async () => {
    const repo = new FakeClienteRepository();

    const result = await listClientes(context, { limit: 20, offset: 0 }, repo);

    expect(result.total).toBe(1);
    expect(repo.lastListInput).toEqual({
      facturadorId: context.facturador.id,
      q: undefined,
      limit: 20,
      offset: 0
    });
  });

  it("throws not found when updating a client outside facturador agenda", async () => {
    const repo = new FakeClienteRepository();
    repo.updateResult = null;

    await expect(
      updateCliente(
        context,
        "44444444-4444-4444-8444-444444444444",
        {
          documento_tipo: "CI",
          documento: "123456",
          razon_social: "Cliente"
        },
        repo
      )
    ).rejects.toMatchObject({
      statusCode: 404
    });
  });

  it("rejects invalid document after normalization", () => {
    expect(() =>
      normalizeClienteInput({
        documento_tipo: "CI",
        documento: "-",
        razon_social: "Cliente"
      })
    ).toThrow(/Documento invalido/);
  });
});
