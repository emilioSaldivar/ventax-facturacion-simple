import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MockFiscalGateway } from "../src/modules/fiscal-gateway/fiscal-gateway.client";
import { mockCargas } from "../src/modules/fiscal-gateway/fiscal-gateway.mock-cargas";
import { FiscalGatewayError, type FeCrearCargaInput, type FiscalGateway } from "../src/modules/fiscal-gateway/fiscal-gateway.types";
import {
  accionSobreCarga,
  descargarPlantilla,
  descargarResultado,
  inutilizarComprobante,
  listarCargas,
  listarComprobantes,
  obtenerCarga,
  obtenerLotes,
  subirCarga,
  traducirErrorFe
} from "../src/modules/cargas/cargas.service";
import { HttpError } from "../src/shared/errors/http-error";
import { FakeCargaRepository, PERFIL_B, contexto, csv } from "./cargas.fixtures";

const gatewayMock = () => new MockFiscalGateway({ mode: "mock", baseUrl: "http://mock", timeoutMs: 1000, environment: "test" });

function errorDeFe(status: number, fe_code: string, details: Record<string, unknown> | null = null, retry: number | null = null) {
  return new FiscalGatewayError("UPSTREAM_ERROR", "mensaje de FE", { status, fe_code, message: "mensaje de FE", details, retry_after_seconds: retry });
}

