import { afterEach, describe, expect, it, vi } from "vitest";
import { env } from "../src/config/env";
import type { FiscalEmitNotaCreditoRequest, FiscalEmitNotaCreditoResponse, FiscalGateway } from "../src/modules/fiscal-gateway/fiscal-gateway.types";
import { emitNotaCredito, getNotaCreditoSaldo, reintentarNotaCredito } from "../src/modules/facturas/facturas.service";
import type { OperationalContextResponse } from "../src/modules/context/context.types";
import type { DocumentoResponse, FacturaItemPreview, FacturaRepository, NotaCreditoPersistInput } from "../src/modules/facturas/facturas.types";

// SPEC_NOTA_CREDITO_UNIFICADA_v0.1 (TASKS NCU-002 a NCU-004). Factura del canvas: copia de 1010671 (sin descuentos).
const context = {
  user: { id: "11111111-1111-4111-8111-111111111111", username: "op", display_name: "Op", role: "OPERADOR_FACTURACION" },
  tenant: { id: "22222222-2222-4222-8222-222222222222", name: "T", status: "ACTIVE" },
  facturador: { id: "33333333-3333-4333-8333-333333333333", emisor_id: "5057016-1", razon_social: "EMISOR", ruc: "5057016-1" },
  fiscal_context: {
    establecimiento: "001",
    punto_expedicion: "001",
    perfil_emision_codigo: "SEGEL-001-001",
    actividad_economica_codigo: "45203",
    timbrado: "05057016",
    timbrado_inicio: "2026-05-19",
    documento_nro: "0000000",
    credito_plazo_dias: 30,
    fiscal_envio_modo: "BATCH",
    batch_enabled: true
  },
  actividad_punto_perfil_id: "55555555-5555-4555-8555-555555555555"
} as unknown as OperationalContextResponse;

const FACTURA_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function item(line_no: number, cantidad: number, precio: number, iva: FacturaItemPreview["iva_tipo"], extra: Partial<FacturaItemPreview> = {}): FacturaItemPreview {
  const subtotal = cantidad * precio - (extra.descuento ?? 0) * cantidad - (extra.descuento_global ?? 0);
  return { line_no, codigo: `L00${line_no}`, descripcion: `Linea ${line_no}`, cantidad, precio_unitario: precio, iva_tipo: iva, subtotal, base_imponible: subtotal, iva_monto: 0, catalogo_item_id: null, ...extra };
}

function factura(overrides: Partial<DocumentoResponse> = {}): DocumentoResponse {
  return {
    id: FACTURA_ID,
    tipo: "FACTURA",
    estado: "EMITIDA",
    cdc: "01050570161001001101067112026111214272073466",
    document_uuid: "f072c115-9149-4787-a6b3-74a3cfff9dfa",
    numero_fiscal: "1010671",
    condicion_venta: "CONTADO",
    moneda: "PYG",
    tipo_cambio: null,
    cliente: { documento_tipo: "RUC", documento: "80026570-0", razon_social: "SEGEL SA" },
    items: [item(1, 2, 75000, "IVA_10"), item(2, 1, 31500, "IVA_5"), item(3, 3, 10000, "EXENTA")],
    totals: { subtotal: 211500, total_sin_iva: 196364, iva_5: 1500, iva_10: 13636, total_iva: 15136, total: 211500, fuente: "FE" },
    ...overrides
  } as DocumentoResponse;
}

const totalesFe = {
  moneda: "PYG",
  tipo_cambio: null,
  totales: { bruto: 211500, descuento: 0, anticipo: 0, total: 211500, redondeo: 0, gravada_10: 136364, iva_10: 13636, gravada_5: 30000, iva_5: 1500, exenta: 30000, exonerada: 0, iva_total: 15136 },
  total_guaranies: 211500,
  raw: {}
};

