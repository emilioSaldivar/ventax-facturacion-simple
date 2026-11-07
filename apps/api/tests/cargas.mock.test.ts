import { beforeEach, describe, expect, it } from "vitest";
import { MockFiscalGateway } from "../src/modules/fiscal-gateway/fiscal-gateway.client";
import { mockCargas } from "../src/modules/fiscal-gateway/fiscal-gateway.mock-cargas";
import { FiscalGatewayError, type FeCrearCargaInput } from "../src/modules/fiscal-gateway/fiscal-gateway.types";
import { CSV_TITULOS, csv } from "./cargas.fixtures";

const nuevoGateway = () => new MockFiscalGateway({ mode: "mock", baseUrl: "http://mock", timeoutMs: 1000, environment: "test" });

function pedido(contenido: Buffer, overrides: Partial<FeCrearCargaInput> = {}): FeCrearCargaInput {
  return { contenido, contentType: "text/csv", emisorId: "80136968-1", numeracion: "SERVICIO", actividadEconomicaCodigo: "82110", establecimiento: "001", punto: "002", ...overrides };
}

async function error(promesa: Promise<unknown>) {
  const capturado = await promesa.then(() => null, (e: unknown) => e);
  expect(capturado).toBeInstanceOf(FiscalGatewayError);
  return (capturado as FiscalGatewayError).details as { status: number; fe_code: string; details: Record<string, unknown> };
}

