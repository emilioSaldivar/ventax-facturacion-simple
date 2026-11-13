// Notas de credito con el patron de Nueva factura (SPEC_UX_RESTO_APP_v0.1 B.1, RN-03, RN-04, RN-07; PLAN §4, URA-005):
// encabezado, pestañas, tarjetas (factura, que se acredita, motivo) y panel fijo con el total y "Emitir"; al emitir,
// el resultado reemplaza al formulario. SPEC_NOTA_CREDITO_UNIFICADA_v0.1 (PLAN 4): una sola grilla con devoluciones,
// acreditaciones por linea y sobre el total; la factura entera sin notas sigue por el cuerpo {motivo} (D-7) y lo
// demas va como pedido combinado. Desde la ficha de Documentos se llega con `facturaInicialId` (D-8).
import { useEffect, useMemo, useState } from "react";
import { useApi } from "../api/useApi";
import { Aviso, type TonoAviso } from "../components/Aviso";
import { AvisoPuntoDistinto } from "../components/AvisoPuntoDistinto";
import { CampoFormulario } from "../components/CampoFormulario";
import { NotaCreditoEditor } from "../components/NotaCreditoEditor";
import { EncabezadoPantalla } from "../components/EncabezadoPantalla";
import { EstadoVacio } from "../components/EstadoVacio";
import { FacturaExternaView } from "./FacturaExternaView";
import { PastillaEstado } from "../components/PastillaEstado";
import { ResultadoEmision } from "../components/ResultadoEmision";
import { useBorradorSinEmitir } from "../lib/borradores";
import { mensajeNotaCredito } from "../lib/documentos";
import { estadoDocumento, etiquetaCondicionVenta } from "../lib/estados";
import { formatMonto, formatShortDate } from "../lib/formato";
import { actividadPunto, nombrePunto, numeroConPunto } from "../lib/punto";
import {
  FORMULARIO_VACIO,
  MOTIVOS_NOTA_CREDITO,
  armarVistaPrevia,
  cuerpoNotaCredito,
  desglosePorTasa,
  esFacturaEntera,
  type FormularioNotaCredito,
  type MotivoCodigoNc
} from "../lib/notaCreditoUnificada";
import { useEntregaDocumento } from "../lib/useEntregaDocumento";
import type {
  DocumentoListResponse,
  DocumentoResponse,
  NotaCreditoCandidate,
  NotaCreditoCandidateListResponse,
  NotaCreditoSaldoResponse,
  OperationalContextResponse
} from "../tipos";

const ETIQUETA_TASA = { IVA_10: "IVA 10 %", IVA_5: "IVA 5 %", EXENTA: "Exento" } as const;

