import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "../src/config/env";
import { createFiscalGateway } from "../src/modules/fiscal-gateway/fiscal-gateway.client";
import {
  FiscalGatewayError,
  type FiscalConsultaDeSifenResponse,
  type FiscalEmitNotaCreditoRequest,
  type FiscalEmitNotaCreditoResponse,
  type FiscalGateway
} from "../src/modules/fiscal-gateway/fiscal-gateway.types";
import { __limpiarCacheDeSifen, cargarManual, eliminarExterna, previsualizarDeSifen, traerDeSifen } from "../src/modules/facturas/facturas-externas.service";
import { emitNotaCredito, getNotaCreditoSaldo, refreshDocumentoStatus } from "../src/modules/facturas/facturas.service";
import type { OperationalContextResponse } from "../src/modules/context/context.types";
import type { DocumentoResponse, FacturaExternaPersistInput, FacturaRepository, NotaCreditoPersistInput } from "../src/modules/facturas/facturas.types";

// SPEC_NOTA_CREDITO_FACTURA_EXTERNA_v0.1 (TASKS NCX-004 a NCX-006). Fixture: rDE real de 001-001-1010665 (SIFEN test).
const RDE = fs.readFileSync(path.join(__dirname, "fixtures", "rde-factura-1010665.xml"), "utf8");
// CDC reales del stack local (PLAN §0): factura 1010665, factura 1010667 y la NC 1010034.
const CDC_1010665 = "01050570161001001101066512026111215911136102";
const CDC_1010667 = "01050570161001001101066712026111210175744287";
const CDC_NC = "05050570161001001101003412026111214303408548";

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

