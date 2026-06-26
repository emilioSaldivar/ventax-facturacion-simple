import { describe, expect, it, vi } from "vitest";
import {
  createNota,
  deleteNota,
  emitirNota,
  getNota,
  numeroALetras,
  updateNota,
  verificarNota,
} from "../src/modules/notas/notas.service";
import type {
  FacturadorParaPdf,
  NotaConItems,
  NotaListFilters,
  NotaListResponse,
  NotaRecord,
  NotasRepository,
  NotaUpdateInput,
} from "../src/modules/notas/notas.types";

const FACTURADOR_ID = "33333333-3333-4333-8333-333333333333";

const baseBorrador: NotaConItems = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  facturador_id: FACTURADOR_ID,
  tipo: "PRESUPUESTO",
  numero: null,
  estado: "BORRADOR",
  fecha_emision: null,
  cliente_nombre: "Cliente Test",
  cliente_ruc: "80000000-1",
  verification_token: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  emitido_at: null,
  created_at: "2026-06-25T00:00:00Z",
  updated_at: "2026-06-25T00:00:00Z",
  items: [
    {
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      nota_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      orden: 0,
      fila_tipo: "ITEM",
      descripcion: "Servicio de consultoria",
      cantidad: 2,
      precio_unitario: 500000,
      precio_total: 1000000,
    },
  ],
  total: 1000000,
};

const baseEmitida: NotaConItems = {
  ...baseBorrador,
  estado: "EMITIDO",
  numero: 1,
  fecha_emision: "2026-06-25",
  emitido_at: "2026-06-25T10:00:00Z",
};

function makeRepo(overrides: Partial<NotasRepository> = {}): NotasRepository {
  return {
    create: vi.fn().mockResolvedValue(baseBorrador),
    findById: vi.fn().mockResolvedValue(baseBorrador),
    list: vi.fn().mockResolvedValue({ items: [], total: 0 } as NotaListResponse),
    update: vi.fn().mockResolvedValue(baseBorrador),
    emitir: vi.fn().mockResolvedValue(baseEmitida),
    softDelete: vi.fn().mockResolvedValue(undefined),
    findByVerificationToken: vi.fn().mockResolvedValue(null),
    getFacturadorParaPdf: vi.fn().mockResolvedValue(null as FacturadorParaPdf | null),
    ...overrides,
  };
}

// --- createNota ---

describe("createNota", () => {
  it("crea borrador exitosamente", async () => {
    const repo = makeRepo();
    const result = await createNota(FACTURADOR_ID, {
      tipo: "PRESUPUESTO",
      cliente_nombre: "Cliente Test",
      items: [],
    }, repo);
    expect(result.estado).toBe("BORRADOR");
    expect(repo.create).toHaveBeenCalledOnce();
  });

  it("rechaza cliente_nombre vacio", async () => {
    const repo = makeRepo();
    await expect(
      createNota(FACTURADOR_ID, { tipo: "PRESUPUESTO", cliente_nombre: "  ", items: [] }, repo)
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

// --- emitirNota ---

describe("emitirNota", () => {
  it("emite exitosamente y asigna numero", async () => {
    const repo = makeRepo();
    const result = await emitirNota("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", FACTURADOR_ID, repo);
    expect(result.estado).toBe("EMITIDO");
    expect(result.numero).toBe(1);
  });

  it("rechaza emitir nota sin items ITEM", async () => {
    const sinItems: NotaConItems = {
      ...baseBorrador,
      items: [
        { ...baseBorrador.items[0], fila_tipo: "CONTEXTO", precio_total: null },
      ],
      total: 0,
    };
    const repo = makeRepo({ findById: vi.fn().mockResolvedValue(sinItems) });
    await expect(
      emitirNota("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", FACTURADOR_ID, repo)
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("rechaza emitir nota no encontrada", async () => {
    const repo = makeRepo({ findById: vi.fn().mockResolvedValue(null) });
    await expect(
      emitirNota("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", FACTURADOR_ID, repo)
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

// --- updateNota ---

describe("updateNota", () => {
  it("llama al repository con los datos", async () => {
    const repo = makeRepo();
    const input: NotaUpdateInput = { cliente_nombre: "Nuevo cliente" };
    await updateNota("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", FACTURADOR_ID, input, repo);
    expect(repo.update).toHaveBeenCalledWith(
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      FACTURADOR_ID,
      input
    );
  });
});

// --- deleteNota ---

describe("deleteNota", () => {
  it("llama softDelete en el repository", async () => {
    const repo = makeRepo();
    await deleteNota("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", FACTURADOR_ID, repo);
    expect(repo.softDelete).toHaveBeenCalledOnce();
  });
});

// --- verificarNota ---

describe("verificarNota", () => {
  it("retorna valido: true para nota emitida", async () => {
    const nota: NotaRecord = { ...baseEmitida };
    const repo = makeRepo({ findByVerificationToken: vi.fn().mockResolvedValue(nota) });
    const result = await verificarNota("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", repo);
    expect(result.valido).toBe(true);
    expect(result.nota).toBeDefined();
  });

  it("retorna valido: false para nota en BORRADOR", async () => {
    const nota: NotaRecord = { ...baseBorrador };
    const repo = makeRepo({ findByVerificationToken: vi.fn().mockResolvedValue(nota) });
    const result = await verificarNota("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", repo);
    expect(result.valido).toBe(false);
  });

  it("retorna valido: false para token inexistente", async () => {
    const repo = makeRepo({ findByVerificationToken: vi.fn().mockResolvedValue(null) });
    const result = await verificarNota("dddddddd-dddd-4ddd-8ddd-dddddddddddd", repo);
    expect(result.valido).toBe(false);
  });
});

// --- numeroALetras ---

describe("numeroALetras", () => {
  it("0 → CERO GUARANIES", () => expect(numeroALetras(0)).toBe("CERO GUARANIES"));
  it("1 → UN GUARANIES", () => expect(numeroALetras(1)).toBe("UN GUARANIES"));
  it("999 → NOVECIENTOS NOVENTA Y NUEVE GUARANIES", () =>
    expect(numeroALetras(999)).toBe("NOVECIENTOS NOVENTA Y NUEVE GUARANIES"));
  it("1000 → MIL GUARANIES", () => expect(numeroALetras(1000)).toBe("MIL GUARANIES"));
  it("1000000 → UN MILLON GUARANIES", () =>
    expect(numeroALetras(1000000)).toBe("UN MILLON GUARANIES"));
  it("1750000 → UN MILLON SETECIENTOS CINCUENTA MIL GUARANIES", () =>
    expect(numeroALetras(1750000)).toBe("UN MILLON SETECIENTOS CINCUENTA MIL GUARANIES"));
});
