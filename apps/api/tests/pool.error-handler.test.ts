import { describe, expect, it, vi } from "vitest";

vi.mock("../src/config/env", () => ({ env: { DATABASE_URL: "postgres://usuario:clave-secreta@127.0.0.1:1/no_existe" } }));
const errorMock = vi.fn();
vi.mock("../src/shared/logging/logger", () => ({ logger: { error: (...args: unknown[]) => errorMock(...args) } }));

import { pool } from "../src/db/pool";

describe("pool de PostgreSQL (SPEC_API_TRAS_REINICIO_POSTGRES)", () => {
  it("RN-01: un error en una conexion ociosa no termina el proceso", () => {
    expect(pool.listenerCount("error")).toBeGreaterThanOrEqual(1);
    // Sin manejador, emit("error") lanzaria y Node terminaria.
    expect(() => pool.emit("error", Object.assign(new Error("terminating connection"), { code: "57P01" }), {} as never)).not.toThrow();
  });

  it("RN-02: registra el codigo y el mensaje, sin la cadena de conexion", () => {
    const registrado = JSON.stringify(errorMock.mock.calls);
    expect(registrado).toContain("57P01");
    expect(registrado).not.toContain("clave-secreta");
  });
});
