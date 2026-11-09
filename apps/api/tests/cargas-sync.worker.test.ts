import { beforeEach, describe, expect, it, vi } from "vitest";
import { sincronizarCarga } from "../src/modules/cargas/cargas-sync.worker";
import { agendaPorCorreo, comprobanteAFactura, numeroSinPunto, proximaSincronizacionMs, resolverEstadoFactura } from "../src/modules/cargas/cargas.mapeo";
import { accionSobreCarga, obtenerCarga, subirCarga } from "../src/modules/cargas/cargas.service";
import { MockFiscalGateway } from "../src/modules/fiscal-gateway/fiscal-gateway.client";
import { mockCargas } from "../src/modules/fiscal-gateway/fiscal-gateway.mock-cargas";
import { FiscalGatewayError, type FeCargaComprobante } from "../src/modules/fiscal-gateway/fiscal-gateway.types";
import { FakeCargaRepository, contexto, csv } from "./cargas.fixtures";

function comprobante(overrides: Partial<FeCargaComprobante> = {}): FeCargaComprobante {
  return {
    orden: 3,
    filas: [4, 5],
    tipo_documento: "FACTURA",
    numero_archivo: "001-002-0000099",
    numero_asignado: "001-002-0000007",
    referencia_venta: "PED-1",
    estado: "APROBADO",
    errores: [],
    advertencias: [],
    document_uuid: "11111111-1111-4111-8111-111111111111",
    cdc: "0".repeat(44),
    documento_estado: null,
    lote: "1",
    sifen: { codigo: "0260", mensaje: "Aprobado" },
    correo: "SENT",
    aprobado_en: "2026-11-07T10:00:00.000Z",
    actualizado_en: "2026-11-07T10:00:00.000Z",
    detalle: {
      fecha: "2026-11-07T09:00:00",
      tipoTransaccion: 1,
      receptor: { tipoDocumento: "RUC", docNro: "80000000", dv: "5", razonSocial: "Empresa", naturaleza: "JURIDICA", email: "a@b.py" },
      condicionOperacion: { tipo: "CREDITO" },
      items: [
        { codigo: "A", descripcion: "Uno", cantidad: 2, precioUnitario: 110000, ivaTipo: "IVA10" },
        { codigo: "B", descripcion: "Dos", cantidad: 1.5, precioUnitario: 21000, ivaTipo: "IVA5" },
        { descripcion: "Tres", cantidad: 1, precioUnitario: 1000, ivaTipo: "EXENTO" }
      ],
      total: 252500
    },
    ...overrides
  };
}

const carga = { fe_carga_id: "carga-fe" };

