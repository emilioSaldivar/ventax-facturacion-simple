/**
 * SPEC_NOTA_REMISION_v0.1 RN-14: reglas de FE (guia §53, OpenAPI `/v1/nota-remision`, segel-rc4.32) reproducidas antes
 * de emitir. Es la unica fuente de los mensajes: `apps/web-operacion/src/lib/validacionRemision.ts` los repite literales.
 * Formato del receptor y del RUC: SPEC_VALIDACIONES_RECEPTOR_v0.1 (RV-01 a RV-06).
 */
import {
  normalizarDocumento,
  normalizarTelefono,
  validarCorreo,
  validarDocumento,
  validarNombre,
  validarRuc,
  validarTelefono
} from "../../shared/validation/receptor";
import type { NotaRemisionError, NotaRemisionInput, NotaRemisionLocal } from "./notas-remision.types";

export const MOTIVOS_REMISION_V01 = [1, 7] as const;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

const largo = (v: string | null | undefined) => (v ?? "").trim().length;

function validarLocal(local: NotaRemisionLocal | null | undefined, campo: string, quien: string, errores: NotaRemisionError[]): void {
  if (!local || largo(local.direccion) === 0 || !/^\d{1,6}$/.test((local.numero_casa ?? "").trim()) || !local.departamento || !local.ciudad) {
    errores.push({ campo, mensaje: `Completá dirección, número de casa, departamento y ciudad ${quien}.` });
    return;
  }
  if (largo(local.direccion) > 255) errores.push({ campo: `${campo}.direccion`, mensaje: "La dirección puede tener hasta 255 caracteres." });
  const tel = normalizarTelefono(local.telefono);
  const rTel = validarTelefono(tel);
  if (!rTel.ok) errores.push({ campo: `${campo}.telefono`, mensaje: rTel.mensaje });
}

/** Fecha de hoy en Asuncion, `AAAA-MM-DD`. */
export function hoyAsuncion(ahora = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Asuncion", year: "numeric", month: "2-digit", day: "2-digit" }).format(ahora);
}

