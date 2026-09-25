import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { HttpError } from "../src/shared/errors/http-error";
import {
  applyFacturadorImport,
  previewFacturadorImport,
  type ImportApplyInput,
  type ImportPreviewInput
} from "../src/modules/backoffice/import/import.service";
import type { ImportRepository, ImportApplyResult } from "../src/modules/backoffice/import/import.repository";
import type { ImportSnapshot, ImportTarget, MapperContext } from "../src/modules/backoffice/import/import.types";

const FIXTURES = join(__dirname, "fixtures");
const leer = (n: string) => readFileSync(join(FIXTURES, n), "utf8");

const ctx: MapperContext = {
  feApiEnv: "prod",
  feApiBaseUrl: "https://fe-api.ventax.app",
  sendProfileCode: true,
  hoy: "2026-09-19"
};
const target: ImportTarget = { mode: "EXISTENTE", tenant_id: "11111111-1111-1111-1111-111111111111" };

const snapshotVacio: ImportSnapshot = {
  tenant: { id: "11111111-1111-1111-1111-111111111111", nombre: "Demo", slug: "demo" },
  facturador: null,
  establecimientos: [],
  puntos: [],
  actividades: [],
  perfiles: [],
  contextos: [],
  emisorEnOtroTenant: null,
  slugOcupado: false
};

class FakeImportRepository implements ImportRepository {
  public applyCalls = 0;
  public ultimoApply: Parameters<ImportRepository["applyImport"]>[0] | null = null;
  /** Simula que la base cambio entre la vista previa y la confirmacion. */
  public snapshotAlAplicar: ImportSnapshot | null = null;

  constructor(private readonly snapshot: ImportSnapshot = snapshotVacio) {}

  async loadSnapshot(): Promise<ImportSnapshot> {
    return this.snapshot;
  }

  async applyImport(input: Parameters<ImportRepository["applyImport"]>[0]): Promise<ImportApplyResult> {
    this.applyCalls += 1;
    this.ultimoApply = input;
    const actual = this.snapshotAlAplicar ?? this.snapshot;
    if (input.recomputeToken(actual) !== input.previewToken) {
      throw new HttpError(409, "CONFLICT", "Los datos cambiaron desde la vista previa.", {
        motivo: "PREVIEW_DESACTUALIZADO"
      });
    }
    return { tenant_id: "t1", facturador_id: "f1", aplicado_en: "2026-09-19T00:00:00.000Z" };
  }
}

function archivo(fixture = "fe-config-v0.1.json"): ImportPreviewInput {
  return { filename: fixture, format: "auto", content: leer(fixture), target };
}

async function tokenDe(repo: ImportRepository, input = archivo()): Promise<string> {
  return (await previewFacturadorImport(input, { repository: repo, ctx })).preview_token;
}

function applyInput(token: string, over: Partial<ImportApplyInput> = {}): ImportApplyInput {
  return {
    ...archivo(),
    preview_token: token,
    permitir_ambiente_distinto: false,
    documento_nro_overrides: {},
    ...over
  };
}

