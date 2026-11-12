import { afterEach, describe, expect, it, vi } from "vitest";
import { env } from "../src/config/env";
import { createFiscalGateway } from "../src/modules/fiscal-gateway/fiscal-gateway.client";
import {
  FiscalGatewayError,
  type FiscalEmitNotaCreditoRequest,
  type FiscalEmitNotaCreditoResponse,
  type FiscalGateway
} from "../src/modules/fiscal-gateway/fiscal-gateway.types";
import { emitNotaCredito, getNotaCreditoSaldo, listNotaCreditoCandidates, reintentarNotaCredito } from "../src/modules/facturas/facturas.service";
import { calcularSaldoMonto } from "../src/modules/facturas/nota-credito-monto";
import { saldoAcreditablePorLinea } from "../src/modules/facturas/nota-credito-parcial";
import type { OperationalContextResponse } from "../src/modules/context/context.types";
import type { DocumentoResponse, FacturaItemPreview, FacturaRepository, NotaCreditoPersistInput } from "../src/modules/facturas/facturas.types";

// SPEC_NOTA_CREDITO_POR_MONTO_v0.1 (TASKS NCM-002 a NCM-005).

const context = {
  user: { id: "11111111-1111-4111-8111-111111111111", username: "op", display_name: "Op", role: "OPERADOR_FACTURACION" },
  tenant: { id: "22222222-2222-4222-8222-222222222222", name: "T", status: "ACTIVE" },
  facturador: { id: "33333333-3333-4333-8333-333333333333", emisor_id: "80026570-0", razon_social: "SEGEL SA", ruc: "80026570-0" },
  fiscal_context: {
    establecimiento: "001",
    punto_expedicion: "001",
    perfil_emision_codigo: "SEGEL-001-001-NCE",
    actividad_economica_codigo: "62010",
    timbrado: "80026570",
    timbrado_inicio: "2023-06-28",
    documento_nro: "0000000",
    credito_plazo_dias: 30,
    fiscal_envio_modo: "BATCH",
    batch_enabled: true
  },
  actividad_punto_perfil_id: "55555555-5555-4555-8555-555555555555"
} as unknown as OperationalContextResponse;

const FACTURA_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function linea(line_no: number, iva_tipo: FacturaItemPreview["iva_tipo"], subtotal: number, cantidad = 1): FacturaItemPreview {
  return {
    line_no,
    codigo: null,
    descripcion: `Linea ${line_no}`,
    cantidad,
    precio_unitario: subtotal / cantidad,
    iva_tipo,
    subtotal,
    base_imponible: subtotal,
    iva_monto: 0,
    catalogo_item_id: null
  };
}

/** La factura del ejemplo de FE §67.5: total neto 242.300 con descuentos (queda `nota_credito_por_referencia`). */
function facturaEjemplo(overrides: Partial<DocumentoResponse> = {}): DocumentoResponse {
  return {
    id: FACTURA_ID,
    tipo: "FACTURA",
    estado: "EMITIDA",
    cdc: "01800265700001001000123422026111216055332772",
    document_uuid: "2bcf1ddd-da1e-4b26-81ab-6d2f8722096f",
    numero_fiscal: "001-001-0001234",
    condicion_venta: "CONTADO",
    moneda: "PYG",
    tipo_cambio: null,
    cliente: { documento_tipo: "RUC", documento: "80026570-0", razon_social: "SEGEL SA" },
    items: [linea(1, "IVA_10", 180000, 2), linea(2, "IVA_5", 52330), linea(3, "EXENTA", 30000)],
    totals: {
      subtotal: 282330,
      total_sin_iva: 224909,
      iva_5: 2315,
      iva_10: 15076,
      total_iva: 17391,
      total: 242300,
      descuento: 40000,
      nota_credito_por_referencia: true,
      fuente: "FE"
    },
    ...overrides
  } as DocumentoResponse;
}

const totalesEjemplo = {
  moneda: "PYG",
  tipo_cambio: null,
  totales: {
    bruto: 282330,
    descuento: 40000,
    anticipo: 0,
    total: 242300,
    redondeo: 30,
    gravada_10: 150757,
    iva_10: 15076,
    gravada_5: 46308,
    iva_5: 2315,
    exenta: 27875,
    exonerada: 0,
    iva_total: 17391
  },
  total_guaranies: 242300,
  raw: {}
};

