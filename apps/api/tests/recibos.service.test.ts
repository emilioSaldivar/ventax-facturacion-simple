import { describe, it, expect, vi } from "vitest";
import {
  crearRecibo,
  editarRecibo,
  eliminarRecibo,
  emitirRecibo,
  anularRecibo,
  verificarRecibo,
} from "../src/modules/recibos/recibos.service.js";
import type { RecibosRepository, ReciboRecord } from "../src/modules/recibos/recibos.types.js";
import { FiscalGatewayError, type FiscalGateway, type FiscalReciboResult } from "../src/modules/fiscal-gateway/fiscal-gateway.types.js";
import type { OperationalContextResponse } from "../src/modules/context/context.types.js";

const context: OperationalContextResponse = {
  user: { id: "11111111-1111-4111-8111-111111111111", username: "operador", display_name: "Operador", role: "OPERADOR_FACTURACION" },
  tenant: { id: "22222222-2222-4222-8222-222222222222", name: "Tenant Demo", status: "ACTIVE" },
  facturador: { id: "f1", emisor_id: "80136968-1", razon_social: "Facturador Demo", ruc: "80136968-1" },
  fiscal_context: {
    establecimiento: "001",
    punto_expedicion: "001",
    perfil_emision_codigo: "SERV",
    actividad_economica_codigo: "82110",
    actividad_economica_descripcion: "Servicios administrativos",
    timbrado: "80136968",
    timbrado_inicio: "2025-12-30",
    documento_nro: "0000000",
    credito_plazo_dias: 30,
  },
};

const makeFiscalResult = (overrides: Partial<FiscalReciboResult> = {}): FiscalReciboResult => ({
  id: "r1",
  estado: "BORRADOR",
  numero: null,
  verification_token: null,
  fecha_cobro: "2026-06-25",
  pagador_nombre: "Juan Perez",
  pagador_documento_tipo: "CI",
  pagador_documento: "1234567",
  concepto: "Pago de servicio",
  importe: "150000.00",
  moneda: "PYG",
  forma_pago: "EFECTIVO",
  referencia_bancaria: null,
  referencia_documento_numero_display: null,
  actividad_economica_codigo: null,
  xml_hash: null,
  pdf_hash: null,
  anulacion_motivo: null,
  emitido_at: null,
  created_at: "2026-06-25T00:00:00Z",
  updated_at: "2026-06-25T00:00:00Z",
  deleted_at: null,
  raw: {},
  ...overrides,
});

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
  moneda: "PYG",
  forma_pago: "EFECTIVO",
  referencia_bancaria: null,
  referencia_documento_uuid: null,
  referencia_documento_numero_display: null,
  external_ref: null,
  idempotency_key: null,
  xml_hash: null,
  pdf_hash: null,
  anulacion_motivo: null,
  verification_token: null,
  emitido_at: null,
  created_at: "2026-06-25T00:00:00Z",
  updated_at: "2026-06-25T00:00:00Z",
  ...overrides,
});

