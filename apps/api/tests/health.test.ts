import { describe, expect, it } from "vitest";
import { getHealthResponse } from "../src/modules/health/health.routes";

describe("health", () => {
  it("returns API health status payload", () => {
    const response = getHealthResponse(new Date("2026-05-17T12:00:00.000Z"));

    expect(response).toEqual({
      status: "ok",
      service: "facturacion-simple-api",
      timestamp: "2026-05-17T12:00:00.000Z"
    });
  });
});
