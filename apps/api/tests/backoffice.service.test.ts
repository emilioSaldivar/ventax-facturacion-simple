import { describe, expect, it } from "vitest";
import { verifyPassword } from "../src/modules/auth/password.service";
import { assignBackofficeOperationConfig, createBackofficeUser, resetBackofficeUserPassword } from "../src/modules/backoffice/backoffice.service";
import type { BackofficeOperationConfigResponse, BackofficeRepository, BackofficeUserResponse } from "../src/modules/backoffice/backoffice.types";

const user: Omit<BackofficeUserResponse, "temporary_password"> = {
  id: "11111111-1111-4111-8111-111111111111",
  username: "operador",
  display_name: "Operador",
  role: "OPERADOR_FACTURACION",
  active: true
};

class FakeBackofficeRepository implements BackofficeRepository {
  public lastCreateInput: Parameters<BackofficeRepository["createUser"]>[0] | null = null;
  public lastResetInput: Parameters<BackofficeRepository["resetPassword"]>[0] | null = null;
  public lastOperationConfigInput: Parameters<BackofficeRepository["assignOperationConfig"]>[0] | null = null;
  public resetResponse: Omit<BackofficeUserResponse, "temporary_password"> | null = user;
  public operationConfigResponse: BackofficeOperationConfigResponse | null = {
    user_id: user.id,
    tenant_id: "22222222-2222-4222-8222-222222222222",
    facturador_id: "33333333-3333-4333-8333-333333333333",
    emisor_id: "80136968-1",
    establecimiento: "001",
    punto_expedicion: "001",
    perfil_emision_codigo: "SERV",
    actividad_economica_codigo: "82110",
    active: true
  };

  async createUser(input: Parameters<BackofficeRepository["createUser"]>[0]): Promise<Omit<BackofficeUserResponse, "temporary_password">> {
    this.lastCreateInput = input;
    return {
      ...user,
      username: input.username,
      display_name: input.displayName,
      role: input.role
    };
  }

  async resetPassword(input: Parameters<BackofficeRepository["resetPassword"]>[0]): Promise<Omit<BackofficeUserResponse, "temporary_password"> | null> {
    this.lastResetInput = input;
    return this.resetResponse;
  }

  async assignOperationConfig(input: Parameters<BackofficeRepository["assignOperationConfig"]>[0]): Promise<BackofficeOperationConfigResponse | null> {
    this.lastOperationConfigInput = input;
    return this.operationConfigResponse;
  }
}