export function CreditNoteView({
  context,
  mostrarPunto = false,
  facturaInicialId = null,
  onBack,
  onVerEmitidas,
  onFacturaExternaGuardada
}: {
  context?: OperationalContextResponse | null;
  mostrarPunto?: boolean;
  /** D-8 (FS-77): "Crear nota de crédito" de la ficha abre esta pantalla con la factura elegida. */
  facturaInicialId?: string | null;
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
  const [form, setForm] = useState<FormularioNotaCredito>(FORMULARIO_VACIO);
  const [mostrarAcreditaciones, setMostrarAcreditaciones] = useState(false);
  // RN-07: null = el sugerido por lo cargado; el operador puede fijar otro.
  const [motivoCodigoElegido, setMotivoCodigoElegido] = useState<MotivoCodigoNc | null>(null);
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
    if (facturaInicialId) {
      api
        .get<DocumentoResponse>(`/facturas/${facturaInicialId}`)
        .then((documento) => {
          const elegible = documento.tipo === "FACTURA" && documento.estado === "EMITIDA";
          elegir({ documento, elegible, motivo_no_elegible: elegible ? null : "La factura no admite nota de crédito." });
        })
        .catch((error) => setAviso({ tono: "error", texto: error instanceof Error ? error.message : "No se pudo abrir la factura." }));
    }
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

  function limpiarPedido() {
    setForm(FORMULARIO_VACIO);
    setMostrarAcreditaciones(false);
    setMotivoCodigoElegido(null);
  }

  function elegir(candidate: NotaCreditoCandidate) {
    setSelected(candidate);
    setAviso(null);
    setSaldo(null);
    setSaldoError(null);
    limpiarPedido();
    if (!candidate.elegible) return;
    api
      .get<NotaCreditoSaldoResponse>(`/facturas/${candidate.documento.id}/nota-credito/saldo`)
      .then(setSaldo)
      .catch((error) => setSaldoError(error instanceof Error ? error.message : "No se pudo cargar el saldo de la factura."));
  }

  function cambiarFactura() {
    setSelected(null);
    setSaldo(null);
    setSaldoError(null);
    limpiarPedido();
    setAviso(null);
  }

  const moneda = saldo?.moneda ?? selected?.documento.moneda ?? "PYG";
  const vista = useMemo(() => (saldo ? armarVistaPrevia(saldo, form) : null), [saldo, form]);
  const armada = vista?.armada ?? null;
  const facturaEntera = saldo && vista ? esFacturaEntera(saldo, vista.pedido) : false;
  // RN-07: solo devoluciones 2, solo ajustes 3, mezcla 1; la factura entera va por la nota total, que manda 1.
  const motivoCodigo: MotivoCodigoNc = motivoCodigoElegido ?? armada?.motivo_sugerido ?? 2;
  const totalNota = facturaEntera ? saldo?.monto.saldo ?? 0 : armada?.total_redondeado ?? 0;
  const queda = saldo ? Math.max(0, Math.round((saldo.monto.saldo - totalNota) * 100) / 100) : 0;
  const desglose = armada ? desglosePorTasa(armada) : [];
  const sinSaldo = saldo ? saldo.monto.saldo <= 0 || (!saldo.admite_parcial && !saldo.monto.admite) : false;

  // RN-04 de SPEC_UX_NUEVA_FACTURA y RN-09: el boton dice por que no se puede emitir.
  const bloqueo = !selected
    ? "Elegí la factura."
    : !selected.elegible
      ? selected.motivo_no_elegible ?? "La factura no admite nota de crédito."
      : saldoError
        ? saldoError
        : !saldo || !armada
          ? "Cargando el saldo de la factura..."
          : sinSaldo
            ? saldo.monto.motivo_no_admite ?? saldo.motivo_no_parcial ?? "La factura no admite nota de crédito."
            : armada.errores.length > 0
              ? armada.errores[0]!.mensaje
              : totalNota <= 0
                ? "El total de la nota redondeado a 50 queda en cero."
                : !motivo.trim()
                  ? "Escribí el detalle para el cliente."
                  : null;

  async function emitNotaCredito() {
    if (!selected || !saldo || !vista || bloqueo) {
      if (bloqueo) setAviso({ tono: "atencion", texto: bloqueo });
      return;
    }
    setEmitting(true);
    setAviso(null);
    const cuerpo = cuerpoNotaCredito(saldo, vista.pedido, motivo.trim(), motivoCodigo);
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
        subtitulo={["Devolvé ítems o ajustá montos y porcentajes de una factura aprobada", seEmitePor].filter(Boolean).join(" · ")}
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
            <h3 id="nc-factura-titulo">Factura de la nota</h3>
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
              <h3 id="nc-que-titulo">Qué se devuelve o ajusta</h3>
              {saldoError ? <Aviso tono="error">{saldoError}</Aviso> : null}
              {saldo && armada ? (
                <>
                  {sinSaldo ? (
                    <Aviso tono="atencion">{saldo.monto.motivo_no_admite ?? saldo.motivo_no_parcial ?? "La factura no admite nota de crédito."}</Aviso>
                  ) : null}
                  {saldo.monto.fuente === "FS" && !selected.documento.origen ? (
                    <Aviso tono="atencion">No se pudo consultar el servicio fiscal: el saldo y el reparto se confirman al emitir.</Aviso>
                  ) : null}
                  <NotaCreditoEditor
                    armada={armada}
                    form={form}
                    mostrarAcreditaciones={mostrarAcreditaciones}
                    onForm={setForm}
                    onMostrarAcreditaciones={setMostrarAcreditaciones}
                    saldo={saldo}
                  />
                </>
              ) : !saldoError ? (
                <p className="muted">Cargando el saldo de la factura...</p>
              ) : null}
            </section>
          ) : null}

          {selected && selected.elegible ? (
            <section className="nc-tarjeta" aria-labelledby="nc-motivo-titulo">
              <h3 id="nc-motivo-titulo">Motivo</h3>
              <div className="nc-motivo-campos">
                <CampoFormulario
                  ayuda={facturaEntera ? "La nota de la factura entera sale con este motivo." : "Sugerido según lo que cargaste; podés cambiarlo."}
                  etiqueta="Motivo en SIFEN"
                >
                  <select
                    disabled={facturaEntera}
                    onChange={(event) => setMotivoCodigoElegido(Number(event.target.value) as MotivoCodigoNc)}
                    value={facturaEntera ? 1 : motivoCodigo}
                  >
                    {MOTIVOS_NOTA_CREDITO.map((m) => (
                      <option key={m.codigo} value={m.codigo}>
                        {m.etiqueta}
                      </option>
                    ))}
                  </select>
                </CampoFormulario>
                <CampoFormulario ayuda="El cliente lo ve en la nota de crédito." className="credit-note-motivo" etiqueta="Detalle para el cliente">
                  <textarea maxLength={150} onChange={(event) => setMotivo(event.target.value)} rows={3} value={motivo} />
                </CampoFormulario>
              </div>
            </section>
          ) : null}
        </div>

        <aside className="nc-panel" aria-labelledby="nc-resumen-titulo">
          <h3 id="nc-resumen-titulo">Resumen</h3>
          <dl className="nc-totales">
            {armada && !facturaEntera ? (
              <>
                <div>
                  <dt>Devolución de ítems</dt>
                  <dd>{formatMonto(armada.devolucion, moneda)}</dd>
                </div>
                <div>
                  <dt>Ajuste por ítem</dt>
                  <dd>{formatMonto(armada.acreditacion_lineas, moneda)}</dd>
                </div>
                <div>
                  <dt>Ajuste sobre el total</dt>
                  <dd>{formatMonto(armada.acreditacion_total, moneda)}</dd>
                </div>
                {armada.redondeo > 0 ? (
                  <div>
                    <dt>Redondeo SIFEN</dt>
                    <dd>− {formatMonto(armada.redondeo, moneda)}</dd>
                  </div>
                ) : null}
              </>
            ) : null}
            <div>
              <dt>{facturaEntera ? "Total de la nota (factura entera)" : "Total de la nota"}</dt>
              <dd className="nc-total" data-testid="nc-total">{formatMonto(totalNota, moneda)}</dd>
            </div>
            {!facturaEntera && desglose.length > 0 ? (
              <div className="nc-desglose">
                <dt>Por tasa</dt>
                <dd>{desglose.map((parte) => `${ETIQUETA_TASA[parte.iva_tipo]} ${formatMonto(Math.round(parte.importe * 100) / 100, moneda)}`).join(" · ")}</dd>
              </div>
            ) : null}
            {saldo ? (
              <>
                <div>
                  <dt>Saldo de la factura</dt>
                  <dd>{formatMonto(saldo.monto.saldo, moneda)}</dd>
                </div>
                <div>
                  <dt>Saldo después de la nota</dt>
                  <dd>{formatMonto(queda, moneda)}</dd>
                </div>
              </>
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