describe("mapeo de comprobantes", () => {
  describe("totales de FE (SPEC_TOTALES_FE_EN_CARGA_v0.1)", () => {
    const totales = { bruto: 100000, descuento: 10000, anticipo: 0, total: 90000, redondeo: 0, gravada_10: 81818, gravada_5: 0, exenta: 0, exonerada: 0, iva_10: 8182, iva_5: 0, iva_total: 8182 };
    const conDetalle = (extra: Partial<NonNullable<FeCargaComprobante["detalle"]>>) =>
      comprobante({ detalle: { ...comprobante().detalle!, ...extra } });

    it("CA-01: con totales de FE guarda los montos de FE, sin calcular, y marca la nota de credito", () => {
      const factura = comprobanteAFactura(carga, conDetalle({
        items: [{ codigo: "A", descripcion: "Uno", cantidad: 1, precioUnitario: 100000, ivaTipo: "IVA10", descuento: 10000 }],
        total: 100000,
        totales
      }))!;
      expect(factura.totals).toEqual({
        subtotal: 100000, total_sin_iva: 81818, iva_5: 0, iva_10: 8182, total_iva: 8182, total: 90000, descuento: 10000, nota_credito_por_referencia: true
      });
      expect(factura.responseSnapshot.total_fe).toBeUndefined();
    });

    it("CA-02: con un articulo exonerado toma el IVA de FE", () => {
      const factura = comprobanteAFactura(carga, conDetalle({
        items: [{ codigo: "A", descripcion: "Uno", cantidad: 1, precioUnitario: 100000, ivaTipo: "EXENTO", afectacionIva: "EXONERADO" }],
        total: 100000,
        totales: { ...totales, descuento: 0, total: 100000, gravada_10: 0, exonerada: 100000, iva_10: 0, iva_total: 0 }
      }))!;
      expect(factura.totals).toMatchObject({ total: 100000, total_iva: 0, nota_credito_por_referencia: true });
    });

    it("sin descuento ni afectacion, toma los montos de FE y no marca la nota de credito", () => {
      const factura = comprobanteAFactura(carga, conDetalle({
        items: [{ codigo: "A", descripcion: "Uno", cantidad: 1, precioUnitario: 110000, ivaTipo: "IVA10" }],
        total: 110000,
        totales: { ...totales, bruto: 110000, descuento: 0, total: 110000, gravada_10: 100000, iva_10: 10000, iva_total: 10000 }
      }))!;
      expect(factura.totals).toMatchObject({ total: 110000, iva_10: 10000, total_sin_iva: 100000 });
      expect(factura.totals.nota_credito_por_referencia).toBeUndefined();
    });

    it("CA-03: sin totales calcula como antes; una linea con descuento igual marca la nota de credito", () => {
      const sinTotales = comprobanteAFactura(carga, comprobante())!;
      expect(sinTotales.totals.nota_credito_por_referencia).toBeUndefined();
      expect(sinTotales.totals.total).toBe(comprobante().detalle!.total);
      const conDescuento = comprobanteAFactura(carga, conDetalle({
        items: [{ codigo: "A", descripcion: "Uno", cantidad: 1, precioUnitario: 100000, ivaTipo: "IVA10", descuento: 5000 }],
        total: 100000
      }))!;
      expect(conDescuento.totals).toMatchObject({ total: 100000, nota_credito_por_referencia: true });
    });

    it("CA-04: un comprobante que no es factura no crea factura", () => {
      expect(comprobanteAFactura(carga, comprobante({ tipo_documento: "NOTA_REMISION" }))).toBeNull();
    });
  });

  it("arma external_ref estable, estado y campos del documento", () => {
    expect(comprobanteAFactura(carga, comprobante())).toMatchObject({
      externalRef: "carga:carga-fe:3",
      estado: "EMITIDA",
      estadoVigente: false,
      fiscalStatusRaw: "APPROVED",
      numeroFiscal: "0000007",
      numeroArchivo: "001-002-0000099",
      emailEstado: "SENT",
      condicionVenta: "CREDITO",
      sifenCodigo: "0260"
    });
  });

  it.each([
    ["PREPARADO", "PENDIENTE_SIFEN", "QUEUED_BATCH"],
    ["ENVIADO", "PENDIENTE_SIFEN", "QUEUED_BATCH"],
    ["APROBADO_CON_OBS", "EMITIDA", "APPROVED_WITH_OBS"],
    ["RECHAZADO", "RECHAZADA", "REJECTED"]
  ] as const)("%s queda %s", (estado, esperado, raw) => {
    expect(comprobanteAFactura(carga, comprobante({ estado }))).toMatchObject({ estado: esperado, fiscalStatusRaw: raw });
  });

  it.each(["INVALIDO", "CANCELADO", "PENDIENTE", "ERROR", "DUPLICADO"] as const)("RN-13: %s no crea documento", (estado) => {
    expect(comprobanteAFactura(carga, comprobante({ estado }))).toBeNull();
  });

  it("guarda el numero sin establecimiento ni punto, como las facturas de la app", () => {
    expect(numeroSinPunto("001-001-1010014")).toBe("1010014");
    expect(numeroSinPunto("1010014")).toBe("1010014");
    expect(numeroSinPunto(null)).toBeNull();
  });

  it("sin document_uuid o sin detalle no crea documento", () => {
    expect(comprobanteAFactura(carga, comprobante({ document_uuid: null }))).toBeNull();
    expect(comprobanteAFactura(carga, comprobante({ detalle: null }))).toBeNull();
  });

  it("RN-15: documento_estado manda sobre el estado de la emision", () => {
    expect(comprobanteAFactura(carga, comprobante({ documento_estado: "CANCELLED" }))).toMatchObject({
      estado: "ANULADA",
      estadoVigente: true,
      fiscalStatusRaw: "CANCELLED"
    });
  });

  it("snapshot del cliente, inverso de buildReceptor", () => {
    expect(comprobanteAFactura(carga, comprobante())!.cliente).toEqual({
      documento_tipo: "RUC",
      documento: "80000000-5",
      razon_social: "Empresa",
      direccion: null,
      telefono: null,
      email: "a@b.py",
      naturaleza: "JURIDICA"
    });
  });

  it("un tipo de documento que FS no conoce queda NO_ESPECIFICADO", () => {
    const base = comprobante();
    const conInnominado = comprobanteAFactura(carga, comprobante({ detalle: { ...base.detalle!, receptor: { tipoDocumento: "INNOMINADO", razonSocial: "Sin Nombre" } } }));
    expect(conInnominado!.cliente).toMatchObject({ documento_tipo: "NO_ESPECIFICADO", documento: "", razon_social: "Sin Nombre" });
  });

  it("calcula items y totales, con IVA y cantidad decimal", () => {
    const factura = comprobanteAFactura(carga, comprobante())!;
    expect(factura.items[0]).toMatchObject({ line_no: 1, cantidad: 2, precio_unitario: 110000, iva_tipo: "IVA_10", subtotal: 220000, base_imponible: 200000, iva_monto: 20000 });
    expect(factura.items[1]).toMatchObject({ cantidad: 1.5, precio_unitario: 21000, iva_tipo: "IVA_5", subtotal: 31500, base_imponible: 30000, iva_monto: 1500 });
    expect(factura.items[2]).toMatchObject({ codigo: null, iva_tipo: "EXENTA", subtotal: 1000, iva_monto: 0, catalogo_item_id: null });
    expect(factura.totals).toMatchObject({ total: 252500, iva_10: 20000, iva_5: 1500 });
    expect(factura.responseSnapshot.total_fe).toBeUndefined();
    expect(factura.responseSnapshot.detalle).toBeUndefined();
  });

  it("D-11: si el total difiere, conserva el de FE", () => {
    const base = comprobante();
    const factura = comprobanteAFactura(carga, comprobante({ detalle: { ...base.detalle!, total: 252501 } }))!;
    expect(factura.responseSnapshot.total_fe).toBe(252501);
    expect(factura.totals.total).toBe(252500);
  });
});

