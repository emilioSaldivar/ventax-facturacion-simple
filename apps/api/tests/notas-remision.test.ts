import { describe, expect, it } from "vitest";
import { validarNotaRemision } from "../src/modules/notas-remision/notas-remision.validacion";
import { construirPedidoFe, emitirNotaRemision, fechaHoraAsuncion } from "../src/modules/notas-remision/notas-remision.service";
import { notaRemisionSchema } from "../src/modules/notas-remision/notas-remision.routes";
import type { NotaRemisionInput } from "../src/modules/notas-remision/notas-remision.types";
import { leerGeografia, limpiarCacheGeografia } from "../src/modules/geografia/geografia.service";
import { MockFiscalGateway } from "../src/modules/fiscal-gateway/fiscal-gateway.client";
import { FiscalGatewayError, type FiscalGateway } from "../src/modules/fiscal-gateway/fiscal-gateway.types";
import { processNextQueuedFiscalEmission } from "../src/modules/facturas/facturas.service";
import type { OperationalContextResponse } from "../src/modules/context/context.types";
import type { FacturaRepository } from "../src/modules/facturas/facturas.types";

// SPEC_NOTA_REMISION_v0.1 (TASKS NRE-003 a NRE-009).
const AHORA = new Date("2026-11-12T13:00:00Z"); // 10:00 en Asuncion

const context = {
  user: { id: "11111111-1111-4111-8111-111111111111", username: "op", display_name: "Op", role: "OPERADOR_FACTURACION" },
  tenant: { id: "22222222-2222-4222-8222-222222222222", name: "T", status: "ACTIVE" },
  facturador: { id: "33333333-3333-4333-8333-333333333333", emisor_id: "80136968-1", razon_social: "SEGEL SA", ruc: "80136968-1" },
  fiscal_context: {
    establecimiento: "001",
    punto_expedicion: "001",
    perfil_emision_codigo: "SERV",
    actividad_economica_codigo: "82110",
    actividad_economica_descripcion: "Servicios",
    timbrado: "80136968",
    timbrado_inicio: "2025-12-30",
    documento_nro: "0000000",
    credito_plazo_dias: 30,
    tipo_transaccion_default: 2
  },
  actividad_punto_perfil_id: "55555555-5555-4555-8555-555555555555"
} as unknown as OperationalContextResponse;

const local = { direccion: "Ruta 2 km 15", numero_casa: "0", departamento: 12, distrito: 164, ciudad: 6010 };

function base(): NotaRemisionInput {
  return {
    cliente: {
      documento_tipo: "RUC",
      documento: "80012345-0",
      razon_social: "Cliente de prueba SA",
      telefono: "0981 123 456",
      domicilio: { direccion: "Mcal. Lopez 1234", numero_casa: "1234", departamento: 1, distrito: 1, ciudad: 1 }
    },
    remision: { motivo: 1, responsable: 1, kilometros: 15, fecha_futura_factura: "2026-11-12" },
    transporte: {
      tipo: 1,
      modalidad: 1,
      responsable_flete: 5,
      inicio_traslado: "2026-11-12",
      fin_traslado: "2026-11-12",
      salida: local,
      entrega_destinatario: true,
      vehiculo: { tipo: "Camion", marca: "Volvo", tipo_identificacion: 2, matricula: "ABC123" },
      transportista: {
        naturaleza: "CONTRIBUYENTE",
        nombre: "SEGEL SA",
        ruc: "80136968-1",
        domicilio_fiscal: "Asuncion",
        chofer: { nombre: "Juan Perez", doc_nro: "1234567", direccion: "Asuncion" }
      }
    },
    items: [{ codigo: "A1", descripcion: "Cajas de producto", cantidad: 10 }]
  };
}

const mensajes = (input: NotaRemisionInput) => validarNotaRemision(input, AHORA).map((e) => `${e.campo}: ${e.mensaje}`);

