// Movido de main.tsx sin cambios (PLAN_UX_RESTO_APP_v0.1 §10.9, URA-023).
import { Icono, type NombreIcono } from "./Icono";
import { esClienteInnominado } from "../lib/innominado";
import { etiquetaCondicionVenta, formatDocumentoTipo } from "../lib/estados";
import { type DocumentoEstado, type OperationalContextResponse, type DocumentoResponse, type DeliveryLinkResponse, type EmailStatusResponse, type ClasePaso } from "../tipos";
import { formatMonto, formatGuaranies, formatCantidad, formatHora, buildWhatsAppShareUrl, formatIva } from "../lib/formato";
import { desgloseDescuentos } from "../lib/descuentos";
import { formatEmailStatus, getDocumentoNombreLower, getSimpleDocumentoEstado, esEstadoFinalOperador } from "../lib/documentos";

export function pasosPorEstado(estado: DocumentoEstado): Array<{ etiqueta: string; clase: ClasePaso }> {
  const etiquetas = ["Creada", "Enviada a SIFEN", "Esperando aprobación", "Aprobada · KUDE listo"];
  const armar = (clases: ClasePaso[], reemplazos: Record<number, string> = {}) =>
    etiquetas.map((etiqueta, indice) => ({ etiqueta: reemplazos[indice] ?? etiqueta, clase: clases[indice] ?? "pendiente" }));
  switch (estado) {
    case "EMITIDA":
      return armar(["hecho", "hecho", "hecho", "hecho"]);
    case "PENDIENTE_SIFEN":
      return armar(["hecho", "hecho", "activo", "pendiente"]);
    case "RECHAZADA":
      return armar(["hecho", "hecho", "error", "pendiente"], { 2: "Rechazada por SIFEN" });
    case "ERROR_TEMPORAL":
    case "ERROR_OPERATIVO":
      return armar(["hecho", "error", "pendiente", "pendiente"], { 1: "No se pudo enviar" });
    case "ANULADA":
    case "CANCELADO_LOCAL":
      return armar(["pendiente", "pendiente", "pendiente", "pendiente"]);
    case "EMITIENDO":
    default:
      return armar(["hecho", "activo", "pendiente", "pendiente"]);
  }
}

/** Texto del estado simple sin el semaforo de emoji (SPEC_UX_NUEVA_FACTURA_v0.1, E.1). */
export function estadoSimpleTexto(documento: DocumentoResponse): string {
  return getSimpleDocumentoEstado(documento.estado, documento.tipo).replace(/^[^\p{L}]+/u, "");
}

export function iconoAccion(documento: DocumentoResponse): { nombre: NombreIcono; clase: string } {
  if (documento.estado === "ANULADA" || documento.estado === "CANCELADO_LOCAL") return { nombre: "alerta", clase: "neutro" };
  switch (documento.accion) {
    case "OK":
      return { nombre: "tilde", clase: "ok" };
    case "EN_PROCESO":
      return { nombre: "reloj", clase: "proceso" };
    case "REQUIERE_ACCION":
      return { nombre: "alerta", clase: "accion" };
    case "REQUIERE_SOPORTE":
      return { nombre: "alerta", clase: "soporte" };
    default:
      if (documento.estado === "EMITIDA") return { nombre: "tilde", clase: "ok" };
      if (documento.estado === "RECHAZADA" || documento.estado === "ERROR_OPERATIVO" || documento.estado === "ERROR_TEMPORAL") return { nombre: "alerta", clase: "soporte" };
      return { nombre: "reloj", clase: "proceso" };
  }
}