function makeRepo(overrides: Partial<RecibosRepository> = {}): RecibosRepository {
  return {
    upsertFromFiscal: vi.fn(async ({ fiscal }) =>
      makeRecibo({
        estado: fiscal.estado,
        numero: fiscal.numero != null ? Number(fiscal.numero) : null,
        verification_token: fiscal.verification_token,
        anulacion_motivo: fiscal.anulacion_motivo,
        emitido_at: fiscal.emitido_at,
      })
    ),
    markDeleted: vi.fn().mockResolvedValue(undefined),
    findById: vi.fn().mockResolvedValue(makeRecibo()),
    list: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    findByIdempotencyKey: vi.fn().mockResolvedValue(null),
    findByVerificationToken: vi.fn().mockResolvedValue(null),
    listByReferenciaDocumento: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

function makeGateway(overrides: Partial<FiscalGateway> = {}): FiscalGateway {
  return {
    crearRecibo: vi.fn().mockResolvedValue(makeFiscalResult()),
    editarRecibo: vi.fn().mockResolvedValue(makeFiscalResult()),
    eliminarRecibo: vi.fn().mockResolvedValue(undefined),
    emitirRecibo: vi.fn().mockResolvedValue(makeFiscalResult({ estado: "EMITIDO", numero: "1", verification_token: "tok-abc" })),
    anularRecibo: vi.fn().mockResolvedValue(makeFiscalResult({ estado: "ANULADO", numero: "1", anulacion_motivo: "Error" })),
    getRecibo: vi.fn().mockResolvedValue(makeFiscalResult({ estado: "ANULADO", numero: "1", anulacion_motivo: "Error" })),
    getReciboPdf: vi.fn(),
    getReciboXml: vi.fn(),
    verificarRecibo: vi.fn().mockResolvedValue({ valido: false, raw: {} }),
    verificarReciboPdf: vi.fn(),
    ...overrides,
  } as unknown as FiscalGateway;
}

describe("crearRecibo", () => {
  it("crea recibo con datos validos delegando al gateway fiscal", async () => {
    const repo = makeRepo();
    const gateway = makeGateway();
    const result = await crearRecibo(context, {
      fecha_cobro: "2026-06-25",
      pagador_nombre: "Juan Perez",
      concepto: "Pago de servicio",
      importe: 150000,
    }, repo, gateway);
    expect(gateway.crearRecibo).toHaveBeenCalledOnce();
    expect(repo.upsertFromFiscal).toHaveBeenCalledOnce();
    expect(result.id).toBe("r1");
  });

  it("envia actividad_economica_codigo del contexto operativo (para que el PDF use el logo/rubro correcto)", async () => {
    const repo = makeRepo();
    const gateway = makeGateway();
    await crearRecibo(context, {
      fecha_cobro: "2026-06-25",
      pagador_nombre: "Juan Perez",
      concepto: "Pago de servicio",
      importe: 150000,
    }, repo, gateway);
    expect(gateway.crearRecibo).toHaveBeenCalledWith(
      expect.objectContaining({ actividad_economica_codigo: context.fiscal_context.actividad_economica_codigo })
    );
  });

  it("mapea ACTIVITY_NOT_AVAILABLE del backend fiscal a 422", async () => {
    const repo = makeRepo();
    const gateway = makeGateway({
      crearRecibo: vi.fn().mockRejectedValue(
        new FiscalGatewayError("UPSTREAM_ERROR", "rejected", { status: 422, body: { error: "ACTIVITY_NOT_AVAILABLE" } })
      ),
    });
    await expect(crearRecibo(context, {
      fecha_cobro: "2026-06-25", pagador_nombre: "Juan", concepto: "Servicio", importe: 1000,
    }, repo, gateway)).rejects.toMatchObject({ statusCode: 422 });
  });

  it("reusa el recibo existente si la idempotency-key ya se proceso (no llama al gateway)", async () => {
    const repo = makeRepo({ findByIdempotencyKey: vi.fn().mockResolvedValue(makeRecibo({ id: "existing" })) });
    const gateway = makeGateway();
    const result = await crearRecibo(context, {
      fecha_cobro: "2026-06-25",
      pagador_nombre: "Juan Perez",
      concepto: "Pago de servicio",
      importe: 150000,
    }, repo, gateway, { idempotencyKey: "RECIBO-2026-07-24-00123" });
    expect(gateway.crearRecibo).not.toHaveBeenCalled();
    expect(result.id).toBe("existing");
  });

  it("rechaza pagador_nombre vacio sin llamar al gateway", async () => {
    const repo = makeRepo();
    const gateway = makeGateway();
    await expect(crearRecibo(context, {
      fecha_cobro: "2026-06-25", pagador_nombre: "", concepto: "Pago", importe: 100000,
    }, repo, gateway)).rejects.toMatchObject({ statusCode: 400 });
    expect(gateway.crearRecibo).not.toHaveBeenCalled();
  });

  it("rechaza importe <= 0", async () => {
    const repo = makeRepo();
    const gateway = makeGateway();
    await expect(crearRecibo(context, {
      fecha_cobro: "2026-06-25", pagador_nombre: "Juan", concepto: "Servicio", importe: 0,
    }, repo, gateway)).rejects.toMatchObject({ statusCode: 400 });
  });

  it("mapea CERTIFICATE_NOT_FOUND del backend fiscal a 422", async () => {
    const repo = makeRepo();
    const gateway = makeGateway({
      crearRecibo: vi.fn().mockRejectedValue(
        new FiscalGatewayError("UPSTREAM_ERROR", "rejected", { status: 422, body: { error: "CERTIFICATE_NOT_FOUND" } })
      ),
    });
    await expect(crearRecibo(context, {
      fecha_cobro: "2026-06-25", pagador_nombre: "Juan", concepto: "Servicio", importe: 1000,
    }, repo, gateway)).rejects.toMatchObject({ statusCode: 422 });
  });

  it("mapea TIMEOUT del backend fiscal a 504", async () => {
    const repo = makeRepo();
    const gateway = makeGateway({
      crearRecibo: vi.fn().mockRejectedValue(new FiscalGatewayError("TIMEOUT", "timeout")),
    });
    await expect(crearRecibo(context, {
      fecha_cobro: "2026-06-25", pagador_nombre: "Juan", concepto: "Servicio", importe: 1000,
    }, repo, gateway)).rejects.toMatchObject({ statusCode: 504 });
  });
});

describe("emitirRecibo", () => {
  it("emite un recibo en borrador", async () => {
    const repo = makeRepo();
    const gateway = makeGateway();
    const result = await emitirRecibo("r1", context, repo, gateway);
    expect(gateway.emitirRecibo).toHaveBeenCalledWith({ reciboId: "r1" });
    expect(result.estado).toBe("EMITIDO");
  });

  it("lanza 404 si no existe en cache local", async () => {
    const repo = makeRepo({ findById: vi.fn().mockResolvedValue(null) });
    const gateway = makeGateway();
    await expect(emitirRecibo("r1", context, repo, gateway)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("lanza 409 si ya esta emitido (sin llamar al gateway)", async () => {
    const repo = makeRepo({ findById: vi.fn().mockResolvedValue(makeRecibo({ estado: "EMITIDO", numero: 1 })) });
    const gateway = makeGateway();
    await expect(emitirRecibo("r1", context, repo, gateway)).rejects.toMatchObject({ statusCode: 409 });
    expect(gateway.emitirRecibo).not.toHaveBeenCalled();
  });
});

describe("editarRecibo", () => {
  it("edita un recibo en borrador", async () => {
    const repo = makeRepo();
    const gateway = makeGateway();
    const result = await editarRecibo("r1", context, { concepto: "Nuevo concepto" }, repo, gateway);
    expect(gateway.editarRecibo).toHaveBeenCalledOnce();
    expect(result).toBeDefined();
  });

  it("lanza 409 al modificar recibo emitido", async () => {
    const repo = makeRepo({ findById: vi.fn().mockResolvedValue(makeRecibo({ estado: "EMITIDO", numero: 1 })) });
    const gateway = makeGateway();
    await expect(editarRecibo("r1", context, { concepto: "x" }, repo, gateway)).rejects.toMatchObject({ statusCode: 409 });
  });

  it("rechaza importe <= 0 en edicion", async () => {
    const repo = makeRepo();
    const gateway = makeGateway();
    await expect(editarRecibo("r1", context, { importe: 0 }, repo, gateway)).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("eliminarRecibo", () => {
  it("elimina un recibo en borrador", async () => {
    const repo = makeRepo();
    const gateway = makeGateway();
    await expect(eliminarRecibo("r1", context, repo, gateway)).resolves.toBeUndefined();
    expect(gateway.eliminarRecibo).toHaveBeenCalledWith({ reciboId: "r1" });
    expect(repo.markDeleted).toHaveBeenCalledWith("r1", "f1");
  });

  it("lanza 409 al eliminar recibo emitido", async () => {
    const repo = makeRepo({ findById: vi.fn().mockResolvedValue(makeRecibo({ estado: "EMITIDO", numero: 1 })) });
    const gateway = makeGateway();
    await expect(eliminarRecibo("r1", context, repo, gateway)).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe("anularRecibo", () => {
  it("anula un recibo emitido", async () => {
    const repo = makeRepo({ findById: vi.fn().mockResolvedValue(makeRecibo({ estado: "EMITIDO", numero: 1 })) });
    const gateway = makeGateway();
    const result = await anularRecibo("r1", context, { motivo: "Importe incorrecto" }, repo, gateway);
    expect(gateway.anularRecibo).toHaveBeenCalledWith({ reciboId: "r1", motivo: "Importe incorrecto" });
    expect(gateway.getRecibo).toHaveBeenCalledWith("r1");
    expect(result.estado).toBe("ANULADO");
  });

  it("persiste el estado real del recibo ORIGINAL (via getRecibo), no el documento nuevo que devuelve anularRecibo", async () => {
    // El backend fiscal genera un documento de anulacion SEPARADO (con su propio id/numero) que
    // referencia al original; la respuesta de anularRecibo describe ESE documento nuevo, no el
    // original actualizado. Este test reproduce ese caso para evitar la regresion de crear un
    // recibo "fantasma" en nuestra cache en vez de marcar ANULADO al original.
    const repo = makeRepo({ findById: vi.fn().mockResolvedValue(makeRecibo({ id: "r1", estado: "EMITIDO", numero: 2 })) });
    const gateway = makeGateway({
      anularRecibo: vi.fn().mockResolvedValue(makeFiscalResult({ id: "doc-anulacion-99", estado: "EMITIDO", numero: "4" })),
      getRecibo: vi.fn().mockResolvedValue(makeFiscalResult({ id: "r1", estado: "ANULADO", numero: "2", anulacion_motivo: "Importe incorrecto" })),
    });
    const result = await anularRecibo("r1", context, { motivo: "Importe incorrecto" }, repo, gateway);
    expect(gateway.getRecibo).toHaveBeenCalledWith("r1");
    expect(repo.upsertFromFiscal).toHaveBeenCalledWith(
      expect.objectContaining({ fiscal: expect.objectContaining({ id: "r1", estado: "ANULADO", numero: "2" }) })
    );
    expect(result.numero).toBe(2); // numero del ORIGINAL (2), nunca el del documento de anulacion (4)
  });

  it("lanza 409 si esta en borrador", async () => {
    const repo = makeRepo();
    const gateway = makeGateway();
    await expect(anularRecibo("r1", context, { motivo: "x" }, repo, gateway)).rejects.toMatchObject({ statusCode: 409 });
  });

  it("lanza 409 si ya fue anulado", async () => {
    const repo = makeRepo({ findById: vi.fn().mockResolvedValue(makeRecibo({ estado: "ANULADO", numero: 1 })) });
    const gateway = makeGateway();
    await expect(anularRecibo("r1", context, { motivo: "x" }, repo, gateway)).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe("verificarRecibo", () => {
  it("combina estado fiscal con datos comerciales de cache", async () => {
    const repo = makeRepo({
      findByVerificationToken: vi.fn().mockResolvedValue(
        makeRecibo({ estado: "EMITIDO", numero: 1, importe: 150000, concepto: "Pago de servicio" })
      ),
    });
    const gateway = makeGateway({
      verificarRecibo: vi.fn().mockResolvedValue({ valido: true, estado: "EMITIDO", firmado_en: "2026-06-25T10:00:00Z", raw: {} }),
    });
    const result = await verificarRecibo("tok-abc", repo, gateway);
    expect(result.valido).toBe(true);
    expect(result.numero).toBe(1);
    expect(result.concepto).toBe("Pago de servicio");
  });

  it("no expone datos comerciales si el backend fiscal dice que no es valido (fail-closed)", async () => {
    const repo = makeRepo({ findByVerificationToken: vi.fn().mockResolvedValue(makeRecibo({ estado: "EMITIDO" })) });
    const gateway = makeGateway({ verificarRecibo: vi.fn().mockResolvedValue({ valido: false, raw: {} }) });
    const result = await verificarRecibo("tok-abc", repo, gateway);
    expect(result.valido).toBe(false);
    expect(result.concepto).toBeUndefined();
  });
});