/** Repositorio en memoria: guarda externas y notas. */
function repositorio() {
  const documentos = new Map<string, DocumentoResponse>();
  const notas: NotaCreditoPersistInput[] = [];
  let n = 0;
  const repo = {
    findById: vi.fn(async ({ documentoId }: { documentoId: string }) => documentos.get(documentoId) ?? null),
    findByCdc: vi.fn(async ({ cdc }: { cdc: string }) => [...documentos.values()].find((d) => d.cdc === cdc) ?? null),
    findByReferenciaImpresa: vi.fn(async ({ referencia }: { referencia: { numero: string; timbrado: string } }) =>
      [...documentos.values()].find((d) => d.referencia_impresa?.numero === referencia.numero && d.referencia_impresa?.timbrado === referencia.timbrado) ?? null
    ),
    createFacturaExterna: vi.fn(async (input: FacturaExternaPersistInput) => {
      n += 1;
      const doc = {
        id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, "0")}`,
        tipo: "FACTURA",
        estado: "EMITIDA",
        condicion_venta: input.condicionVenta,
        moneda: input.moneda,
        tipo_cambio: input.tipoCambio,
        cdc: input.cdc,
        document_uuid: null,
        numero_fiscal: input.numeroFiscal,
        cliente: input.cliente,
        items: input.items,
        totals: input.totals,
        origen: input.origen,
        referencia_impresa: input.referenciaImpresa,
        sifen_consulta: input.sifenConsulta,
        fecha_emision: input.fechaEmision,
        fiscal_status: null,
        delivery: { email_status: "NOT_APPLICABLE" }
      } as unknown as DocumentoResponse;
      documentos.set(doc.id, doc);
      return doc;
    }),
    softDeleteFacturaExterna: vi.fn(async () => true),
    findNotasCreditoByOriginal: vi.fn(async () => []),
    createNotaCreditoFromFactura: vi.fn(async (input: NotaCreditoPersistInput) => {
      notas.push(input);
      return { id: "nota-1", tipo: "NOTA_CREDITO", estado: input.estado, items: input.items ?? input.original.items, totals: input.totals ?? input.original.totals, nce_modo: input.modo ?? null, fiscal_status: null } as unknown as DocumentoResponse;
    }),
    updateTotals: vi.fn(async () => null)
  } as unknown as FacturaRepository;
  return { repo, documentos, notas };
}

function gateway(consulta: (cdc: string) => Promise<FiscalConsultaDeSifenResponse>) {
  const pedidos: FiscalEmitNotaCreditoRequest[] = [];
  const g = {
    consultarDeSifen: vi.fn(async (cdc: string) => consulta(cdc)),
    getDocumentoTotales: vi.fn(async () => {
      throw new Error("no deberia pedir /totales de una externa");
    }),
    refreshFacturaStatus: vi.fn(async () => {
      throw new Error("no deberia consultar FE por una externa");
    }),
    emitNotaCredito: vi.fn(async (request: FiscalEmitNotaCreditoRequest): Promise<FiscalEmitNotaCreditoResponse> => {
      pedidos.push(request);
      return { fiscal_document_id: "nce", document_uuid: null, cdc: "05".padEnd(44, "0"), numero_fiscal: "001-001-0000040", estado: "PENDIENTE_SIFEN", status_raw: "QUEUED_BATCH", result_code: null, result_message: null, idempotent: false, batch: null, email_status: "NOT_APPLICABLE", raw: {} } as FiscalEmitNotaCreditoResponse;
    })
  } as unknown as FiscalGateway;
  return { g, pedidos };
}

const aprobada = async (cdc: string): Promise<FiscalConsultaDeSifenResponse> => ({
  cdc,
  estado: "APROBADO",
  sifen: { dCodRes: "0422", dMsgRes: "CDC encontrado", dFecProc: "2026-11-12T18:48:00-03:00", dProtAut: "50414874" },
  xml_rde: RDE,
  desde_cache: false
});

const impresa = { tipo: "IMPRESO" as const, timbrado: "12345678", establecimiento: "1", punto: "1", numero: "123", fecha: "2026-11-01" };
const manualBase = {
  cliente: { documento_tipo: "RUC" as const, documento: "80026570-0", razon_social: "SEGEL SA" },
  items: [
    { descripcion: "Servicio", cantidad: 2, precio_unitario: 55000, iva_tipo: "IVA_10" as const },
    { descripcion: "Libro", cantidad: 1, precio_unitario: 21000, iva_tipo: "IVA_5" as const }
  ],
  moneda: "PYG" as const
};

describe("facturas externas", () => {
  const banderaDescuentos = env.FE_NC_DESCUENTOS;
  beforeEach(() => __limpiarCacheDeSifen());
  afterEach(() => {
    env.FE_NC_DESCUENTOS = banderaDescuentos;
    vi.unstubAllGlobals();
  });

  describe("traer desde SIFEN por CDC", () => {
    it("previsualiza y guarda la 1010665 con los datos del rDE (origen SIFEN)", async () => {
      const { repo } = repositorio();
      const { g } = gateway(aprobada);
      const previa = await previsualizarDeSifen(context, CDC_1010665, repo, g);
      expect(previa).toMatchObject({ cdc: CDC_1010665, numero_fiscal: "001-001-1010665", totals: { total: 242300, gravada_10: 150757 } });
      expect(repo.createFacturaExterna).not.toHaveBeenCalled();

      const doc = await traerDeSifen(context, CDC_1010665, repo, g);
      expect(doc).toMatchObject({ origen: "SIFEN", estado: "EMITIDA", numero_fiscal: "001-001-1010665", cdc: CDC_1010665, fecha_emision: "2026-11-12", puede_eliminar_externa: true });
      expect(doc.items).toHaveLength(3);
      expect(doc.sifen_consulta).toMatchObject({ protocolo: "50414874" });
      // La previsualizacion y el guardado comparten la consulta (cache de 10 min).
      expect(g.consultarDeSifen).toHaveBeenCalledTimes(1);
    });

    it("normaliza el CDC pegado en grupos", async () => {
      const { repo } = repositorio();
      const { g } = gateway(aprobada);
      const agrupado = CDC_1010665.replace(/(\d{4})(?=\d)/g, "$1 ");
      expect((await traerDeSifen(context, agrupado, repo, g)).cdc).toBe(CDC_1010665);
    });

    it("RN-01: CDC de una NC, de otro RUC o con DV malo: 400 sin consultar SIFEN", async () => {
      const { repo } = repositorio();
      const { g } = gateway(aprobada);
      const dvMalo = CDC_1010665.slice(0, 43) + String((Number(CDC_1010665[43]) + 1) % 10);
      await expect(traerDeSifen(context, CDC_NC, repo, g)).rejects.toMatchObject({ statusCode: 400, details: { reason: "CDC_NO_ES_FACTURA" } });
      await expect(traerDeSifen(context, dvMalo, repo, g)).rejects.toMatchObject({ statusCode: 400, details: { reason: "CDC_DV" } });
      const otro = { ...context, facturador: { ...context.facturador, emisor_id: "80026570-0" } } as OperationalContextResponse;
      await expect(traerDeSifen(otro, CDC_1010665, repo, g)).rejects.toMatchObject({ statusCode: 400, details: { reason: "CDC_OTRO_EMISOR" } });
      expect(g.consultarDeSifen).not.toHaveBeenCalled();
    });

    it("D-7: una factura ya en el sistema (propia o externa) responde 409 FACTURA_YA_EXISTE", async () => {
      const { repo } = repositorio();
      const { g } = gateway(aprobada);
      const primera = await traerDeSifen(context, CDC_1010665, repo, g);
      await expect(traerDeSifen(context, CDC_1010665, repo, g)).rejects.toMatchObject({ statusCode: 409, details: { reason: "FACTURA_YA_EXISTE", documento_id: primera.id } });
    });

    it("RN-02/RN-03: inexistente, cancelada, sin permiso y SIFEN caido", async () => {
      const { repo } = repositorio();
      const inexistente = gateway(async () => {
        throw new FiscalGatewayError("UPSTREAM_ERROR", "x", { status: 404, body: { error: "CDC_INEXISTENTE" } });
      });
      await expect(traerDeSifen(context, CDC_1010667, repo, inexistente.g)).rejects.toMatchObject({ statusCode: 409, details: { reason: "FACTURA_NO_APROBADA" } });
      const cancelada = gateway(async (cdc) => ({ ...(await aprobada(cdc)), estado: "CANCELADO" }));
      await expect(traerDeSifen(context, CDC_1010667, repo, cancelada.g)).rejects.toMatchObject({ statusCode: 409, details: { reason: "FACTURA_NO_APROBADA", estado: "CANCELADO" } });
      const sinPermiso = gateway(async () => {
        throw new FiscalGatewayError("UPSTREAM_ERROR", "x", { status: 403, body: { error: "FORBIDDEN" } });
      });
      await expect(traerDeSifen(context, CDC_1010667, repo, sinPermiso.g)).rejects.toMatchObject({ statusCode: 409, details: { reason: "SIFEN_CONSULTA_NO_DISPONIBLE" } });
      const caido = gateway(async () => {
        throw new FiscalGatewayError("TIMEOUT", "x", { status: 504, body: { error: "SIFEN_TIMEOUT" } });
      });
      await expect(traerDeSifen(context, CDC_1010667, repo, caido.g)).rejects.toMatchObject({ statusCode: 503, details: { reason: "SIFEN_NO_DISPONIBLE" } });
    });

    it("RN-02: ante 429 reintenta una vez", async () => {
      const { repo } = repositorio();
      let llamadas = 0;
      const { g } = gateway(async (cdc) => {
        llamadas += 1;
        if (llamadas === 1) throw new FiscalGatewayError("UPSTREAM_ERROR", "x", { status: 429, body: { error: "RATE_LIMITED" }, retry_after: 0 });
        return aprobada(cdc);
      });
      expect((await traerDeSifen(context, CDC_1010665, repo, g)).origen).toBe("SIFEN");
      expect(llamadas).toBe(2);
    });

    it("rDE de otro emisor o con IVA parcial", async () => {
      const { repo } = repositorio();
      const otroEmisor = gateway(async (cdc) => ({ ...(await aprobada(cdc)), xml_rde: RDE.replace("<dRucEm>5057016</dRucEm>", "<dRucEm>80026570</dRucEm>") }));
      await expect(traerDeSifen(context, CDC_1010665, repo, otroEmisor.g)).rejects.toMatchObject({ statusCode: 409, details: { reason: "FACTURA_NO_PROPIA" } });
      __limpiarCacheDeSifen();
      const parcial = gateway(async (cdc) => ({ ...(await aprobada(cdc)), xml_rde: RDE.replace("<iAfecIVA>1</iAfecIVA>", "<iAfecIVA>4</iAfecIVA>") }));
      await expect(traerDeSifen(context, CDC_1010665, repo, parcial.g)).rejects.toMatchObject({ statusCode: 409, details: { reason: "IVA_PARCIAL_NO_SOPORTADO" } });
    });
  });

  describe("cargar a mano", () => {
    const hoy = new Date("2026-11-12T15:00:00Z");

    it("referencia impresa: normaliza ceros, calcula totales y bases por tasa (origen MANUAL)", async () => {
      const { repo } = repositorio();
      const doc = await cargarManual(context, { ...manualBase, referencia: impresa }, repo, hoy);
      expect(doc).toMatchObject({
        origen: "MANUAL",
        cdc: null,
        numero_fiscal: "001-001-0000123",
        fecha_emision: "2026-11-01",
        referencia_impresa: { timbrado: "12345678", establecimiento: "001", punto: "001", numero: "0000123", fecha: "2026-11-01" },
        totals: { total: 131000, fuente: "MANUAL", gravada_10: 100000, gravada_5: 20000, exenta: 0, exonerada: 0 }
      });
    });

    it("RN-05: timbrado corto y fecha futura responden 400", async () => {
      const { repo } = repositorio();
      await expect(cargarManual(context, { ...manualBase, referencia: { ...impresa, timbrado: "1234567" } }, repo, hoy)).rejects.toMatchObject({ statusCode: 400, message: "El timbrado tiene 8 dígitos." });
      await expect(cargarManual(context, { ...manualBase, referencia: { ...impresa, fecha: "2026-12-01" } }, repo, hoy)).rejects.toMatchObject({ statusCode: 400 });
    });

    it("referencia electronica: valida el CDC y toma la fecha del CDC", async () => {
      const { repo } = repositorio();
      const doc = await cargarManual(context, { ...manualBase, referencia: { tipo: "ELECTRONICO", cdc: CDC_1010667 } }, repo, hoy);
      expect(doc).toMatchObject({ origen: "MANUAL", cdc: CDC_1010667, numero_fiscal: "001-001-1010667", fecha_emision: "2026-11-12" });
      await expect(cargarManual(context, { ...manualBase, referencia: { tipo: "ELECTRONICO", cdc: CDC_NC } }, repo, hoy)).rejects.toMatchObject({ statusCode: 400 });
    });

    it("D-7: la misma referencia impresa dos veces responde 409", async () => {
      const { repo } = repositorio();
      await cargarManual(context, { ...manualBase, referencia: impresa }, repo, hoy);
      await expect(cargarManual(context, { ...manualBase, referencia: impresa }, repo, hoy)).rejects.toMatchObject({ statusCode: 409, details: { reason: "FACTURA_YA_EXISTE" } });
    });

    it("RN-09: eliminar solo externas; con notas, 409", async () => {
      const { repo } = repositorio();
      const doc = await cargarManual(context, { ...manualBase, referencia: impresa }, repo, hoy);
      await eliminarExterna(context, doc.id, repo);
      (repo.softDeleteFacturaExterna as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);
      await expect(eliminarExterna(context, doc.id, repo)).rejects.toMatchObject({ statusCode: 409, details: { reason: "EXTERNA_CON_NOTAS" } });
    });
  });

  describe("nota de credito sobre una externa", () => {
    const hoy = new Date("2026-11-12T15:00:00Z");

    it("D-3: total sobre la 1010665 (con descuentos) va por tasa, motivo 1, guardada como MONTO y sin referencia a FE", async () => {
      const { repo, notas } = repositorio();
      const { g, pedidos } = gateway(aprobada);
      const factura = await traerDeSifen(context, CDC_1010665, repo, g);
      await emitNotaCredito(context, factura.id, { motivo: "Devolucion total" }, repo, g);
      const pedido = pedidos[0]!;
      expect(pedido.por_referencia).toBeUndefined();
      // motivo 1 es el valor por defecto del gateway (`codigo: request.motivo_codigo ?? 1`).
      expect(pedido.motivo_codigo ?? 1).toBe(1);
      expect(pedido.factura_referencia.cdc).toBe(CDC_1010665);
      expect(pedido.items.map((i) => [i.codigo, i.iva_tipo])).toEqual([["AJ-IVA10", "IVA_10"], ["AJ-IVA5", "IVA_5"], ["AJ-EXE", "EXENTA"]]);
      expect(pedido.items.reduce((s, i) => s + i.precio_unitario, 0)).toBe(242300);
      expect(pedido.enviar_descuentos).toBeUndefined();
      expect(notas[0]).toMatchObject({ modo: "MONTO", motivoCodigo: 1 });
      expect(g.getDocumentoTotales).not.toHaveBeenCalled();
    });

    it("total sobre una externa impresa sin descuentos copia las lineas y va con referencia IMPRESO", async () => {
      const { repo } = repositorio();
      const { g, pedidos } = gateway(aprobada);
      const factura = await cargarManual(context, { ...manualBase, referencia: impresa }, repo, hoy);
      await emitNotaCredito(context, factura.id, { motivo: "Devolucion" }, repo, g);
      expect(pedidos[0]!.factura_referencia).toMatchObject({ cdc: null, referencia_impresa: { timbrado: "12345678", numero: "0000123" } });
      expect(pedidos[0]!.items.map((i) => i.descripcion)).toEqual(["Servicio", "Libro"]);
    });

    it("D-4: por lineas sobre una linea con descuento responde 400 (FE sin descuentos en la NC)", async () => {
      const { repo } = repositorio();
      const { g } = gateway(aprobada);
      const factura = await traerDeSifen(context, CDC_1010665, repo, g);
      // La factura tiene descuentos: no es "solo total" (no hay nota_credito_por_referencia en una externa).
      await expect(emitNotaCredito(context, factura.id, { motivo: "x", lineas: [{ line_no: 1, cantidad: 1 }] }, repo, g)).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining("usá la nota por monto")
      });
    });

    it("D-5: por monto usa las tasas guardadas (sin /totales de FE) y el saldo expuesto tambien", async () => {
      const { repo } = repositorio();
      const { g, pedidos } = gateway(aprobada);
      const factura = await traerDeSifen(context, CDC_1010665, repo, g);
      const saldo = await getNotaCreditoSaldo(context, factura.id, repo, g);
      expect(saldo.monto).toMatchObject({ admite: true, total_factura: 242300, saldo: 242300, tasas: { iva_10: 165833, iva_5: 48623, exenta: 27875 } });
      await emitNotaCredito(context, factura.id, { motivo: "Descuento", monto: 100000, motivo_codigo: 3 }, repo, g);
      expect(pedidos[0]!.items.map((i) => i.precio_unitario)).toEqual([68432, 20065, 11503]);
      expect(g.getDocumentoTotales).not.toHaveBeenCalled();
    });

    it("D-9: refrescar una externa no consulta FE", async () => {
      const { repo } = repositorio();
      const { g } = gateway(aprobada);
      const factura = await traerDeSifen(context, CDC_1010665, repo, g);
      const refrescada = await refreshDocumentoStatus(context, factura.id, repo, g);
      expect(refrescada.origen).toBe("SIFEN");
      expect(g.refreshFacturaStatus).not.toHaveBeenCalled();
    });

    it("RN-08: FE sin soporte de externa (404) responde 409 sin guardar la nota", async () => {
      const { repo, notas } = repositorio();
      const { g } = gateway(aprobada);
      (g.emitNotaCredito as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new FiscalGatewayError("UPSTREAM_ERROR", "x", { status: 404, body: { error: "REFERENCED_DOCUMENT_NOT_FOUND" } })
      );
      const factura = await cargarManual(context, { ...manualBase, referencia: { tipo: "ELECTRONICO", cdc: CDC_1010667 } }, repo, hoy);
      await expect(emitNotaCredito(context, factura.id, { motivo: "x" }, repo, g)).rejects.toMatchObject({
        statusCode: 409,
        details: { reason: "NOTA_CREDITO_FE_SIN_SOPORTE_EXTERNA" }
      });
      expect(notas).toHaveLength(0);
    });

    it("D-8: receptor del exterior responde 409 NOTA_CREDITO_EXTERIOR", async () => {
      const { repo } = repositorio();
      const exterior = RDE.replace("<cPaisRec>PRY</cPaisRec>", "<cPaisRec>ARG</cPaisRec>");
      const { g } = gateway(async (cdc) => ({ ...(await aprobada(cdc)), xml_rde: exterior }));
      const factura = await traerDeSifen(context, CDC_1010665, repo, g);
      await expect(emitNotaCredito(context, factura.id, { motivo: "x", monto: 1000 }, repo, g)).rejects.toMatchObject({ details: { reason: "NOTA_CREDITO_EXTERIOR" } });
    });
  });

  describe("gateway", () => {
    it("la NC con referencia impresa manda IMPRESO con puntoExpedicion; sin bandera no manda descuentos", async () => {
      const fetchMock = vi.fn(async () => new Response(JSON.stringify({ document_id: "1", status: "QUEUED_BATCH", idempotent: false }), { status: 201 }));
      vi.stubGlobal("fetch", fetchMock);
      const real = createFiscalGateway({ mode: "real", baseUrl: "http://fe.test/v1", apiKey: "clave", timeoutMs: 1000, environment: "test", sendEmissionProfileCode: true, serviceNumbering: true } as never);
      const base = {
        external_ref: "nce_x",
        facturador: context.facturador,
        fiscal_context: context.fiscal_context,
        cliente: manualBase.cliente,
        items: [{ line_no: 1, codigo: null, descripcion: "A", cantidad: 1, precio_unitario: 1000, iva_tipo: "IVA_10", subtotal: 1000, base_imponible: 909, iva_monto: 91, descuento: 100, descuento_global: 50, catalogo_item_id: null }],
        totals: { subtotal: 1000, total_sin_iva: 909, iva_5: 0, iva_10: 91, total_iva: 91, total: 1000 },
        motivo: "x",
        factura_referencia: { documento_id: "f", cdc: null, numero_fiscal: "001-001-0000123", referencia_impresa: { timbrado: "12345678", establecimiento: "001", punto: "001", numero: "0000123", fecha: "2026-11-01" } }
      } as unknown as FiscalEmitNotaCreditoRequest;
      await real.emitNotaCredito(base);
      await real.emitNotaCredito({ ...base, enviar_descuentos: true });
      const cuerpo = (i: number) => JSON.parse(String((fetchMock.mock.calls[i] as unknown as [string, RequestInit])[1].body));
      expect(cuerpo(0).referencia).toEqual({ tipo: "IMPRESO", timbrado: "12345678", establecimiento: "001", puntoExpedicion: "001", numero: "0000123", fecha: "2026-11-01" });
      expect(cuerpo(0).items[0].descuento).toBeUndefined();
      expect(cuerpo(0).descuentoGlobal).toBeUndefined();
      expect(cuerpo(1).items[0].descuento).toBe(100);
      expect(cuerpo(1).descuentoGlobal).toBe(50);
    });

    it("consultarDeSifen real: arma la URL y traslada Retry-After", async () => {
      const fetchMock = vi.fn(async (url: string) =>
        url.includes("ok")
          ? new Response(JSON.stringify({ cdc: "x", estado: "APROBADO", sifen: { dCodRes: "0422", dProtAut: "1" }, xml_rde: "<rDE/>", desde_cache: true }), { status: 200 })
          : new Response(JSON.stringify({ error: "RATE_LIMITED" }), { status: 429, headers: { "retry-after": "2" } })
      );
      vi.stubGlobal("fetch", fetchMock);
      const real = createFiscalGateway({ mode: "real", baseUrl: "http://fe.test/v1", apiKey: "clave", timeoutMs: 1000, environment: "test", sendEmissionProfileCode: true, serviceNumbering: true } as never);
      const ok = await real.consultarDeSifen!("ok", "5057016-1");
      expect(ok).toMatchObject({ estado: "APROBADO", xml_rde: "<rDE/>", desde_cache: true, sifen: { dProtAut: "1" } });
      expect(String((fetchMock.mock.calls[0] as unknown as [string])[0])).toBe("http://fe.test/v1/consultar/de-sifen/ok?emisor_id=5057016-1&env=test");
      await expect(real.consultarDeSifen!("lento", "5057016-1")).rejects.toMatchObject({ details: { status: 429, retry_after: 2 } });
    });
  });
});
