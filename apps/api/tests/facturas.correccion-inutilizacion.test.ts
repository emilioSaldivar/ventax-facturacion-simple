import { describe, expect, it } from "vitest";
// SPEC_CORRECCION_INUTILIZACION_RECHAZADAS_v0.1: correccion vinculada (fase A) e inutilizacion por el operador (fase B).
import { MockFiscalGateway } from "../src/modules/fiscal-gateway/fiscal-gateway.client";
import {
  FiscalGatewayError,
  type FiscalGateway,
  type FiscalInutilizarNumeracionRequest,
  type FiscalInutilizarNumeracionResponse
} from "../src/modules/fiscal-gateway/fiscal-gateway.types";
import { deriveAccion } from "../src/modules/facturas/facturas.accion";
import {
  buscarCodigoSifen,
  leerNumeracionDelCdc,
  mismoEmisor,
  numeroComparable,
  puedeInutilizar
} from "../src/modules/facturas/facturas.inutilizacion";
import { enqueueFacturaEmission, getDocumentoById, inutilizarNumeroFactura } from "../src/modules/facturas/facturas.service";
import type {
  DocumentoResponse,
  FacturaQueuedPersistInput,
  FacturaRepository,
  InutilizacionPersistInput
} from "../src/modules/facturas/facturas.types";
import type { OperationalContextResponse } from "../src/modules/context/context.types";

// CDC con la estructura del MT150: tipo 01, RUC 80136968, DV 1, 001-001-1010565.
const CDC = "01801369681001001101056512026110914786851818";

const context = {
  user: { id: "11111111-1111-4111-8111-111111111111", username: "operador", display_name: "Operador", role: "OPERADOR_FACTURACION" },
  tenant: { id: "22222222-2222-4222-8222-222222222222", name: "Tenant", status: "ACTIVE" },
  facturador: { id: "33333333-3333-4333-8333-333333333333", emisor_id: "80136968-1", razon_social: "Facturador", ruc: "80136968-1" },
  fiscal_context: {
    establecimiento: "001",
    punto_expedicion: "002",
    perfil_emision_codigo: "SERV",
    actividad_economica_codigo: "82110",
    actividad_economica_descripcion: "Servicios",
    timbrado: "80136968",
    timbrado_inicio: "2025-12-30",
    documento_nro: "0000000",
    credito_plazo_dias: 30,
    tipo_transaccion_default: 2,
    fiscal_envio_modo: "BATCH",
    batch_enabled: true
  },
  actividad_punto_perfil_id: "55555555-5555-4555-8555-555555555555"
} as unknown as OperationalContextResponse;

function rechazada(overrides: Partial<DocumentoResponse> = {}): DocumentoResponse {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    document_uuid: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    tipo: "FACTURA",
    estado: "RECHAZADA",
    condicion_venta: "CONTADO",
    numero_fiscal: "1010565",
    cdc: CDC,
    fiscal_document_id: "fe-1",
    external_ref: "fac_x",
    fiscal_envio_modo: "BATCH",
    batch: null,
    cliente: { documento_tipo: "RUC", documento: "80000000-5", razon_social: "Empresa" },
    items: [],
    totals: { total: 1100 },
    fiscal_status: null,
    fiscal_status_raw: "REJECTED",
    sifen_result_code: "0420",
    sifen_result_message: "Documento No Existe en SIFEN o ha sido Rechazado",
    sifen_last_checked_at: null,
    documento_relacionado_id: null,
    nce_motivo: null,
    emitido_por: null,
    cancelacion: null,
    inutilizacion: null,
    corrige_a: null,
    corregida_por: null,
    delivery: { public_url: null, whatsapp_url: null, email_status: "NOT_APPLICABLE", artifacts: { kude_pdf: { available: true, url: null }, xml: { available: true, url: null } } },
    created_at: "2026-11-09T12:00:00.000Z",
    ...overrides
  } as DocumentoResponse;
}