/** SPEC_UX_NUEVA_FACTURA_v0.1, C: pantalla posterior a "Crear factura" (PLAN 5). */
export function ResultadoEmision({
  context,
  deliveryLink,
  deliveryLoading,
  deliveryMessage,
  documento,
  emailStatus,
  emitting,
  onCompartir,
  onCopiar,
  onCrearNueva,
  onRegenerarEnlace,
  onReintentar,
  onVerDocumentos,
  onVerificar,
  setWhatsappPhone,
  whatsappPhone
}: {
  context: OperationalContextResponse | null;
  deliveryLink: DeliveryLinkResponse | null;
  deliveryLoading: boolean;
  deliveryMessage: string | null;
  documento: DocumentoResponse;
  emailStatus: EmailStatusResponse | null;
  emitting: boolean;
  onCompartir: () => void;
  onCopiar: () => void;
  onCrearNueva: () => void;
  onRegenerarEnlace: () => void;
  onReintentar: () => void;
  onVerDocumentos?: () => void;
  onVerificar: () => void;
  setWhatsappPhone: (value: string) => void;
  whatsappPhone: string;
}) {
  const moneda = documento.moneda ?? "PYG";
  const total = formatMonto(documento.totals.total, moneda);
  const operador = documento.emitido_por?.display_name?.trim() || documento.emitido_por?.username || context?.user.display_name?.trim() || context?.user.username || "";
  const hora = formatHora(documento.created_at);
  const pasos = pasosPorEstado(documento.estado);
  const icono = iconoAccion(documento);
  const titulo = documento.accion_detalle?.titulo ?? estadoSimpleTexto(documento);
  const descripcion = documento.accion_detalle?.descripcion ?? getSimpleDocumentoHint(documento.estado, documento.tipo);
  const estadoEmail = formatEmailStatus(emailStatus?.status ?? documento.delivery.email_status);
  const conCorreo = Boolean(documento.cliente.email?.trim());
  const kudeUrl = deliveryLink && documento.delivery.artifacts.kude_pdf.available ? `${deliveryLink.public_url}/kude.pdf` : null;
  const xmlUrl = deliveryLink && documento.delivery.artifacts.xml.available ? `${deliveryLink.public_url}/xml` : null;
  const equivalenteGs =
    moneda !== "PYG" && documento.tipo_cambio ? formatGuaranies(documento.totals.total_guaranies ?? Math.round(documento.totals.total * documento.tipo_cambio)) : null;
  const items = documento.items ?? [];
  const nombreTipo = getDocumentoNombreLower(documento.tipo);
  // SPEC_AJUSTES_TEXTOS_OPERADOR_v0.1, A-2: el titulo y el boton dicen el tipo del documento.
  const nombreTitulo = nombreTipo.charAt(0).toUpperCase() + nombreTipo.slice(1);

  const esRemision = documento.tipo === "NOTA_REMISION";
  // SPEC_DESCUENTOS_FACTURA_v0.1 RN-19: columna "Descuento" solo si alguna linea lo tiene.
  const conDescuentoPorLinea = (documento.items ?? []).some((item) => (item.descuento ?? 0) > 0);
  const traslado = esRemision && documento.remision?.motivo === 7;
  return (
    <div className="resultado-emision" aria-live="polite">
      <div className="editor-heading">
        <div>
          <h2 id="invoice-title">{documento.numero_fiscal ? `${nombreTitulo} ${documento.numero_fiscal}` : `${nombreTitulo} creada · número pendiente`}</h2>
          <p className="muted editor-subtitulo">
            Creada hoy{hora ? ` ${hora}` : ""}{operador ? ` por ${operador}` : ""} · {documento.cliente.razon_social}{esRemision ? "" : ` · ${total}`}
          </p>
        </div>
        <div className="header-actions">
          {onVerDocumentos ? (
            <button className="ghost-action" onClick={onVerDocumentos} type="button">
              Ver en Documentos
            </button>
          ) : null}
          <button className="primary-action con-icono" onClick={onCrearNueva} type="button">
            <Icono nombre="mas" tamano={16} grosor={2.5} /> Crear nueva {nombreTipo}
          </button>
        </div>
      </div>

      <section className={`estado-fiscal ${icono.clase}`} aria-label="Estado fiscal">
        <div className="estado-fiscal-titulo">
          <span className="estado-fiscal-icono" aria-hidden="true"><Icono nombre={icono.nombre} tamano={20} /></span>
          <div>
            <strong>{titulo}</strong>
            <span className="muted">{descripcion}</span>
          </div>
        </div>
        <ol className="pasos" aria-label="Pasos de la emisión">
          {pasos.map((paso, indice) => (
            <li className={`paso ${paso.clase}`} key={paso.etiqueta}>
              <span className="paso-punto" aria-hidden="true">{paso.clase === "hecho" ? <Icono nombre="tilde" tamano={14} grosor={3} /> : null}</span>
              <span className="paso-texto">{paso.etiqueta}</span>
              {indice < pasos.length - 1 ? <span className="paso-linea" aria-hidden="true" /> : null}
            </li>
          ))}
        </ol>
        <span className={documento.estado === "EMITIDA" ? "status-pill ready" : "status-pill blocked"} data-estado={documento.estado}>{estadoSimpleTexto(documento)}</span>
      </section>

      <div className="resultado-cuerpo">
        <section className="resultado-resumen" aria-label={esRemision ? "Resumen de la nota de remisión" : "Resumen de la factura"}>
          <div className="resultado-datos">
            <div>
              <dt>Cliente</dt>
              <dd>{documento.cliente.razon_social}</dd>
              <small>{esClienteInnominado(documento.cliente) ? "Sin nombre (consumidor final)" : `${documento.cliente.documento_tipo} ${documento.cliente.documento}`}{documento.cliente.naturaleza ? ` · ${documento.cliente.naturaleza === "JURIDICA" ? "Jurídica" : "Física"}` : ""}</small>
            </div>
            {/* SPEC_NOTA_REMISION_v0.1 RN-20: la nota de remision no tiene montos; muestra motivo y traslado. */}
            {esRemision ? (
              <>
                <div>
                  <dt>Motivo</dt>
                  <dd>{documento.remision?.motivo_descripcion ?? "—"}</dd>
                  <small>{documento.remision?.transportista ?? ""}</small>
                </div>
                <div>
                  <dt>Traslado</dt>
                  <dd>
                    {documento.remision?.inicio_traslado ?? "—"}
                    {documento.remision?.fin_traslado && documento.remision.fin_traslado !== documento.remision.inicio_traslado ? ` a ${documento.remision.fin_traslado}` : ""}
                  </dd>
                  <small>{[documento.remision?.kilometros ? `${documento.remision.kilometros} km` : null, documento.remision?.vehiculo].filter(Boolean).join(" · ")}</small>
                </div>
              </>
            ) : (
              <>
                <div>
                  <dt>Condición</dt>
                  <dd>{etiquetaCondicionVenta(documento.condicion_venta)}</dd>
                  <small>{context?.fiscal_context.actividad_economica_descripcion ?? ""}</small>
                </div>
                <div>
                  <dt>Moneda</dt>
                  <dd>{moneda}</dd>
                  <small>{documento.tipo_cambio ? `Cambio ${String(documento.tipo_cambio).replace(".", ",")} Gs. por 1 ${moneda}` : "Guaranies"}</small>
                </div>
                <div className="resultado-total">
                  <dt>Total a pagar</dt>
                  <dd className="cifra">{total}</dd>
                  {equivalenteGs ? <small className="cifra">{equivalenteGs}</small> : null}
                </div>
              </>
            )}
          </div>
          {items.length > 0 ? (
            <div className="resultado-lineas-wrap">
              <table className="resultado-lineas">
                <thead>
                  <tr>
                    <th className="col-numero">#</th>
                    <th>Descripción</th>
                    <th className="cifra">Cantidad</th>
                    {esRemision ? null : (
                      <>
                        <th className="cifra">Precio</th>
                        {conDescuentoPorLinea ? <th className="cifra">Descuento</th> : null}
                        <th>IVA</th>
                        <th className="cifra">Subtotal</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, indice) => (
                    <tr key={`${item.line_no ?? indice}-${item.descripcion}`}>
                      <td className="col-numero">{indice + 1}</td>
                      <td>{item.descripcion}{item.codigo ? <small className="muted"> · {item.codigo}</small> : null}</td>
                      <td className="cifra">{formatCantidad(item.cantidad)}</td>
                      {esRemision ? null : (
                        <>
                          <td className="cifra">{formatMonto(item.precio_unitario, moneda).replace(/^(Gs\.|[A-Z]{3}) /, "")}</td>
                          {conDescuentoPorLinea ? <td className="cifra">{(item.descuento ?? 0) > 0 ? formatMonto(item.descuento!, moneda).replace(/^(Gs\.|[A-Z]{3}) /, "") : "—"}</td> : null}
                          <td>{formatIva(item.iva_tipo)}</td>
                          <td className="cifra">{formatMonto(item.subtotal, moneda).replace(/^(Gs\.|[A-Z]{3}) /, "")}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {esRemision ? null : <div className="resultado-totales">
            {/* SPEC_DESCUENTOS_FACTURA_v0.1 RN-19b: el mismo desglose que el editor. */}
            {desgloseDescuentos(documento.totals).map((fila) => (
              <div className={fila.cierre ? "descuento-cierre" : "descuento-parcial"} key={fila.etiqueta}><span>{fila.etiqueta}</span><strong className="cifra">− {formatMonto(fila.monto, moneda)}</strong></div>
            ))}
            <div><span>Total sin IVA</span><strong className="cifra">{formatMonto(documento.totals.total_sin_iva, moneda)}</strong></div>
            <div><span>IVA 5%</span><strong className="cifra">{formatMonto(documento.totals.iva_5, moneda)}</strong></div>
            <div><span>IVA 10%</span><strong className="cifra">{formatMonto(documento.totals.iva_10, moneda)}</strong></div>
            <div><span>Total IVA</span><strong className="cifra">{formatMonto(documento.totals.total_iva, moneda)}</strong></div>
          </div>}
          <p className="muted resultado-cdc">
            {documento.cdc ? <span title={documento.cdc}>CDC {documento.cdc.slice(0, 8)}…{documento.cdc.slice(-4)}</span> : "CDC pendiente hasta la aprobación"}
            {" · el enlace público siempre entrega la versión vigente del XML y el KUDE"}
          </p>
        </section>

        <aside className="resultado-entrega" aria-label={traslado ? "Descargar para el traslado" : "Entregar al cliente"}>
          <section className="form-section">
            {/* SPEC_NOTA_REMISION_v0.1 RN-20: con motivo 7 el destinatario es el propio emisor; no hay a quien entregar. */}
            <h3>{traslado ? "Descargar para el traslado" : "Entregar al cliente"}</h3>
            {traslado ? (
              <p className="muted">La mercadería va a otro local tuyo: imprimí o descargá el KUDE para que acompañe el traslado.</p>
            ) : (
              <p className="muted">
                {conCorreo
                  ? `Correo a ${documento.cliente.email}: ${estadoEmail}.`
                  : `${documento.cliente.razon_social} no tiene correo en la agenda. Envia por WhatsApp o copia el enlace.`}
              </p>
            )}
            {!traslado && emailStatus?.message ? <p className="editor-alert ready">{emailStatus.message}</p> : null}
            {traslado ? null : (
            <>
            <label className="campo-whatsapp">
              Número de WhatsApp
              <span className="campo-prefijo">
                <span>+595</span>
                <input inputMode="tel" onChange={(event) => setWhatsappPhone(event.target.value)} placeholder="981 123 456" value={whatsappPhone} />
              </span>
            </label>
            <a
              className={deliveryLink ? "primary-action wide con-icono secondary-link-as-button" : "primary-action wide con-icono secondary-link-as-button disabled"}
              href={deliveryLink ? buildWhatsAppShareUrl(deliveryLink.public_url, whatsappPhone) : "#"}
              rel="noreferrer"
              target="_blank"
            >
              <Icono nombre="whatsapp" tamano={16} /> Enviar por WhatsApp
            </a>
            </>
            )}
            <div className="delivery-actions">
              <button className="secondary-action con-icono" disabled={!deliveryLink} onClick={onCopiar} type="button">
                <Icono nombre="copiar" tamano={16} /> Copiar enlace
              </button>
              <button aria-label={`Compartir ${nombreTipo}`} className="secondary-action con-icono" disabled={!deliveryLink} onClick={onCompartir} type="button">
                <Icono nombre="compartir" tamano={16} /> Compartir
              </button>
            </div>
            {kudeUrl ? (
              <a className="secondary-link con-icono" href={kudeUrl} rel="noreferrer" target="_blank">
                <Icono nombre="pdf" tamano={16} /> Ver KUDE en PDF
              </a>
            ) : (
              <button className="secondary-action con-icono" disabled title="Disponible cuando SIFEN apruebe la factura" type="button">
                <Icono nombre="pdf" tamano={16} /> Ver KUDE en PDF (al aprobar)
              </button>
            )}
            {deliveryMessage ? <p className="inline-message">{deliveryMessage}</p> : null}
          </section>

          <details className="form-section mas-opciones">
            <summary className="group-title">Más opciones</summary>
            <div className="result-actions">
              <a className={xmlUrl ? "secondary-link" : "secondary-link disabled"} href={xmlUrl ?? "#"} rel="noreferrer" target="_blank">
                Descargar documento electrónico (XML)
              </a>
              <button className="secondary-action" disabled={deliveryLoading} onClick={onRegenerarEnlace} type="button">
                Regenerar enlace
              </button>
              {(documento.document_uuid || documento.cdc) && !esEstadoFinalOperador(documento.estado) ? (
                <button className="secondary-action" disabled={emitting} onClick={onVerificar} type="button">
                  Verificar estado fiscal
                </button>
              ) : null}
              {documento.puede_reintentar_emision ? (
                <button className="secondary-action" disabled={emitting} onClick={onReintentar} type="button">
                  Reintentar emisión
                </button>
              ) : null}
            </div>
          </details>
        </aside>
      </div>
    </div>
  );
}

export function getSimpleDocumentoHint(value: DocumentoEstado, tipo?: DocumentoResponse["tipo"]): string {
  const nombre = formatDocumentoTipo(tipo ?? "FACTURA");
  if (value === "EMITIDA") {
    return `${nombre} lista para enviar por WhatsApp, compartir enlace o abrir PDF.`;
  }
  if (value === "RECHAZADA" || value === "ERROR_OPERATIVO" || value === "ERROR_TEMPORAL" || value === "ANULADA" || value === "CANCELADO_LOCAL") {
    return "El documento requiere revisión antes de continuar.";
  }
  return `Estamos procesando la ${nombre.toLowerCase()}. Podés compartir el enlace al cliente.`;
}