describe("RN-14 validaciones antes de emitir", () => {
  it("una nota completa no tiene errores", () => {
    expect(mensajes(base())).toEqual([]);
  });

  const casos: Array<[string, (i: NotaRemisionInput) => void, string]> = [
    ["motivo fuera de 1 y 7", (i) => (i.remision.motivo = 3), "remision.motivo: Por ahora la nota de remisión se emite por venta o por traslado entre locales propios."],
    ["kilometros 0", (i) => (i.remision.kilometros = 0), "remision.kilometros: Los kilómetros van de 1 a 99.999."],
    ["kilometros 100000", (i) => (i.remision.kilometros = 100000), "remision.kilometros: Los kilómetros van de 1 a 99.999."],
    ["motivo 1 sin fecha prevista", (i) => (i.remision.fecha_futura_factura = null), "remision.fecha_futura_factura: Indicá la fecha prevista de la factura."],
    ["fecha prevista de un mes posterior", (i) => (i.remision.fecha_futura_factura = "2026-12-01"), "remision.fecha_futura_factura: La factura prevista no puede ser de un mes posterior a la nota."],
    ["destinatario sin domicilio", (i) => (i.cliente!.domicilio = null), "cliente.domicilio: Completá dirección, número de casa, departamento y ciudad del destinatario."],
    ["numero de casa con letras", (i) => (i.cliente!.domicilio!.numero_casa = "S/N"), "cliente.domicilio: Completá dirección, número de casa, departamento y ciudad del destinatario."],
    ["RUC del destinatario con DV incorrecto", (i) => (i.cliente!.documento = "80012345-1"), "cliente.documento: El RUC 80012345-1 no es válido: el dígito verificador que corresponde es 0."],
    ["destinatario sin nombre", (i) => (i.cliente!.documento_tipo = "INNOMINADO"), "cliente.documento_tipo: La nota de remisión necesita un destinatario con RUC, cédula, pasaporte o cédula extranjera."],
    ["telefono corto", (i) => (i.cliente!.telefono = "12345"), "cliente.telefono: El teléfono tiene que tener entre 6 y 15 números. Ejemplo: 0981123456."],
    ["fin antes del inicio", (i) => (i.transporte.fin_traslado = "2026-11-11"), "transporte.fin_traslado: El fin del traslado no puede ser anterior al inicio."],
    ["transporte propio con flete de otro", (i) => (i.transporte.responsable_flete = 1), "transporte.responsable_flete: Con transporte propio, el flete es del transporte propio."],
    ["modalidad aerea", (i) => (i.transporte.modalidad = 3), "transporte.modalidad: Elegí la modalidad: terrestre, fluvial o multimodal."],
    ["matricula de 5", (i) => (i.transporte.vehiculo.matricula = "AB123"), "transporte.vehiculo.matricula: La matrícula va de 6 a 7 caracteres."],
    ["tipo de vehiculo de 3", (i) => (i.transporte.vehiculo.tipo = "Van"), "transporte.vehiculo.tipo: El tipo de vehículo va de 4 a 10 caracteres (por ejemplo, Camion)."],
    ["RUC del transportista con DV incorrecto", (i) => (i.transporte.transportista.ruc = "80136968-2"), "transporte.transportista.ruc: El RUC 80136968-2 no es válido: el dígito verificador que corresponde es 1."],
    ["chofer con puntos en el documento", (i) => (i.transporte.transportista.chofer.doc_nro = "1.234.567"), "transporte.transportista.chofer.doc_nro: El documento del chofer va sin puntos, de 1 a 20 caracteres."],
    ["nombre del chofer corto", (i) => (i.transporte.transportista.chofer.nombre = "Ana"), "transporte.transportista.chofer.nombre: El nombre del chofer va de 4 a 60 caracteres."],
    ["sin articulos", (i) => (i.items = []), "items: Agregá al menos un artículo con descripción y cantidad."],
    ["articulo con cantidad 0", (i) => (i.items[0]!.cantidad = 0), "items: Agregá al menos un artículo con descripción y cantidad."],
    ["entrega en otro lugar sin domicilio", (i) => {
      i.transporte.entrega_destinatario = false;
      i.transporte.entrega = null;
    }, "transporte.entrega: Completá dirección, número de casa, departamento y ciudad del lugar de entrega."]
  ];
  it.each(casos)("%s", (_nombre, cambiar, esperado) => {
    const input = base();
    cambiar(input);
    expect(mensajes(input)).toContain(esperado);
  });

  it("motivo 7 no pide destinatario ni fecha prevista, pero si el local de entrega", () => {
    const input = base();
    input.remision.motivo = 7;
    input.cliente = null;
    input.remision.fecha_futura_factura = null;
    input.transporte.entrega_destinatario = false;
    expect(mensajes(input)).toEqual(["transporte.entrega: Completá dirección, número de casa, departamento y ciudad del lugar de entrega."]);
    input.transporte.entrega = { ...local, ciudad: 1, departamento: 1, distrito: 1, direccion: "Deposito central" };
    expect(mensajes(input)).toEqual([]);
  });
});