class Repo {
  documento: DocumentoResponse | null = rechazada();
  lastQueued: FacturaQueuedPersistInput | null = null;
  registros: InutilizacionPersistInput[] = [];

  async findById(): Promise<DocumentoResponse | null> {
    return this.documento;
  }
  async findByIdempotencyKey(): Promise<DocumentoResponse | null> {
    return null;
  }
  async createQueuedEmission(input: FacturaQueuedPersistInput): Promise<DocumentoResponse> {
    this.lastQueued = input;
    return rechazada({
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      estado: "EMITIENDO",
      cdc: null,
      numero_fiscal: null,
      documento_relacionado_id: input.documentoRelacionadoId ?? null
    });
  }
  async registrarInutilizacion(input: InutilizacionPersistInput): Promise<DocumentoResponse | null> {
    this.registros.push(input);
    if (!this.documento) return null;
    this.documento = {
      ...this.documento,
      inutilizacion: {
        status: input.status,
        evento_id: input.eventoId,
        motivo: input.motivo,
        rejection_code: input.rejectionCode,
        rejection_message: input.rejectionMessage,
        intentos: (this.documento.inutilizacion?.intentos ?? 0) + 1,
        last_at: "2026-11-10T12:00:00.000Z"
      }
    };
    return this.documento;
  }
}

class Gateway {
  requests: FiscalInutilizarNumeracionRequest[] = [];
  respuesta: FiscalInutilizarNumeracionResponse | FiscalGatewayError = { event_id: "91", status: "VOIDED", sifen: {} };
  async inutilizarNumeracion(request: FiscalInutilizarNumeracionRequest): Promise<FiscalInutilizarNumeracionResponse> {
    this.requests.push(request);
    if (this.respuesta instanceof FiscalGatewayError) throw this.respuesta;
    return this.respuesta;
  }
}

const emitInput = {
  condicion_venta: "CONTADO" as const,
  tipo_transaccion: 2,
  cliente: { documento_tipo: "CI" as const, documento: "492019", razon_social: "Roberto Saldivar" },
  items: [{ descripcion: "Servicio", cantidad: 1, precio_unitario: 1100, iva_tipo: "IVA_10" as const }]
};

const asRepo = (repo: Repo) => repo as unknown as FacturaRepository;
const asGateway = (gateway: Gateway) => gateway as unknown as FiscalGateway;

describe("reglas puras de la inutilizacion", () => {
  it("lee establecimiento, punto y numero del CDC", () => {
    expect(leerNumeracionDelCdc(CDC)).toEqual({ tipo: "01", ruc: "80136968", dv: "1", establecimiento: "001", punto: "001", numero: "1010565" });
    expect(leerNumeracionDelCdc("0180136968")).toBeNull();
    expect(leerNumeracionDelCdc(`${CDC.slice(0, 43)}X`)).toBeNull();
    expect(leerNumeracionDelCdc(null)).toBeNull();
  });

  it("compara el numero fiscal en sus dos formas y el emisor sin ceros a la izquierda", () => {
    expect(numeroComparable("1010565")).toBe("1010565");
    expect(numeroComparable("001-001-1010565")).toBe("1010565");
    expect(numeroComparable("001-001-0000047")).toBe("0000047");
    expect(numeroComparable(null)).toBeNull();
    expect(mismoEmisor("5057016-1", { ruc: "05057016", dv: "1" })).toBe(true);
    expect(mismoEmisor("5057016-1", { ruc: "05057016", dv: "2" })).toBe(false);
  });

  it("RN-B1: solo una factura rechazada con CDC y numero, sin inutilizacion aceptada", () => {
    expect(puedeInutilizar(rechazada())).toBe(true);
    expect(puedeInutilizar(rechazada({ estado: "EMITIDA" }))).toBe(false);
    expect(puedeInutilizar(rechazada({ tipo: "NOTA_CREDITO" }))).toBe(false);
    expect(puedeInutilizar(rechazada({ cdc: null }))).toBe(false);
    const aceptada = { status: "ACCEPTED" as const, evento_id: "1", motivo: "m", rejection_code: null, rejection_message: null, intentos: 1, last_at: null };
    expect(puedeInutilizar(rechazada({ inutilizacion: aceptada }))).toBe(false);
    expect(puedeInutilizar(rechazada({ inutilizacion: { ...aceptada, status: "REJECTED" } }))).toBe(true);
  });

  it("encuentra dCodRes y dMsgRes en cualquier nivel de la respuesta de SIFEN", () => {
    expect(buscarCodigoSifen({ "ns2:rRetEnviEventoDe": { "ns2:gResProcEVe": { "ns2:dCodRes": "4003", "ns2:dMsgRes": "Rango" } } })).toEqual({ code: "4003", message: "Rango" });
    expect(buscarCodigoSifen(null)).toEqual({ code: null, message: null });
  });
});

