// Movido de main.tsx sin cambios (PLAN_UX_RESTO_APP_v0.1 §10.9, URA-023).
import { useEffect, useState } from "react";
import { Aviso, type TonoAviso } from "../components/Aviso";
import { CampoFormulario } from "../components/CampoFormulario";
import { EncabezadoPantalla } from "../components/EncabezadoPantalla";
import { EstadoVacio } from "../components/EstadoVacio";
import { AvisoPuntoDistinto } from "../components/AvisoPuntoDistinto";
import { useBorradorSinEmitir } from "../lib/borradores";
import { numeroConPunto } from "../lib/punto";
import { etiquetaCondicionVenta, formatDocumentoTipo } from "../lib/estados";
import { useApi } from "../api/useApi";
import { type DocumentoEstado, type OperationalContextResponse, type DocumentoResponse, type NotaCreditoCandidate, type NotaCreditoCandidateListResponse, type DeliveryLinkResponse } from "../tipos";
import { formatMonto } from "../lib/formato";
import { mensajeNotaCredito } from "../lib/documentos";

export function CreditNoteView({
  context,
  mostrarPunto = false,
  onBack
}: {
  context?: OperationalContextResponse | null;
  mostrarPunto?: boolean;
  onBack: () => void;
}) {
  const api = useApi();
  const [candidates, setCandidates] = useState<NotaCreditoCandidate[]>([]);
  const [selected, setSelected] = useState<NotaCreditoCandidate | null>(null);
  const [query, setQuery] = useState("");
  const [motivo, setMotivo] = useState("");
  const [loading, setLoading] = useState(false);
  const [emitting, setEmitting] = useState(false);
  const [result, setResult] = useState<DocumentoResponse | null>(null);
  const [deliveryLink, setDeliveryLink] = useState<DeliveryLinkResponse | null>(null);
  // URA-017: el tono del aviso se decide donde se produce el mensaje, no buscando "emitida" en el texto.
  const [aviso, setAviso] = useState<{ tono: TonoAviso; texto: string } | null>(null);
  // SPEC_MULTIPERFIL_USUARIO_v0.1 RN-06: una factura elegida con motivo y sin NC emitida es un borrador.
  useBorradorSinEmitir("nota-credito", () => Boolean(selected && !result && motivo.trim()));

  useEffect(() => {
    void loadCandidates();
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
      setSelected((current) => (current ? response.items.find((item) => item.documento.id === current.documento.id) ?? current : current));
    } catch (error) {
      setAviso({ tono: "error", texto: error instanceof Error ? error.message : "No se pudieron cargar facturas candidatas." });
    } finally {
      setLoading(false);
    }
  }

  async function emitNotaCredito() {
    if (!selected?.elegible) {
      setAviso({ tono: "atencion", texto: selected?.motivo_no_elegible ?? "Elegí una factura elegible." });
      return;
    }
    if (!motivo.trim()) {
      setAviso({ tono: "atencion", texto: "Motivo requerido." });
      return;
    }

    setEmitting(true);
    setAviso(null);
    setDeliveryLink(null);

    try {
      const notaCredito = await api.request<DocumentoResponse>(`/facturas/${selected.documento.id}/nota-credito`, {
        method: "POST",
        body: JSON.stringify({ motivo: motivo.trim() })
      });
      setResult(notaCredito);
      setAviso({ tono: notaCredito.estado === "EMITIDA" ? "exito" : notaCredito.estado === "RECHAZADA" ? "error" : "atencion", texto: mensajeNotaCredito(notaCredito) });
      if (notaCredito.estado === "EMITIDA") {
        const link = await api.post<DeliveryLinkResponse>(`/facturas/${notaCredito.id}/delivery-link`, { regenerate: false });
        setDeliveryLink(link);
      }
    } catch (error) {
      setAviso({ tono: "error", texto: error instanceof Error ? error.message : "No se pudo emitir la nota de crédito." });
    } finally {
      setEmitting(false);
    }
  }

  return (
    <section className="documents-view" aria-labelledby="credit-note-title">
      <EncabezadoPantalla id="credit-note-title" onVolver={onBack} rotulo="Nueva nota de crédito" titulo="Seleccionar factura" />
      <section className="documents-filters">
        <label>
          Buscar factura
          <input
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                void loadCandidates();
              }
            }}
            placeholder="Cliente, documento, número o total"
            value={query}
          />
        </label>
        <button className="secondary-action" disabled={loading} onClick={() => void loadCandidates()} type="button">
          {loading ? "Cargando..." : "Buscar"}
        </button>
      </section>

      {aviso ? <Aviso tono={aviso.tono}>{aviso.texto}</Aviso> : null}

      <section className="documents-layout">
        <div className="documents-list">
          {candidates.length === 0 && !loading ? <EstadoVacio>Sin facturas para los filtros actuales.</EstadoVacio> : null}
          {candidates.map((candidate) => (
            <button
              className={selected?.documento.id === candidate.documento.id ? "document-row active" : "document-row"}
              key={candidate.documento.id}
              onClick={() => {
                setSelected(candidate);
                setResult(null);
                setDeliveryLink(null);
              }}
              type="button"
            >
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

        <aside className="document-detail">
          {selected ? (
            <>
              <div className="receipt-heading">
                <div>
                  <p className="eyebrow">Factura origen</p>
                  <h3>{selected.documento.cliente.razon_social}</h3>
                  <p className="muted">
                    {selected.documento.numero_fiscal ?? "Número pendiente"} · {etiquetaCondicionVenta(selected.documento.condicion_venta)} · {formatDocumentoEstado(selected.documento.estado)}
                  </p>
                </div>
                <span className={selected.elegible ? "status-pill ready" : "status-pill blocked"}>
                  {selected.elegible ? "Elegible" : "Bloqueada"}
                </span>
              </div>
              <div className="receipt-summary">
                <div>
                  <dt>Documento</dt>
                  <dd>{selected.documento.cliente.documento}</dd>
                </div>
                <div>
                  <dt>Total</dt>
                  <dd>{formatMonto(selected.documento.totals.total, selected.documento.moneda)}</dd>
                </div>
              </div>
              {!selected.elegible ? <p className="editor-alert blocked">{selected.motivo_no_elegible}</p> : null}
              {/* SPEC_MULTIPERFIL_USUARIO_v0.1 RN-05 / D-1: la NC sale por el punto activo; se avisa si difiere. */}
              <AvisoPuntoDistinto perfilDocumento={selected.documento.perfil_emision} puntoActivo={context?.fiscal_context} />
              <CampoFormulario className="credit-note-motivo" etiqueta="Motivo">
                <textarea onChange={(event) => setMotivo(event.target.value)} rows={4} value={motivo} />
              </CampoFormulario>
              <button className="primary-action wide" disabled={emitting || !selected.elegible} onClick={() => void emitNotaCredito()} type="button">
                {emitting ? "Emitiendo..." : "Emitir nota de crédito"}
              </button>

              {result ? (
                <div className="public-link-box">
                  <dt>Nota de crédito</dt>
                  <dd>
                    {formatDocumentoEstado(result.estado)} · Número {result.numero_fiscal ?? "pendiente"} · {deliveryLink?.public_url ?? "Link en proceso"}
                  </dd>
                </div>
              ) : null}
            </>
          ) : (
            <p className="muted empty-state">Elegí una factura emitida elegible para emitir una nota de crédito total.</p>
          )}
        </aside>
      </section>
    </section>
  );
}

export function formatDocumentoEstado(value: DocumentoEstado, tipo?: DocumentoResponse["tipo"]): string {
  const nombre = formatDocumentoTipo(tipo ?? "FACTURA");
  const labels: Record<DocumentoEstado, string> = {
    EMITIENDO: "Emisión en proceso",
    EMITIDA: `${nombre} emitida`,
    PENDIENTE_SIFEN: "Pendiente SIFEN",
    RECHAZADA: "Rechazada",
    ERROR_OPERATIVO: "Error operativo",
    ERROR_TEMPORAL: "Error temporal",
    ANULADA: "Anulada",
    CANCELADO_LOCAL: "Cancelada antes de enviar"
  };
  return labels[value];
}