export function validarNotaRemision(input: NotaRemisionInput, ahora = new Date()): NotaRemisionError[] {
  const errores: NotaRemisionError[] = [];
  const add = (campo: string, mensaje: string) => errores.push({ campo, mensaje });
  const { remision, transporte } = input;

  // Motivo (RN-09, R-1).
  if (!(MOTIVOS_REMISION_V01 as readonly number[]).includes(remision.motivo)) {
    add("remision.motivo", "Por ahora la nota de remisión se emite por venta o por traslado entre locales propios.");
  }
  if (!Number.isInteger(remision.responsable) || remision.responsable < 1 || remision.responsable > 5) {
    add("remision.responsable", "Elegí quién es responsable de la emisión.");
  }
  if (!Number.isInteger(remision.kilometros) || remision.kilometros < 1 || remision.kilometros > 99999) {
    add("remision.kilometros", "Los kilómetros van de 1 a 99.999.");
  }
  if (remision.costo_flete !== undefined && remision.costo_flete !== null && (!Number.isInteger(remision.costo_flete) || remision.costo_flete < 0)) {
    add("remision.costo_flete", "El costo del flete va en guaraníes, sin decimales.");
  }
  const hoy = hoyAsuncion(ahora);
  if (remision.motivo === 1) {
    const prevista = remision.fecha_futura_factura ?? "";
    if (!FECHA.test(prevista)) {
      add("remision.fecha_futura_factura", "Indicá la fecha prevista de la factura.");
    } else if (prevista.slice(0, 7) > hoy.slice(0, 7)) {
      add("remision.fecha_futura_factura", "La factura prevista no puede ser de un mes posterior a la nota.");
    }
  }

  // Destinatario (RN-10). Con motivo 7 lo arma el servidor (RN-15).
  if (remision.motivo === 1) {
    const c = input.cliente;
    if (!c) {
      add("cliente", "Elegí el destinatario.");
    } else {
      if (c.documento_tipo === "INNOMINADO" || c.documento_tipo === "NO_ESPECIFICADO") {
        add("cliente.documento_tipo", "La nota de remisión necesita un destinatario con RUC, cédula, pasaporte o cédula extranjera.");
      } else {
        const rDoc = validarDocumento(c.documento_tipo, normalizarDocumento(c.documento_tipo, c.documento));
        if (!rDoc.ok) add("cliente.documento", rDoc.mensaje);
      }
      const rNom = validarNombre((c.razon_social ?? "").trim().replace(/\s+/g, " "));
      if (!rNom.ok) add("cliente.razon_social", rNom.mensaje);
      const rTel = validarTelefono(normalizarTelefono(c.telefono));
      if (!rTel.ok) add("cliente.telefono", rTel.mensaje);
      const correo = (c.email ?? "").trim();
      const rMail = validarCorreo(correo ? correo : null);
      if (!rMail.ok) add("cliente.email", rMail.mensaje);
      const d = c.domicilio;
      if (!d || largo(d.direccion) === 0 || !/^\d{1,6}$/.test((d.numero_casa ?? "").trim()) || !d.departamento || !d.ciudad) {
        add("cliente.domicilio", "Completá dirección, número de casa, departamento y ciudad del destinatario.");
      } else if (largo(d.direccion) > 255) {
        add("cliente.domicilio.direccion", "La dirección puede tener hasta 255 caracteres.");
      }
    }
  }

  // Transporte (RN-11).
  if (transporte.tipo !== 1 && transporte.tipo !== 2) add("transporte.tipo", "Elegí si el transporte es propio o de un tercero.");
  if (![1, 2, 4].includes(transporte.modalidad)) add("transporte.modalidad", "Elegí la modalidad: terrestre, fluvial o multimodal.");
  if (transporte.tipo === 1 && transporte.responsable_flete !== 5) {
    add("transporte.responsable_flete", "Con transporte propio, el flete es del transporte propio.");
  }
  if (transporte.tipo === 2 && (transporte.responsable_flete < 1 || transporte.responsable_flete > 4)) {
    add("transporte.responsable_flete", "Elegí quién paga el flete.");
  }
  if (!FECHA.test(transporte.inicio_traslado)) add("transporte.inicio_traslado", "Indicá la fecha de inicio del traslado.");
  if (!FECHA.test(transporte.fin_traslado)) add("transporte.fin_traslado", "Indicá la fecha de fin del traslado.");
  if (FECHA.test(transporte.inicio_traslado) && FECHA.test(transporte.fin_traslado) && transporte.fin_traslado < transporte.inicio_traslado) {
    add("transporte.fin_traslado", "El fin del traslado no puede ser anterior al inicio.");
  }

  // Salida y entrega (RN-12).
  validarLocal(transporte.salida, "transporte.salida", "del local de salida", errores);
  if (remision.motivo === 7 || !transporte.entrega_destinatario) {
    validarLocal(transporte.entrega, "transporte.entrega", "del lugar de entrega", errores);
  }

  // Vehiculo, transportista y chofer (RN-13).
  const v = transporte.vehiculo;
  if (largo(v.tipo) < 4 || largo(v.tipo) > 10) add("transporte.vehiculo.tipo", "El tipo de vehículo va de 4 a 10 caracteres (por ejemplo, Camion).");
  if (largo(v.marca) < 1 || largo(v.marca) > 10) add("transporte.vehiculo.marca", "La marca del vehículo va de 1 a 10 caracteres.");
  if (v.tipo_identificacion === 2) {
    if (largo(v.matricula) < 6 || largo(v.matricula) > 7) add("transporte.vehiculo.matricula", "La matrícula va de 6 a 7 caracteres.");
  } else if (v.tipo_identificacion === 1) {
    if (largo(v.numero_identificacion) < 1 || largo(v.numero_identificacion) > 20) {
      add("transporte.vehiculo.numero_identificacion", "El número de identificación del vehículo va de 1 a 20 caracteres.");
    }
  } else {
    add("transporte.vehiculo.tipo_identificacion", "Elegí si el vehículo se identifica por matrícula o por número.");
  }

  const t = transporte.transportista;
  if (largo(t.nombre) < 4 || largo(t.nombre) > 60) add("transporte.transportista.nombre", "El nombre del transportista va de 4 a 60 caracteres.");
  if (t.naturaleza === "CONTRIBUYENTE") {
    const rRuc = validarRuc(normalizarDocumento("RUC", t.ruc ?? ""));
    if (!rRuc.ok) add("transporte.transportista.ruc", rRuc.mensaje);
  } else if (t.naturaleza === "NO_CONTRIBUYENTE") {
    if (!t.tipo_documento || t.tipo_documento < 1 || t.tipo_documento > 4) add("transporte.transportista.tipo_documento", "Elegí el tipo de documento del transportista.");
    if (largo(t.doc_nro) < 1 || largo(t.doc_nro) > 20) add("transporte.transportista.doc_nro", "El documento del transportista va de 1 a 20 caracteres.");
  } else {
    add("transporte.transportista.naturaleza", "Elegí si el transportista es contribuyente o no.");
  }
  if (largo(t.domicilio_fiscal) < 1 || largo(t.domicilio_fiscal) > 150) {
    add("transporte.transportista.domicilio_fiscal", "El domicilio fiscal del transportista va de 1 a 150 caracteres.");
  }
  const ch = t.chofer;
  if (largo(ch?.nombre) < 4 || largo(ch?.nombre) > 60) add("transporte.transportista.chofer.nombre", "El nombre del chofer va de 4 a 60 caracteres.");
  if (!/^[^.]{1,20}$/.test((ch?.doc_nro ?? "").trim())) add("transporte.transportista.chofer.doc_nro", "El documento del chofer va sin puntos, de 1 a 20 caracteres.");
  if (largo(ch?.direccion) < 1 || largo(ch?.direccion) > 255) add("transporte.transportista.chofer.direccion", "La dirección del chofer va de 1 a 255 caracteres.");

  // Articulos (RN-17).
  const validos = input.items.filter((i) => largo(i.descripcion) > 0);
  if (validos.length === 0 || input.items.some((i) => largo(i.descripcion) === 0 || !(i.cantidad > 0))) {
    add("items", "Agregá al menos un artículo con descripción y cantidad.");
  }
  input.items.forEach((i, n) => {
    if (largo(i.descripcion) > 120) add(`items.${n}.descripcion`, "La descripción del artículo va hasta 120 caracteres.");
    if (i.cantidad > 0 && Math.abs(i.cantidad * 10000 - Math.round(i.cantidad * 10000)) > 1e-6) {
      add(`items.${n}.cantidad`, "La cantidad admite hasta 4 decimales.");
    }
  });

  // Informacion para el Fisco (RN-18).
  if (largo(input.informacion_fisco) > 3000) add("informacion_fisco", "La información para el Fisco va hasta 3.000 caracteres.");

  return errores;
}