describe("mock de carga masiva", () => {
  beforeEach(() => mockCargas.__reiniciar());

  it("el estado sobrevive entre instancias: cada pedido crea su propio gateway", async () => {
    const { carga } = await nuevoGateway().crearCarga(pedido(csv("001-002-0000001;PED-1;;A")));
    expect((await nuevoGateway().getCarga(carga.carga_id)).estado).toBe("VALIDADA");
  });

  it("archivo sin numero_comprobante queda RECHAZADA con motivo, fila y columna", async () => {
    const gateway = nuevoGateway();
    const { carga } = await gateway.crearCarga(pedido(Buffer.from("otra;columna\n1;2\n")));
    const rechazada = await gateway.getCarga(carga.carga_id);
    expect(rechazada.estado).toBe("RECHAZADA");
    expect(rechazada.motivos?.[0]).toMatchObject({ codigo: "COLUMNA_DESCONOCIDA", fila: 1, columna: "numero_comprobante" });
  });

  it("mas de 20 MB responde 413 con tope_bytes y no crea carga", async () => {
    const info = await error(nuevoGateway().crearCarga(pedido(Buffer.alloc(20_971_521, "a"))));
    expect(info).toMatchObject({ status: 413, fe_code: "CARGA_ARCHIVO_DEMASIADO_GRANDE", details: { tope_bytes: 20_971_520 } });
  });

  it("archivo vacio responde 422", async () => {
    expect(await error(nuevoGateway().crearCarga(pedido(Buffer.alloc(0))))).toMatchObject({ status: 422, fe_code: "CARGA_ARCHIVO_VACIO" });
  });

  it("agrupa las filas seguidas de un mismo comprobante", async () => {
    const gateway = nuevoGateway();
    const { carga } = await gateway.crearCarga(pedido(csv("001-002-0000001;PED-1;;A", "001-002-0000001;PED-1;;B", "001-002-0000002;PED-2;;A")));
    const validada = await gateway.getCarga(carga.carga_id);
    expect(validada.totales).toMatchObject({ lineas: 3, comprobantes: 2, pendientes: 2 });
    const { items } = await gateway.listCargaComprobantes(carga.carga_id, {});
    expect(items[0]!.filas).toEqual([2, 3]);
  });

  it("los marcadores producen invalido, aviso y duplicado", async () => {
    const gateway = nuevoGateway();
    const { carga } = await gateway.crearCarga(pedido(csv("001-002-0000001;INVALIDO-1;;A", "001-002-0000002;AVISO-1;;A", "001-002-0000003;DUP-1;;A")));
    await gateway.getCarga(carga.carga_id);
    const { items } = await gateway.listCargaComprobantes(carga.carga_id, {});
    expect(items[0]).toMatchObject({ estado: "INVALIDO", errores: [{ codigo: "TOTAL_NO_COINCIDE", columna: "total_comprobante" }] });
    expect(items[1]).toMatchObject({ estado: "PENDIENTE", advertencias: [{ codigo: "TRANSMISION_EXTEMPORANEA" }] });
    expect(items[2]).toMatchObject({ estado: "DUPLICADO", document_uuid: "00000000-0000-4000-8000-0000000000dd" });
  });

  it("recorre validada, preparacion, SIFEN y finalizada, con rechazo y correo", async () => {
    const gateway = nuevoGateway();
    const { carga } = await gateway.crearCarga(pedido(csv("001-002-0000001;PED-1;a@b.py;A", "001-002-0000002;RECHAZO-1;;A")));
    await gateway.getCarga(carga.carga_id);
    const confirmada = await gateway.confirmarCarga(carga.carga_id);
    expect(confirmada.estado).toBe("EN_PREPARACION");
    expect(confirmada.totales.preparados).toBe(1);
    expect((await gateway.getCarga(carga.carga_id)).estado).toBe("EN_SIFEN");
    const final = await gateway.getCarga(carga.carga_id);
    expect(final.estado).toBe("FINALIZADA");
    expect(final.totales).toMatchObject({ aprobados: 1, rechazados: 1 });
    const { items } = await gateway.listCargaComprobantes(carga.carga_id, { detalle: true });
    expect(items[0]).toMatchObject({ estado: "APROBADO", correo: "SENT", documento_estado: "APPROVED" });
    expect(items[0]!.numero_asignado).toBe("001-002-0000001");
    expect(items[0]!.detalle?.receptor?.docNro).toBe("80000000");
    expect(items[1]).toMatchObject({ estado: "RECHAZADO", sifen: { codigo: "1306" }, correo: null });
  });

  it("un comprobante en ERROR deja la carga abierta hasta reintentar", async () => {
    const gateway = nuevoGateway();
    const { carga } = await gateway.crearCarga(pedido(csv("001-002-0000001;ERROR-1;;A")));
    await gateway.getCarga(carga.carga_id);
    const confirmada = await gateway.confirmarCarga(carga.carga_id);
    expect(confirmada.totales.con_error).toBe(1);
    expect(confirmada.acciones.puede_reintentar).toBe(true);
    await gateway.getCarga(carga.carga_id);
    expect((await gateway.getCarga(carga.carga_id)).estado).toBe("EN_SIFEN");
    await gateway.reintentarCarga(carga.carga_id);
    await gateway.getCarga(carga.carga_id);
    const final = await gateway.getCarga(carga.carga_id);
    expect(final.estado).toBe("FINALIZADA");
    expect(final.totales.aprobados).toBe(1);
  });

  it("confirmada con otra carga activa del emisor queda EN_COLA", async () => {
    const gateway = nuevoGateway();
    const primera = (await gateway.crearCarga(pedido(csv("001-002-0000001;ERROR-1;;A")))).carga;
    const segunda = (await gateway.crearCarga(pedido(csv("001-002-0000002;PED-2;;A")))).carga;
    await gateway.getCarga(primera.carga_id);
    await gateway.getCarga(segunda.carga_id);
    await gateway.confirmarCarga(primera.carga_id);
    expect((await gateway.confirmarCarga(segunda.carga_id)).estado).toBe("EN_COLA");
    expect((await gateway.getCarga(segunda.carga_id)).estado).toBe("EN_COLA");
  });

  it("cancelar en VALIDADA deja CANCELADA y todos CANCELADO", async () => {
    const gateway = nuevoGateway();
    const { carga } = await gateway.crearCarga(pedido(csv("001-002-0000001;PED-1;;A")));
    await gateway.getCarga(carga.carga_id);
    const cancelada = await gateway.cancelarCarga(carga.carga_id);
    expect(cancelada.estado).toBe("CANCELADA");
    expect(cancelada.totales.cancelados).toBe(1);
  });

  it("cancelar en EN_SIFEN conserva lo enviado y termina FINALIZADA con cancelada_en", async () => {
    const gateway = nuevoGateway();
    const { carga } = await gateway.crearCarga(pedido(csv("001-002-0000001;PED-1;;A", "001-002-0000002;ERROR-1;;A")));
    await gateway.getCarga(carga.carga_id);
    await gateway.confirmarCarga(carga.carga_id);
    await gateway.getCarga(carga.carga_id);
    await gateway.getCarga(carga.carga_id);
    const cancelada = await gateway.cancelarCarga(carga.carga_id);
    expect(cancelada.cancelada_en).not.toBeNull();
    const final = await gateway.getCarga(carga.carga_id);
    expect(final.estado).toBe("FINALIZADA");
    expect(final.totales).toMatchObject({ aprobados: 1, cancelados: 1 });
  });

  it("una accion fuera de estado responde 409 con estado y acciones", async () => {
    const gateway = nuevoGateway();
    const { carga } = await gateway.crearCarga(pedido(csv("001-002-0000001;PED-1;;A")));
    const info = await error(gateway.confirmarCarga(carga.carga_id));
    expect(info).toMatchObject({ status: 409, fe_code: "CARGA_ACCION_NO_ADMITIDA", details: { estado: "RECIBIDA" } });
    expect(info.details.acciones).toMatchObject({ puede_confirmar: false });
  });

  it("los mismos bytes devuelven la misma carga, salvo RECHAZADA o CANCELADA", async () => {
    const gateway = nuevoGateway();
    const contenido = csv("001-002-0000001;PED-1;;A");
    const primera = await gateway.crearCarga(pedido(contenido));
    const repetida = await gateway.crearCarga(pedido(contenido, { nombreArchivo: "otro.csv" }));
    expect(repetida.creada).toBe(false);
    expect(repetida.carga.carga_id).toBe(primera.carga.carga_id);
    await gateway.getCarga(primera.carga.carga_id);
    await gateway.cancelarCarga(primera.carga.carga_id);
    expect((await gateway.crearCarga(pedido(contenido))).creada).toBe(true);
  });

  it("filtra por estado, advertencias, actualizado_desde y pagina", async () => {
    const gateway = nuevoGateway();
    const { carga } = await gateway.crearCarga(pedido(csv("001-002-0000001;INVALIDO-1;;A", "001-002-0000002;AVISO-1;;A", "001-002-0000003;PED-3;;A")));
    await gateway.getCarga(carga.carga_id);
    expect((await gateway.listCargaComprobantes(carga.carga_id, { estado: "INVALIDO" })).total).toBe(1);
    expect((await gateway.listCargaComprobantes(carga.carga_id, { con_advertencias: true })).total).toBe(1);
    const pagina = await gateway.listCargaComprobantes(carga.carga_id, { page: 2, limit: 2 });
    expect(pagina).toMatchObject({ total: 3, page: 2, limit: 2 });
    expect(pagina.items).toHaveLength(1);
    expect((await gateway.listCargaComprobantes(carga.carga_id, { actualizado_desde: "2999-01-01T00:00:00.000Z" })).total).toBe(0);
  });

  it("resultado, plantilla y lotes responden con la forma publicada", async () => {
    const gateway = nuevoGateway();
    const { carga } = await gateway.crearCarga(pedido(csv("001-002-0000001;PED-1;;A")));
    await gateway.getCarga(carga.carga_id);
    await gateway.confirmarCarga(carga.carga_id);
    await gateway.getCarga(carga.carga_id);
    const lotes = await gateway.getCargaLotes(carga.carga_id);
    expect(lotes.items[0]).toMatchObject({ documentos: 1, estado: "RECIBIDO" });
    expect((await gateway.getCargaResultado(carga.carga_id)).body.toString()).toContain("001-002-0000001");
    expect((await gateway.getPlantillaCarga()).body.toString()).toContain("numero_comprobante");
    expect(CSV_TITULOS).toContain("referencia_venta");
  });
});