function nota(overrides: Partial<DocumentoResponse> = {}): DocumentoResponse {
  return {
    id: `nota-${Math.random()}`,
    tipo: "NOTA_CREDITO",
    estado: "EMITIDA",
    documento_relacionado_id: FACTURA_ID,
    items: [],
    totals: { subtotal: 0, total_sin_iva: 0, iva_5: 0, iva_10: 0, total_iva: 0, total: 0, fuente: "FE" },
    fiscal_status: null,
    nce_modo: "MONTO",
    ...overrides
  } as DocumentoResponse;
}

const totales = (total: number) => ({ subtotal: total, total_sin_iva: 0, iva_5: 0, iva_10: 0, total_iva: 0, total, fuente: "FE" as const });

function repositorio(factura: DocumentoResponse, notas: DocumentoResponse[] = []) {
  const creadas: NotaCreditoPersistInput[] = [];
  const repo = {
    findById: vi.fn(async () => factura),
    findNotasCreditoByOriginal: vi.fn(async () => notas),
    createNotaCreditoFromFactura: vi.fn(async (input: NotaCreditoPersistInput) => {
      creadas.push(input);
      return nota({ estado: input.estado, items: input.items ?? [], totals: input.totals ?? input.original.totals, nce_modo: input.modo ?? null });
    }),
    updateNotaCreditoTrasReintento: vi.fn(async () => nota()),
    updateTotals: vi.fn(async () => null),
    list: vi.fn()
  } as unknown as FacturaRepository;
  return { repo, creadas };
}

