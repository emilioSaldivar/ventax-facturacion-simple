// Notas de credito con el patron de Nueva factura (SPEC_UX_RESTO_APP_v0.1 B.1, RN-03, RN-04, RN-07; PLAN §4, URA-005):
// encabezado, pestañas, tarjetas (factura, que se devuelve, motivo) y panel fijo con el total y "Emitir"; al emitir,
// el resultado reemplaza al formulario. El cuerpo del pedido es el de antes: total {motivo}, parcial {motivo, lineas}
// (linea de base en scripts/segel-fs/nc-cuerpo.base.json); por monto {motivo, monto, motivo_codigo}
// (SPEC_NOTA_CREDITO_POR_MONTO_v0.1).
import { useEffect, useState } from "react";
import { useApi } from "../api/useApi";
import { Aviso, type TonoAviso } from "../components/Aviso";
import { AvisoPuntoDistinto } from "../components/AvisoPuntoDistinto";
import { CampoFormulario } from "../components/CampoFormulario";
import { NotaCreditoPorMonto, pedidoNotaCreditoMonto } from "../components/NotaCreditoPorMonto";
import { EncabezadoPantalla } from "../components/EncabezadoPantalla";
import { EstadoVacio } from "../components/EstadoVacio";
import { FacturaExternaView } from "./FacturaExternaView";
import { PastillaEstado } from "../components/PastillaEstado";
import { ResultadoEmision } from "../components/ResultadoEmision";
import { useBorradorSinEmitir } from "../lib/borradores";
import { mensajeNotaCredito } from "../lib/documentos";
import { estadoDocumento, etiquetaCondicionVenta } from "../lib/estados";
import { cantidadValida, formatCantidad, formatMonto, formatShortDate, normalizeDecimalInput } from "../lib/formato";
import { actividadPunto, nombrePunto, numeroConPunto } from "../lib/punto";
import { modoInicialNotaCredito, type ModoNotaCredito, type MotivoCodigoMonto } from "../lib/notaCreditoMonto";
import { useEntregaDocumento } from "../lib/useEntregaDocumento";
import type {
  DocumentoListResponse,
  DocumentoResponse,
  NotaCreditoCandidate,
  NotaCreditoCandidateListResponse,
  NotaCreditoSaldoResponse,
  OperationalContextResponse
} from "../tipos";

type Modo = ModoNotaCredito;

/** Importe de una cantidad de una linea, redondeado como lo muestra el resto de la app. */
function importeLinea(cantidad: number, precio: number, moneda: string): number {
  const bruto = cantidad * precio;
  return moneda === "PYG" ? Math.round(bruto) : Math.round(bruto * 100) / 100;
}