describe("backoffice service", () => {
  it("creates an operative user with normalized username and generated temporary password", async () => {
    const repo = new FakeBackofficeRepository();

    const result = await createBackofficeUser(
      "22222222-2222-4222-8222-222222222222",
      {
        username: " Operador.Demo ",
        display_name: " Operador Demo ",
        role: "OPERADOR_FACTURACION"
      },
      repo
    );

    expect(result).toMatchObject({
      username: "operador.demo",
      display_name: "Operador Demo",
      role: "OPERADOR_FACTURACION",
      active: true
    });
    expect(result.temporary_password).toMatch(/^Vtx-/);
    expect(repo.lastCreateInput).toMatchObject({
      tenantId: "22222222-2222-4222-8222-222222222222",
      username: "operador.demo",
      displayName: "Operador Demo",
      role: "OPERADOR_FACTURACION"
    });
    expect(repo.lastCreateInput?.passwordHash).not.toBe(result.temporary_password);
    await expect(verifyPassword(repo.lastCreateInput!.passwordHash, result.temporary_password!)).resolves.toBe(true);
  });

  it("uses provided temporary password without storing it in plain text", async () => {
    const repo = new FakeBackofficeRepository();

    const result = await createBackofficeUser(
      "22222222-2222-4222-8222-222222222222",
      {
        username: "soporte",
        display_name: null,
        role: "SOPORTE_INTERNO",
        temporary_password: "Temporal-12345"
      },
      repo
    );

    expect(result.temporary_password).toBe("Temporal-12345");
    expect(repo.lastCreateInput?.passwordHash).not.toBe("Temporal-12345");
    await expect(verifyPassword(repo.lastCreateInput!.passwordHash, "Temporal-12345")).resolves.toBe(true);
  });

  it("allows email-shaped usernames for customer operators", async () => {
    const repo = new FakeBackofficeRepository();

    const result = await createBackofficeUser(
      "22222222-2222-4222-8222-222222222222",
      {
        username: " Emiliomatasc@Fpuna.Edu.Py ",
        display_name: "Emilio Saldivar",
        role: "OPERADOR_FACTURACION",
        temporary_password: "Temporal-12345"
      },
      repo
    );

    expect(result.username).toBe("emiliomatasc@fpuna.edu.py");
    expect(repo.lastCreateInput?.username).toBe("emiliomatasc@fpuna.edu.py");
  });

  it("resets password, returns the one-time temporary password and delegates unlock to repository", async () => {
    const repo = new FakeBackofficeRepository();

    const result = await resetBackofficeUserPassword(
      "11111111-1111-4111-8111-111111111111",
      {
        temporary_password: "Reset-12345"
      },
      repo
    );

    expect(result.temporary_password).toBe("Reset-12345");
    expect(repo.lastResetInput?.userId).toBe("11111111-1111-4111-8111-111111111111");
    expect(repo.lastResetInput?.passwordHash).not.toBe("Reset-12345");
    await expect(verifyPassword(repo.lastResetInput!.passwordHash, "Reset-12345")).resolves.toBe(true);
  });

  it("throws not found when resetting an unknown user", async () => {
    const repo = new FakeBackofficeRepository();
    repo.resetResponse = null;

    await expect(resetBackofficeUserPassword("11111111-1111-4111-8111-111111111111", {}, repo)).rejects.toMatchObject({
      statusCode: 404
    });
  });

  it("assigns a single operation config to a user", async () => {
    const repo = new FakeBackofficeRepository();

    const result = await assignBackofficeOperationConfig(
      user.id,
      {
        tenant_id: "22222222-2222-4222-8222-222222222222",
        facturador_id: "33333333-3333-4333-8333-333333333333",
        emisor_id: " 80136968-1 ",
        establecimiento: "001",
        punto_expedicion: "001",
        perfil_emision_codigo: " SERV ",
        actividad_economica_codigo: " 82110 "
      },
      repo
    );

    expect(result).toMatchObject({
      user_id: user.id,
      facturador_id: "33333333-3333-4333-8333-333333333333",
      active: true
    });
    expect(repo.lastOperationConfigInput).toEqual({
      userId: user.id,
      data: {
        tenant_id: "22222222-2222-4222-8222-222222222222",
        facturador_id: "33333333-3333-4333-8333-333333333333",
        emisor_id: "80136968-1",
        establecimiento: "001",
        punto_expedicion: "001",
        perfil_emision_codigo: "SERV",
        actividad_economica_codigo: "82110"
      }
    });
  });

  it("throws not found when operation config references do not match", async () => {
    const repo = new FakeBackofficeRepository();
    repo.operationConfigResponse = null;

    await expect(
      assignBackofficeOperationConfig(
        user.id,
        {
          tenant_id: "22222222-2222-4222-8222-222222222222",
          facturador_id: "33333333-3333-4333-8333-333333333333",
          emisor_id: "80136968-1",
          establecimiento: "001",
          punto_expedicion: "001",
          perfil_emision_codigo: "SERV",
          actividad_economica_codigo: "82110"
        },
        repo
      )
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("rejects invalid usernames and short temporary passwords", async () => {
    const repo = new FakeBackofficeRepository();

    await expect(
      createBackofficeUser(
        "22222222-2222-4222-8222-222222222222",
        {
          username: "no",
          role: "OPERADOR_FACTURACION"
        },
        repo
      )
    ).rejects.toMatchObject({ statusCode: 400 });

    await expect(
      resetBackofficeUserPassword(
        "11111111-1111-4111-8111-111111111111",
        {
          temporary_password: "corta"
        },
        repo
      )
    ).rejects.toMatchObject({ statusCode: 400 });

    await expect(
      assignBackofficeOperationConfig(
        user.id,
        {
          tenant_id: "22222222-2222-4222-8222-222222222222",
          facturador_id: "33333333-3333-4333-8333-333333333333",
          emisor_id: "80136968-1",
          establecimiento: "1",
          punto_expedicion: "001",
          perfil_emision_codigo: "SERV",
          actividad_economica_codigo: "82110"
        },
        repo
      )
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