describe("estados finales", () => {
  it("una ANULADA no cambia, ni con FE informando otra cosa", () => {
    expect(resolverEstadoFactura("ANULADA", { estado: "EMITIDA", estadoVigente: true })).toBe("ANULADA");
  });

  it("una EMITIDA no vuelve a PENDIENTE_SIFEN ni cambia por el estado de emision", () => {
    expect(resolverEstadoFactura("EMITIDA", { estado: "PENDIENTE_SIFEN", estadoVigente: true })).toBe("EMITIDA");
    expect(resolverEstadoFactura("EMITIDA", { estado: "RECHAZADA", estadoVigente: false })).toBe("EMITIDA");
  });

  it("una EMITIDA cambia por otro estado final vigente", () => {
    expect(resolverEstadoFactura("EMITIDA", { estado: "ANULADA", estadoVigente: true })).toBe("ANULADA");
  });

  it("una pendiente toma lo que llega", () => {
    expect(resolverEstadoFactura("PENDIENTE_SIFEN", { estado: "RECHAZADA", estadoVigente: false })).toBe("RECHAZADA");
  });
});

describe("frecuencia", () => {
  const MIN = 60_000;
  it.each([
    ["RECIBIDA", MIN],
    ["VALIDANDO", MIN],
    ["EN_PREPARACION", MIN],
    ["EN_COLA", 5 * MIN],
    ["EN_SIFEN", 5 * MIN],
    ["VALIDADA", null],
    ["RECHAZADA", null],
    ["FINALIZADA", null],
    ["CANCELADA", null]
  ] as const)("%s", (estado, esperado) => {
    expect(proximaSincronizacionMs(estado, null)).toBe(esperado);
  });

  it("pasadas 72 h sin terminar, cada 30 min", () => {
    const ahora = Date.now();
    expect(proximaSincronizacionMs("EN_SIFEN", new Date(ahora - 73 * 3_600_000).toISOString(), ahora)).toBe(30 * MIN);
  });

  it("RN-06: VALIDADA sin nada que confirmar se consulta cada 15 min; confirmable espera al operador", () => {
    expect(proximaSincronizacionMs("VALIDADA", null, Date.now(), { puede_confirmar: false })).toBe(15 * MIN);
    expect(proximaSincronizacionMs("VALIDADA", null, Date.now(), { puede_confirmar: true })).toBeNull();
    expect(proximaSincronizacionMs("VALIDADA", null)).toBeNull();
  });

});

