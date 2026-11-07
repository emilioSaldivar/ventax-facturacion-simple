import { describe, expect, it, vi, beforeEach } from "vitest";

const sendEmailMock = vi.fn().mockResolvedValue(undefined);
vi.mock("../src/shared/email/email.service", () => ({
  sendEmail: (...args: unknown[]) => sendEmailMock(...args)
}));

import { startVerificacionFiscalWorker } from "../src/modules/facturas/verificacion.worker";
import type { FacturaRepository, DocumentoResponse, PendingVerificacion } from "../src/modules/facturas/facturas.types";
import type { FiscalGateway, FiscalDocumentoCanonicoResponse, FiscalRefreshStatusResponse } from "../src/modules/fiscal-gateway/fiscal-gateway.types";
import { FiscalGatewayError } from "../src/modules/fiscal-gateway/fiscal-gateway.types";

beforeEach(() => {
  sendEmailMock.mockClear();
});

function buildDocumento(overrides: Partial<DocumentoResponse> = {}): DocumentoResponse {
  return {
    id: "doc-1",
    document_uuid: "11111111-1111-4111-8111-111111111111",
    tipo: "FACTURA",
    estado: "PENDIENTE_SIFEN",
    condicion_venta: "CONTADO",
    numero_fiscal: null,
    cdc: null,
    fiscal_document_id: null,
    external_ref: "ext-1",
    fiscal_envio_modo: "BATCH",
    batch: null,
    cliente: { documento_tipo: "RUC", documento: "80000000-1", razon_social: "Cliente Test" },
    items: [],
    totals: { subtotal: 0, total_sin_iva: 0, iva_5: 0, iva_10: 0, total_iva: 0, total: 0 },
    fiscal_status: null,
    fiscal_status_raw: null,
    sifen_result_code: null,
    sifen_result_message: null,
    sifen_last_checked_at: null,
    documento_relacionado_id: null,
    nce_motivo: null,
    delivery: {
      public_url: null,
      whatsapp_url: null,
      email_status: "NOT_APPLICABLE",
      artifacts: { kude_pdf: { available: false, url: null }, xml: { available: false, url: null } }
    },
    created_at: new Date().toISOString(),
    ...overrides
  };
}

function buildPendingVerificacion(overrides: Partial<PendingVerificacion> = {}): PendingVerificacion {
  return {
    documentoId: "doc-1",
    facturadorId: "fact-1",
    documentUuid: "11111111-1111-4111-8111-111111111111",
    estado: "PENDIENTE_SIFEN",
    attempts: 1,
    accionNotificadaAt: null,
    createdAt: new Date().toISOString(),
    ...overrides
  };
}

class FakeRepository implements Partial<FacturaRepository> {
  public claimQueue: PendingVerificacion[] = [];
  public findByIdResponse: DocumentoResponse | null = null;
  public scheduleCalls: Array<{ documentoId: string; nextAt: Date | null; attempts: number }> = [];
  public markAccionNotificadaCalls: string[] = [];
  public notificationRecipients: string[] = ["ops@cliente.com"];

  async claimNextVerificacion(): Promise<PendingVerificacion[]> {
    const batch = this.claimQueue;
    this.claimQueue = [];
    return batch;
  }

  async findById(): Promise<DocumentoResponse | null> {
    return this.findByIdResponse;
  }

  async updateFiscalStatus(input: Parameters<FacturaRepository["updateFiscalStatus"]>[0]): Promise<DocumentoResponse | null> {
    if (!this.findByIdResponse) return null;
    return { ...this.findByIdResponse, estado: input.estado, fiscal_status_raw: input.fiscalStatusRaw ?? null };
  }

  async bulkUpdateDocumentUuidByCdc(): Promise<void> {
    // no-op
  }

  async scheduleNextVerificacion(input: { documentoId: string; nextAt: Date | null; attempts: number }): Promise<void> {
    this.scheduleCalls.push(input);
  }

  async markAccionNotificada(documentoId: string): Promise<void> {
    this.markAccionNotificadaCalls.push(documentoId);
  }

  async getNotificationRecipients(): Promise<string[]> {
    return this.notificationRecipients;
  }
}

class FakeGateway implements Partial<FiscalGateway> {
  /** Si se fija, reemplaza al status canonico que se deriva del estado declarado. */
  public statusCanonico: string | null = null;

  constructor(private readonly response: FiscalRefreshStatusResponse | FiscalGatewayError) {}

  async refreshFacturaStatus(): Promise<FiscalRefreshStatusResponse> {
    if (this.response instanceof FiscalGatewayError) {
      throw this.response;
    }
    return this.response;
  }