describe("servicio de cargas", () => {
  let repository: FakeCargaRepository;
  let gateway: FiscalGateway;
  let deps: { repository: FakeCargaRepository; gatewayFor: () => Promise<FiscalGateway> };
  const archivo = () => ({ contenido: csv("001-002-0000001;PED-1;;A"), contentType: "text/csv" as const, nombreArchivo: "ventas.csv" });

  beforeEach(() => {
    mockCargas.__reiniciar();
    repository = new FakeCargaRepository();
    gateway = gatewayMock();
    deps = { repository, gatewayFor: async () => gateway };
  });

  describe("subida", () => {
    it("entrega a FE los bytes sin tocarlos y con los parametros del contexto", async () => {
      const espia = vi.spyOn(gateway, "crearCarga");
      const input = archivo();
      const carga = await subirCarga(contexto({}, "CLIENTE"), input, deps);
      const pedido = espia.mock.calls[0]![0] as FeCrearCargaInput;
      expect(createHash("sha256").update(pedido.contenido).digest("hex")).toBe(createHash("sha256").update(input.contenido).digest("hex"));
      expect(pedido).toMatchObject({ emisorId: "80136968-1", numeracion: "CLIENTE", actividadEconomicaCodigo: "82110", emissionProfileCode: "SERV", nombreArchivo: "ventas.csv" });
      expect(pedido.establecimiento).toBeUndefined();
      expect(carga).toMatchObject({ estado: "RECIBIDA", repetida: false, numeracion: "CLIENTE" });
    });

    it("sin perfil manda establecimiento y punto", async () => {
      const espia = vi.spyOn(gateway, "crearCarga");
      const base = contexto();
      await subirCarga({ ...base, fiscal_context: { ...base.fiscal_context, perfil_emision_codigo: "NO_REQUERIDO" } }, archivo(), deps);
      const pedido = espia.mock.calls[0]![0] as FeCrearCargaInput;
      expect(pedido).toMatchObject({ establecimiento: "001", punto: "002" });
      expect(pedido.emissionProfileCode).toBeUndefined();
    });

    it("D-13: repetido visible vuelve sin llamar a FE y queda auditado", async () => {
      const primera = await subirCarga(contexto(), archivo(), deps);
      const espia = vi.spyOn(gateway, "crearCarga");
      const repetida = await subirCarga(contexto(), archivo(), deps);
      expect(espia).not.toHaveBeenCalled();
      expect(repetida).toMatchObject({ id: primera.id, repetida: true });
      expect(repository.eventos.at(-1)).toMatchObject({ tipo: "CARGA_SUBIDA", metadata: { repetida: true } });
    });

    it("D-13: repetido de otro contexto responde 409 sin exponer la carga ni llamar a FE", async () => {
      await subirCarga(contexto(), archivo(), deps);
      const espia = vi.spyOn(gateway, "crearCarga");
      await expect(subirCarga(contexto({ actividad_punto_perfil_id: PERFIL_B }), archivo(), deps)).rejects.toMatchObject({
        statusCode: 409,
        details: { reason: "ARCHIVO_YA_SUBIDO_EN_OTRO_CONTEXTO" }
      });
      expect(espia).not.toHaveBeenCalled();
    });

    it("un rol interno ve el repetido de cualquier contexto", async () => {
      await subirCarga(contexto(), archivo(), deps);
      const interno = contexto({ actividad_punto_perfil_id: PERFIL_B, user: { id: "99999999-9999-4999-8999-999999999999", username: "s", display_name: "S", role: "SOPORTE_INTERNO" } });
      await expect(subirCarga(interno, archivo(), deps)).resolves.toMatchObject({ repetida: true });
    });

    it("el 200 de FE reutiliza la fila local", async () => {
      const primera = await subirCarga(contexto(), archivo(), deps);
      repository.filas.get(primera.id)!.sha256 = "otro";
      const repetida = await subirCarga(contexto(), archivo(), deps);
      expect(repetida).toMatchObject({ id: primera.id, repetida: true });
      expect(repository.filas.size).toBe(1);
    });

    it("el 200 de FE sobre una carga de otro contexto responde 409", async () => {
      const primera = await subirCarga(contexto(), archivo(), deps);
      repository.filas.get(primera.id)!.sha256 = "otro";
      await expect(subirCarga(contexto({ actividad_punto_perfil_id: PERFIL_B }), archivo(), deps)).rejects.toMatchObject({
        details: { reason: "ARCHIVO_YA_SUBIDO_EN_OTRO_CONTEXTO" }
      });
    });

    it("ante un timeout reintenta una vez con los mismos bytes", async () => {
      const real = gateway.crearCarga.bind(gateway);
      const espia = vi.spyOn(gateway, "crearCarga").mockRejectedValueOnce(new FiscalGatewayError("TIMEOUT", "lento")).mockImplementation(real);
      await expect(subirCarga(contexto(), archivo(), deps)).resolves.toMatchObject({ repetida: false });
      expect(espia).toHaveBeenCalledTimes(2);
    });

    it("RN-01b: el 413 de FE llega con su tope y no crea fila", async () => {
      const grande = { contenido: Buffer.alloc(21 * 1024 * 1024, "a"), contentType: "text/csv" as const };
      await expect(subirCarga(contexto(), grande, deps)).rejects.toMatchObject({
        statusCode: 413,
        code: "PAYLOAD_TOO_LARGE",
        details: { fe_code: "CARGA_ARCHIVO_DEMASIADO_GRANDE", tope_bytes: 20_971_520 }
      });
      expect(repository.filas.size).toBe(0);
    });

    it("el 422 de parametros conserva motivos y no crea fila", async () => {
      vi.spyOn(gateway, "crearCarga").mockRejectedValue(errorDeFe(422, "CARGA_PARAMETROS_INVALIDOS", { motivos: [{ codigo: "ACTIVIDAD_NO_CUBIERTA", mensaje: "texto" }] }));
      await expect(subirCarga(contexto(), archivo(), deps)).rejects.toMatchObject({
        statusCode: 422,
        message: "mensaje de FE",
        details: { fe_code: "CARGA_PARAMETROS_INVALIDOS", motivos: [{ codigo: "ACTIVIDAD_NO_CUBIERTA" }] }
      });
      expect(repository.filas.size).toBe(0);
    });

    it("el 404 de FE se responde como funcion no habilitada (D-10)", async () => {
      vi.spyOn(gateway, "crearCarga").mockRejectedValue(errorDeFe(404, "NOT_FOUND"));
      await expect(subirCarga(contexto(), archivo(), deps)).rejects.toMatchObject({ statusCode: 409, details: { reason: "CARGA_MASIVA_NO_HABILITADA_EN_FE" } });
    });

    it.each([
      [403, 403, "FORBIDDEN"],
      [415, 415, "VALIDATION_ERROR"],
      [429, 429, "CONFLICT"],
      [500, 502, "INTERNAL_ERROR"]
    ])("el %i de FE se responde %i %s", async (entra, sale, code) => {
      vi.spyOn(gateway, "crearCarga").mockRejectedValue(errorDeFe(entra, "X", null, entra === 429 ? 120 : null));
      await expect(subirCarga(contexto(), archivo(), deps)).rejects.toMatchObject({ statusCode: sale, code });
    });

    it("el 429 conserva la espera", () => {
      const traducido = traducirErrorFe(errorDeFe(429, "CARGA_CUOTA_DIARIA", { motivo: "CUOTA_DIARIA" }, 3600)) as HttpError;
      expect(traducido.details).toMatchObject({ fe_code: "CARGA_CUOTA_DIARIA", motivo: "CUOTA_DIARIA", retry_after_seconds: 3600 });
    });

    it("FE caido responde FE_NO_DISPONIBLE", () => {
      const traducido = traducirErrorFe(new FiscalGatewayError("UNAVAILABLE", "sin red")) as HttpError;
      expect(traducido).toMatchObject({ statusCode: 502, details: { reason: "FE_NO_DISPONIBLE" } });
    });
  });

  describe("aislamiento", () => {
    it("CA-04: otro perfil y otro facturador reciben 404, tambien por id", async () => {
      const carga = await subirCarga(contexto(), archivo(), deps);
      const otroPerfil = contexto({ actividad_punto_perfil_id: PERFIL_B });
      const base = contexto();
      const otroFacturador = contexto({ facturador: { ...base.facturador, id: "44444444-4444-4444-8444-444444444444" } });
      for (const ajeno of [otroPerfil, otroFacturador]) {
        await expect(obtenerCarga(ajeno, carga.id, deps)).rejects.toMatchObject({ statusCode: 404 });
        await expect(listarComprobantes(ajeno, carga.id, {}, deps)).rejects.toMatchObject({ statusCode: 404 });
        await expect(accionSobreCarga(ajeno, carga.id, "confirmar", deps)).rejects.toMatchObject({ statusCode: 404 });
        await expect(descargarResultado(ajeno, carga.id, deps)).rejects.toMatchObject({ statusCode: 404 });
      }
    });

    it("el listado acota al contexto del operador; el rol interno ve todo el facturador", async () => {
      await subirCarga(contexto(), archivo(), deps);
      const filtros = { limit: 20, offset: 0 };
      expect((await listarCargas(contexto(), filtros, deps)).total).toBe(1);
      expect((await listarCargas(contexto({ actividad_punto_perfil_id: PERFIL_B }), filtros, deps)).total).toBe(0);
      const interno = contexto({ actividad_punto_perfil_id: PERFIL_B, user: { id: "99999999-9999-4999-8999-999999999999", username: "s", display_name: "S", role: "ADMIN_INTERNO" } });
      expect((await listarCargas(interno, filtros, deps)).total).toBe(1);
    });

    it("los lotes son solo para roles internos", async () => {
      const carga = await subirCarga(contexto(), archivo(), deps);
      await expect(obtenerLotes(contexto(), carga.id, deps)).rejects.toMatchObject({ statusCode: 403 });
      const interno = contexto({ user: { id: "99999999-9999-4999-8999-999999999999", username: "s", display_name: "S", role: "SOPORTE_INTERNO" } });
      await expect(obtenerLotes(interno, carga.id, deps)).resolves.toMatchObject({ carga_id: carga.id });
    });
  });

  describe("acciones", () => {
    it("CA-02: subir no ordena emitir, y confirmar guarda quien y audita", async () => {
      const espia = vi.spyOn(gateway, "confirmarCarga");
      const carga = await subirCarga(contexto(), archivo(), deps);
      expect(espia).not.toHaveBeenCalled();
      await obtenerCarga(contexto(), carga.id, deps);
      const confirmada = await accionSobreCarga(contexto(), carga.id, "confirmar", deps);
      expect(confirmada.estado).toBe("EN_PREPARACION");
      expect(confirmada.confirmada_por?.id).toBe(contexto().user.id);
      expect(repository.filas.get(carga.id)!.sync_next_at).not.toBeNull();
      expect(repository.eventos.at(-1)).toMatchObject({ tipo: "CARGA_CONFIRMADA", usuarioId: contexto().user.id });
    });

    it("cancelar y reintentar quedan auditados", async () => {
      const carga = await subirCarga(contexto(), { ...archivo(), contenido: csv("001-002-0000001;ERROR-1;;A", "001-002-0000002;ERROR-2;;A") }, deps);
      await obtenerCarga(contexto(), carga.id, deps);
      await accionSobreCarga(contexto(), carga.id, "confirmar", deps);
      await obtenerCarga(contexto(), carga.id, deps);
      await accionSobreCarga(contexto(), carga.id, "reintentar", deps);
      expect(repository.eventos.at(-1)!.tipo).toBe("CARGA_REINTENTADA");
    });

    it("cancelar guarda cancelada_por", async () => {
      const carga = await subirCarga(contexto(), archivo(), deps);
      await obtenerCarga(contexto(), carga.id, deps);
      const cancelada = await accionSobreCarga(contexto(), carga.id, "cancelar", deps);
      expect(cancelada.estado).toBe("CANCELADA");
      expect(cancelada.cancelada_por?.id).toBe(contexto().user.id);
      expect(repository.eventos.at(-1)!.tipo).toBe("CARGA_CANCELADA");
    });

    it("RN-08: fuera de estado responde 409 y actualiza estado y acciones locales", async () => {
      const carga = await subirCarga(contexto(), archivo(), deps);
      await expect(accionSobreCarga(contexto(), carga.id, "confirmar", deps)).rejects.toMatchObject({
        statusCode: 409,
        details: { reason: "CARGA_ACCION_NO_ADMITIDA", estado: "RECIBIDA" }
      });
      expect(repository.filas.get(carga.id)!.acciones).toMatchObject({ puede_confirmar: false });
    });
  });

  describe("inutilizar el numero de un comprobante (SPEC_CARGA_ATENCION_COMPROBANTES_v0.1)", () => {
    const invalido = () => ({ ...archivo(), contenido: csv("001-002-0000007;INVALIDO-1;;A") });

    it("CA-02: llama a FE, audita, agenda la carga y devuelve el comprobante sin atencion", async () => {
      const carga = await subirCarga(contexto({}, "CLIENTE"), invalido(), deps);
      await obtenerCarga(contexto({}, "CLIENTE"), carga.id, deps);
      const espia = vi.spyOn(gateway, "inutilizarComprobanteCarga");
      const resultado = await inutilizarComprobante(contexto({}, "CLIENTE"), carga.id, 1, "Factura invalida en la carga", deps);
      expect(espia).toHaveBeenCalledWith(carga.fe_carga_id, 1, "Factura invalida en la carga");
      expect(resultado.comprobante).toMatchObject({ atencion: null, inutilizacion: { estado: "ACCEPTED" }, documento_id: null });
      expect(repository.eventos.at(-1)).toMatchObject({
        tipo: "CARGA_COMPROBANTE_INUTILIZADO",
        usuarioId: contexto().user.id,
        metadata: { orden: 1, numero: "001-002-0000007", motivo: "Factura invalida en la carga", evento_estado: "ACCEPTED" }
      });
      expect(repository.filas.get(carga.id)!.estado).toBe("FINALIZADA");
    });

    it("RN-04: un 409 de FE llega con su codigo; el 404 del comprobante es 404", async () => {
      const carga = await subirCarga(contexto({}, "CLIENTE"), archivo(), deps);
      await obtenerCarga(contexto({}, "CLIENTE"), carga.id, deps);
      await expect(inutilizarComprobante(contexto({}, "CLIENTE"), carga.id, 1, "Motivo valido", deps)).rejects.toMatchObject({
        statusCode: 409,
        details: { reason: "COMPROBANTE_SIN_ATENCION" }
      });
      await expect(inutilizarComprobante(contexto({}, "CLIENTE"), carga.id, 9, "Motivo valido", deps)).rejects.toMatchObject({ statusCode: 404 });
      vi.spyOn(gateway, "inutilizarComprobanteCarga").mockRejectedValueOnce(errorDeFe(409, "EVENT_IN_PROGRESS"));
      await expect(inutilizarComprobante(contexto({}, "CLIENTE"), carga.id, 1, "Motivo valido", deps)).rejects.toMatchObject({
        statusCode: 409,
        details: { reason: "EVENT_IN_PROGRESS" }
      });
    });

    it("RN-08: otro perfil recibe 404 y no llega a FE", async () => {
      const carga = await subirCarga(contexto({}, "CLIENTE"), invalido(), deps);
      const espia = vi.spyOn(gateway, "inutilizarComprobanteCarga");
      await expect(
        inutilizarComprobante(contexto({ actividad_punto_perfil_id: PERFIL_B }, "CLIENTE"), carga.id, 1, "Motivo valido", deps)
      ).rejects.toMatchObject({ statusCode: 404 });
      expect(espia).not.toHaveBeenCalled();
    });
  });

  describe("consultas", () => {
    it("CA-08: con FE caido devuelve la copia con el error y no cambia el estado", async () => {
      const carga = await subirCarga(contexto(), archivo(), deps);
      vi.spyOn(gateway, "getCarga").mockRejectedValue(new FiscalGatewayError("UNAVAILABLE", "sin red"));
      const copia = await obtenerCarga(contexto(), carga.id, deps);
      expect(copia).toMatchObject({ estado: "RECIBIDA", sync_error: "sin red" });
    });

    it("suma documento_id a los comprobantes incorporados", async () => {
      const carga = await subirCarga(contexto(), archivo(), deps);
      await obtenerCarga(contexto(), carga.id, deps);
      await accionSobreCarga(contexto(), carga.id, "confirmar", deps);
      const uuid = (await gateway.listCargaComprobantes(carga.fe_carga_id, {})).items[0]!.document_uuid!;
      repository.documentos.set(uuid, "doc-1");
      const lista = await listarComprobantes(contexto(), carga.id, {}, deps);
      expect(lista.carga_id).toBe(carga.id);
      expect(lista.items[0]!.documento_id).toBe("doc-1");
    });

    it("plantilla y resultado llevan nombre de archivo propio", async () => {
      const carga = await subirCarga(contexto(), archivo(), deps);
      expect((await descargarPlantilla(contexto(), deps)).filename).toBe("plantilla-carga-facturas.csv");
      expect((await descargarResultado(contexto(), carga.id, deps)).filename).toBe("resultado-ventas.csv");
    });
  });
});