describe("agenda por correo pendiente tras el cierre (CEV-1, FS-40)", () => {
  const MIN = 60_000;
  const ahora = Date.parse("2026-11-08T18:00:00Z");
  it("finalizada hace 10 min con pendientes: cada 5 min", () => {
    expect(agendaPorCorreo({ estado: "FINALIZADA", cerradaEn: new Date(ahora - 10 * MIN).toISOString(), pendientes: 3, ahora })).toEqual({ esperaMs: 5 * MIN, vencida: false });
  });
  it("cancelada con pendientes: tambien", () => {
    expect(agendaPorCorreo({ estado: "CANCELADA", cerradaEn: new Date(ahora - MIN).toISOString(), pendientes: 1, ahora }).esperaMs).toBe(5 * MIN);
  });
  it("sin pendientes: sin agenda", () => {
    expect(agendaPorCorreo({ estado: "FINALIZADA", cerradaEn: new Date(ahora).toISOString(), pendientes: 0, ahora })).toEqual({ esperaMs: null, vencida: false });
  });
  it("pasadas 2 h del cierre: sin agenda y avisa", () => {
    expect(agendaPorCorreo({ estado: "FINALIZADA", cerradaEn: new Date(ahora - 121 * MIN).toISOString(), pendientes: 5, ahora })).toEqual({ esperaMs: null, vencida: true });
  });
  it("sin fecha de cierre no corta", () => {
    expect(agendaPorCorreo({ estado: "FINALIZADA", cerradaEn: null, pendientes: 2, ahora }).esperaMs).toBe(5 * MIN);
  });
  it("una carga en curso no la usa", () => {
    expect(agendaPorCorreo({ estado: "EN_SIFEN", cerradaEn: null, pendientes: 9, ahora }).esperaMs).toBeNull();
  });
});