  // El estado lo decide el paso canonico: se deriva del estado que declara cada test.
  async getDocumentoCanonico(documentUuid: string): Promise<FiscalDocumentoCanonicoResponse> {
    if (this.response instanceof FiscalGatewayError) {
      throw this.response;
    }
    const status = this.statusCanonico ?? STATUS_CANONICO_POR_ESTADO[this.response.estado] ?? null;
    return { status, estado: this.response.estado, current_cdc: this.response.current_cdc, nro_factura: null, raw: { document_uuid: documentUuid, status } };
  }
}

/** Status canonico de FE equivalente al estado que declara el test (SPEC_ESTADO_FISCAL_CANONICO_v0.1). */
const STATUS_CANONICO_POR_ESTADO: Record<string, string> = {
  EMITIDA: "APPROVED",
  RECHAZADA: "REJECTED",
  ANULADA: "CANCELLED",
  PENDIENTE_SIFEN: "QUEUED_BATCH"
};

describe("verificacion fiscal worker", () => {
  it("transiciona PENDIENTE_SIFEN a EMITIDA automaticamente y retira el documento de la agenda", async () => {
    const repo = new FakeRepository();
    repo.findByIdResponse = buildDocumento({ estado: "PENDIENTE_SIFEN" });
    repo.claimQueue = [buildPendingVerificacion({ attempts: 1 })];
    const gateway = new FakeGateway({
      estado: "EMITIDA",
      current_cdc: null,
      status_raw: "APPROVED",
      result_code: "0260",
      result_message: "Aprobado",
      raw: {}
    });

    const stop = startVerificacionFiscalWorker({
      repository: repo as unknown as FacturaRepository,
      gateway: gateway as unknown as FiscalGateway,
      intervalMs: 100000,
      batchSize: 10
    });
    stop();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(repo.scheduleCalls).toHaveLength(1);
    expect(repo.scheduleCalls[0].nextAt).toBeNull();
  });

  it("EMITIENDO colgado con document_uuid tambien se verifica (recupera crashes de emision)", async () => {
    const repo = new FakeRepository();
    repo.findByIdResponse = buildDocumento({ estado: "EMITIENDO" });
    repo.claimQueue = [buildPendingVerificacion({ estado: "EMITIENDO", attempts: 1 })];
    const gateway = new FakeGateway({
      estado: "EMITIDA",
      current_cdc: null,
      status_raw: "APPROVED",
      result_code: "0260",
      result_message: "Aprobado",
      raw: {}
    });

    const stop = startVerificacionFiscalWorker({
      repository: repo as unknown as FacturaRepository,
      gateway: gateway as unknown as FiscalGateway,
      intervalMs: 100000,
      batchSize: 10
    });
    stop();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(repo.scheduleCalls).toHaveLength(1);
    expect(repo.scheduleCalls[0].nextAt).toBeNull();
  });

  it("rechazo -> se retira de la agenda (deriveAccion decide REQUIERE_ACCION/SOPORTE en la capa de presentacion)", async () => {
    const repo = new FakeRepository();
    repo.findByIdResponse = buildDocumento({ estado: "PENDIENTE_SIFEN" });
    repo.claimQueue = [buildPendingVerificacion({ attempts: 1 })];
    const gateway = new FakeGateway({
      estado: "RECHAZADA",
      current_cdc: null,
      status_raw: "REJECTED",
      result_code: "1306",
      result_message: "Receptor invalido",
      raw: {}
    });

    const stop = startVerificacionFiscalWorker({
      repository: repo as unknown as FacturaRepository,
      gateway: gateway as unknown as FiscalGateway,
      intervalMs: 100000,
      batchSize: 10
    });
    stop();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(repo.scheduleCalls).toHaveLength(1);
    expect(repo.scheduleCalls[0].nextAt).toBeNull();
  });

  it("RN-V3: un error de gateway no propaga y reprograma con backoff igual", async () => {
    const repo = new FakeRepository();
    repo.findByIdResponse = buildDocumento({ estado: "PENDIENTE_SIFEN" });
    repo.claimQueue = [buildPendingVerificacion({ attempts: 1 })];
    const gateway = new FakeGateway(new FiscalGatewayError("UPSTREAM_ERROR", "fallo simulado"));

    const stop = startVerificacionFiscalWorker({
      repository: repo as unknown as FacturaRepository,
      gateway: gateway as unknown as FiscalGateway,
      intervalMs: 100000,
      batchSize: 10
    });
    stop();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(repo.scheduleCalls).toHaveLength(1);
    expect(repo.scheduleCalls[0].nextAt).not.toBeNull();
    // attempts=1 -> siguiente backoff 30m
    const deltaMs = repo.scheduleCalls[0].nextAt!.getTime() - Date.now();
    expect(deltaMs).toBeGreaterThan(25 * 60 * 1000);
    expect(deltaMs).toBeLessThan(35 * 60 * 1000);
  });

  it("documento vencido (> 30 dias) deja de reprogramarse aunque siga PENDIENTE_SIFEN", async () => {
    const repo = new FakeRepository();
    const oldDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    repo.findByIdResponse = buildDocumento({ estado: "PENDIENTE_SIFEN", created_at: oldDate });
    repo.claimQueue = [buildPendingVerificacion({ attempts: 6, createdAt: oldDate })];
    const gateway = new FakeGateway({
      estado: "PENDIENTE_SIFEN",
      current_cdc: null,
      status_raw: "QUEUED_BATCH",
      result_code: null,
      result_message: null,
      raw: {}
    });

    const stop = startVerificacionFiscalWorker({
      repository: repo as unknown as FacturaRepository,
      gateway: gateway as unknown as FiscalGateway,
      intervalMs: 100000,
      batchSize: 10
    });
    stop();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(repo.scheduleCalls).toHaveLength(1);
    expect(repo.scheduleCalls[0].nextAt).toBeNull();
  });

  describe("documentos en cola de FE (SPEC_VERIFICACION_DOCUMENTOS_EN_COLA)", () => {
    const enCola = (documentoExtra: Partial<DocumentoResponse> = {}, pendiente: Partial<PendingVerificacion> = {}) => {
      const repo = new FakeRepository();
      repo.findByIdResponse = buildDocumento({ estado: "PENDIENTE_SIFEN", ...documentoExtra });
      repo.claimQueue = [buildPendingVerificacion(pendiente)];
      return repo;
    };
    const correr = async (repo: FakeRepository, gateway: FakeGateway) => {
      const stop = startVerificacionFiscalWorker({
        repository: repo as unknown as FacturaRepository,
        gateway: gateway as unknown as FiscalGateway,
        intervalMs: 100000,
        batchSize: 10
      });
      stop();
      await new Promise((resolve) => setTimeout(resolve, 10));
    };
    const pendienteEnCola = { estado: "PENDIENTE_SIFEN", current_cdc: null, status_raw: "QUEUED_BATCH", result_code: null, result_message: null, raw: {} } as FiscalRefreshStatusResponse;

    it("CA-01: en cola reprograma a 5 min y no gasta intentos, por mas consultas que lleve", async () => {
      const repo = enCola({}, { attempts: 4 });
      const antes = Date.now();
      await correr(repo, new FakeGateway(pendienteEnCola));

      expect(repo.scheduleCalls).toHaveLength(1);
      expect(repo.scheduleCalls[0].attempts).toBe(0);
      const espera = repo.scheduleCalls[0].nextAt!.getTime() - antes;
      expect(espera).toBeGreaterThanOrEqual(4 * 60 * 1000);
      expect(espera).toBeLessThanOrEqual(6 * 60 * 1000);
    });

    it("CA-02: si el documento ya salio de la cola con otro estado pendiente, rige el backoff vigente", async () => {
      const repo = enCola({}, { attempts: 2 });
      const gateway = new FakeGateway(pendienteEnCola);
      gateway.statusCanonico = "ALGO_PENDIENTE";
      const antes = Date.now();
      await correr(repo, gateway);

      expect(repo.scheduleCalls[0].attempts).toBe(2);
      expect(repo.scheduleCalls[0].nextAt!.getTime() - antes).toBeGreaterThanOrEqual(59 * 60 * 1000);
    });

    it("CA-03: pasado el corte de 30 dias sale de la agenda aunque siga en cola", async () => {
      const viejo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
      const repo = enCola({}, { createdAt: viejo, attempts: 1 });
      await correr(repo, new FakeGateway(pendienteEnCola));

      expect(repo.scheduleCalls[0].nextAt).toBeNull();
    });

    it("RN-04: si la consulta falla no se sabe si sigue en cola, y rige el backoff vigente", async () => {
      const repo = enCola({ fiscal_status_raw: "QUEUED_BATCH" }, { attempts: 3 });
      const antes = Date.now();
      await correr(repo, new FakeGateway(new FiscalGatewayError("UPSTREAM_ERROR", "fallo")));

      expect(repo.scheduleCalls[0].attempts).toBe(3);
      expect(repo.scheduleCalls[0].nextAt!.getTime() - antes).toBeGreaterThanOrEqual(5 * 60 * 60 * 1000);
    });
  });

  describe("FS-24: documentos en lote", () => {
    const pendiente = { estado: "PENDIENTE_SIFEN", current_cdc: null, status_raw: "SENT_BATCH", result_code: null, result_message: null, raw: {} } as FiscalRefreshStatusResponse;

    async function correr(opciones: { attempts?: number; createdAt?: string; omitir?: boolean; status?: string; gateway?: FakeGateway } = {}) {
      const repo = new FakeRepository();
      repo.findByIdResponse = buildDocumento({ estado: "PENDIENTE_SIFEN" });
      repo.claimQueue = [buildPendingVerificacion({
        attempts: opciones.attempts ?? 3,
        ...(opciones.createdAt ? { createdAt: opciones.createdAt } : {})
      })];
      const gateway = opciones.gateway ?? new FakeGateway(pendiente);
      gateway.statusCanonico = opciones.status ?? "SENT_BATCH";
      const refresh = vi.spyOn(gateway, "refreshFacturaStatus");
      const antes = Date.now();
      const stop = startVerificacionFiscalWorker({
        repository: repo as unknown as FacturaRepository,
        gateway: gateway as unknown as FiscalGateway,
        intervalMs: 100000,
        batchSize: 10,
        omitirRefreshEnLote: opciones.omitir
      });
      stop();
      await new Promise((resolve) => setTimeout(resolve, 10));
      return { repo, refresh, espera: repo.scheduleCalls[0]!.nextAt ? repo.scheduleCalls[0]!.nextAt.getTime() - antes : null };
    }

    it("CA-24.1: bandera apagada: consulta con refresh, reprograma a 15 min y no gasta intentos", async () => {
      const { repo, refresh, espera } = await correr({ attempts: 3 });
      expect(refresh).toHaveBeenCalledTimes(1);
      expect(repo.scheduleCalls[0]!.attempts).toBe(2);
      expect(espera).toBeGreaterThanOrEqual(14 * 60 * 1000);
      expect(espera).toBeLessThanOrEqual(16 * 60 * 1000);
    });

    it("CA-24.2: bandera encendida y SENT_BATCH: sin refresh, 15 min, intentos sin cambio", async () => {
      const { repo, refresh, espera } = await correr({ attempts: 3, omitir: true });
      expect(refresh).not.toHaveBeenCalled();
      expect(repo.scheduleCalls[0]!.attempts).toBe(2);
      expect(espera).toBeLessThanOrEqual(16 * 60 * 1000);
    });

    it("bandera encendida y QUEUED_BATCH: sin refresh, con la regla de la cola", async () => {
      const { refresh, espera } = await correr({ omitir: true, status: "QUEUED_BATCH" });
      expect(refresh).not.toHaveBeenCalled();
      expect(espera).toBeLessThanOrEqual(6 * 60 * 1000);
    });

    it("RN-24.4: bandera encendida con otro estado: consulta con refresh", async () => {
      const { refresh } = await correr({ omitir: true, status: "ALGO_PENDIENTE" });
      expect(refresh).toHaveBeenCalledTimes(1);
    });

    it("el primer intento no baja de cero", async () => {
      const { repo } = await correr({ attempts: 0 });
      expect(repo.scheduleCalls[0]!.attempts).toBe(0);
    });

    it("CA-24.4: con mas de 48 h en lote vuelve al backoff vigente", async () => {
      const { repo, espera } = await correr({ attempts: 3, createdAt: new Date(Date.now() - 49 * 3_600_000).toISOString() });
      expect(repo.scheduleCalls[0]!.attempts).toBe(3);
      expect(espera).toBeGreaterThanOrEqual(5 * 3_600_000);
    });

    it("CA-24.5: si la lectura falla rige el backoff vigente", async () => {
      const { repo, espera } = await correr({ attempts: 3, omitir: true, gateway: new FakeGateway(new FiscalGatewayError("UPSTREAM_ERROR", "fallo")) });
      expect(repo.scheduleCalls[0]!.attempts).toBe(3);
      expect(espera).toBeGreaterThanOrEqual(5 * 3_600_000);
    });

    it("CA-24.3: una factura que sale del lote aprobada se retira de la agenda", async () => {
      const aprobada = { ...pendiente, estado: "EMITIDA" } as FiscalRefreshStatusResponse;
      const { repo } = await correr({ status: "APPROVED", gateway: new FakeGateway(aprobada) });
      expect(repo.scheduleCalls[0]!.nextAt).toBeNull();
    });
  });

  it("no arranca ningun tick si intervalMs es muy alto y se detiene inmediatamente (worker apagable)", async () => {
    const repo = new FakeRepository();
    repo.claimQueue = [];
    const gateway = new FakeGateway({ estado: "EMITIDA", current_cdc: null, status_raw: "APPROVED", result_code: "0260", result_message: null, raw: {} });
    const claimSpy = vi.spyOn(repo, "claimNextVerificacion");

    const stop = startVerificacionFiscalWorker({
      repository: repo as unknown as FacturaRepository,
      gateway: gateway as unknown as FiscalGateway,
      intervalMs: 100000,
      batchSize: 10
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    stop();

    expect(claimSpy).toHaveBeenCalledTimes(1);
  });

  it("gate anti-spam: transicion a RECHAZADA con accionNotificadaAt=null envia un correo y marca notificado", async () => {
    const repo = new FakeRepository();
    repo.findByIdResponse = buildDocumento({ estado: "PENDIENTE_SIFEN" });
    repo.claimQueue = [buildPendingVerificacion({ attempts: 1, accionNotificadaAt: null })];
    const gateway = new FakeGateway({
      estado: "RECHAZADA",
      current_cdc: null,
      status_raw: "REJECTED",
      result_code: "1306",
      result_message: "Receptor invalido",
      raw: {}
    });

    const stop = startVerificacionFiscalWorker({
      repository: repo as unknown as FacturaRepository,
      gateway: gateway as unknown as FiscalGateway,
      intervalMs: 100000,
      batchSize: 10
    });
    stop();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(repo.markAccionNotificadaCalls).toEqual(["doc-1"]);
  });

  it("gate anti-spam: si accionNotificadaAt ya esta seteado, NO vuelve a enviar ni a marcar", async () => {
    const repo = new FakeRepository();
    repo.findByIdResponse = buildDocumento({ estado: "PENDIENTE_SIFEN" });
    repo.claimQueue = [buildPendingVerificacion({ attempts: 2, accionNotificadaAt: new Date().toISOString() })];
    const gateway = new FakeGateway({
      estado: "RECHAZADA",
      current_cdc: null,
      status_raw: "REJECTED",
      result_code: "1306",
      result_message: "Receptor invalido",
      raw: {}
    });

    const stop = startVerificacionFiscalWorker({
      repository: repo as unknown as FacturaRepository,
      gateway: gateway as unknown as FiscalGateway,
      intervalMs: 100000,
      batchSize: 10
    });
    stop();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(repo.markAccionNotificadaCalls).toHaveLength(0);
  });

  // SPEC_ALINEACION_CLAVE_VERIFICACION_FISCAL_v0.1: las rutas de consulta de estado del
  // backend fiscal (`/documentos/*`) exigen la clave COMPARTIDA. Usar la clave de
  // consumidor del facturador devuelve 401 y dejo 44 documentos varados en produccion.
  // Este test falla si alguien vuelve a introducir una seleccion de gateway por clave.
  it("usa siempre el gateway de clave compartida, nunca una clave por facturador", async () => {
    const repo = new FakeRepository();
    repo.findByIdResponse = buildDocumento({ estado: "PENDIENTE_SIFEN" });
    repo.claimQueue = [buildPendingVerificacion({ facturadorId: "fact-con-clave-propia" })];

    const sharedGateway = new FakeGateway({
      estado: "EMITIDA",
      current_cdc: null,
      status_raw: "APPROVED",
      result_code: "0260",
      result_message: "Aprobado",
      raw: {}
    });
    const sharedSpy = vi.spyOn(sharedGateway, "refreshFacturaStatus");
    const gatewayWithKeySpy = vi.fn(() => sharedGateway as unknown as FiscalGateway);

    const stop = startVerificacionFiscalWorker({
      repository: repo as unknown as FacturaRepository,
      gateway: sharedGateway as unknown as FiscalGateway,
      intervalMs: 100000,
      batchSize: 10,
      // Se pasa a proposito una fabrica de gateway por clave: el worker no debe tener
      // ninguna ruta de codigo que la consuma.
      ...({ gatewayWithKey: gatewayWithKeySpy } as unknown as Record<string, never>)
    });
    stop();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(sharedSpy).toHaveBeenCalledTimes(1);
    expect(gatewayWithKeySpy).not.toHaveBeenCalled();
  });

  // El tipo `PendingVerificacion` no debe volver a transportar la clave de consumidor:
  // sin ese dato, la seleccion por facturador no puede reintroducirse por accidente.
  it("el trabajo reclamado no transporta la clave de consumidor del facturador", () => {
    const item = buildPendingVerificacion();
    expect(Object.keys(item)).not.toContain("facturadorApiKey");
  });
});
