import crypto from "node:crypto";
import { HttpError } from "../../shared/errors/http-error";
import { normalizarDocumento, normalizarNombre, normalizarTelefono } from "../../shared/validation/receptor";
import type { OperationalContextResponse } from "../context/context.types";
import { withAccion } from "../facturas/facturas.service";
import type { DocumentoResponse, FacturaItemPreview, FacturaPreviewInput, FacturaRepository } from "../facturas/facturas.types";
import type { FiscalEmitNotaRemisionRequest, FiscalNotaRemisionLocal } from "../fiscal-gateway/fiscal-gateway.types";
import type { NotaRemisionDomicilio, NotaRemisionInput, NotaRemisionLocal } from "./notas-remision.types";
import { hoyAsuncion, validarNotaRemision } from "./notas-remision.validacion";

/** SPEC_NOTA_REMISION_v0.1 RN-22: mismas reglas que la emision, sin crear nada. */
export function validarONotificar(input: NotaRemisionInput, ahora = new Date()): void {
  const errores = validarNotaRemision(input, ahora);
  if (errores.length > 0) {
    throw new HttpError(400, "VALIDATION_ERROR", errores[0]!.mensaje, { errores });
  }
}

/** Fecha y hora en Asuncion sin offset, `AAAA-MM-DDTHH:mm:ss` (FE `toXmlgenDateTime`). */
export function fechaHoraAsuncion(ahora = new Date()): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Asuncion",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23"
    })
      .formatToParts(ahora)
      .map((x) => [x.type, x.value])
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
}

function localFe(local: NotaRemisionLocal | NotaRemisionDomicilio, extra: { telefono?: string | null } = {}): FiscalNotaRemisionLocal {
  const l = local as NotaRemisionLocal;
  const telefono = normalizarTelefono(extra.telefono ?? l.telefono ?? null);
  return {
    direccion: normalizarNombre(local.direccion),
    numeroCasa: local.numero_casa.trim(),
    departamento: local.departamento,
    ...(local.distrito ? { distrito: local.distrito } : {}),
    ciudad: local.ciudad,
    ...(l.complemento1?.trim() ? { complemento1: l.complemento1.trim() } : {}),
    ...(l.complemento2?.trim() ? { complemento2: l.complemento2.trim() } : {}),
    ...(telefono ? { telefono } : {})
  };
}

const naturalezaPorRuc = (ruc: string): "FISICA" | "JURIDICA" => {
  const base = ruc.split("-")[0] ?? ruc;
  return /^\d+$/.test(base) && base.length > 7 ? "JURIDICA" : "FISICA";
};