describe("previewFacturadorImport", () => {
  it("devuelve el diff con las referencias del archivo", async () => {
    const repo = new FakeImportRepository();
    const diff = await previewFacturadorImport(archivo(), { repository: repo, ctx });

    expect(diff.puede_aplicar).toBe(true);
    expect(diff.contextos).toHaveLength(2);
    expect(diff.referencias["$.emisor.razon_social"]).toContain("GUIA_INTEGRACION_CONSUMIDORES.md#");
    expect(diff.preview_token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("responde con bloqueantes SIN lanzar, marcando puede_aplicar en false", async () => {
    const repo = new FakeImportRepository();
    const diff = await previewFacturadorImport(
      { ...archivo("fe-config-ambiente-test.json"), target },
      { repository: repo, ctx }
    );

    expect(diff.puede_aplicar).toBe(false);
    expect(diff.bloqueantes.map((b) => b.codigo)).toContain("AMBIENTE_DISTINTO");
  });
});

describe("applyFacturadorImport", () => {
  it("aplica el import una sola vez cuando no hay bloqueantes", async () => {
    const repo = new FakeImportRepository();
    const res = await applyFacturadorImport(applyInput(await tokenDe(repo)), "u1", { repository: repo, ctx });

    expect(repo.applyCalls).toBe(1);
    expect(res.aplicado).toBe(true);
    expect(res.facturador_id).toBe("f1");
    expect(res.bloqueantes).toEqual([]);
    expect(res.proximos_pasos.join(" ")).toContain("API key");
  });

  it("rechaza con IMPORT_BLOQUEADO si hay bloqueantes", async () => {
    const repo = new FakeImportRepository();
    const input: ImportApplyInput = {
      ...applyInput("0".repeat(64)),
      filename: "fe-config-ambiente-test.json",
      content: leer("fe-config-ambiente-test.json")
    };

    await expect(applyFacturadorImport(input, "u1", { repository: repo, ctx })).rejects.toMatchObject({
      statusCode: 409,
      details: { motivo: "IMPORT_BLOQUEADO" }
    });
    expect(repo.applyCalls).toBe(0);
  });

  it("permite forzar el ambiente distinto y lo registra", async () => {
    const repo = new FakeImportRepository();
    const base: ImportApplyInput = {
      ...applyInput("x"),
      filename: "fe-config-ambiente-test.json",
      content: leer("fe-config-ambiente-test.json"),
      permitir_ambiente_distinto: true
    };
    const token = (
      await previewFacturadorImport({ ...base, target }, { repository: repo, ctx })
    ).preview_token;

    const res = await applyFacturadorImport({ ...base, preview_token: token }, "u1", { repository: repo, ctx });

    expect(res.aplicado).toBe(true);
    expect(repo.ultimoApply?.ambienteForzado).toBe(true);
  });

  it("rechaza con PREVIEW_DESACTUALIZADO si la base cambio", async () => {
    const repo = new FakeImportRepository();
    const token = await tokenDe(repo);
    // Entre la vista previa y la confirmacion aparece un facturador.
    repo.snapshotAlAplicar = {
      ...snapshotVacio,
      facturador: {
        id: "f-nuevo",
        tenant_id: "t1",
        emisor_id: "5057016-1",
        ruc: "5057016-1",
        razon_social: "X",
        nombre_fantasia: null,
        activo: true,
        has_api_key: true
      }
    };

    await expect(applyFacturadorImport(applyInput(token), "u1", { repository: repo, ctx })).rejects.toMatchObject({
      statusCode: 409,
      details: { motivo: "PREVIEW_DESACTUALIZADO" }
    });
  });

  it("aplica el override de documento_nro de un contexto nuevo", async () => {
    const repo = new FakeImportRepository();
    const overrides = { "A45203-E001-P001-FE-PTO": "0000950" };
    const token = (
      await previewFacturadorImport(archivo(), { repository: repo, ctx })
    ).preview_token;

    await applyFacturadorImport(applyInput(token, { documento_nro_overrides: overrides }), "u1", {
      repository: repo,
      ctx
    });

    expect(repo.ultimoApply?.documentoNroOverrides).toEqual(overrides);
  });

  it("ignora con advertencia un override sobre un contexto que ya existe (RN-09)", async () => {
    const conContexto: ImportSnapshot = {
      ...snapshotVacio,
      facturador: {
        id: "f1",
        tenant_id: "t1",
        emisor_id: "5057016-1",
        ruc: "5057016-1",
        razon_social: "EMILIO MATIAS SALDIVAR CAPUTO",
        nombre_fantasia: "EMILIO SALDIVAR",
        activo: true,
        has_api_key: true
      },
      contextos: [
        {
          id: "c1",
          actividad_codigo: "45203",
          establecimiento_codigo: "001",
          punto_codigo: "001",
          perfil_codigo: "A45203-E001-P001-FE-PTO",
          timbrado: "18861677",
          timbrado_inicio: "2026-05-19",
          documento_nro: "0000123",
          credito_plazo_dias: 30,
          alias_operativo: null,
          activo: true,
          usuarios_asignados: 0
        }
      ]
    };
    const repo = new FakeImportRepository(conContexto);
    const token = await tokenDe(repo);

    const res = await applyFacturadorImport(
      applyInput(token, { documento_nro_overrides: { "A45203-E001-P001-FE-PTO": "0000950" } }),
      "u1",
      { repository: repo, ctx }
    );

    expect(repo.ultimoApply?.documentoNroOverrides).toEqual({});
    expect(res.advertencias.map((a) => a.codigo)).toContain("OVERRIDE_IGNORADO");
  });

  it("guarda en la auditoria el payload desenvuelto, sin wrappers", async () => {
    const repo = new FakeImportRepository();
    await applyFacturadorImport(applyInput(await tokenDe(repo)), "u1", { repository: repo, ctx });

    const payload = repo.ultimoApply?.payload as Record<string, any>;
    expect(payload.emisor.emisor_id).toBe("5057016-1");
    expect(payload.emisor.emisor_id).not.toHaveProperty("valor");
  });
});