describe("RN-05, RN-15 y RN-24: pedido a FE", () => {
  it("motivo 1: receptor estricto con domicilio, entrega = domicilio del destinatario, articulos sin precio", () => {
    const { pedido, cliente } = construirPedidoFe(context, base(), "nre_x", AHORA);
    expect(pedido.tipo_documento).toBe("NOTA_REMISION");
    expect(pedido.fecha).toBe("2026-11-12T10:00:00");
    expect(pedido.receptor).toEqual({
      tipoDocumento: "RUC",
      docNro: "80012345",
      dv: "0",
      razonSocial: "Cliente de prueba SA",
      naturaleza: "JURIDICA",
      tipoOperacion: "B2B",
      direccion: "Mcal. Lopez 1234",
      numeroCasa: "1234",
      departamento: 1,
      distrito: 1,
      ciudad: 1,
      telefono: "0981123456"
    });
    expect(pedido.transporte.entregas[0]).toMatchObject({ direccion: "Mcal. Lopez 1234", ciudad: 1, telefono: "0981123456" });
    expect(pedido.items).toEqual([{ codigo: "A1", descripcion: "Cajas de producto", cantidad: 10, unidadMedida: 77 }]);
    expect(pedido.items[0]).not.toHaveProperty("precioUnitario");
    expect(pedido.remision).toEqual({ motivo: 1, responsable: 1, kilometros: 15, fechaFuturaFactura: "2026-11-12" });
    expect(pedido.transporte.vehiculos[0]).toEqual({ tipo: "Camion", marca: "Volvo", tipoIdentificacion: 2, matricula: "ABC123" });
    expect(cliente).toMatchObject({ documento_tipo: "RUC", documento: "80012345-0", domicilio: { ciudad: 1 } });
  });

  it("motivo 7: el receptor es el facturador con el domicilio del local de entrega; sin fecha prevista", () => {
    const input = base();
    input.remision.motivo = 7;
    input.cliente = null;
    input.transporte.entrega_destinatario = false;
    input.transporte.entrega = { direccion: "Deposito central", numero_casa: "100", departamento: 1, distrito: 1, ciudad: 1 };
    const { pedido } = construirPedidoFe(context, input, "nre_y", AHORA);
    expect(pedido.receptor).toMatchObject({ tipoDocumento: "RUC", docNro: "80136968", dv: "1", razonSocial: "SEGEL SA", tipoOperacion: "B2B", direccion: "Deposito central", numeroCasa: "100" });
    expect(pedido.remision).not.toHaveProperty("fechaFuturaFactura");
  });

  it("hora de Asuncion sin offset", () => {
    expect(fechaHoraAsuncion(new Date("2026-11-12T02:30:05Z"))).toBe("2026-11-11T23:30:05");
  });

  it("el esquema de la ruta acepta el cuerpo", () => {
    expect(notaRemisionSchema.safeParse(base()).success).toBe(true);
  });
});

describe("RN-21 emitir: permiso, idempotencia y encolado", () => {
  function repo() {
    const creados: Array<Record<string, unknown>> = [];
    const r = {
      creados,
      async findByIdempotencyKey({ idempotencyKey }: { idempotencyKey: string }) {
        const previo = creados.find((c) => c.idempotencyKey === idempotencyKey);
        return previo ? ({ id: "doc-1", tipo: "NOTA_REMISION", estado: "EMITIENDO" } as never) : null;
      },
      async createQueuedEmission(input: Record<string, unknown>) {
        creados.push(input);
        return { id: "doc-1", tipo: "NOTA_REMISION", estado: "EMITIENDO", cliente: input.input && (input.input as { cliente: unknown }).cliente } as never;
      }
    };
    return r;
  }

  it("sin NRE_EMIT responde 403", async () => {
    await expect(emitirNotaRemision(context, base(), repo() as unknown as FacturaRepository, { idempotencyKey: "clave-12345", habilitada: false, ahora: AHORA })).rejects.toMatchObject({
      statusCode: 403
    });
  });

  it("con datos invalidos responde 400 con el primer mensaje y no encola", async () => {
    const r = repo();
    const input = base();
    input.remision.kilometros = 0;
    await expect(emitirNotaRemision(context, input, r as unknown as FacturaRepository, { idempotencyKey: "clave-12345", habilitada: true, ahora: AHORA })).rejects.toMatchObject({
      statusCode: 400,
      message: "Los kilómetros van de 1 a 99.999."
    });
    expect(r.creados).toHaveLength(0);
  });

  it("CA-05: la misma clave crea un solo documento, tipo NOTA_REMISION, sin montos", async () => {
    const r = repo();
    await emitirNotaRemision(context, base(), r as unknown as FacturaRepository, { idempotencyKey: "clave-12345", habilitada: true, ahora: AHORA });
    await emitirNotaRemision(context, base(), r as unknown as FacturaRepository, { idempotencyKey: "clave-12345", habilitada: true, ahora: AHORA });
    expect(r.creados).toHaveLength(1);
    const c = r.creados[0]!;
    expect(c.tipo).toBe("NOTA_REMISION");
    expect((c.preview as { totals: { total: number } }).totals.total).toBe(0);
    expect((c.preview as { items: Array<{ precio_unitario: number }> }).items[0]!.precio_unitario).toBe(0);
    expect((c.fiscalRequest as { tipo_documento: string }).tipo_documento).toBe("NOTA_REMISION");
    expect(String(c.externalRef)).toMatch(/^nre_/);
  });
});