export function CreditNoteView({
  context,
  mostrarPunto = false,
  onBack,
  onVerEmitidas,
  onFacturaExternaGuardada
}: {
  context?: OperationalContextResponse | null;
  mostrarPunto?: boolean;
  onBack: () => void;
  /** Abre Documentos en la pestaña de notas de credito. */
  onVerEmitidas?: () => void;
  /** SPEC_NOTA_CREDITO_FACTURA_EXTERNA_v0.1 (PLAN 7): abre la ficha de la factura externa recien guardada. */
  onFacturaExternaGuardada?: (documento: DocumentoResponse) => void;
}) {
  const api = useApi();
  const entrega = useEntregaDocumento(api);
  const [candidates, setCandidates] = useState<NotaCreditoCandidate[]>([]);
  const [selected, setSelected] = useState<NotaCreditoCandidate | null>(null);
  const [saldo, setSaldo] = useState<NotaCreditoSaldoResponse | null>(null);
  const [saldoError, setSaldoError] = useState<string | null>(null);
  const [modo, setModo] = useState<Modo>("TOTAL");
  const [cantidades, setCantidades] = useState<Record<number, string>>({});
  const [montoTexto, setMontoTexto] = useState("");
  const [motivoCodigo, setMotivoCodigo] = useState<MotivoCodigoMonto>(3);
  const [query, setQuery] = useState("");
  const [motivo, setMotivo] = useState("");
  const [loading, setLoading] = useState(false);
  const [emitting, setEmitting] = useState(false);
  const [emitidas, setEmitidas] = useState<number | null>(null);
  // URA-017: el tono del aviso se decide donde se produce el mensaje, no buscando "emitida" en el texto.
  const [aviso, setAviso] = useState<{ tono: TonoAviso; texto: string } | null>(null);
  const [traerExterna, setTraerExterna] = useState(false);
  // SPEC_MULTIPERFIL_USUARIO_v0.1 RN-06: una factura elegida con motivo y sin NC emitida es un borrador.
  useBorradorSinEmitir("nota-credito", () => Boolean(selected && !entrega.documento && motivo.trim()));

  useEffect(() => {
    void loadCandidates();
    // B.1: "Emitidas · N" con el total de la lista, sin contrato nuevo.
    api
      .get<DocumentoListResponse>("/facturas?tipo=NOTA_CREDITO&limit=1&offset=0")
      .then((r) => setEmitidas(r.total))
      .catch(() => setEmitidas(null));
  }, []);

  async function loadCandidates(nextQuery = query) {
    setLoading(true);
    setAviso(null);
    const params = new URLSearchParams({ limit: "30", offset: "0" });
    if (nextQuery.trim()) {
      params.set("q", nextQuery.trim());
    }
    try {
      const response = await api.get<NotaCreditoCandidateListResponse>(`/facturas/nce-candidatas?${params.toString()}`);
      setCandidates(response.items);
    } catch (error) {
      setAviso({ tono: "error", texto: error instanceof Error ? error.message : "No se pudieron cargar facturas candidatas." });
    } finally {
      setLoading(false);
    }
  }

  function elegir(candidate: NotaCreditoCandidate) {
    setSelected(candidate);
    setAviso(null);
    setSaldo(null);
    setSaldoError(null);
    setModo("TOTAL");
    setCantidades({});
    setMontoTexto("");
    setMotivoCodigo(3);
    if (!candidate.elegible) return;
    api
      .get<NotaCreditoSaldoResponse>(`/facturas/${candidate.documento.id}/nota-credito/saldo`)
      .then((s) => {
        setSaldo(s);
        setModo(modoInicialNotaCredito(s));
      })
      .catch((error) => setSaldoError(error instanceof Error ? error.message : "No se pudo cargar el saldo de la factura."));
  }

  function cambiarFactura() {
    setSelected(null);
    setSaldo(null);
    setSaldoError(null);
    setCantidades({});
    setMontoTexto("");
    setAviso(null);
  }

  /** Lineas pedidas en modo parcial, con el mismo control que el modal de Documentos (RN-01 en pantalla). */
  function lineasParciales(): { lineas: Array<{ line_no: number; cantidad: number }>; error: string | null } {
    if (!saldo) return { lineas: [], error: "No se pudo cargar el saldo de la factura." };
    const lineas: Array<{ line_no: number; cantidad: number }> = [];
    for (const linea of saldo.lineas) {
      const texto = cantidades[linea.line_no]?.trim();
      if (!texto) continue;
      const cantidad = Number(texto);
      if (!cantidadValida(cantidad)) return { lineas, error: `Línea ${linea.line_no}: cantidad no válida (hasta 4 decimales).` };
      if (cantidad > linea.saldo + 1e-9) return { lineas, error: `Línea ${linea.line_no}: supera el saldo (${formatCantidad(linea.saldo)}).` };
      lineas.push({ line_no: linea.line_no, cantidad });
    }
    if (lineas.length === 0) return { lineas, error: "Indicá la cantidad a devolver en al menos una línea." };
    return { lineas, error: null };
  }

  const moneda = saldo?.moneda ?? selected?.documento.moneda ?? "PYG";
  const pedidoMonto = modo === "MONTO" && saldo ? pedidoNotaCreditoMonto(saldo, montoTexto) : null;
  // Por monto el saldo es el neto de FE (SPEC_NOTA_CREDITO_POR_MONTO_v0.1, D-3); por lineas, el de siempre.
  const saldoTotal = !saldo
    ? 0
    : modo === "MONTO"
      ? saldo.monto.saldo
      : saldo.lineas.reduce((suma, l) => suma + importeLinea(l.saldo, l.precio_unitario, moneda), 0);
  const aDevolver =
    modo === "TOTAL"
      ? selected?.documento.totals.total ?? 0
      : modo === "MONTO"
        ? pedidoMonto?.monto ?? 0
        : saldo
        ? saldo.lineas.reduce((suma, l) => {
            const cantidad = Number(cantidades[l.line_no] || 0);
            return suma + (Number.isFinite(cantidad) ? importeLinea(cantidad, l.precio_unitario, moneda) : 0);
          }, 0)
        : 0;
  const queda = Math.max(0, saldoTotal - aDevolver);
  const parcial = modo === "PARCIAL" ? lineasParciales() : null;

  // RN-04 de SPEC_UX_NUEVA_FACTURA: el boton dice por que no se puede emitir.
  const bloqueo = !selected
    ? "Elegí la factura a devolver."
    : !selected.elegible
      ? selected.motivo_no_elegible ?? "La factura no admite nota de crédito."
      : saldoError
        ? saldoError
        : !saldo
          ? "Cargando el saldo de la factura..."
          : !saldo.admite_total && !saldo.admite_parcial && !saldo.monto.admite
            ? saldo.monto.motivo_no_admite ?? saldo.motivo_no_parcial ?? "La factura no admite nota de crédito."
            : parcial?.error
              ? parcial.error
              : pedidoMonto?.error
                ? pedidoMonto.error
                : !motivo.trim()
                  ? "Escribí el motivo."
                  : null;

  async function emitNotaCredito() {
    if (!selected || bloqueo) {
      if (bloqueo) setAviso({ tono: "atencion", texto: bloqueo });
      return;
    }
    setEmitting(true);
    setAviso(null);
    const cuerpo =
      modo === "PARCIAL" && parcial
        ? { motivo: motivo.trim(), lineas: parcial.lineas }
        : modo === "MONTO" && pedidoMonto?.monto
          ? { motivo: motivo.trim(), monto: pedidoMonto.monto, motivo_codigo: motivoCodigo }
          : { motivo: motivo.trim() };
    try {
      const notaCredito = await api.request<DocumentoResponse>(`/facturas/${selected.documento.id}/nota-credito`, {
        method: "POST",
        body: JSON.stringify(cuerpo)
      });
      entrega.setDocumento(notaCredito);
      setEmitidas((n) => (n === null ? n : n + 1));
    } catch (error) {
      setAviso({ tono: "error", texto: error instanceof Error ? error.message : "No se pudo emitir la nota de crédito." });
    } finally {
      setEmitting(false);
    }
  }

  function nuevaNota() {
    entrega.setDocumento(null);
    setMotivo("");
    cambiarFactura();
    void loadCandidates();
  }

  const fc = context?.fiscal_context;
  const seEmitePor = fc ? `Se emite por el ${[nombrePunto(fc), actividadPunto(fc)].filter(Boolean).join(" · ")}` : null;

  if (traerExterna && context) {
    return (
      <FacturaExternaView
        context={context}
        onCancelar={() => setTraerExterna(false)}
        onGuardada={(documento) => {
          setTraerExterna(false);
          onFacturaExternaGuardada?.(documento);
        }}
      />
    );
  }

  if (entrega.documento) {
    return (
      <section className="nc-espacio" aria-labelledby="credit-note-title">
        <EncabezadoPantalla id="credit-note-title" onVolver={onBack} subtitulo={seEmitePor} titulo="Notas de crédito" />
        {entrega.deliveryMessage ? <Aviso tono="info">{entrega.deliveryMessage}</Aviso> : null}
        {/* RN-04: el resultado reemplaza al formulario, con los pasos y la entrega, como en Nueva factura. */}
        <Aviso tono={entrega.documento.estado === "EMITIDA" ? "exito" : entrega.documento.estado === "RECHAZADA" ? "error" : "atencion"}>
          {mensajeNotaCredito(entrega.documento)}
        </Aviso>
        <ResultadoEmision
          context={context ?? null}
          deliveryLink={entrega.deliveryLink}
          deliveryLoading={entrega.deliveryLoading}
          deliveryMessage={entrega.deliveryMessage}
          documento={entrega.documento}
          emailStatus={entrega.emailStatus}
          emitting={entrega.ocupado}
          onCompartir={() => void entrega.compartir()}
          onCopiar={() => void entrega.copiar()}
          onCrearNueva={nuevaNota}
          onRegenerarEnlace={() => void entrega.regenerarEnlace()}
          onReintentar={() => void entrega.reintentar()}
          onVerDocumentos={onVerEmitidas}
          onVerificar={() => void entrega.verificar()}
          setWhatsappPhone={entrega.setWhatsappPhone}
          whatsappPhone={entrega.whatsappPhone}
        />
      </section>
    );
  }

  return (
    <section className="nc-espacio" aria-labelledby="credit-note-title">
      <EncabezadoPantalla
        id="credit-note-title"
        onVolver={onBack}
        subtitulo={["Devolución total o parcial, o un monto, de una factura aprobada", seEmitePor].filter(Boolean).join(" · ")}
        titulo="Notas de crédito"
      />
      <div className="nc-pestanas" role="group" aria-label="Notas de crédito">
        <button aria-pressed="true" className="active" type="button">
          Nueva nota de crédito
        </button>
        <button aria-pressed="false" onClick={onVerEmitidas} type="button">
          Emitidas{emitidas !== null ? ` · ${emitidas}` : ""}
        </button>
      </div>
      {aviso ? <Aviso tono={aviso.tono}>{aviso.texto}</Aviso> : null}

      <div className="nc-grilla">
        <div className="nc-columna">
          <section className="nc-tarjeta" aria-labelledby="nc-factura-titulo">
            <h3 id="nc-factura-titulo">Factura a devolver</h3>
            {selected ? (
              <div className="nc-factura-elegida">
                <div className="nc-factura-datos">
                  <strong>{numeroConPunto(selected.documento, mostrarPunto) ?? "Número pendiente"}</strong>
                  <span>{selected.documento.cliente.razon_social} · {selected.documento.cliente.documento}</span>
                  <span className="muted">
                    {formatShortDate(selected.documento.created_at)} · {etiquetaCondicionVenta(selected.documento.condicion_venta)} ·{" "}
                    {formatMonto(selected.documento.totals.total, selected.documento.moneda)}
                  </span>
                </div>
                <PastillaEstado {...estadoDocumento(selected.documento)} />
                <button className="enlace-accion" onClick={cambiarFactura} type="button">
                  Cambiar factura
                </button>
              </div>
            ) : (
              <>
                <div className="nc-busqueda">
                  <CampoFormulario etiqueta="Buscar factura">
                    <input
                      onChange={(event) => setQuery(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") void loadCandidates();
                      }}
                      placeholder="Cliente, documento, número o total"
                      value={query}
                    />
                  </CampoFormulario>
                  <button className="secondary-action" disabled={loading} onClick={() => void loadCandidates()} type="button">
                    {loading ? "Buscando..." : "Buscar"}
                  </button>
                </div>
                {onFacturaExternaGuardada ? (
                  <button className="enlace-accion nc-traer-externa" onClick={() => setTraerExterna(true)} type="button">
                    ¿La factura no está en el sistema? Traela por CDC o cargala a mano
                  </button>
                ) : null}
                <div className="documents-list nc-candidatas">
                  {candidates.length === 0 && !loading ? <EstadoVacio>Sin facturas para los filtros actuales.</EstadoVacio> : null}
                  {candidates.map((candidate) => (
                    <button className="document-row" key={candidate.documento.id} onClick={() => elegir(candidate)} type="button">
                      <span>
                        {/* URA-021 (H-08): con varios puntos, cada factura dice de que punto es. */}
                        <strong>{numeroConPunto(candidate.documento, mostrarPunto) ?? "Número pendiente"}</strong>
                        <small>{candidate.documento.cliente.razon_social}</small>
                      </span>
                      <span>
                        <strong>{formatMonto(candidate.documento.totals.total, candidate.documento.moneda)}</strong>
                        <small>{candidate.elegible ? "Elegible" : candidate.motivo_no_elegible}</small>
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
            {selected ? (
              /* SPEC_MULTIPERFIL_USUARIO_v0.1 RN-05 / D-1: la NC sale por el punto activo; se avisa si difiere. */
              <AvisoPuntoDistinto perfilDocumento={selected.documento.perfil_emision} puntoActivo={context?.fiscal_context} />
            ) : null}
          </section>

          {selected && selected.elegible ? (
            <section className="nc-tarjeta" aria-labelledby="nc-que-titulo">
              <h3 id="nc-que-titulo">Qué se devuelve</h3>
              {saldoError ? <Aviso tono="error">{saldoError}</Aviso> : null}
              {saldo ? (
                <>
                  <div className="segmented-control nc-modo" role="group" aria-label="Tipo de nota de crédito">
                    <button
                      aria-pressed={modo === "TOTAL"}
                      className={modo === "TOTAL" ? "active" : ""}
                      disabled={!saldo.admite_total}
                      onClick={() => setModo("TOTAL")}
                      title={saldo.admite_total ? undefined : "La factura ya tiene notas de crédito"}
                      type="button"
                    >
                      Toda la factura
                    </button>
                    <button
                      aria-pressed={modo === "PARCIAL"}
                      className={modo === "PARCIAL" ? "active" : ""}
                      disabled={!saldo.admite_parcial}
                      onClick={() => setModo("PARCIAL")}
                      title={saldo.motivo_no_parcial ?? undefined}
                      type="button"
                    >
                      Algunas líneas
                    </button>
                    <button
                      aria-pressed={modo === "MONTO"}
                      className={modo === "MONTO" ? "active" : ""}
                      disabled={!saldo.monto.admite}
                      onClick={() => setModo("MONTO")}
                      title={saldo.monto.motivo_no_admite ?? undefined}
                      type="button"
                    >
                      Un monto
                    </button>
                  </div>
                  {modo === "MONTO" ? (
                    <NotaCreditoPorMonto
                      montoTexto={montoTexto}
                      motivoCodigo={motivoCodigo}
                      onMontoTexto={setMontoTexto}
                      onMotivoCodigo={setMotivoCodigo}
                      saldo={saldo}
                    />
                  ) : (
                  <div className="nc-lineas-wrap">
                    <table className="nc-lineas">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Descripción</th>
                          <th className="numero nc-col-secundaria">Facturado</th>
                          <th className="numero nc-col-secundaria">Ya devuelto</th>
                          <th className="numero">Devolver</th>
                          <th className="numero">Importe</th>
                        </tr>
                      </thead>
                      <tbody>
                        {saldo.lineas.map((linea) => {
                          const cantidad = modo === "TOTAL" ? linea.saldo : Number(cantidades[linea.line_no] || 0);
                          return (
                            <tr key={linea.line_no}>
                              <td>{linea.line_no}</td>
                              <td>{linea.descripcion}</td>
                              <td className="numero nc-col-secundaria">{formatCantidad(linea.cantidad_facturada)}</td>
                              <td className="numero nc-col-secundaria">{formatCantidad(linea.cantidad_acreditada)}</td>
                              <td className="numero">
                                {modo === "PARCIAL" ? (
                                  <input
                                    aria-label={`Cantidad a devolver, línea ${linea.line_no}`}
                                    disabled={linea.saldo <= 0}
                                    inputMode="decimal"
                                    onChange={(event) =>
                                      setCantidades((actual) => ({ ...actual, [linea.line_no]: normalizeDecimalInput(event.target.value, 4) }))
                                    }
                                    placeholder={linea.saldo > 0 ? `máx. ${formatCantidad(linea.saldo)}` : "sin saldo"}
                                    value={(cantidades[linea.line_no] ?? "").replace(".", ",")}
                                  />
                                ) : (
                                  formatCantidad(linea.saldo)
                                )}
                              </td>
                              <td className="numero">{formatMonto(Number.isFinite(cantidad) ? importeLinea(cantidad, linea.precio_unitario, moneda) : 0, moneda)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  )}
                </>
              ) : !saldoError ? (
                <p className="muted">Cargando el saldo de la factura...</p>
              ) : null}
            </section>
          ) : null}

          {selected && selected.elegible ? (
            <section className="nc-tarjeta" aria-labelledby="nc-motivo-titulo">
              <h3 id="nc-motivo-titulo">Motivo</h3>
              <CampoFormulario ayuda="El cliente lo ve en la nota de crédito." className="credit-note-motivo" etiqueta="Motivo (detalle para el cliente)">
                <textarea maxLength={150} onChange={(event) => setMotivo(event.target.value)} rows={3} value={motivo} />
              </CampoFormulario>
            </section>
          ) : null}
        </div>

        <aside className="nc-panel" aria-labelledby="nc-resumen-titulo">
          <h3 id="nc-resumen-titulo">Resumen</h3>
          <dl className="nc-totales">
            <div>
              <dt>{modo === "MONTO" ? "Monto a acreditar" : `Total a devolver${modo === "PARCIAL" ? " (estimado)" : ""}`}</dt>
              <dd className="nc-total">{formatMonto(aDevolver, moneda)}</dd>
            </div>
            {saldo ? (
              <div>
                <dt>Queda por devolver</dt>
                <dd>{formatMonto(queda, moneda)}</dd>
              </div>
            ) : null}
          </dl>
          <button className="primary-action wide" disabled={emitting || Boolean(bloqueo)} onClick={() => void emitNotaCredito()} type="button">
            {emitting ? "Emitiendo..." : "Emitir nota de crédito"}
          </button>
          {bloqueo && !emitting ? <p className="nc-bloqueo">{bloqueo}</p> : null}
          {seEmitePor ? <p className="muted nc-punto">{seEmitePor}</p> : null}
        </aside>
      </div>
    </section>
  );
}
