import { afterEach, describe, expect, it, vi } from "vitest";
import { env } from "../src/config/env";
import { createFiscalGateway } from "../src/modules/fiscal-gateway/fiscal-gateway.client";
import {
  FiscalGatewayError,
  type FiscalEmitNotaCreditoRequest,
  type FiscalEmitNotaCreditoResponse,
  type FiscalGateway
} from "../src/modules/fiscal-gateway/fiscal-gateway.types";
import { emitNotaCredito, getNotaCreditoSaldo, reintentarNotaCredito } from "../src/modules/facturas/facturas.service";
import { armarLineasNotaCredito, esNotaParcial, saldoAcreditablePorLinea, validarLineasPedidas } from "../src/modules/facturas/nota-credito-parcial";
import type { OperationalContextResponse } from "../src/modules/context/context.types";
import type { DocumentoResponse, FacturaItemPreview, FacturaRepository, NotaCreditoPersistInput } from "../src/modules/facturas/facturas.types";

// SPEC_NOTA_CREDITO_PARCIAL_v0.1 (TASKS NCP-001 a NCP-005).

const context = {
  user: { id: "11111111-1111-4111-8111-111111111111", username: "op", display_name: "Op", role: "OPERADOR_FACTURACION" },
  tenant: { id: "22222222-2222-4222-8222-222222222222", name: "T", status: "ACTIVE" },
  facturador: { id: "33333333-3333-4333-8333-333333333333", emisor_id: "80120841-6", razon_social: "RAJ SA", ruc: "80120841-6" },
  fiscal_context: {
    establecimiento: "001",
    punto_expedicion: "001",
    perfil_emision_codigo: "RAJ-001-001-NCE",
    actividad_economica_codigo: "77290",
    timbrado: "80120841",
    timbrado_inicio: "2023-06-28",
    documento_nro: "0000000",
    credito_plazo_dias: 30,
    fiscal_envio_modo: "BATCH",
    batch_enabled: true
  },
  actividad_punto_perfil_id: "55555555-5555-4555-8555-555555555555"
} as unknown as OperationalContextResponse;

function item(line_no: number, cantidad: number, precio: number): FacturaItemPreview {
  const subtotal = Math.round(cantidad * precio * 100) / 100;
  return {
    line_no,
    codigo: null,
    descripcion: `Linea ${line_no}`,
    cantidad,
    precio_unitario: precio,
    iva_tipo: "IVA_10",
    subtotal,
    base_imponible: Math.round((subtotal / 1.1) * 100) / 100,
    iva_monto: Math.round((subtotal - subtotal / 1.1) * 100) / 100,
    catalogo_item_id: null
  };
}

const FACTURA_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

/** Factura USD de dos lineas: 2 x 150,25 y 1 x 99,99 (SPEC CA-01). */
function facturaUsd(overrides: Partial<DocumentoResponse> = {}): DocumentoResponse {
  return {
    id: FACTURA_ID,
    tipo: "FACTURA",
    estado: "EMITIDA",
    cdc: "01801208416001001000074822026111016055332772",
    document_uuid: "2bcf1ddd-da1e-4b26-81ab-6d2f8722096f",
    numero_fiscal: "0000748",
    condicion_venta: "CONTADO",
    moneda: "USD",
    tipo_cambio: 6329.77,
    cliente: { documento_tipo: "RUC", documento: "80026570-0", razon_social: "SEGEL SA" },
    items: [item(1, 2, 150.25), item(2, 1, 99.99)],
    totals: { subtotal: 400.49, total_sin_iva: 364.08, iva_5: 0, iva_10: 36.41, total_iva: 36.41, total: 400.49 },
    ...overrides
  } as DocumentoResponse;
}

function nota(items: FacturaItemPreview[], overrides: Partial<DocumentoResponse> = {}): DocumentoResponse {
  return {
    id: `nota-${Math.random()}`,
    tipo: "NOTA_CREDITO",
    estado: "EMITIDA",
    documento_relacionado_id: FACTURA_ID,
    items,
    totals: { subtotal: 0, total_sin_iva: 0, iva_5: 0, iva_10: 0, total_iva: 0, total: 0 },
    fiscal_status: null,
    ...overrides
  } as DocumentoResponse;
}

function repositorio(factura: DocumentoResponse, notas: DocumentoResponse[] = []) {
  const creadas: NotaCreditoPersistInput[] = [];
  const repo = {
    findById: vi.fn(async () => factura),
    findNotasCreditoByOriginal: vi.fn(async () => notas),
    createNotaCreditoFromFactura: vi.fn(async (input: NotaCreditoPersistInput) => {
      creadas.push(input);
      return nota(input.items ?? input.original.items, { estado: input.estado, totals: input.totals ?? input.original.totals, moneda: input.original.moneda });
    }),
    updateNotaCreditoTrasReintento: vi.fn(async () => nota([])),
    updateTotals: vi.fn(async () => null)
  } as unknown as FacturaRepository;
  return { repo, creadas };
}