describe("fase A: correccion vinculada", () => {
  it("CA-01: la emision guarda la factura que corrige", async () => {
    const repo = new Repo();
    await enqueueFacturaEmission(context, emitInput, asRepo(repo), { idempotencyKey: "idem-corr-1", corrigeDocumentoId: rechazada().id });
    expect(repo.lastQueued?.documentoRelacionadoId).toBe(rechazada().id);
  });

  it("sin corrige_documento_id la emision no cambia", async () => {
    const repo = new Repo();
    await enqueueFacturaEmission(context, emitInput, asRepo(repo), { idempotencyKey: "idem-corr-2" });
    expect(repo.lastQueued?.documentoRelacionadoId).toBeNull();
  });

  it.each([
    ["aprobada", rechazada({ estado: "EMITIDA" }), "CORRECCION_NO_ADMITIDA"],
    ["de otro facturador o inexistente", null, "CORRECCION_NO_ADMITIDA"],
    ["nota de credito", rechazada({ tipo: "NOTA_CREDITO" }), "CORRECCION_NO_ADMITIDA"],
    ["ya corregida", rechazada({ corregida_por: { id: "x", numero_fiscal: "1010566", estado: "EMITIDA" } }), "CORRECCION_EXISTENTE"]
  ])("CA-02: no corrige una factura %s", async (_caso, original, reason) => {
    const repo = new Repo();
    repo.documento = original;
    await expect(
      enqueueFacturaEmission(context, emitInput, asRepo(repo), { idempotencyKey: "idem-corr-3", corrigeDocumentoId: rechazada().id })
    ).rejects.toMatchObject({ statusCode: 409, details: { reason } });
    expect(repo.lastQueued).toBeNull();
  });
});

