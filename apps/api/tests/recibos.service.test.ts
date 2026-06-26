import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createRecibo,
  emitirRecibo,
  updateRecibo,
  deleteRecibo,
  verificarRecibo,
} from "../src/modules/recibos/recibos.service.js";
import type { RecibosRepository, ReciboRecord } from "../src/modules/recibos/recibos.types.js";

const makeRecibo = (overrides: Partial<ReciboRecord> = {}): ReciboRecord => ({
  id: "r1",
  facturador_id: "f1",
  numero: null,
  estado: "BORRADOR",
  fecha_cobro: "2026-06-25",
  pagador_nombre: "Juan Perez",
  pagador_documento_tipo: "CI",
  pagador_documento: "1234567",
  concepto: "Pago de servicio",
  importe: 150000,
  forma_pago: "EFECTIVO",
  referencia_bancaria: null,
  factura_id: null,
  factura_numero_display: null,
  verification_token: "tok-abc",
  emitido_at: null,
  created_at: "2026-06-25T00:00:00Z",
  updated_at: "2026-06-25T00:00:00Z",
  ...overrides,
});

const makeRepo = (): RecibosRepository => ({
  create: vi.fn().mockResolvedValue(makeRecibo()),
  findById: vi.fn().mockResolvedValue(makeRecibo()),
  list: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  update: vi.fn().mockResolvedValue(makeRecibo()),
  emitir: vi.fn().mockResolvedValue(makeRecibo({ estado: "EMITIDO", numero: 1, emitido_at: "2026-06-25T10:00:00Z" })),
  softDelete: vi.fn().mockResolvedValue(undefined),
  findByVerificationToken: vi.fn().mockResolvedValue(null),
  listByFactura: vi.fn().mockResolvedValue([]),
  getFacturadorParaPdf: vi.fn().mockResolvedValue(null),
});

describe("createRecibo", () => {
  it("crea recibo con datos válidos", async () => {
    const repo = makeRepo();
    const result = await createRecibo("f1", {
      fecha_cobro: "2026-06-25",
      pagador_nombre: "Juan Perez",
      concepto: "Pago de servicio",
      importe: 150000,
    }, repo);
    expect(repo.create).toHaveBeenCalledOnce();
    expect(result.id).toBe("r1");
  });

  it("rechaza pagador_nombre vacío", async () => {
    const repo = makeRepo();
    await expect(createRecibo("f1", {
      fecha_cobro: "2026-06-25",
      pagador_nombre: "",
      concepto: "Pago",
      importe: 100000,
    }, repo)).rejects.toMatchObject({ statusCode: 400 });
  });

  it("rechaza concepto vacío", async () => {
    const repo = makeRepo();
    await expect(createRecibo("f1", {
      fecha_cobro: "2026-06-25",
      pagador_nombre: "Juan",
      concepto: "",
      importe: 100000,
    }, repo)).rejects.toMatchObject({ statusCode: 400 });
  });

  it("rechaza importe cero", async () => {
    const repo = makeRepo();
    await expect(createRecibo("f1", {
      fecha_cobro: "2026-06-25",
      pagador_nombre: "Juan",
      concepto: "Servicio",
      importe: 0,
    }, repo)).rejects.toMatchObject({ statusCode: 400 });
  });

  it("rechaza importe negativo", async () => {
    const repo = makeRepo();
    await expect(createRecibo("f1", {
      fecha_cobro: "2026-06-25",
      pagador_nombre: "Juan",
      concepto: "Servicio",
      importe: -500,
    }, repo)).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("emitirRecibo", () => {
  it("emite recibo en borrador", async () => {
    const repo = makeRepo();
    const result = await emitirRecibo("r1", "f1", repo);
    expect(result.estado).toBe("EMITIDO");
    expect(result.numero).toBe(1);
  });

  it("lanza 404 si no existe", async () => {
    const repo = makeRepo();
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(emitirRecibo("r1", "f1", repo)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("lanza 409 si ya emitido", async () => {
    const repo = makeRepo();
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(makeRecibo({ estado: "EMITIDO", numero: 1 }));
    await expect(emitirRecibo("r1", "f1", repo)).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe("updateRecibo", () => {
  it("actualiza recibo en borrador", async () => {
    const repo = makeRepo();
    const result = await updateRecibo("r1", "f1", { concepto: "Nuevo concepto" }, repo);
    expect(repo.update).toHaveBeenCalledOnce();
    expect(result).toBeDefined();
  });

  it("lanza 409 al modificar recibo emitido", async () => {
    const repo = makeRepo();
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(makeRecibo({ estado: "EMITIDO", numero: 1 }));
    await expect(updateRecibo("r1", "f1", { concepto: "x" }, repo)).rejects.toMatchObject({ statusCode: 409 });
  });

  it("rechaza importe <= 0 en update", async () => {
    const repo = makeRepo();
    await expect(updateRecibo("r1", "f1", { importe: 0 }, repo)).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("deleteRecibo", () => {
  it("elimina recibo en borrador", async () => {
    const repo = makeRepo();
    await expect(deleteRecibo("r1", "f1", repo)).resolves.toBeUndefined();
    expect(repo.softDelete).toHaveBeenCalledOnce();
  });

  it("lanza 409 al eliminar recibo emitido", async () => {
    const repo = makeRepo();
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(makeRecibo({ estado: "EMITIDO", numero: 1 }));
    await expect(deleteRecibo("r1", "f1", repo)).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe("verificarRecibo", () => {
  it("retorna valido:true para recibo emitido", async () => {
    const repo = makeRepo();
    (repo.findByVerificationToken as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeRecibo({ estado: "EMITIDO", numero: 1, emitido_at: "2026-06-25T10:00:00Z" })
    );
    const result = await verificarRecibo("tok-abc", repo);
    expect(result.valido).toBe(true);
    expect(result.recibo?.numero).toBe(1);
  });

  it("retorna valido:false para recibo borrador", async () => {
    const repo = makeRepo();
    (repo.findByVerificationToken as ReturnType<typeof vi.fn>).mockResolvedValue(makeRecibo());
    const result = await verificarRecibo("tok-abc", repo);
    expect(result.valido).toBe(false);
  });

  it("retorna valido:false si token no existe", async () => {
    const repo = makeRepo();
    const result = await verificarRecibo("tok-inexistente", repo);
    expect(result.valido).toBe(false);
  });
});