describe("worker de sincronizacion", () => {
  let repository: FakeCargaRepository;
  let gateway: MockFiscalGateway;
  let deps: { repository: FakeCargaRepository; gatewayFor: () => Promise<MockFiscalGateway> };

  async function cargaConfirmada(...filas: string[]) {
    const subida = await subirCarga(contexto(), { contenido: csv(...filas), contentType: "text/csv" }, deps);
    await obtenerCarga(contexto(), subida.id, deps);
    await accionSobreCarga(contexto(), subida.id, "confirmar", deps);
    return repository.filas.get(subida.id)!;
  }

  beforeEach(() => {
    mockCargas.__reiniciar();
    repository = new FakeCargaRepository();
    gateway = new MockFiscalGateway({ mode: "mock", baseUrl: "http://mock", timeoutMs: 1000, environment: "test" });
    deps = { repository, gatewayFor: async () => gateway };
  });

  it("incorpora solo comprobantes con document_uuid y avanza hasta dejar la agenda vacia", async () => {
    const fila = await cargaConfirmada("001-002-0000001;PED-1;;A", "001-002-0000002;INVALIDO-1;;A", "001-002-0000003;RECHAZO-1;;A");
    await sincronizarCarga(repository.filas.get(fila.id)!, gateway, repository);
    expect(repository.filas.get(fila.id)!.estado).toBe("EN_SIFEN");
    expect(repository.filas.get(fila.id)!.sync_next_at).not.toBeNull();
    await sincronizarCarga(repository.filas.get(fila.id)!, gateway, repository);
    // SPEC_CARGA_ATENCION_COMPROBANTES_v0.1: el rechazado deja la carga abierta y agendada hasta inutilizarlo.
    expect(repository.filas.get(fila.id)!.estado).toBe("EN_SIFEN");
    expect(repository.filas.get(fila.id)!.sync_next_at).not.toBeNull();
    await gateway.inutilizarComprobanteCarga(fila.fe_carga_id, 3, "Numero rechazado por SIFEN");
    await sincronizarCarga(repository.filas.get(fila.id)!, gateway, repository);
    const final = repository.filas.get(fila.id)!;
    expect(final.estado).toBe("FINALIZADA");
    expect(final.sync_next_at).toBeNull();
    expect([...repository.facturas.keys()].sort()).toEqual([`carga:${fila.fe_carga_id}:1`, `carga:${fila.fe_carga_id}:3`]);
    expect(repository.facturas.get(`carga:${fila.fe_carga_id}:3`)!.estado).toBe("RECHAZADA");
  });

  it("CEV-1: finalizada con correos pendientes queda agendada; sin pendientes, sale de la agenda", async () => {
    const fila = await cargaConfirmada("001-002-0000001;PED-1;a@b.py;A");
    await sincronizarCarga(repository.filas.get(fila.id)!, gateway, repository);
    expect(repository.facturas.get(`carga:${fila.fe_carga_id}:1`)!.emailEstado).toBe("PENDING");
    // FE ya cerro la carga y el correo sigue en cola: nada nuevo que incorporar.
    const real = await gateway.getCarga(fila.fe_carga_id);
    const getCarga = vi.spyOn(gateway, "getCarga").mockResolvedValue({ ...real, estado: "FINALIZADA", finalizada_en: new Date().toISOString() });
    const lista = vi.spyOn(gateway, "listCargaComprobantes").mockResolvedValue({ items: [], total: 0, page: 1, limit: 200 } as never);
    await sincronizarCarga(repository.filas.get(fila.id)!, gateway, repository);
    const agendada = repository.filas.get(fila.id)!;
    expect(agendada.estado).toBe("FINALIZADA");
    expect(agendada.sync_next_at!.getTime() - Date.now()).toBeGreaterThan(4 * 60_000);
    getCarga.mockRestore();
    lista.mockRestore();
    // La pasada siguiente trae el correo SENT y la carga sale de la agenda.
    await sincronizarCarga(repository.filas.get(fila.id)!, gateway, repository);
    expect(repository.facturas.get(`carga:${fila.fe_carga_id}:1`)!.emailEstado).toBe("SENT");
    expect(repository.filas.get(fila.id)!.sync_next_at).toBeNull();
  });

  it("RN-06: una VALIDADA con numeros sin resolver queda agendada y se ve FINALIZADA al inutilizarlos", async () => {
    const subida = await subirCarga(contexto({}, "CLIENTE"), { contenido: csv("001-002-0000007;INVALIDO-1;;A"), contentType: "text/csv" }, deps);
    await sincronizarCarga(repository.filas.get(subida.id)!, gateway, repository);
    const abierta = repository.filas.get(subida.id)!;
    expect(abierta.estado).toBe("VALIDADA");
    expect(abierta.sync_next_at!.getTime() - Date.now()).toBeGreaterThan(14 * 60_000);
    await gateway.inutilizarComprobanteCarga(abierta.fe_carga_id, 1, "Factura invalida en la carga");
    await sincronizarCarga(repository.filas.get(subida.id)!, gateway, repository);
    const cerrada = repository.filas.get(subida.id)!;
    expect(cerrada.estado).toBe("FINALIZADA");
    expect(cerrada.sync_next_at).toBeNull();
  });

  it("no pide comprobantes antes de confirmar", async () => {
    const subida = await subirCarga(contexto(), { contenido: csv("001-002-0000001;PED-1;;A"), contentType: "text/csv" }, deps);
    const espia = vi.spyOn(gateway, "listCargaComprobantes");
    await sincronizarCarga(repository.filas.get(subida.id)!, gateway, repository);
    expect(repository.filas.get(subida.id)!.estado).toBe("VALIDADA");
    expect(repository.filas.get(subida.id)!.sync_next_at).toBeNull();
    expect(espia).not.toHaveBeenCalled();
  });

  it("pide detalle en paginas de 200 y recorre todas", async () => {
    const filas = Array.from({ length: 450 }, (_, i) => `001-002-${String(i + 1).padStart(7, "0")};PED-${i};;A`);
    const fila = await cargaConfirmada(...filas);
    const espia = vi.spyOn(gateway, "listCargaComprobantes");
    await sincronizarCarga(repository.filas.get(fila.id)!, gateway, repository);
    expect(espia.mock.calls.map(([, f]) => f.page)).toEqual([1, 2, 3]);
    expect(espia.mock.calls[0]![1]).toMatchObject({ detalle: true, limit: 200 });
    expect(repository.facturas.size).toBe(450);
  });

  it("el cursor es el actualizado_en mas nuevo, y la siguiente pasada lo usa con margen", async () => {
    const fila = await cargaConfirmada("001-002-0000001;PED-1;;A");
    const espia = vi.spyOn(gateway, "listCargaComprobantes");
    await sincronizarCarga(repository.filas.get(fila.id)!, gateway, repository);
    const { items } = await gateway.listCargaComprobantes(fila.fe_carga_id, {});
    const hasta = repository.filas.get(fila.id)!.sincronizada_hasta!;
    expect(hasta.toISOString()).toBe(items[0]!.actualizado_en);
    espia.mockClear();
    await sincronizarCarga(repository.filas.get(fila.id)!, gateway, repository);
    expect(espia.mock.calls[0]![1].actualizado_desde).toBe(new Date(hasta.getTime() - 120_000).toISOString());
  });

  it("un cambio de correo llega aunque los totales no cambien", async () => {
    const fila = await cargaConfirmada("001-002-0000001;PED-1;a@b.py;A");
    await sincronizarCarga(repository.filas.get(fila.id)!, gateway, repository);
    expect(repository.facturas.get(`carga:${fila.fe_carga_id}:1`)!.emailEstado).toBe("PENDING");
    await sincronizarCarga(repository.filas.get(fila.id)!, gateway, repository);
    expect(repository.facturas.get(`carga:${fila.fe_carga_id}:1`)!.emailEstado).toBe("SENT");
  });

  it("CA-08: un fallo de FE propaga sin tocar estados ni el cursor", async () => {
    const fila = await cargaConfirmada("001-002-0000001;PED-1;;A");
    const antes = repository.filas.get(fila.id)!;
    vi.spyOn(gateway, "listCargaComprobantes").mockRejectedValue(new FiscalGatewayError("UNAVAILABLE", "sin red"));
    await expect(sincronizarCarga(antes, gateway, repository)).rejects.toBeInstanceOf(FiscalGatewayError);
    expect(repository.filas.get(fila.id)!.sincronizada_hasta).toBeNull();
    expect(repository.facturas.size).toBe(0);
  });
});