function repositorio(fact: DocumentoResponse, notas: DocumentoResponse[] = []) {
  const creadas: NotaCreditoPersistInput[] = [];
  const repo = {
    findById: vi.fn(async () => fact),
    findNotasCreditoByOriginal: vi.fn(async () => notas),
    createNotaCreditoFromFactura: vi.fn(async (input: NotaCreditoPersistInput) => {
      creadas.push(input);
      return { id: "nota-nueva", tipo: "NOTA_CREDITO", estado: input.estado, items: input.items ?? [], totals: input.totals ?? input.original.totals, nce_modo: input.modo ?? null, fiscal_status: null } as unknown as DocumentoResponse;
    }),
    updateNotaCreditoTrasReintento: vi.fn(async () => ({ id: "nota", tipo: "NOTA_CREDITO", estado: "PENDIENTE_SIFEN", items: [], totals: {}, fiscal_status: null }) as unknown as DocumentoResponse),
    updateTotals: vi.fn(async () => null)
  } as unknown as FacturaRepository;
  return { repo, creadas };
}

function gateway() {
  const pedidos: FiscalEmitNotaCreditoRequest[] = [];
  const g = {
    getDocumentoTotales: vi.fn(async () => totalesFe),
    emitNotaCredito: vi.fn(async (request: FiscalEmitNotaCreditoRequest): Promise<FiscalEmitNotaCreditoResponse> => {
      pedidos.push(request);
      return { fiscal_document_id: "nce", document_uuid: null, cdc: "05".padEnd(44, "0"), numero_fiscal: "001-001-0000050", estado: "PENDIENTE_SIFEN", status_raw: "QUEUED_BATCH", result_code: null, result_message: null, idempotent: false, batch: null, email_status: "NOT_APPLICABLE", raw: {} } as FiscalEmitNotaCreditoResponse;
    })
  } as unknown as FiscalGateway;
  return { g, pedidos };
}

const canvas = {
  motivo: "Devolucion y bonificacion",
  combinada: true,
  lineas: [{ line_no: 1, cantidad: 1 }, { line_no: 2, acreditacion: { tipo: "PORCENTAJE" as const, valor: 10 } }],
  acreditacion_total: { tipo: "MONTO" as const, valor: 5000 }
};

