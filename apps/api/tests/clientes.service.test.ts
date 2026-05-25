import { describe, expect, it } from "vitest";
import {
  autocompleteClienteFromDnit,
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
    actividad_economica_descripcion: "Servicios administrativos",
    timbrado: "80136968",
    timbrado_inicio: "2025-12-30",
    documento_nro: "0000000",
    credito_plazo_dias: 30
  }
};

const otherFacturadorContext: OperationalContextResponse = {
  ...context,
  facturador: {
    id: "99999999-9999-4999-8999-999999999999",
    emisor_id: "80000000-0",
    razon_social: "Otro Facturador",
    ruc: "80000000-0"
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
  public lastDnitInput: unknown;
  public searchResult: ClienteSearchResult[] = [clienteResponse];
  public updateResult: ClienteResponse | null = clienteResponse;
  public dnitResult:
    | {
        status: "FOUND" | "NOT_FOUND" | "AMBIGUOUS";
        item?: {
          ruc_sin_dv: string;
          dv: string;
          ruc: string;
          nombre: string | null;
          apellido: string | null;
          razon_social: string;
          codigo_dnit: string | null;
          estado: string | null;
        };
      }
    = {
      status: "FOUND",
      item: {
        ruc_sin_dv: "1001210",
        dv: "9",
        ruc: "1001210-9",
        nombre: "MILCIADES ANTONIO",
        apellido: "SILVERO IBAÑEZ",
        razon_social: "MILCIADES ANTONIO SILVERO IBAÑEZ",
        codigo_dnit: "SIIM6816200",
        estado: "ACTIVO"
      }
    };

  async search(input: { tenantId: string; facturadorId: string; q: string; limit: number }): Promise<ClienteSearchResult[]> {
    this.lastSearchInput = input;
    return this.searchResult;
  }

  async list(input: { facturadorId: string; q?: string; limit: number; offset: number }): Promise<ClienteListResponse> {
    this.lastListInput = input;
    return { items: [clienteResponse], total: 1 };
  }

  async findByIdForFacturador(): Promise<ClienteResponse | null> {
    return clienteResponse;
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

  async findDnitByDocumento(input: { documentoTipo: "RUC" | "CI"; rucSinDv: string; dv?: string }) {
    this.lastDnitInput = input;
    return this.dnitResult;
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

  it("returns global fallback suggestions without creating an agenda entry", async () => {
    const repo = new FakeClienteRepository();
    repo.searchResult = [
      {
        ...clienteResponse,
        source: "IDENTIDAD_COMPARTIDA",
        cliente_id: null,
        documento: "80003110-5",
        razon_social: "CAVALLARO S.A.C.E.I"
      }
    ];

    const result = await searchClientes(context, { q: "80003110", limit: 5 }, repo);

    expect(result.items).toEqual(repo.searchResult);
    expect(repo.lastSearchInput).toEqual({
      tenantId: context.tenant.id,
      facturadorId: context.facturador.id,
      q: "80003110",
      limit: 5
    });
    expect(repo.lastUpsertInput).toBeUndefined();
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

  it("keeps search, list, create and update scoped to the current facturador", async () => {
    const repo = new FakeClienteRepository();

    await searchClientes(otherFacturadorContext, { q: "800", limit: 5 }, repo);
    expect(repo.lastSearchInput).toMatchObject({
      tenantId: otherFacturadorContext.tenant.id,
      facturadorId: otherFacturadorContext.facturador.id
    });

    await listClientes(otherFacturadorContext, { q: "Cliente", limit: 10, offset: 0 }, repo);
    expect(repo.lastListInput).toMatchObject({
      facturadorId: otherFacturadorContext.facturador.id
    });

    await createCliente(
      otherFacturadorContext,
      {
        documento_tipo: "RUC",
        documento: "80000000-0",
        razon_social: "Cliente Otro"
      },
      repo
    );
    expect(repo.lastUpsertInput).toMatchObject({
      tenantId: otherFacturadorContext.tenant.id,
      facturadorId: otherFacturadorContext.facturador.id,
      userId: otherFacturadorContext.user.id
    });

    await updateCliente(
      otherFacturadorContext,
      clienteResponse.cliente_id,
      {
        documento_tipo: "RUC",
        documento: "80000000-0",
        razon_social: "Cliente Otro"
      },
      repo
    );
    expect(repo.lastUpdateInput).toMatchObject({
      clienteId: clienteResponse.cliente_id,
      facturadorId: otherFacturadorContext.facturador.id,
      userId: otherFacturadorContext.user.id
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

  it("autocompletes from dnit with documento including dv", async () => {
    const repo = new FakeClienteRepository();

    const result = await autocompleteClienteFromDnit(
      {
        documento_tipo: "RUC",
        documento: "1001210-9"
      },
      repo
    );

    expect(result).toMatchObject({
      found: true,
      cliente: {
        documento: "1001210-9",
        razon_social: "MILCIADES ANTONIO SILVERO IBAÑEZ"
      }
    });
    expect(repo.lastDnitInput).toEqual({
      documentoTipo: "RUC",
      rucSinDv: "1001210",
      dv: "9"
    });
  });

  it("returns ambiguous=false when dnit does not match", async () => {
    const repo = new FakeClienteRepository();
    repo.dnitResult = { status: "NOT_FOUND" };

    const result = await autocompleteClienteFromDnit(
      {
        documento_tipo: "CI",
        documento: "1001210"
      },
      repo
    );

    expect(result).toEqual({
      found: false,
      ambiguous: false,
      message: "Sin coincidencias DNIT."
    });
  });

  it("returns documento without dv for inactive fisica", async () => {
    const repo = new FakeClienteRepository();
    repo.dnitResult = {
      status: "FOUND",
      item: {
        ruc_sin_dv: "1001210",
        dv: "9",
        ruc: "1001210-9",
        nombre: "MILCIADES ANTONIO",
        apellido: "SILVERO IBAÑEZ",
        razon_social: "MILCIADES ANTONIO SILVERO IBAÑEZ",
        codigo_dnit: "SIIM6816200",
        estado: "CANCELADO"
      }
    };

    const result = await autocompleteClienteFromDnit(
      {
        documento_tipo: "CI",
        documento: "1001210"
      },
      repo
    );

    expect(result).toMatchObject({
      found: true,
      cliente: {
        documento: "1001210"
      }
    });
  });

  it("returns documento with dv for juridica even if not active", async () => {
    const repo = new FakeClienteRepository();
    repo.dnitResult = {
      status: "FOUND",
      item: {
        ruc_sin_dv: "80163532",
        dv: "2",
        ruc: "80163532-2",
        nombre: null,
        apellido: null,
        razon_social: "AML SOCIEDAD ANONIMA",
        codigo_dnit: "AMLA257700X",
        estado: "BLOQUEADO"
      }
    };

    const result = await autocompleteClienteFromDnit(
      {
        documento_tipo: "RUC",
        documento: "80163532"
      },
      repo
    );

    expect(result).toMatchObject({
      found: true,
      cliente: {
        documento: "80163532-2",
        razon_social: "AML SOCIEDAD ANONIMA"
      }
    });
  });
});