/** RN-10 y RN-15: receptor de FE (estricto) y cliente para el snapshot de FS. */
function armarReceptor(
  context: OperationalContextResponse,
  input: NotaRemisionInput
): { receptor: FiscalEmitNotaRemisionRequest["receptor"]; cliente: FacturaPreviewInput["cliente"] } {
  if (input.remision.motivo === 7) {
    // RN-15: el receptor es el propio facturador, con el domicilio del local de entrega.
    const ruc = normalizarDocumento("RUC", context.facturador.ruc);
    const [base, dv] = ruc.split("-");
    const entrega = input.transporte.entrega!;
    const naturaleza = naturalezaPorRuc(ruc);
    return {
      receptor: {
        tipoDocumento: "RUC",
        docNro: base ?? ruc,
        ...(dv ? { dv } : {}),
        razonSocial: context.facturador.razon_social,
        naturaleza,
        tipoOperacion: "B2B",
        ...localFe(entrega)
      } as FiscalEmitNotaRemisionRequest["receptor"],
      cliente: {
        documento_tipo: "RUC",
        documento: ruc,
        razon_social: context.facturador.razon_social,
        direccion: normalizarNombre(entrega.direccion),
        telefono: null,
        email: null,
        naturaleza
      }
    };
  }

  const c = input.cliente!;
  const d = c.domicilio!;
  const documento = normalizarDocumento(c.documento_tipo, c.documento);
  const esRuc = c.documento_tipo === "RUC";
  const [base, dv] = documento.split("-");
  const telefono = normalizarTelefono(c.telefono);
  const email = (c.email ?? "").trim() || null;
  const naturaleza = esRuc ? c.naturaleza ?? naturalezaPorRuc(documento) : undefined;
  const local = localFe(d);
  return {
    receptor: {
      tipoDocumento: c.documento_tipo,
      docNro: esRuc ? base ?? documento : documento,
      ...(esRuc && dv ? { dv } : {}),
      razonSocial: normalizarNombre(c.razon_social),
      ...(naturaleza ? { naturaleza } : {}),
      tipoOperacion: esRuc ? "B2B" : "B2C",
      direccion: local.direccion,
      numeroCasa: local.numeroCasa,
      departamento: local.departamento,
      ...(local.distrito ? { distrito: local.distrito } : {}),
      ciudad: local.ciudad,
      ...(telefono ? { telefono } : {}),
      ...(email ? { email } : {})
    },
    cliente: {
      cliente_id: c.cliente_id ?? null,
      documento_tipo: c.documento_tipo as FacturaPreviewInput["cliente"]["documento_tipo"],
      documento,
      razon_social: normalizarNombre(c.razon_social),
      direccion: local.direccion,
      telefono,
      email,
      ...(naturaleza ? { naturaleza } : {}),
      // RN-04: el snapshot del destinatario guarda el domicilio codificado.
      domicilio: d
    } as FacturaPreviewInput["cliente"]
  };
}

export function construirPedidoFe(
  context: OperationalContextResponse,
  input: NotaRemisionInput,
  externalRef: string,
  ahora = new Date()
): { pedido: FiscalEmitNotaRemisionRequest; cliente: FacturaPreviewInput["cliente"] } {
  const { receptor, cliente } = armarReceptor(context, input);
  const t = input.transporte;
  const destino = input.remision.motivo === 1 && t.entrega_destinatario ? input.cliente!.domicilio! : t.entrega!;
  const telefonoEntrega = input.remision.motivo === 1 && t.entrega_destinatario ? input.cliente?.telefono ?? null : null;
  const transportista = t.transportista;
  const pedido: FiscalEmitNotaRemisionRequest = {
    tipo_documento: "NOTA_REMISION",
    external_ref: externalRef,
    facturador: context.facturador,
    fiscal_context: {
      ...context.fiscal_context,
      fiscal_envio_modo: context.fiscal_context.fiscal_envio_modo ?? "BATCH",
      batch_enabled: context.fiscal_context.batch_enabled ?? true
    },
    fecha: fechaHoraAsuncion(ahora),
    receptor,
    remision: {
      motivo: input.remision.motivo,
      responsable: input.remision.responsable,
      kilometros: input.remision.kilometros,
      ...(input.remision.motivo === 1 && input.remision.fecha_futura_factura ? { fechaFuturaFactura: input.remision.fecha_futura_factura } : {}),
      ...(input.remision.costo_flete ? { costoFlete: input.remision.costo_flete } : {})
    },
    transporte: {
      tipo: t.tipo as 1 | 2,
      modalidad: t.modalidad as 1 | 2 | 3 | 4,
      responsableFlete: t.responsable_flete,
      inicioTraslado: t.inicio_traslado,
      finTraslado: t.fin_traslado,
      salida: localFe(t.salida),
      entregas: [localFe(destino, { telefono: telefonoEntrega })],
      vehiculos: [
        t.vehiculo.tipo_identificacion === 2
          ? { tipo: t.vehiculo.tipo.trim(), marca: t.vehiculo.marca.trim(), tipoIdentificacion: 2, matricula: (t.vehiculo.matricula ?? "").trim().toUpperCase() }
          : { tipo: t.vehiculo.tipo.trim(), marca: t.vehiculo.marca.trim(), tipoIdentificacion: 1, numeroIdentificacion: (t.vehiculo.numero_identificacion ?? "").trim() }
      ],
      transportista: {
        naturaleza: transportista.naturaleza,
        nombre: normalizarNombre(transportista.nombre),
        ...(transportista.naturaleza === "CONTRIBUYENTE"
          ? { ruc: normalizarDocumento("RUC", transportista.ruc ?? "") }
          : { tipoDocumento: transportista.tipo_documento ?? 1, docNro: (transportista.doc_nro ?? "").trim() }),
        domicilioFiscal: normalizarNombre(transportista.domicilio_fiscal),
        chofer: {
          docNro: transportista.chofer.doc_nro.trim(),
          nombre: normalizarNombre(transportista.chofer.nombre),
          direccion: normalizarNombre(transportista.chofer.direccion)
        }
      }
    },
    items: input.items.map((i, n) => ({
      codigo: i.codigo?.trim() || `L${String(n + 1).padStart(3, "0")}`,
      descripcion: i.descripcion.trim(),
      cantidad: i.cantidad,
      // DP-1: unidad fija 77 "Unidad" (catalogo UNIDAD_MEDIDA de FE).
      unidadMedida: 77
    })),
    ...(input.informacion_fisco?.trim() ? { informacionFisco: input.informacion_fisco.trim() } : {})
  };
  return { pedido, cliente };
}