describe("fase B: inutilizacion por el operador", () => {
  it("CA-03 y CA-07: arma el pedido desde el CDC y el facturador, y guarda ACCEPTED", async () => {
    const repo = new Repo();
    const gateway = new Gateway();
    const result = await inutilizarNumeroFactura(context, rechazada().id, { motivo: "Factura rechazada por SIFEN" }, asRepo(repo), asGateway(gateway));
    // El contexto activo es 001-002: el punto sale del CDC, no del contexto ni del pedido.
    expect(gateway.requests).toEqual([
      {
        emisor_id: "80136968-1",
        establecimiento: "001",
        puntoExpedicion: "001",
        desdeNumero: "1010565",
        hastaNumero: "1010565",
        motivo: "Factura rechazada por SIFEN",
        tipoDocumento: "FE"
      }
    ]);
    expect(repo.registros[0]).toMatchObject({ status: "ACCEPTED", eventoId: "91", numero: "001-001-1010565", usuarioId: context.user.id });
    expect(result.puede_inutilizar).toBe(false);
    expect(result.accion).toBe("OK");
  });

  it("CA-04: un rechazo de SIFEN queda REJECTED con su codigo y deja reintentar", async () => {
    const repo = new Repo();
    const gateway = new Gateway();
    gateway.respuesta = { event_id: "92", status: "REJECTED", sifen: { "ns2:dCodRes": "4003", "ns2:dMsgRes": "Rango no habilitado" } };
    const result = await inutilizarNumeroFactura(context, rechazada().id, { motivo: "Motivo valido" }, asRepo(repo), asGateway(gateway));
    expect(repo.registros[0]).toMatchObject({ status: "REJECTED", rejectionCode: "4003", rejectionMessage: "Rango no habilitado" });
    expect(result.puede_inutilizar).toBe(true);
    expect(result.accion_detalle?.acciones_sugeridas).toContain("INUTILIZAR_NUMERO");
  });

  it("CA-04: EVENT_ALREADY_EXISTS queda inutilizado con el evento de FE", async () => {
    const repo = new Repo();
    const gateway = new Gateway();
    gateway.respuesta = new FiscalGatewayError("UPSTREAM_ERROR", "x", { status: 409, body: { error: "EVENT_ALREADY_EXISTS", details: { event_id: 77, status: "ACCEPTED" } } });
    await inutilizarNumeroFactura(context, rechazada().id, { motivo: "Motivo valido" }, asRepo(repo), asGateway(gateway));
    expect(repo.registros[0]).toMatchObject({ status: "ACCEPTED", eventoId: "77" });
  });

  it("RN-B5: otro 409 de FE se informa sin registrar", async () => {
    const repo = new Repo();
    const gateway = new Gateway();
    gateway.respuesta = new FiscalGatewayError("UPSTREAM_ERROR", "x", { status: 409, body: { error: "RANGE_POSSIBLY_CONSUMED" } });
    await expect(
      inutilizarNumeroFactura(context, rechazada().id, { motivo: "Motivo valido" }, asRepo(repo), asGateway(gateway))
    ).rejects.toMatchObject({ statusCode: 409, details: { fe_error: "RANGE_POSSIBLY_CONSUMED" } });
    expect(repo.registros).toHaveLength(0);
  });

  it("RN-B5: sin respuesta queda FAILED y responde 502", async () => {
    const repo = new Repo();
    const gateway = new Gateway();
    gateway.respuesta = new FiscalGatewayError("UPSTREAM_ERROR", "x", { status: 500, body: { error: "EVENT_VOID_FAILED" } });
    await expect(
      inutilizarNumeroFactura(context, rechazada().id, { motivo: "Motivo valido" }, asRepo(repo), asGateway(gateway))
    ).rejects.toMatchObject({ statusCode: 502 });
    expect(repo.registros[0]).toMatchObject({ status: "FAILED" });
  });

  it.each([
    ["aprobada", { estado: "EMITIDA" as const }],
    ["anulada", { estado: "ANULADA" as const }],
    ["en proceso", { estado: "PENDIENTE_SIFEN" as const }]
  ])("CA-05: una factura %s no se inutiliza", async (_caso, overrides) => {
    const repo = new Repo();
    repo.documento = rechazada(overrides);
    const gateway = new Gateway();
    await expect(
      inutilizarNumeroFactura(context, rechazada().id, { motivo: "Motivo valido" }, asRepo(repo), asGateway(gateway))
    ).rejects.toMatchObject({ statusCode: 409, details: { reason: "INUTILIZACION_NO_ADMITIDA" } });
    expect(gateway.requests).toHaveLength(0);
  });

  it("RN-B2: un CDC de otro emisor o de otro numero no llama a FE", async () => {
    for (const documento of [rechazada({ cdc: `01800000005${CDC.slice(11)}` }), rechazada({ numero_fiscal: "1010566" })]) {
      const repo = new Repo();
      repo.documento = documento;
      const gateway = new Gateway();
      await expect(
        inutilizarNumeroFactura(context, documento.id, { motivo: "Motivo valido" }, asRepo(repo), asGateway(gateway))
      ).rejects.toMatchObject({ statusCode: 409, details: { reason: "NUMERACION_NO_IDENTIFICADA" } });
      expect(gateway.requests).toHaveLength(0);
    }
  });

  it("getDocumentoById expone puede_inutilizar", async () => {
    const repo = new Repo();
    expect((await getDocumentoById(context, rechazada().id, asRepo(repo))).puede_inutilizar).toBe(true);
  });
});