describe("RN-23 worker: la remision va a emitNotaRemision y no pide totales", () => {
  it("bifurca por tipo", async () => {
    const { pedido } = construirPedidoFe(context, base(), "nre_z", AHORA);
    const llamadas: string[] = [];
    const gateway = {
      emitFactura: async () => {
        llamadas.push("factura");
        throw new Error("no");
      },
      emitNotaRemision: async () => {
        llamadas.push("remision");
        return { estado: "EMITIDA" } as never;
      },
      getDocumentoTotales: async () => {
        llamadas.push("totales");
        throw new Error("no");
      }
    } as unknown as FiscalGateway;
    const repository = {
      claimNextPendingEmission: async () => ({
        outboxId: "o1",
        documentoId: "d1",
        facturadorId: "f1",
        facturadorApiKey: null,
        fiscalRequest: pedido,
        attempts: 0,
        documentoCreatedAt: new Date().toISOString(),
        accionNotificadaAt: null
      }),
      completePendingEmission: async () => ({ id: "d1", tipo: "NOTA_REMISION", estado: "EMITIDA" })
    } as unknown as FacturaRepository;
    const r = await processNextQueuedFiscalEmission(repository, gateway);
    expect(llamadas).toEqual(["remision"]);
    expect(r).toMatchObject({ tipo: "NOTA_REMISION", estado: "EMITIDA" });
  });
});

describe("RN-24 mock del gateway", () => {
  const gw = new MockFiscalGateway({ environment: "test" } as never);
  it("aprueba una NRE con CDC 07", async () => {
    const { pedido } = construirPedidoFe(context, base(), "nre_m", AHORA);
    const r = await gw.emitNotaRemision(pedido);
    expect(r.estado).toBe("EMITIDA");
    expect(r.cdc?.startsWith("07")).toBe(true);
  });
  it("reproduce el 422 del DV del transportista", async () => {
    const { pedido } = construirPedidoFe(context, base(), "nre_n", AHORA);
    pedido.transporte.transportista.ruc = "80136968-2";
    await expect(gw.emitNotaRemision(pedido)).rejects.toBeInstanceOf(FiscalGatewayError);
  });
});

describe("RN-08 geografia: cache 24 h y 503 sin FE", () => {
  it("una sola llamada a FE para dos lecturas; 503 sin cache y FE caido", async () => {
    limpiarCacheGeografia();
    let llamadas = 0;
    const ok = { getGeografia: async () => (llamadas++, { version: "2026.11", items: [{ codigo: 1, descripcion: "CAPITAL" }] }) } as unknown as FiscalGateway;
    await leerGeografia(ok, {}, 1000);
    await leerGeografia(ok, {}, 2000);
    expect(llamadas).toBe(1);
    const caido = { getGeografia: async () => { throw new Error("caido"); } } as unknown as FiscalGateway;
    await expect(leerGeografia(caido, { departamento: 12 }, 3000)).rejects.toMatchObject({ statusCode: 503 });
    // Vencido el cache y con FE caido, sirve lo ultimo guardado.
    const r = await leerGeografia(caido, {}, 1000 + 25 * 60 * 60 * 1000);
    expect(r.items[0]!.descripcion).toBe("CAPITAL");
  });
});