function gateway() {
  const pedidos: FiscalEmitNotaCreditoRequest[] = [];
  const g = {
    emitNotaCredito: vi.fn(async (request: FiscalEmitNotaCreditoRequest): Promise<FiscalEmitNotaCreditoResponse> => {
      pedidos.push(request);
      return {
        fiscal_document_id: "nce-1",
        document_uuid: null,
        cdc: "05801208416001001000000322026111012302419498",
        numero_fiscal: "001-001-0000003",
        estado: "PENDIENTE_SIFEN",
        status_raw: "QUEUED_BATCH",
        result_code: null,
        result_message: null,
        idempotent: false,
        batch: null,
        email_status: "NOT_APPLICABLE",
        raw: {}
      } as FiscalEmitNotaCreditoResponse;
    }),
    getDocumentoTotales: vi.fn(async () => {
      throw new FiscalGatewayError("UPSTREAM_ERROR", "no");
    })
  } as unknown as FiscalGateway;
  return { g, pedidos };
}

describe("nota de credito parcial", () => {
  const banderaPrevia = env.FE_NC_MONEDA_EXTRANJERA;
  afterEach(() => {
    env.FE_NC_MONEDA_EXTRANJERA = banderaPrevia;
    vi.unstubAllGlobals();
  });

  describe("reglas puras", () => {
    it("saldo por linea descuenta las notas vivas y no las rechazadas", () => {
      const factura = facturaUsd();
      const saldos = saldoAcreditablePorLinea(factura, [nota([item(1, 1, 150.25)]), nota([item(1, 1, 150.25), item(2, 1, 99.99)], { estado: "RECHAZADA" })]);
      expect(saldos.map((s) => [s.line_no, s.cantidad_facturada, s.cantidad_acreditada, s.saldo])).toEqual([
        [1, 2, 1, 1],
        [2, 1, 0, 1]
      ]);
    });

    it("saldo con cantidades decimales no acumula error", () => {
      const factura = facturaUsd({ items: [item(1, 1, 100)] });
      const saldos = saldoAcreditablePorLinea(factura, [nota([item(1, 0.1, 100)]), nota([item(1, 0.2, 100)])]);
      expect(saldos[0]).toMatchObject({ cantidad_acreditada: 0.3, saldo: 0.7 });
    });

    it("RN-01: linea inexistente, repetida, con 5 decimales o sobre el saldo", () => {
      const saldos = saldoAcreditablePorLinea(facturaUsd(), []);
      expect(validarLineasPedidas([{ line_no: 1, cantidad: 2 }], saldos)).toEqual([]);
      const errores = validarLineasPedidas(
        [
          { line_no: 9, cantidad: 1 },
          { line_no: 1, cantidad: 3 },
          { line_no: 2, cantidad: 0.00001 }
        ],
        saldos
      );
      expect(errores.map((e) => e.line_no)).toEqual([9, 1, 2]);
      expect(errores[1]).toMatchObject({ saldo: 2 });
      expect(validarLineasPedidas([{ line_no: 2, cantidad: 1 }, { line_no: 2, cantidad: 1 }], saldos)).toHaveLength(1);
    });

    it("RN-02: lineas con precio e IVA de la factura, line_no original y totales en USD", () => {
      const { items, totals } = armarLineasNotaCredito(facturaUsd(), [{ line_no: 2, cantidad: 1 }]);
      expect(items).toEqual([expect.objectContaining({ line_no: 2, cantidad: 1, precio_unitario: 99.99, iva_tipo: "IVA_10", subtotal: 99.99 })]);
      expect(totals).toMatchObject({ total: 99.99, iva_10: 9.09 });
    });

    it("esNotaParcial: la total copia todas las lineas", () => {
      const factura = facturaUsd();
      expect(esNotaParcial(nota(factura.items), factura)).toBe(false);
      expect(esNotaParcial(nota([item(1, 1, 150.25)]), factura)).toBe(true);
      expect(esNotaParcial(nota([item(1, 1, 150.25), item(2, 1, 99.99)]), factura)).toBe(true);
    });
  });

  describe("servicio", () => {
    it("CA-01: parcial USD va con lineas, moneda y tipo de cambio, sin referencia; guarda sus lineas", async () => {
      env.FE_NC_MONEDA_EXTRANJERA = true;
      const { repo, creadas } = repositorio(facturaUsd());
      const { g, pedidos } = gateway();
      const { documento, reintento } = await emitNotaCredito(context, FACTURA_ID, { motivo: "Devolucion parcial", lineas: [{ line_no: 1, cantidad: 1 }] }, repo, g);
      expect(reintento).toBe(false);
      expect(pedidos[0]).toMatchObject({ moneda: "USD", tipo_cambio: 6329.77, totals: { total: 150.25 } });
      expect(pedidos[0]!.por_referencia).toBeUndefined();
      expect(pedidos[0]!.items).toEqual([expect.objectContaining({ line_no: 1, cantidad: 1, precio_unitario: 150.25 })]);
      expect(creadas[0]).toMatchObject({ totals: { total: 150.25 }, items: [expect.objectContaining({ line_no: 1, cantidad: 1 })] });
      expect(documento.items).toHaveLength(1);
    });

    it("CA-02: segunda parcial por el saldo con otra clave; despues no queda saldo", async () => {
      env.FE_NC_MONEDA_EXTRANJERA = true;
      const primera = nota([item(1, 1, 150.25)], { external_ref: "nce_a" });
      const { repo } = repositorio(facturaUsd(), [primera]);
      const { g, pedidos } = gateway();
      await emitNotaCredito(context, FACTURA_ID, { motivo: "Saldo", lineas: [{ line_no: 1, cantidad: 1 }, { line_no: 2, cantidad: 1 }] }, repo, g);
      expect(pedidos[0]!.external_ref).not.toBe("nce_a");
      const saldo = await getNotaCreditoSaldo(context, FACTURA_ID, repositorio(facturaUsd(), [primera, nota([item(1, 1, 150.25), item(2, 1, 99.99)])]).repo);
      expect(saldo).toMatchObject({ admite_total: false, admite_parcial: false, motivo_no_parcial: "La factura ya esta acreditada por completo." });
    });

    it("CA-03: pedir mas que el saldo responde 400 con el detalle y no llama a FE", async () => {
      env.FE_NC_MONEDA_EXTRANJERA = true;
      const { repo } = repositorio(facturaUsd());
      const { g } = gateway();
      await expect(emitNotaCredito(context, FACTURA_ID, { motivo: "x", lineas: [{ line_no: 1, cantidad: 3 }] }, repo, g)).rejects.toMatchObject({
        statusCode: 400,
        details: { lineas: [expect.objectContaining({ line_no: 1, saldo: 2 })] }
      });
      expect(g.emitNotaCredito).not.toHaveBeenCalled();
    });

    it("CA-04: en guaranies, importes enteros y sin moneda en el pedido", async () => {
      const pyg = facturaUsd({ moneda: "PYG", tipo_cambio: null, items: [item(1, 3, 110000)], totals: { subtotal: 330000, total_sin_iva: 300000, iva_5: 0, iva_10: 30000, total_iva: 30000, total: 330000 } });
      const { repo } = repositorio(pyg);
      const { g, pedidos } = gateway();
      await emitNotaCredito(context, FACTURA_ID, { motivo: "Una", lineas: [{ line_no: 1, cantidad: 1 }] }, repo, g);
      expect(pedidos[0]).toMatchObject({ totals: { total: 110000, iva_10: 10000 } });
      expect(pedidos[0]!.moneda).toBeUndefined();
    });

    it("CA-05 y CA-06: bandera apagada en USD, factura solo-total y nota trabada", async () => {
      const { g } = gateway();
      env.FE_NC_MONEDA_EXTRANJERA = false;
      await expect(emitNotaCredito(context, FACTURA_ID, { motivo: "x", lineas: [{ line_no: 1, cantidad: 1 }] }, repositorio(facturaUsd()).repo, g)).rejects.toMatchObject({
        statusCode: 409,
        details: { reason: "NOTA_CREDITO_MONEDA_EXTRANJERA" }
      });
      env.FE_NC_MONEDA_EXTRANJERA = true;
      const soloTotal = facturaUsd({ totals: { ...facturaUsd().totals, nota_credito_por_referencia: true } });
      await expect(emitNotaCredito(context, FACTURA_ID, { motivo: "x", lineas: [{ line_no: 1, cantidad: 1 }] }, repositorio(soloTotal).repo, g)).rejects.toMatchObject({
        statusCode: 409,
        details: { reason: "NOTA_CREDITO_SOLO_TOTAL" }
      });
      const trabada = nota([item(1, 1, 150.25)], { estado: "PENDIENTE_SIFEN", fiscal_status: { code: "TRANSMISSION_FAILED" } });
      await expect(emitNotaCredito(context, FACTURA_ID, { motivo: "x", lineas: [{ line_no: 2, cantidad: 1 }] }, repositorio(facturaUsd(), [trabada]).repo, g)).rejects.toMatchObject({
        statusCode: 409,
        details: { reason: "NOTA_CREDITO_TRABADA" }
      });
      expect(g.emitNotaCredito).not.toHaveBeenCalled();
    });

    it("RN-07: con una parcial viva la total responde 409 y el saldo ofrece la parcial", async () => {
      env.FE_NC_MONEDA_EXTRANJERA = true;
      const parcial = nota([item(1, 1, 150.25)]);
      const { g } = gateway();
      await expect(emitNotaCredito(context, FACTURA_ID, { motivo: "total" }, repositorio(facturaUsd(), [parcial]).repo, g)).rejects.toMatchObject({
        statusCode: 409,
        details: { reason: "NOTA_CREDITO_YA_EMITIDA" }
      });
      const saldo = await getNotaCreditoSaldo(context, FACTURA_ID, repositorio(facturaUsd(), [parcial]).repo);
      expect(saldo).toMatchObject({ moneda: "USD", admite_total: false, admite_parcial: true, lineas: [expect.objectContaining({ saldo: 1 }), expect.objectContaining({ saldo: 1 })] });
    });

    it("el reintento de una parcial trabada manda sus mismas lineas y la misma clave", async () => {
      env.FE_NC_MONEDA_EXTRANJERA = true;
      const trabada = nota([item(1, 1, 150.25)], {
        estado: "PENDIENTE_SIFEN",
        fiscal_status: { code: "TRANSMISSION_FAILED" },
        external_ref: "nce_parcial_1",
        nce_motivo: "Devolucion",
        totals: { subtotal: 150.25, total_sin_iva: 136.59, iva_5: 0, iva_10: 13.66, total_iva: 13.66, total: 150.25 }
      });
      const { repo } = repositorio(facturaUsd(), [trabada]);
      const { g, pedidos } = gateway();
      await reintentarNotaCredito(context, trabada, repo, g, facturaUsd());
      expect(pedidos[0]).toMatchObject({ external_ref: "nce_parcial_1", moneda: "USD", totals: { total: 150.25 } });
      expect(pedidos[0]!.items).toHaveLength(1);
      expect(pedidos[0]!.por_referencia).toBeUndefined();
    });
  });

  describe("gateway", () => {
    it("la parcial USD manda moneda y tipoCambio a /nota-credito; la total por referencia no", async () => {
      const fetchMock = vi.fn(async () => new Response(JSON.stringify({ document_id: "1", status: "QUEUED_BATCH", idempotent: false }), { status: 201 }));
      vi.stubGlobal("fetch", fetchMock);
      const real = createFiscalGateway({ mode: "real", baseUrl: "http://fe.test/v1", apiKey: "clave", timeoutMs: 1000, environment: "test", sendEmissionProfileCode: true, serviceNumbering: true } as never);
      const base = {
        external_ref: "nce_x",
        facturador: context.facturador,
        fiscal_context: context.fiscal_context,
        cliente: facturaUsd().cliente,
        items: [item(1, 1.5, 150.25)],
        totals: facturaUsd().totals,
        motivo: "x",
        factura_referencia: { documento_id: FACTURA_ID, cdc: facturaUsd().cdc!, numero_fiscal: "0000748" }
      } as FiscalEmitNotaCreditoRequest;
      await real.emitNotaCredito({ ...base, moneda: "USD", tipo_cambio: 6329.77 });
      await real.emitNotaCredito({ ...base, por_referencia: true, moneda: "USD", tipo_cambio: 6329.77 });
      const [url1, init1] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      const [url2, init2] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
      const body1 = JSON.parse(String(init1.body));
      const body2 = JSON.parse(String(init2.body));
      expect(url1).toBe("http://fe.test/v1/nota-credito");
      expect(body1).toMatchObject({ moneda: "USD", tipoCambio: 6329.77, items: [expect.objectContaining({ cantidad: 1.5, precioUnitario: 150.25 })] });
      expect(url2).toBe("http://fe.test/v1/nota-credito/total");
      expect(body2.moneda).toBeUndefined();
      expect(body2.tipoCambio).toBeUndefined();
      expect(body2.items).toBeUndefined();
    });

    it("RN-05: 422 INVALID_REFERENCED_DOCUMENT de FE llega como 409 con el codigo de FE", async () => {
      env.FE_NC_MONEDA_EXTRANJERA = true;
      const { repo } = repositorio(facturaUsd());
      const g = {
        emitNotaCredito: vi.fn(async () => {
          throw new FiscalGatewayError("UPSTREAM_ERROR", "x", { status: 422, body: { error: "INVALID_REFERENCED_DOCUMENT", details: { moneda_factura: "USD", moneda_nota: "PYG" } } });
        })
      } as unknown as FiscalGateway;
      await expect(emitNotaCredito(context, FACTURA_ID, { motivo: "x", lineas: [{ line_no: 1, cantidad: 1 }] }, repo, g)).rejects.toMatchObject({
        statusCode: 409,
        details: { fe_code: "INVALID_REFERENCED_DOCUMENT" }
      });
    });
  });
});