function gateway(totalesFe: unknown = totalesEjemplo) {
  const pedidos: FiscalEmitNotaCreditoRequest[] = [];
  const g = {
    emitNotaCredito: vi.fn(async (request: FiscalEmitNotaCreditoRequest): Promise<FiscalEmitNotaCreditoResponse> => {
      pedidos.push(request);
      return {
        fiscal_document_id: "nce-1",
        document_uuid: null,
        cdc: "05800265700001001000000322026111212302419498",
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
      if (totalesFe instanceof Error) throw totalesFe;
      return totalesFe;
    })
  } as unknown as FiscalGateway;
  return { g, pedidos };
}

describe("nota de credito por monto", () => {
  const banderaPrevia = env.FE_NC_MONEDA_EXTRANJERA;
  afterEach(() => {
    env.FE_NC_MONEDA_EXTRANJERA = banderaPrevia;
    vi.unstubAllGlobals();
  });

  describe("saldo neto (D-3, D-4)", () => {
    it("descuenta las notas vivas, incluidas las en cola, y no las rechazadas, anuladas ni canceladas", () => {
      const notas = [
        nota({ totals: totales(100000) }),
        nota({ totals: totales(10000), estado: "PENDIENTE_SIFEN" }),
        nota({ totals: totales(50000), estado: "RECHAZADA" }),
        nota({ totals: totales(50000), estado: "ANULADA" }),
        nota({ totals: totales(50000), estado: "CANCELADO_LOCAL" })
      ];
      expect(calcularSaldoMonto(242300, notas, FACTURA_ID, "PYG")).toEqual({ total_factura: 242300, acreditado: 110000, saldo: 132300 });
    });

    it("un residuo menor que 50 Gs cuenta como cero", () => {
      expect(calcularSaldoMonto(242300, [nota({ totals: totales(242270) })], FACTURA_ID, "PYG").saldo).toBe(0);
    });

    it("RN-07: el saldo por lineas no cuenta las notas por monto", () => {
      const saldos = saldoAcreditablePorLinea(facturaEjemplo(), [nota({ items: [linea(1, "IVA_10", 68432)] })]);
      expect(saldos[0]!.cantidad_acreditada).toBe(0);
    });
  });

  describe("emision", () => {
    it("CA-01: 100.000 con motivo Descuento se reparte como el ejemplo de FE y va sin referencia, con motivo 3", async () => {
      const { repo, creadas } = repositorio(facturaEjemplo());
      const { g, pedidos } = gateway();
      const { documento, reintento } = await emitNotaCredito(context, FACTURA_ID, { motivo: "Descuento acordado", monto: 100000, motivo_codigo: 3 }, repo, g);
      expect(reintento).toBe(false);
      expect(documento.nce_modo).toBe("MONTO");
      expect(pedidos).toHaveLength(1);
      const pedido = pedidos[0]!;
      expect(pedido.por_referencia).toBeUndefined();
      expect(pedido.motivo_codigo).toBe(3);
      expect(pedido.moneda).toBeUndefined();
      expect(pedido.items.map((i) => [i.codigo, i.iva_tipo, i.cantidad, i.precio_unitario, i.descripcion])).toEqual([
        ["AJ-IVA10", "IVA_10", 1, 68432, "Descuento posterior sobre la factura"],
        ["AJ-IVA5", "IVA_5", 1, 20065, "Descuento posterior sobre la factura"],
        ["AJ-EXE", "EXENTA", 1, 11503, "Descuento posterior sobre la factura"]
      ]);
      expect(pedido.totals.total).toBe(100000);
      expect(creadas[0]).toMatchObject({ modo: "MONTO", motivoCodigo: 3 });
      expect(creadas[0]!.totals!.total).toBe(100000);
    });

    it("sin motivo_codigo usa 3 (Descuento)", async () => {
      const { repo } = repositorio(facturaEjemplo());
      const { g, pedidos } = gateway();
      await emitNotaCredito(context, FACTURA_ID, { motivo: "x", monto: 1000 }, repo, g);
      expect(pedidos[0]!.motivo_codigo).toBe(3);
    });

    it("CA-03: 10.020 Gs responde 400 sin llamar a FE", async () => {
      const { repo } = repositorio(facturaEjemplo());
      const { g } = gateway();
      await expect(emitNotaCredito(context, FACTURA_ID, { motivo: "x", monto: 10020 }, repo, g)).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining("múltiplo de 50")
      });
      expect(g.emitNotaCredito).not.toHaveBeenCalled();
    });

    it("CA-03 / RN-04: un monto mayor que el saldo neto responde 409 NOTA_CREDITO_SUPERA_SALDO sin llamar a FE", async () => {
      // 152.300 supera el neto (132.300) pero no el bruto: FE la numeraria y SIFEN la rechazaria con 2417 (§67.4).
      const { repo } = repositorio(facturaEjemplo(), [nota({ totals: totales(100000) }), nota({ totals: totales(10000) })]);
      const { g } = gateway();
      await expect(emitNotaCredito(context, FACTURA_ID, { motivo: "x", monto: 152300 }, repo, g)).rejects.toMatchObject({
        statusCode: 409,
        details: { reason: "NOTA_CREDITO_SUPERA_SALDO", saldo: 132300 }
      });
      expect(g.emitNotaCredito).not.toHaveBeenCalled();
    });

    it("CA-04: el saldo exacto se acepta", async () => {
      const { repo } = repositorio(facturaEjemplo(), [nota({ totals: totales(100000) }), nota({ totals: totales(10000) })]);
      const { g, pedidos } = gateway();
      await emitNotaCredito(context, FACTURA_ID, { motivo: "x", monto: 132300, motivo_codigo: 8 }, repo, g);
      expect(pedidos[0]!.totals.total).toBe(132300);
      expect(pedidos[0]!.items[0]!.descripcion).toBe("Ajuste de precio sobre la factura");
    });

    it("D-8: si FE no da los totales responde 502 sin emitir", async () => {
      const { repo } = repositorio(facturaEjemplo());
      const { g } = gateway(new FiscalGatewayError("UPSTREAM_ERROR", "caido"));
      await expect(emitNotaCredito(context, FACTURA_ID, { motivo: "x", monto: 1000 }, repo, g)).rejects.toMatchObject({
        statusCode: 502,
        details: { reason: "FE_TOTALES_NO_DISPONIBLES" }
      });
      expect(g.emitNotaCredito).not.toHaveBeenCalled();
    });

    it("CA-02: en USD manda moneda y tipo de cambio, con montos en centavos", async () => {
      env.FE_NC_MONEDA_EXTRANJERA = true;
      const factura = facturaEjemplo({
        moneda: "USD",
        tipo_cambio: 7350.5,
        totals: { subtotal: 313.97, total_sin_iva: 286.15, iva_5: 0.5, iva_10: 27.32, total_iva: 27.82, total: 313.97, fuente: "FE" }
      });
      const { repo } = repositorio(factura);
      const { g, pedidos } = gateway({
        moneda: "USD",
        tipo_cambio: 7350.5,
        totales: { bruto: 313.97, descuento: 0, anticipo: 0, total: 313.97, redondeo: 0, gravada_10: 273.18, iva_10: 27.32, gravada_5: 10, iva_5: 0.5, exenta: 2.97, exonerada: 0, iva_total: 27.82 },
        total_guaranies: 2307806,
        raw: {}
      });
      await emitNotaCredito(context, FACTURA_ID, { motivo: "Bonificacion", monto: 50.25, motivo_codigo: 4 }, repo, g);
      expect(pedidos[0]).toMatchObject({ moneda: "USD", tipo_cambio: 7350.5, motivo_codigo: 4 });
      expect(Math.round(pedidos[0]!.items.reduce((s, i) => s + i.precio_unitario, 0) * 100)).toBe(5025);
    });

    it("en USD con la bandera apagada responde 409 NOTA_CREDITO_MONEDA_EXTRANJERA", async () => {
      env.FE_NC_MONEDA_EXTRANJERA = false;
      const { repo } = repositorio(facturaEjemplo({ moneda: "USD" }));
      const { g } = gateway();
      await expect(emitNotaCredito(context, FACTURA_ID, { motivo: "x", monto: 10 }, repo, g)).rejects.toMatchObject({
        details: { reason: "NOTA_CREDITO_MONEDA_EXTRANJERA" }
      });
    });

    it("monto y lineas juntos responde 400", async () => {
      const { repo } = repositorio(facturaEjemplo());
      const { g } = gateway();
      await expect(
        emitNotaCredito(context, FACTURA_ID, { motivo: "x", monto: 1000, lineas: [{ line_no: 1, cantidad: 1 }] }, repo, g)
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("con anticipo responde 409 NOTA_CREDITO_CON_ANTICIPO", async () => {
      const { repo } = repositorio(facturaEjemplo({ totals: { ...facturaEjemplo().totals, anticipo: 1000 } }));
      const { g } = gateway();
      await expect(emitNotaCredito(context, FACTURA_ID, { motivo: "x", monto: 1000 }, repo, g)).rejects.toMatchObject({
        details: { reason: "NOTA_CREDITO_CON_ANTICIPO" }
      });
    });

    it("con una nota trabada responde 409 NOTA_CREDITO_TRABADA", async () => {
      const trabada = nota({ estado: "PENDIENTE_SIFEN", fiscal_status: { code: "TRANSMISSION_FAILED", recoverable: true, suggested_action: "RETRY" } } as never);
      const { repo } = repositorio(facturaEjemplo(), [trabada]);
      const { g } = gateway();
      await expect(emitNotaCredito(context, FACTURA_ID, { motivo: "x", monto: 1000 }, repo, g)).rejects.toMatchObject({
        details: { reason: "NOTA_CREDITO_TRABADA" }
      });
    });

    it("RN-10: una parcial por lineas despues de una nota por monto no puede pasar el saldo neto", async () => {
      const factura = facturaEjemplo({ totals: { ...facturaEjemplo().totals, nota_credito_por_referencia: false } });
      const { repo } = repositorio(factura, [nota({ totals: totales(200000) })]);
      const { g } = gateway();
      await expect(emitNotaCredito(context, FACTURA_ID, { motivo: "x", lineas: [{ line_no: 1, cantidad: 1 }] }, repo, g)).rejects.toMatchObject({
        statusCode: 409,
        details: { reason: "NOTA_CREDITO_SUPERA_SALDO" }
      });
    });

    it("RN-07: el reintento de una nota por monto repite sus lineas y su motivo SIFEN", async () => {
      const trabada = nota({
        estado: "PENDIENTE_SIFEN",
        external_ref: "nce_monto",
        nce_motivo: "Bonificacion",
        nce_motivo_codigo: 4,
        items: [linea(1, "IVA_10", 5000)],
        totals: totales(5000),
        fiscal_status: { code: "TRANSMISSION_FAILED", recoverable: true, suggested_action: "RETRY" }
      } as never);
      const { repo } = repositorio(facturaEjemplo(), [trabada]);
      const { g, pedidos } = gateway();
      await reintentarNotaCredito(context, trabada, repo, g, facturaEjemplo());
      expect(pedidos[0]).toMatchObject({ external_ref: "nce_monto", motivo_codigo: 4 });
      expect(pedidos[0]!.items).toHaveLength(1);
      expect(pedidos[0]!.items[0]!.precio_unitario).toBe(5000);
    });
  });

  describe("saldo expuesto y candidatas", () => {
    it("la factura con descuento admite monto (no parcial por lineas) con las tasas de FE", async () => {
      const { repo } = repositorio(facturaEjemplo(), [nota({ totals: totales(100000) })]);
      const { g } = gateway();
      const saldo = await getNotaCreditoSaldo(context, FACTURA_ID, repo, g);
      expect(saldo.admite_parcial).toBe(false);
      expect(saldo.monto).toEqual({
        admite: true,
        motivo_no_admite: null,
        total_factura: 242300,
        acreditado: 100000,
        saldo: 142300,
        tasas: { iva_10: 165833, iva_5: 48623, exenta: 27875 },
        fuente: "FE"
      });
    });

    it("acreditada por completo: no admite monto", async () => {
      const { repo } = repositorio(facturaEjemplo(), [nota({ totals: totales(242300) })]);
      const { g } = gateway();
      const saldo = await getNotaCreditoSaldo(context, FACTURA_ID, repo, g);
      expect(saldo.monto).toMatchObject({ admite: false, saldo: 0, motivo_no_admite: expect.stringContaining("acreditada por completo") });
    });

    it("sin FE: usa los totales guardados y no da tasas", async () => {
      const { repo } = repositorio(facturaEjemplo());
      const { g } = gateway(new FiscalGatewayError("UPSTREAM_ERROR", "caido"));
      const saldo = await getNotaCreditoSaldo(context, FACTURA_ID, repo, g);
      expect(saldo.monto).toMatchObject({ admite: true, total_factura: 242300, tasas: null, fuente: "FS" });
    });

    it("RN-09: una factura con notas por monto sigue candidata mientras tenga saldo", async () => {
      const factura = facturaEjemplo();
      const conSaldo = nota({ totals: totales(100000) });
      const repo = {
        list: vi.fn(async (input: { filters: { tipo: string } }) =>
          input.filters.tipo === "FACTURA" ? { total: 1, items: [factura] } : { total: 1, items: [conSaldo] }
        )
      } as unknown as FacturaRepository;
      const sinSaldo = await listNotaCreditoCandidates(context, {}, repo);
      expect(sinSaldo.items[0]!.elegible).toBe(true);
      conSaldo.totals = totales(242300);
      const completa = await listNotaCreditoCandidates(context, {}, repo);
      expect(completa.items[0]!.elegible).toBe(false);
    });
  });

  describe("gateway", () => {
    it("manda motivo.codigo del pedido y 1 por defecto", async () => {
      const fetchMock = vi.fn(async () => new Response(JSON.stringify({ document_id: "1", status: "QUEUED_BATCH", idempotent: false }), { status: 201 }));
      vi.stubGlobal("fetch", fetchMock);
      const real = createFiscalGateway({ mode: "real", baseUrl: "http://fe.test/v1", apiKey: "clave", timeoutMs: 1000, environment: "test", sendEmissionProfileCode: true, serviceNumbering: true } as never);
      const base = {
        external_ref: "nce_x",
        facturador: context.facturador,
        fiscal_context: context.fiscal_context,
        cliente: facturaEjemplo().cliente,
        items: [linea(1, "IVA_10", 68432)],
        totals: totales(68432),
        motivo: "Descuento",
        factura_referencia: { documento_id: FACTURA_ID, cdc: facturaEjemplo().cdc!, numero_fiscal: "001-001-0001234" }
      } as FiscalEmitNotaCreditoRequest;
      await real.emitNotaCredito({ ...base, motivo_codigo: 8 });
      await real.emitNotaCredito(base);
      const cuerpo = (n: number) => JSON.parse(String((fetchMock.mock.calls[n] as unknown as [string, RequestInit])[1].body));
      expect(cuerpo(0).motivo).toEqual({ codigo: 8, descripcion: "Descuento" });
      expect(cuerpo(1).motivo.codigo).toBe(1);
    });

    it("el mock informa las tres tasas desde las lineas de la factura", async () => {
      const mock = createFiscalGateway({ mode: "mock" } as never);
      const pedido = {
        external_ref: `fac_${Date.now()}`,
        facturador: context.facturador,
        fiscal_context: context.fiscal_context,
        cliente: facturaEjemplo().cliente,
        condicion_venta: "CONTADO",
        items: [linea(1, "IVA_10", 110000), linea(2, "IVA_5", 21000), linea(3, "EXENTA", 30000)],
        totals: { subtotal: 161000, total_sin_iva: 151000, iva_5: 1000, iva_10: 10000, total_iva: 11000, total: 161000 }
      };
      const emitida = await mock.emitFactura(pedido as never);
      const fe = await mock.getDocumentoTotales(emitida.document_uuid!);
      expect(fe.totales).toMatchObject({ gravada_10: 100000, iva_10: 10000, gravada_5: 20000, iva_5: 1000, exenta: 30000 });
    });
  });
});