function externalRefDe(context: OperationalContextResponse, idempotencyKey: string): string {
  return `nre_${crypto.createHash("sha256").update(`${context.facturador.id}:nre:${idempotencyKey}`).digest("hex").slice(0, 32)}`;
}

/** SPEC_NOTA_REMISION_v0.1 RN-21: crea el documento NOTA_REMISION y lo encola en el outbox de emision. */
export async function emitirNotaRemision(
  context: OperationalContextResponse,
  input: NotaRemisionInput,
  repository: FacturaRepository,
  options: { idempotencyKey: string; habilitada: boolean; ahora?: Date }
): Promise<DocumentoResponse> {
  if (!options.habilitada) {
    throw new HttpError(403, "FORBIDDEN", "Tu clave fiscal todavía no tiene habilitada la nota de remisión. Pedila a Segel.", {
      reason: "NOTA_REMISION_NO_HABILITADA"
    });
  }
  const existente = await repository.findByIdempotencyKey({ facturadorId: context.facturador.id, idempotencyKey: options.idempotencyKey });
  if (existente) return withAccion(existente);

  if (context.fiscal_context.numeracion_facturas === "CLIENTE") {
    throw new HttpError(409, "CONFLICT", "Este punto de expedición emite solo por carga de archivo. Usá Por planilla.", {
      reason: "NUMERACION_DEL_CLIENTE"
    });
  }
  validarONotificar(input, options.ahora);

  const externalRef = externalRefDe(context, options.idempotencyKey);
  const { pedido, cliente } = construirPedidoFe(context, input, externalRef, options.ahora);
  const items: FacturaItemPreview[] = input.items.map((i, n) => ({
    line_no: n + 1,
    codigo: i.codigo?.trim() || null,
    descripcion: i.descripcion.trim(),
    cantidad: i.cantidad,
    precio_unitario: 0,
    iva_tipo: "EXENTA",
    subtotal: 0,
    base_imponible: 0,
    iva_monto: 0,
    catalogo_item_id: i.catalogo_item_id ?? null
  }));
  const creado = await repository.createQueuedEmission({
    tenantId: context.tenant.id,
    actividadPuntoPerfilId: context.actividad_punto_perfil_id,
    facturadorId: context.facturador.id,
    userId: context.user.id,
    externalRef,
    idempotencyKey: options.idempotencyKey,
    tipo: "NOTA_REMISION",
    // RN-04: sin condicion de venta (la columna la admite nula desde 0040) y en guaranies.
    input: { condicion_venta: null as unknown as FacturaPreviewInput["condicion_venta"], cliente, items: [] } as unknown as FacturaPreviewInput,
    preview: { items, totals: { subtotal: 0, total_sin_iva: 0, iva_5: 0, iva_10: 0, total_iva: 0, total: 0 } },
    fiscalRequest: pedido
  });
  return withAccion(creado);
}

export { hoyAsuncion };