describe("RN-C2: acciones de una factura rechazada", () => {
  const aceptada = { status: "ACCEPTED" as const, evento_id: "1", motivo: "m", rejection_code: null, rejection_message: null, intentos: 1, last_at: null };
  const correccion = { id: "c", numero_fiscal: "1010566", estado: "EMITIDA" as const };

  it("sin correccion ni inutilizacion: causa de SIFEN mas INUTILIZAR_NUMERO", () => {
    const { accion, accion_detalle } = deriveAccion(rechazada());
    expect(accion).toBe("REQUIERE_SOPORTE");
    expect(accion_detalle.acciones_sugeridas).toEqual(["CONTACTAR_SOPORTE", "INUTILIZAR_NUMERO"]);
    const ruc = deriveAccion(rechazada({ sifen_result_code: "1306" }));
    expect(ruc.accion_detalle.acciones_sugeridas).toEqual(["CORREGIR_REEMITIR", "INUTILIZAR_NUMERO"]);
  });

  it("corregida sin inutilizar: dice por cual y solo ofrece inutilizar", () => {
    const { accion, accion_detalle } = deriveAccion(rechazada({ corregida_por: correccion }));
    expect(accion).toBe("REQUIERE_ACCION");
    expect(accion_detalle.titulo).toBe("Corregida por la factura 1010566");
    expect(accion_detalle.acciones_sugeridas).toEqual(["INUTILIZAR_NUMERO"]);
  });

  it("inutilizada sin correccion: OK y mantiene corregir", () => {
    const { accion, accion_detalle } = deriveAccion(rechazada({ inutilizacion: aceptada }));
    expect(accion).toBe("OK");
    expect(accion_detalle.acciones_sugeridas).toEqual(["CORREGIR_REEMITIR"]);
  });

  it("corregida e inutilizada: resuelta, sin acciones", () => {
    const { accion, accion_detalle } = deriveAccion(rechazada({ corregida_por: correccion, inutilizacion: aceptada }));
    expect(accion).toBe("OK");
    expect(accion_detalle.titulo).toBe("Factura rechazada resuelta");
    expect(accion_detalle.acciones_sugeridas).toEqual([]);
  });

  it("ERROR_OPERATIVO corregida no ofrece corregir otra vez", () => {
    const { accion, accion_detalle } = deriveAccion(rechazada({ estado: "ERROR_OPERATIVO", corregida_por: correccion }));
    expect(accion).toBe("OK");
    expect(accion_detalle.acciones_sugeridas).toEqual([]);
  });
});

describe("mock de FE", () => {
  it("acepta, rechaza con INUT-RECHAZO y responde EVENT_ALREADY_EXISTS al repetir", async () => {
    const mock = new MockFiscalGateway();
    const base = { emisor_id: "80136968-1", establecimiento: "009", puntoExpedicion: "009", hastaNumero: "1", motivo: "Motivo valido", tipoDocumento: "FE" as const };
    expect((await mock.inutilizarNumeracion({ ...base, desdeNumero: "4440001", hastaNumero: "4440001" })).status).toBe("VOIDED");
    expect((await mock.inutilizarNumeracion({ ...base, desdeNumero: "4440002", hastaNumero: "4440002", motivo: "INUT-RECHAZO prueba" })).status).toBe("REJECTED");
    await expect(mock.inutilizarNumeracion({ ...base, desdeNumero: "4440001", hastaNumero: "4440001" })).rejects.toMatchObject({
      details: { status: 409, body: { error: "EVENT_ALREADY_EXISTS" } }
    });
  });
});