describe("nota de credito combinada", () => {
  const bandera = env.FE_NC_DESCUENTOS;
  afterEach(() => {
    env.FE_NC_DESCUENTOS = bandera;
  });

  it("CA-01: el ejemplo del canvas va con 5 lineas, motivo 1, total 83.150, guardada COMBINADA con linea_factura y origen", async () => {
    const { repo, creadas } = repositorio(factura());
    const { g, pedidos } = gateway();
    await emitNotaCredito(context, FACTURA_ID, canvas, repo, g);
    const pedido = pedidos[0]!;
    expect(pedido.por_referencia).toBeUndefined();
    expect(pedido.motivo_codigo ?? 1).toBe(1);
    expect(pedido.items.map((i) => [i.line_no, i.codigo, i.cantidad, i.precio_unitario, i.iva_tipo])).toEqual([
      [1, "L001", 1, 75000, "IVA_10"],
      [2, "AJ-L002", 1, 3150, "IVA_5"],
      [3, "AJ-IVA10", 1, 3546, "IVA_10"],
      [4, "AJ-IVA5", 1, 745, "IVA_5"],
      [5, "AJ-EXE", 1, 709, "EXENTA"]
    ]);
    expect(pedido.totals.total).toBe(83150);
    expect(creadas[0]).toMatchObject({ modo: "COMBINADA", motivoCodigo: 1 });
    expect(creadas[0]!.items!.map((i) => [i.linea_factura, i.origen_nc])).toEqual([
      [1, "DEVOLUCION"],
      [2, "ACREDITACION_LINEA"],
      [null, "ACREDITACION_TOTAL"],
      [null, "ACREDITACION_TOTAL"],
      [null, "ACREDITACION_TOTAL"]
    ]);
  });

  it("FS-143: solo ajuste sobre el total (sin lineas o con lineas vacias) va por la combinada con las lineas AJ por tasa", async () => {
    for (const cuerpo of [
      { motivo: "Ajuste de precio", combinada: true, motivo_codigo: 8 as const, acreditacion_total: { tipo: "MONTO" as const, valor: 5000 } },
      { motivo: "Ajuste de precio", combinada: true, motivo_codigo: 8 as const, lineas: [], acreditacion_total: { tipo: "MONTO" as const, valor: 5000 } }
    ]) {
      const { repo, creadas } = repositorio(factura());
      const { g, pedidos } = gateway();
      await emitNotaCredito(context, FACTURA_ID, cuerpo, repo, g);
      const pedido = pedidos[0]!;
      expect(pedido.motivo_codigo).toBe(8);
      expect(pedido.items.map((i) => i.codigo)).toEqual(["AJ-IVA10", "AJ-IVA5", "AJ-EXE"]);
      expect(pedido.totals.total).toBe(5000);
      expect(creadas[0]).toMatchObject({ modo: "COMBINADA" });
      expect(creadas[0]!.items!.every((i) => i.origen_nc === "ACREDITACION_TOTAL" && i.linea_factura === null)).toBe(true);
    }
  });

  it("el operador puede elegir otro motivo (1, 2, 3, 4 u 8)", async () => {
    const { repo } = repositorio(factura());
    const { g, pedidos } = gateway();
    await emitNotaCredito(context, FACTURA_ID, { ...canvas, motivo_codigo: 4 }, repo, g);
    expect(pedidos[0]!.motivo_codigo).toBe(4);
  });

  it("RN-03: tope por item (400 con el detalle) y tope total (409 NOTA_CREDITO_SUPERA_SALDO), sin llamar a FE", async () => {
    const { repo } = repositorio(factura());
    const { g } = gateway();
    await expect(
      emitNotaCredito(context, FACTURA_ID, { motivo: "x", combinada: true, lineas: [{ line_no: 1, cantidad: 2, acreditacion: { tipo: "MONTO", valor: 20000 } }] }, repo, g)
    ).rejects.toMatchObject({ statusCode: 400, details: { lineas: [expect.objectContaining({ line_no: 1, campo: "acreditacion" })] } });
    const nota = { id: "n1", tipo: "NOTA_CREDITO", estado: "EMITIDA", documento_relacionado_id: FACTURA_ID, nce_modo: "MONTO", items: [], totals: { total: 200000, fuente: "FE" }, fiscal_status: null } as unknown as DocumentoResponse;
    const conNota = repositorio(factura(), [nota]);
    await expect(emitNotaCredito(context, FACTURA_ID, { motivo: "x", combinada: true, lineas: [{ line_no: 1, cantidad: 1 }] }, conNota.repo, g)).rejects.toMatchObject({
      statusCode: 409,
      details: { reason: "NOTA_CREDITO_SUPERA_SALDO", saldo: 11500 }
    });
    expect(g.emitNotaCredito).not.toHaveBeenCalled();
  });

  it("RN-06 / RN-08: despues de una combinada, el saldo por linea cuenta devoluciones por linea_factura y acreditaciones por importe", async () => {
    const previa = {
      id: "n1",
      tipo: "NOTA_CREDITO",
      estado: "EMITIDA",
      documento_relacionado_id: FACTURA_ID,
      nce_modo: "COMBINADA",
      totals: { total: 83150, fuente: "FE" },
      fiscal_status: null,
      items: [
        { ...item(1, 1, 75000, "IVA_10"), line_no: 1, linea_factura: 1, origen_nc: "DEVOLUCION" },
        { ...item(2, 1, 3150, "IVA_5"), line_no: 2, linea_factura: 2, origen_nc: "ACREDITACION_LINEA" },
        { ...item(3, 1, 3546, "IVA_10"), line_no: 3, linea_factura: null, origen_nc: "ACREDITACION_TOTAL" }
      ]
    } as unknown as DocumentoResponse;
    const { repo } = repositorio(factura(), [previa]);
    const { g } = gateway();
    const saldo = await getNotaCreditoSaldo(context, FACTURA_ID, repo, g);
    expect(saldo.lineas.map((l) => [l.line_no, l.cantidad_acreditada, l.saldo, l.importe_acreditado, l.saldo_importe])).toEqual([
      [1, 1, 1, 75000, 75000],
      [2, 0, 1, 3150, 28350],
      [3, 0, 3, 0, 30000]
    ]);
    expect(saldo.monto.saldo).toBe(128350);
    // Devolver el manual completo ahora supera lo que queda (28.350 de 31.500).
    await expect(emitNotaCredito(context, FACTURA_ID, { motivo: "x", combinada: true, lineas: [{ line_no: 2, cantidad: 1 }] }, repo, g)).rejects.toMatchObject({ statusCode: 400 });
  });

  it("RN-05: el reintento de una combinada trabada manda sus mismas lineas y su motivo", async () => {
    const trabada = {
      id: "n1",
      tipo: "NOTA_CREDITO",
      estado: "PENDIENTE_SIFEN",
      documento_relacionado_id: FACTURA_ID,
      external_ref: "nce_combinada",
      nce_modo: "COMBINADA",
      nce_motivo: "x",
      nce_motivo_codigo: 1,
      items: [
        { ...item(1, 1, 75000, "IVA_10"), line_no: 1, linea_factura: 1, origen_nc: "DEVOLUCION" },
        { ...item(2, 1, 3150, "IVA_5"), codigo: "AJ-L002", line_no: 2, linea_factura: 2, origen_nc: "ACREDITACION_LINEA" }
      ],
      totals: { total: 78150 },
      fiscal_status: { code: "TRANSMISSION_FAILED", recoverable: true, suggested_action: "RETRY" }
    } as unknown as DocumentoResponse;
    const { repo } = repositorio(factura(), [trabada]);
    const { g, pedidos } = gateway();
    await reintentarNotaCredito(context, trabada, repo, g, factura());
    expect(pedidos[0]).toMatchObject({ external_ref: "nce_combinada" });
    expect(pedidos[0]!.items.map((i) => i.codigo)).toEqual(["L001", "AJ-L002"]);
  });

  it("D-9: los cuerpos anteriores siguen por sus caminos (lineas → LINEAS, monto → MONTO)", async () => {
    const { repo, creadas } = repositorio(factura());
    const { g } = gateway();
    await emitNotaCredito(context, FACTURA_ID, { motivo: "x", lineas: [{ line_no: 1, cantidad: 1 }] }, repo, g);
    await emitNotaCredito(context, FACTURA_ID, { motivo: "x", monto: 1000, motivo_codigo: 3 }, repo, g);
    expect(creadas.map((c) => c.modo)).toEqual([undefined, "MONTO"]);
  });

  it("D-6: con FE_NC_DESCUENTOS, una devolucion por el cuerpo de lineas sobre una linea con descuento va por la combinada al neto", async () => {
    env.FE_NC_DESCUENTOS = true;
    const conDescuento = factura({
      items: [item(1, 2, 100000, "IVA_10", { descuento: 10000, descuento_global: 14168 })],
      totals: { subtotal: 200000, total_sin_iva: 150757, iva_5: 0, iva_10: 15075, total_iva: 15075, total: 165800, descuento: 34168, fuente: "FE" }
    });
    const { repo, creadas } = repositorio(conDescuento);
    const g = {
      getDocumentoTotales: vi.fn(async () => ({ ...totalesFe, totales: { ...totalesFe.totales, total: 165800, gravada_10: 150757, iva_10: 15075, gravada_5: 0, iva_5: 0, exenta: 0 } })),
      emitNotaCredito: gateway().g.emitNotaCredito
    } as unknown as FiscalGateway;
    await emitNotaCredito(context, FACTURA_ID, { motivo: "x", lineas: [{ line_no: 1, cantidad: 1 }] }, repo, g);
    expect(creadas[0]).toMatchObject({ modo: "COMBINADA" });
    expect(creadas[0]!.items![0]).toMatchObject({ precio_unitario: 100000, descuento: 17084, subtotal: 82916 });
  });
});
