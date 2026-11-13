// Movido de main.tsx sin cambios (PLAN_UX_RESTO_APP_v0.1 §10.9, URA-023).
import { DIRECCION_NO_ENVIADA, textoDireccion, tieneDireccion } from "../components/CampoDireccion";
import { domicilioCompleto } from "../lib/validacionReceptor";
import { useEffect, useMemo, useState } from "react";
import { CargaMasivaView, type TipoDeCarga } from "../carga-masiva";
import { useConfirmar } from "../components/Dialogo";
import { MenuFila } from "../components/MenuFila";
import { PastillaEstado } from "../components/PastillaEstado";
import { EncabezadoPantalla } from "../components/EncabezadoPantalla";
import { TIPOS_PROXIMAMENTE } from "../lib/tiposEmision";
import { AvisoPuntoDistinto } from "../components/AvisoPuntoDistinto";
import { filaDescuento } from "../lib/descuentos";
import { etiquetaPunto, nombrePunto, numeroConPunto } from "../lib/punto";
import { Icono } from "../components/Icono";
import { pasosPorEstado } from "../components/ResultadoEmision";
import { esNotaSinConfirmar, estadoDocumento, etiquetaCondicionVenta, formatDocumentoTipo } from "../lib/estados";
import { useApi } from "../api/useApi";
import { type UserSummary, type OperationView, type DocumentoEstado, type OperationalContextResponse, type DocumentoAccion, type DocumentoAccionSoportePayload, type DocumentoInutilizacion, type NotaCreditoSaldoResponse, type DocumentoResponse, type DocumentoListResponse, type DeliveryLinkResponse, type EmailStatusResponse, type DocumentoEventosListResponse, type DocumentoDecisionResponse, type DocumentoValidateCdcImpactResponse, type DocumentoGestionResendResponse, type DocumentoGestionCreateDerivedResponse, type DocumentoGestionCancelSendResponse, type DocumentoGestionVoidResponse, type BatchPendientesGestionResponse, type ReconciliacionFiscalResponse, type SifenSummary, type InvoiceInitialDraft } from "../tipos";
import { formatMonto, formatGuaranies, formatCantidad, formatShortDate, formatYmdFromDate, formatUltimaVerificacion, cantidadValida, normalizeDecimalInput } from "../lib/formato";
import { useEsEscritorio } from "../lib/useEsEscritorio";
import { mensajeResultadoReintento, mensajeNotaCredito, formatEmailStatus, getDocumentoNombreLower, getSimpleDocumentoEstado, esEstadoFinalOperador } from "../lib/documentos";
import { AVISO_NOTA_CREDITO_INNOMINADA, esClienteInnominado } from "../lib/innominado";

export const POR_PAGINA_DOCUMENTOS = 30;


export function DocumentsView({
  onBack,
  onGoTo,
  role,
  context,
  onCorregirFactura,
  mostrarPunto = false,
  pestanaInicial = "FACTURAS",
  tipoCargaInicial,
  documentoInicialId,
  onCrearNotaCredito
}: {
  onBack: () => void;
  onGoTo?: (view: OperationView) => void;
  role: UserSummary["role"];
  context?: OperationalContextResponse | null;
  onCorregirFactura?: (draft: InvoiceInitialDraft) => void;
  /** SPEC_MULTIPERFIL_USUARIO_v0.1 §C.8: columna "Punto" solo con mas de un perfil. */
  mostrarPunto?: boolean;
  /** URA-003: el menu "Notas de remisión" abre Documentos en su pestaña. */
  pestanaInicial?: "FACTURAS" | "NOTAS_CREDITO" | "NOTAS_REMISION" | "CARGA_MASIVA";
  /** URA-004: con la pestaña de carga masiva, abre "Nueva carga" con este tipo. */
  tipoCargaInicial?: TipoDeCarga;
  /** URA-006: abre la ficha de este documento al entrar (desde la carga masiva de Notas de remision). */
  documentoInicialId?: string | null;
  /** SPEC_NOTA_CREDITO_UNIFICADA_v0.1 D-8 (FS-77): "Crear nota de crédito" abre la pantalla de notas con la factura. */
  onCrearNotaCredito?: (facturaId: string) => void;
}) {
  const api = useApi();
  const todayYmd = useMemo(() => formatYmdFromDate(new Date()), []);
  const last7DaysYmd = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() - 6);
    return formatYmdFromDate(date);
  }, []);
  const [documents, setDocuments] = useState<DocumentoResponse[]>([]);
  const [selected, setSelected] = useState<DocumentoResponse | null>(null);
  const [estadoFilter, setEstadoFilter] = useState<DocumentoEstado | "">("");
  const [docKindTab, setDocKindTab] = useState<"FACTURAS" | "NOTAS_CREDITO" | "NOTAS_REMISION" | "CARGA_MASIVA">(pestanaInicial);
  const esRemision = docKindTab === "NOTAS_REMISION";
  const [cargaAbiertaId, setCargaAbiertaId] = useState<string | null>(null);
  // FS-33: carga desde la que se abrio la ficha, para volver a ella.
  const [volverACargaId, setVolverACargaId] = useState<string | null>(null);
  /** SPEC_CORRECCION_INUTILIZACION_RECHAZADAS_v0.1, RN-B3: dialogo de inutilizacion del detalle. */
  const [inutilizarMotivo, setInutilizarMotivo] = useState<string | null>(null);
  const [tipoOperativoFilter, setTipoOperativoFilter] = useState<"TODOS" | "CONTADO" | "CREDITO">("TODOS");
  const [query, setQuery] = useState("");
  const [desde, setDesde] = useState(last7DaysYmd);
  const [hasta, setHasta] = useState(todayYmd);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [quickMenuDocId, setQuickMenuDocId] = useState<string | null>(null);
  // SPEC_DOCUMENTOS_ESCRITORIO_v0.1: tabla en escritorio y paginacion en las dos vistas.
  const esEscritorio = useEsEscritorio();
  // URA-017: confirmaciones con Dialogo (PAUTAS_FRONTEND_v0.1 P-L6).
  const [confirmar, dialogoConfirmar] = useConfirmar();
  const [pagina, setPagina] = useState(1);
  const [totalDocumentos, setTotalDocumentos] = useState(0);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deliveryLink, setDeliveryLink] = useState<DeliveryLinkResponse | null>(null);
  const [emailStatus, setEmailStatus] = useState<EmailStatusResponse | null>(null);
  const [whatsappPhone, setWhatsappPhone] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [eventos, setEventos] = useState<DocumentoEventosListResponse | null>(null);
  const [batchPendientes, setBatchPendientes] = useState<BatchPendientesGestionResponse | null>(null);
  const [reconciliacion, setReconciliacion] = useState<ReconciliacionFiscalResponse | null>(null);
  const [gestionTab, setGestionTab] = useState<"STATUS" | "EVENTOS" | "PENDIENTES" | "RECONCILIACION">("STATUS");
  const [gestionLoading, setGestionLoading] = useState(false);
  const [decision, setDecision] = useState<DocumentoDecisionResponse | null>(null);
  const [cdcImpact, setCdcImpact] = useState<DocumentoValidateCdcImpactResponse | null>(null);
  const [reasonModal, setReasonModal] = useState<{
    action: "CANCEL_DETAIL" | "CANCEL_LIST" | "VOID_NUMBER";
    documentoId: string;
    tipo?: DocumentoResponse["tipo"];
    reintentar?: boolean;
  } | null>(null);
  const [reasonDraft, setReasonDraft] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [notaCreditoPopup, setNotaCreditoPopup] = useState<DocumentoResponse | null>(null);
  // Lo acreditado por notas de credito, para la ficha de una factura (SPEC_NOTA_CREDITO_PARCIAL_v0.1, alcance 6).
  const [fichaSaldo, setFichaSaldo] = useState<NotaCreditoSaldoResponse | null>(null);
  // Lista blanca a proposito: un rol nuevo no hereda permisos de soporte por descarte
  // (SPEC_SEGMENTACION_PERFIL_EMISION §0).
  const isInternalSupport = role === "SOPORTE_INTERNO" || role === "ADMIN_INTERNO";

  useEffect(() => {
    if (docKindTab === "CARGA_MASIVA") return;
    setPagina(1);
    void loadDocuments(query, 1);
  }, [estadoFilter, tipoOperativoFilter, desde, hasta, docKindTab]);

  async function loadDocuments(nextQuery = query, paginaPedida = pagina) {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({ limit: String(POR_PAGINA_DOCUMENTOS), offset: String((paginaPedida - 1) * POR_PAGINA_DOCUMENTOS) });
    params.set("tipo", docKindTab === "NOTAS_CREDITO" ? "NOTA_CREDITO" : docKindTab === "NOTAS_REMISION" ? "NOTA_REMISION" : "FACTURA");
    if (estadoFilter) {
      params.set("estado", estadoFilter);
    }
    if (docKindTab === "FACTURAS" && tipoOperativoFilter !== "TODOS") {
      params.set("tipo_operativo", tipoOperativoFilter);
    }
    if (nextQuery.trim()) {
      params.set("q", nextQuery.trim());
    }
    if (desde) {
      params.set("desde", desde);
    }
    if (hasta) {
      params.set("hasta", hasta);
    }

    try {
      const result = await api.get<DocumentoListResponse>(`/facturas?${params.toString()}`);
      setDocuments(result.items);
      setTotalDocumentos(result.total);
      setPagina(paginaPedida);
      setSelected((current) => (current ? result.items.find((item) => item.id === current.id) ?? current : current));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar el listado.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (documentoInicialId) void openDetail(documentoInicialId);
  }, [documentoInicialId]);

  async function openDetail(documentoId: string) {
    setActionLoading(true);
    setError(null);
    setMessage(null);
    setInutilizarMotivo(null);
    setDeliveryLink(null);
    setEmailStatus(null);

    try {
      const detail = await api.get<DocumentoResponse>(`/facturas/${documentoId}`);
      setSelected(detail);
      setFichaSaldo(null);
      if (detail.tipo === "FACTURA" && detail.estado === "EMITIDA") {
        void api
          .get<NotaCreditoSaldoResponse>(`/facturas/${documentoId}/nota-credito/saldo`)
          .then(setFichaSaldo)
          .catch(() => setFichaSaldo(null));
      }
      await loadDeliveryFor(detail);
      if (isInternalSupport) {
        try {
          const detailDecision = await api.get<DocumentoDecisionResponse>(`/facturas/${documentoId}/gestion/decision`);
          setDecision(detailDecision);
        } catch {
          setDecision(null);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo abrir el detalle.");
    } finally {
      setActionLoading(false);
    }
  }

  async function validateSelectedCdcImpact() {
    if (!selected || !isInternalSupport) {
      return;
    }
    setActionLoading(true);
    try {
      const result = await api.post<DocumentoValidateCdcImpactResponse>(`/facturas/${selected.id}/gestion/validate-cdc-impact`, {});
      setCdcImpact(result);
      setMessage(`Impacto CDC: ${result.cdc_impact}.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "No se pudo validar impacto CDC.");
    } finally {
      setActionLoading(false);
    }
  }

  async function retrySameCdcAction() {
    if (!selected || !isInternalSupport) {
      return;
    }
    const comment = window.prompt("Comentario de soporte (opcional)", "") ?? "";
    setActionLoading(true);
    try {
      const result = await api.post<DocumentoGestionResendResponse>(`/facturas/${selected.id}/gestion/retry-same-cdc`, {
        mode: "BATCH",
        send_now: false,
        comment: comment.trim() || undefined
      });
      setMessage(`Reintento enviado. Revisión ${result.revision_number}.`);
      await openDetail(selected.id);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "No se pudo reintentar con mismo CDC.");
    } finally {
      setActionLoading(false);
    }
  }

  async function createDerivedAction() {
    if (!selected || !isInternalSupport) {
      return;
    }
    const comment = window.prompt("Motivo/Comentario de derivación", "");
    if (!comment?.trim()) {
      return;
    }
    setActionLoading(true);
    try {
      const result = await api.post<DocumentoGestionCreateDerivedResponse>(`/facturas/${selected.id}/gestion/create-derived`, {
        mode: "BATCH",
        send_now: false,
        comment: comment.trim()
      });
      setMessage(`DE derivado creado: ${result.derived_document_id}.`);
      await loadDocuments();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "No se pudo crear DE derivado.");
    } finally {
      setActionLoading(false);
    }
  }

  async function cancelSendAction() {
    if (!selected || !isInternalSupport) {
      return;
    }
    if (!(await confirmar({ titulo: "¿Cancelar el envío local del documento en cola batch?", textoConfirmar: "Cancelar envío", textoCancelar: "Volver", peligro: true }))) {
      return;
    }
    setActionLoading(true);
    try {
      const result = await api.post<DocumentoGestionCancelSendResponse>(`/facturas/${selected.id}/gestion/cancel-send`, {});
      setMessage(`Envio cancelado. Resultado: ${result.action_result}.`);
      await openDetail(selected.id);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "No se pudo cancelar envío local.");
    } finally {
      setActionLoading(false);
    }
  }

  async function voidNumberAction() {
    if (!selected || !isInternalSupport) {
      return;
    }
    openReasonModal("VOID_NUMBER", selected.id);
  }

  function openReasonModal(
    action: "CANCEL_DETAIL" | "CANCEL_LIST" | "VOID_NUMBER",
    documentoId: string,
    tipo?: DocumentoResponse["tipo"],
    reintentar?: boolean
  ) {
    setReasonModal({ action, documentoId, tipo, reintentar });
    setReasonDraft("");
    setReasonError(null);
  }

  function closeReasonModal() {
    setReasonModal(null);
    setReasonDraft("");
    setReasonError(null);
  }

  async function submitReasonModal() {
    if (!reasonModal) {
      return;
    }
    const motivo = reasonDraft.trim();
    if (!motivo) {
      setReasonError("Escribí el motivo para continuar.");
      return;
    }
    if (motivo.length < 3) {
      setReasonError("El motivo debe tener al menos 3 caracteres.");
      return;
    }

    setReasonError(null);
    setActionLoading(true);
    setMessage(null);

    try {
      if (reasonModal.action === "CANCEL_DETAIL") {
        const updated = await api.post<DocumentoResponse>(`/facturas/${reasonModal.documentoId}/cancelar`, {
          motivo,
          ...(reasonModal.reintentar ? { reintentar: true } : {})
        });
        setSelected(updated);
        setDocuments((current) => current.map((item) => (item.id === updated.id ? updated : item)));
        // SIFEN rechaza ~15% de las cancelaciones: el resultado no se asume exitoso.
        setMessage(mensajeCancelacion(updated));
        await loadDeliveryFor(updated);
      } else if (reasonModal.action === "CANCEL_LIST") {
        const updated = await api.post<DocumentoResponse>(`/facturas/${reasonModal.documentoId}/cancelar`, { motivo });
        setMessage(mensajeCancelacion(updated));
        await loadDocuments();
      } else {
        const result = await api.post<DocumentoGestionVoidResponse>(`/facturas/${reasonModal.documentoId}/gestion/void-number`, {
          motivo
        });
        setMessage(`Inutilización solicitada. Evento: ${result.event_id ?? "sin id"}.`);
        await loadEventosDocumento();
      }
      closeReasonModal();
    } catch (err) {
      setReasonError(err instanceof Error ? err.message : "No se pudo procesar la acción.");
    } finally {
      setActionLoading(false);
    }
  }

  async function loadDeliveryFor(documento: DocumentoResponse, regenerate = false) {
    // FS-31: sin validez no hay enlace; el estado del correo si se consulta.
    if (sinValidezFiscal(documento)) {
      setDeliveryLink(null);
      try {
        setEmailStatus(await api.get<EmailStatusResponse>(`/facturas/${documento.id}/email-status`));
      } catch {
        // El estado del correo es informativo.
      }
      return;
    }
    try {
      const [link, email] = await Promise.all([
        api.post<DeliveryLinkResponse>(`/facturas/${documento.id}/delivery-link`, { regenerate }),
        api.get<EmailStatusResponse>(`/facturas/${documento.id}/email-status`)
      ]);
      setDeliveryLink(link);
      setEmailStatus(email);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "No se pudieron cargar acciones de entrega.");
    }
  }

  async function inutilizarSelected() {
    if (!selected || inutilizarMotivo === null) return;
    const numero = selected.numero_fiscal ?? "";
    setActionLoading(true);
    setError(null);
    setMessage(null);
    try {
      const updated = await api.post<DocumentoResponse>(`/facturas/${selected.id}/inutilizar`, { motivo: inutilizarMotivo.trim() });
      setSelected(updated);
      setDocuments((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setInutilizarMotivo(null);
      setMessage(
        updated.inutilizacion?.status === "ACCEPTED"
          ? `El número ${numero} quedó inutilizado ante SIFEN.`
          : `SIFEN no aceptó la inutilización del número ${numero}${updated.inutilizacion?.rejection_code ? ` (${updated.inutilizacion.rejection_code})` : ""}. Puede volver a intentar.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo inutilizar el número.");
    } finally {
      setActionLoading(false);
    }
  }

  async function refreshSelectedStatus() {
    if (!selected) {
      return;
    }

    setActionLoading(true);
    setMessage(null);

    try {
      const updated = await api.post<DocumentoResponse>(`/facturas/${selected.id}/refresh-status`, {});
      setSelected(updated);
      setDocuments((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      await loadDeliveryFor(updated);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "No se pudo refrescar estado.");
    } finally {
      setActionLoading(false);
    }
  }

  async function retrySelectedEmission() {
    if (!selected) {
      return;
    }

    setActionLoading(true);
    setMessage(null);

    try {
      const updated = await api.post<DocumentoResponse>(`/facturas/${selected.id}/retry-emission`, {});
      setSelected(updated);
      setDocuments((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setMessage(mensajeResultadoReintento(updated));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "No se pudo reintentar la emisión.");
    } finally {
      setActionLoading(false);
    }
  }

  async function retryNotaCredito(nota: DocumentoResponse) {
    setActionLoading(true);
    setMessage(null);
    try {
      const updated = await api.post<DocumentoResponse>(`/facturas/${nota.id}/nota-credito/reintentar`, {});
      setSelected((current) => (current && current.id === updated.id ? updated : current));
      setDocuments((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setNotaCreditoPopup((current) => (current && current.id === updated.id ? updated : current));
      setMessage(mensajeNotaCredito(updated));
      if (updated.estado === "EMITIDA") await loadDeliveryFor(updated);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "No se pudo reintentar la nota de crédito.");
    } finally {
      setActionLoading(false);
    }
  }

  function openNuevaNotaCredito(nota: DocumentoResponse) {
    if (nota.documento_relacionado_id) onCrearNotaCredito?.(nota.documento_relacionado_id);
  }

  async function cancelSelectedDocumento() {
    if (!selected) {
      return;
    }
    openReasonModal("CANCEL_DETAIL", selected.id, selected.tipo);
  }

  /** SPEC_NOTA_CREDITO_FACTURA_EXTERNA_v0.1 RN-09: borra una factura externa sin notas de credito. */
  async function eliminarFacturaExterna() {
    if (!selected?.origen) return;
    const ok = await confirmar({
      titulo: "Eliminar factura externa",
      texto: `Se quita del sistema la factura ${selected.numero_fiscal ?? ""}. No cambia nada en SIFEN.`,
      textoConfirmar: "Eliminar",
      peligro: true
    });
    if (!ok) return;
    setActionLoading(true);
    setError(null);
    try {
      await api.request(`/facturas/externas/${selected.id}`, { method: "DELETE" });
      setSelected(null);
      await loadDocuments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar la factura externa.");
    } finally {
      setActionLoading(false);
    }
  }

  async function emitSelectedNotaCredito() {
    if (!selected) {
      return;
    }
    onCrearNotaCredito?.(selected.id);
  }

  async function emitNotaCreditoFromList(documentoId: string) {
    onCrearNotaCredito?.(documentoId);
  }

  async function cancelDocumentoFromList(documentoId: string, tipo?: DocumentoResponse["tipo"]) {
    openReasonModal("CANCEL_LIST", documentoId, tipo);
  }

  async function openQuickShare(documento: DocumentoResponse, mode: "public" | "whatsapp") {
    setActionLoading(true);
    setMessage(null);
    try {
      const link = await api.post<DeliveryLinkResponse>(`/facturas/${documento.id}/delivery-link`, {});
      const targetUrl = mode === "whatsapp" ? link.whatsapp_url : link.public_url;
      window.open(targetUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "No se pudo abrir acción rápida.");
    } finally {
      setActionLoading(false);
      setQuickMenuDocId(null);
    }
  }

  async function copySoportePayload(payload: DocumentoAccionSoportePayload) {
    const lines = [
      `Documento: ${payload.documento_id}`,
      `document_uuid: ${payload.document_uuid ?? "-"}`,
      `CDC: ${payload.cdc ?? "-"}`,
      `Número fiscal: ${payload.numero_fiscal ?? "-"}`,
      `Código SIFEN: ${payload.sifen_result_code ?? "-"}`,
      `Mensaje SIFEN: ${payload.sifen_result_message ?? "-"}`,
      `Estado fiscal (raw): ${payload.fiscal_status_raw ?? "-"}`,
      `Creado: ${payload.created_at ?? "-"}`
    ];
    const text = lines.join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setMessage("Datos copiados. Puede pegarlos al contactar a soporte.");
    } catch {
      setMessage(text);
    }
  }

  async function copyDetailLink() {
    if (!deliveryLink?.public_url) {
      return;
    }

    try {
      await navigator.clipboard.writeText(deliveryLink.public_url);
      setMessage("Link copiado.");
    } catch {
      setMessage(deliveryLink.public_url);
    }
  }

  async function loadEventosDocumento() {
    if (!selected) {
      setMessage("Elegí un documento para consultar historial.");
      return;
    }

    setGestionLoading(true);
    setGestionTab("EVENTOS");
    try {
      const result = await api.get<DocumentoEventosListResponse>(`/facturas/${selected.id}/eventos`);
      setEventos(result);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "No se pudo consultar historial del documento.");
    } finally {
      setGestionLoading(false);
    }
  }

  async function loadBatchPendientes() {
    setGestionLoading(true);
    setGestionTab("PENDIENTES");
    try {
      const result = await api.get<BatchPendientesGestionResponse>("/facturas/gestion/batch-pendientes?limit=20&offset=0");
      setBatchPendientes(result);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "No se pudo consultar documentos en espera.");
    } finally {
      setGestionLoading(false);
    }
  }

  async function loadReconciliacion() {
    setGestionLoading(true);
    setGestionTab("RECONCILIACION");
    try {
      const result = await api.get<ReconciliacionFiscalResponse>("/facturas/gestion/reconciliacion?limit=20&offset=0");
      setReconciliacion(result);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "No se pudo comparar con registro fiscal.");
    } finally {
      setGestionLoading(false);
    }
  }

  const selectedSifenSummary = selected ? getSifenSummary(selected) : null;
  const selectedKudeUrl = selected && deliveryLink && selected.delivery.artifacts.kude_pdf.available ? `${deliveryLink.public_url}/kude.pdf` : null;
  const selectedXmlUrl = selected && deliveryLink && selected.delivery.artifacts.xml.available ? `${deliveryLink.public_url}/xml` : null;
  const hasRecentWindow = Boolean(desde || hasta);
  const [todayDocs, weekDocs] = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const tomorrowStart = todayStart + 24 * 60 * 60 * 1000;
    const currentWeekDocs: DocumentoResponse[] = [];
    const currentTodayDocs: DocumentoResponse[] = [];

    for (const documento of documents) {
      const rawDate = documento.created_at ? Date.parse(documento.created_at) : NaN;
      if (Number.isNaN(rawDate)) {
        currentWeekDocs.push(documento);
        continue;
      }
      if (rawDate >= todayStart && rawDate < tomorrowStart) {
        currentTodayDocs.push(documento);
      } else {
        currentWeekDocs.push(documento);
      }
    }

    return [currentTodayDocs, currentWeekDocs];
  }, [documents]);

  /** SPEC_DOCUMENTOS_ESCRITORIO_v0.1, RN-02: la tarjeta y la fila de la tabla ofrecen las mismas acciones. */
  // URA-019: menu de la fila con MenuFila (nombre, aria-haspopup, aria-expanded, Escape; PAUTAS P-A3).
  function menuDeFila(documento: DocumentoResponse) {
    return (
                  <MenuFila
                    abierto={quickMenuDocId === documento.id}
                    etiqueta={`Acciones de ${formatDocumentoTipo(documento.tipo).toLowerCase()} ${documento.numero_fiscal ?? "pendiente"}`}
                    onAbrir={() => setQuickMenuDocId(documento.id)}
                    onCerrar={() => setQuickMenuDocId(null)}
                  >
                    <button onClick={() => void openDetail(documento.id)} role="menuitem" type="button">Ver detalle</button>
                    {!sinValidezFiscal(documento) ? (
                      <>
                        <button onClick={() => void openQuickShare(documento, "public")} role="menuitem" type="button">Compartir</button>
                        <button onClick={() => void openQuickShare(documento, "whatsapp")} role="menuitem" type="button">WhatsApp</button>
                      </>
                    ) : null}
                    {documento.accion_detalle?.acciones_sugeridas.includes("REINTENTAR_NOTA_CREDITO") ? (
                      <button onClick={() => { setQuickMenuDocId(null); void retryNotaCredito(documento); }} role="menuitem" type="button">Reintentar nota de crédito</button>
                    ) : null}
                    {documento.tipo === "FACTURA" ? (
                      <button onClick={() => void emitNotaCreditoFromList(documento.id)} role="menuitem" type="button">Nota de crédito</button>
                    ) : null}
                    {documento.tipo !== "NOTA_REMISION" ? (
                      <button className="destructive-item" onClick={() => void cancelDocumentoFromList(documento.id, documento.tipo)} role="menuitem" type="button">Anular</button>
                    ) : null}
                  </MenuFila>
    );
  }

  const pestanasDocumentos = (
    <div className="filter-tabs" role="group" aria-label="Tipo de documento">
      {(context?.carga_masiva_habilitada ? (["FACTURAS", "NOTAS_CREDITO", "NOTAS_REMISION", "CARGA_MASIVA"] as const) : (["FACTURAS", "NOTAS_CREDITO", "NOTAS_REMISION"] as const)).map((value) => (
        <button
          className={docKindTab === value ? "active" : ""}
          key={value}
          onClick={() => {
            setCargaAbiertaId(null);
            setDocKindTab(value);
          }}
          type="button"
        >
          {value === "FACTURAS" ? "Facturas" : value === "NOTAS_CREDITO" ? "Notas de crédito" : value === "NOTAS_REMISION" ? "Notas de remisión" : "Cargas por planilla"}
          {/* URA-007 (SPEC C.1, D-9): solo la pestaña activa muestra su cantidad, con el total que ya trae la lista. */}
          {docKindTab === value && value !== "CARGA_MASIVA" && !loading ? ` · ${totalDocumentos}` : ""}
        </button>
      ))}
      {/* SPEC_DOCUMENTOS_ESCRITORIO_v0.1, RN-03: tipos que FS incorpora cuando FE los habilite (Fase B). */}
      {TIPOS_PROXIMAMENTE.map((tipo) => (
        <button className="pestana-proximamente" disabled key={tipo} title={`${tipo}: disponible proximamente`} type="button">
          {tipo} <small>Próximamente</small>
        </button>
      ))}
    </div>
  );

  const totalPaginas = Math.max(1, Math.ceil(totalDocumentos / POR_PAGINA_DOCUMENTOS));
  const paginador = totalDocumentos > POR_PAGINA_DOCUMENTOS ? (
    <div className="documents-paginas">
      <button className="secondary-action" disabled={loading || pagina <= 1} onClick={() => void loadDocuments(query, pagina - 1)} type="button">Anterior</button>
      <span className="muted">Página {pagina} de {totalPaginas} · {totalDocumentos} documentos</span>
      <button className="secondary-action" disabled={loading || pagina >= totalPaginas} onClick={() => void loadDocuments(query, pagina + 1)} type="button">Siguiente</button>
    </div>
  ) : null;

  if (docKindTab === "CARGA_MASIVA" && context) {
    return (
      <section className="documents-view documents-view-ancha" aria-labelledby="documents-title">
        <EncabezadoPantalla id="documents-title" onVolver={onBack} rotulo="Documentos" titulo="Cargas por planilla" />
        {pestanasDocumentos}
        <CargaMasivaView
          api={api}
          cargaInicialId={cargaAbiertaId}
          tipoInicial={tipoCargaInicial}
          contexto={{
            facturador: context.facturador.razon_social,
            establecimiento: context.fiscal_context.establecimiento,
            punto: context.fiscal_context.punto_expedicion,
            perfil: context.fiscal_context.perfil_emision_alias ?? context.fiscal_context.perfil_emision_codigo,
            numeracion: context.fiscal_context.numeracion_facturas ?? "SERVICIO"
          }}
          esInterno={isInternalSupport}
          key={cargaAbiertaId ?? "cargas"}
          onVerDocumento={(documentoId, cargaId) => {
            // FS-48: openDetail carga el enlace de entrega y el estado del correo;
            // sin eso el detalle queda sin acciones frecuentes.
            setVolverACargaId(cargaId);
            setDocKindTab("FACTURAS");
            void openDetail(documentoId);
          }}
        />
      </section>
    );
  }

  return (
    <section className={esEscritorio ? "documents-view documents-view-ancha" : "documents-view"} aria-labelledby="documents-title">
      <EncabezadoPantalla id="documents-title" onVolver={onBack} rotulo="Documentos" titulo="Facturas y notas" />

      {/* URA-007 (SPEC C.4): en escritorio la lista queda a la vista y la ficha se abre al costado; en celular la ficha
          reemplaza a la lista, como antes. */}
      <div className={esEscritorio && selected ? "documents-cuerpo con-ficha" : "documents-cuerpo"}>
      <div className="documents-principal">
      {!selected || esEscritorio ? (
      <section className={esEscritorio ? "documents-filters documents-filtros-escritorio" : "documents-filters"}>
        {pestanasDocumentos}
        <label>
          Buscar
          <input
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                void loadDocuments(query, 1);
              }
            }}
            placeholder="Buscar factura..."
            value={query}
          />
        </label>
        <div className="quick-actions-row compact">
          <button className="secondary-action" disabled={loading} onClick={() => void loadDocuments(query, 1)} type="button">
            {loading ? "Cargando..." : "Buscar"}
          </button>
          {!esEscritorio ? (
          <button className="secondary-action" onClick={() => setShowAdvancedFilters((current) => !current)} type="button">
            {showAdvancedFilters ? "Ocultar filtros" : "Más filtros"}
          </button>
          ) : null}
          {!showAdvancedFilters ? (
            <button
              className="secondary-action"
              onClick={() => {
                setShowAdvancedFilters(true);
                setDesde("");
                setHasta("");
              }}
              type="button"
            >
              Buscar más documentos
            </button>
          ) : null}
        </div>
        {showAdvancedFilters || esEscritorio ? (
          <div className="documents-advanced-filters">
            <label>
              Estado
              <select onChange={(event) => setEstadoFilter(event.target.value as DocumentoEstado | "")} value={estadoFilter}>
                <option value="">Todos</option>
                <option value="EMITIENDO">Emitiendo</option>
                <option value="EMITIDA">Emitida</option>
                <option value="PENDIENTE_SIFEN">Pendiente SIFEN</option>
                <option value="RECHAZADA">Rechazada</option>
                <option value="ERROR_TEMPORAL">Error temporal</option>
                <option value="ERROR_OPERATIVO">Error operativo</option>
                <option value="ANULADA">Anulada</option>
              </select>
            </label>
            {docKindTab === "FACTURAS" ? (
              <label>
                Tipo factura
                <select onChange={(event) => setTipoOperativoFilter(event.target.value as "TODOS" | "CONTADO" | "CREDITO")} value={tipoOperativoFilter}>
                  <option value="TODOS">Todas</option>
                  <option value="CONTADO">Contado</option>
                  <option value="CREDITO">Crédito</option>
                </select>
              </label>
            ) : null}
            <label>
              Desde
              <input onChange={(event) => setDesde(event.target.value)} type="date" value={desde} />
            </label>
            <label>
              Hasta
              <input onChange={(event) => setHasta(event.target.value)} type="date" value={hasta} />
            </label>
          </div>
        ) : null}
      </section>
      ) : null}

      {error ? <p className="form-error">{error}</p> : null}

      {!selected && isInternalSupport ? (
      <section className="document-management" aria-label="Gestion de documentos">
        <header className="document-management-header">
          <h3>Gestion de documentos</h3>
          <p className="muted">Accesos rapidos para seguimiento y autogestion operativa.</p>
        </header>
        <div className="document-management-grid">
          <article className="document-management-card">
            <h4>Estado de mis documentos</h4>
            <p className="muted">Revisá emisión, pendientes y rechazados en un solo lugar.</p>
            <button className="secondary-action" onClick={() => setGestionTab("STATUS")} type="button">
              Ver estado
            </button>
          </article>
          <article className="document-management-card">
            <h4>Historial del documento</h4>
            <p className="muted">Consulte eventos y cambios de estado por comprobante.</p>
            <button className="secondary-action" onClick={() => void loadEventosDocumento()} type="button">
              Consultar historial
            </button>
          </article>
          <article className="document-management-card">
            <h4>Documentos en espera de confirmación</h4>
            <p className="muted">Identifique comprobantes pendientes de respuesta fiscal.</p>
            <button className="secondary-action" onClick={() => void loadBatchPendientes()} type="button">
              Ver pendientes
            </button>
          </article>
          <article className="document-management-card">
            <h4>Comparar con registro fiscal</h4>
            <p className="muted">Contraste documentos operativos contra el registro fiscal.</p>
            <button className="secondary-action" onClick={() => void loadReconciliacion()} type="button">
              Comparar
            </button>
          </article>
        </div>
        {gestionLoading ? <p className="muted">Consultando gestion de documentos...</p> : null}
        {gestionTab === "EVENTOS" && eventos ? (
          <div className="document-management-results">
            <strong>Historial del documento</strong>
            {eventos.events.length === 0 ? <p className="muted">Sin eventos registrados para este documento.</p> : null}
            {eventos.events.map((event) => (
              <p className="muted" key={`${event.event_id ?? "evt"}-${event.created_at ?? "time"}`}>
                {(event.type ?? "EVENTO")} · {(event.status ?? "SIN_ESTADO")} · {event.created_at ?? "sin fecha"}
              </p>
            ))}
          </div>
        ) : null}
        {gestionTab === "PENDIENTES" && batchPendientes ? (
          <div className="document-management-results">
            <strong>Documentos en espera de confirmación</strong>
            <p className="muted">
              Documentos: {batchPendientes.documents_pending} · Lotes: {batchPendientes.batches_pending}
            </p>
          </div>
        ) : null}
        {gestionTab === "RECONCILIACION" && reconciliacion ? (
          <div className="document-management-results">
            <strong>Comparar con registro fiscal</strong>
            {reconciliacion.items.length === 0 ? <p className="muted">Sin diferencias visibles para la consulta actual.</p> : null}
            {reconciliacion.items.slice(0, 3).map((item) => (
              <p className="muted" key={`${item.document_id ?? "doc"}-${item.cdc ?? "cdc"}`}>
                {(item.nro_factura ?? "sin número")} · {(item.status ?? "sin estado")} · {(item.receptor_nombre ?? "sin receptor")}
              </p>
            ))}
          </div>
        ) : null}
      </section>
      ) : null}

      {esEscritorio ? (
      <section className="documents-layout documents-layout-escritorio">
        {documents.length === 0 && !loading ? <p className="muted empty-state">Sin documentos para los filtros actuales.</p> : null}
        {documents.length > 0 ? (
          <div className="documents-tabla-contenedor">
            <table className="documents-tabla">
              <thead>
                <tr>
                  <th>Fecha</th>
                  {mostrarPunto ? <th>Punto</th> : null}
                  <th>Número</th>
                  <th>{esRemision ? "Destinatario" : "Cliente"}</th>
                  <th className="documents-tabla-ruc">RUC o CI</th>
                  {esRemision ? <th>Motivo</th> : <th>Condición</th>}
                  <th>Estado</th>
                  <th className="documents-tabla-cdc">CDC</th>
                  {esRemision ? null : <th className="documents-tabla-moneda">Moneda</th>}
                  {esRemision ? null : <th className="numero">Total</th>}
                  <th aria-label="Acciones" />
                </tr>
              </thead>
              <tbody>
                {documents.map((documento) => (
                  <tr className={selected?.id === documento.id ? "documents-tabla-fila activa" : "documents-tabla-fila"} key={documento.id} onClick={() => void openDetail(documento.id)}>
                    <td>{formatShortDate(documento.created_at)}</td>
                    {mostrarPunto ? (
                      <td className="documents-tabla-punto">{documento.perfil_emision ? etiquetaPunto(documento.perfil_emision) : "—"}</td>
                    ) : null}
                    <td>
                      {/* URA-019 (P-A6): la fila tambien se abre con el teclado, desde el numero. */}
                      <button
                        className="enlace-fila"
                        onClick={(event) => {
                          event.stopPropagation();
                          void openDetail(documento.id);
                        }}
                        title={documento.accion_detalle?.titulo}
                        type="button"
                      >
                        <strong>{documento.numero_fiscal ?? "pendiente"}</strong>
                      </button>
                      {documento.carga ? (
                        <button
                          className="carga-enlace documents-tabla-carga"
                          onClick={(event) => {
                            event.stopPropagation();
                            setCargaAbiertaId(documento.carga!.id);
                            setDocKindTab("CARGA_MASIVA");
                          }}
                          type="button"
                        >
                          Carga
                        </button>
                      ) : null}
                    </td>
                    <td>
                      {documento.cliente.razon_social}
                      {formatEmisor(documento) ? <small className="document-row-emisor">Emitio {formatEmisor(documento)}</small> : null}
                    </td>
                    <td className="documents-tabla-ruc">{documento.cliente.documento}</td>
                    {esRemision ? (
                      <td>{documento.remision?.motivo_descripcion ?? "-"}</td>
                    ) : (
                      <td>{etiquetaCondicionVenta(documento.condicion_venta)}</td>
                    )}
                    <td><EstadoDocumentoPill documento={documento} /></td>
                    <td className="documents-tabla-cdc" title={documento.cdc ?? undefined}>{documento.cdc ? `${documento.cdc.slice(0, 8)}…${documento.cdc.slice(-4)}` : "-"}</td>
                    {esRemision ? null : <td className="documents-tabla-moneda">{documento.moneda ?? "PYG"}</td>}
                    {esRemision ? null : <td className="numero"><strong>{formatMonto(documento.totals.total, documento.moneda)}</strong></td>}
                    <td className="documents-tabla-acciones" onClick={(event) => event.stopPropagation()}>
                      {menuDeFila(documento)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {paginador}
      </section>
      ) : null}

      {!selected && !esEscritorio ? (
      <section className="documents-layout">
        <div className="documents-list">
          {documents.length === 0 && !loading ? <p className="muted empty-state">Sin documentos para los filtros actuales.</p> : null}
          {hasRecentWindow ? <h3 className="documents-group-title">Hoy</h3> : null}
          {todayDocs.map((documento) => (
            <article className="document-row document-row-rich" key={documento.id}>
              <button className="document-row-main" onClick={() => void openDetail(documento.id)} type="button">
                <span>
                  <strong title={documento.accion_detalle?.titulo}>{`${formatDocumentoTipo(documento.tipo)} ${numeroConPunto(documento, mostrarPunto) ?? "pendiente"}`}</strong>
                  {documento.carga ? (
                    <span className="carga-marca">
                      <button
                        className="carga-enlace"
                        onClick={(event) => {
                          event.stopPropagation();
                          setCargaAbiertaId(documento.carga!.id);
                          setDocKindTab("CARGA_MASIVA");
                        }}
                        type="button"
                      >
                        Carga
                      </button>
                      {documento.carga.numero_archivo && !documento.carga.numero_archivo.endsWith(documento.numero_fiscal ?? "\u0000") ? ` · Archivo ${documento.carga.numero_archivo}` : null}
                    </span>
                  ) : null}
                  <small>{documento.cliente.razon_social}</small>
                  {formatEmisor(documento) ? <small className="document-row-emisor">Emitio {formatEmisor(documento)}</small> : null}
                </span>
                <span>
                  <strong>{documento.tipo === "NOTA_REMISION" ? documento.remision?.motivo_descripcion ?? "Nota de remisión" : formatMonto(documento.totals.total, documento.moneda)}</strong>
                  <EstadoDocumentoPill documento={documento} />
                  <small>{formatShortDate(documento.created_at)}</small>
                </span>
              </button>
              {menuDeFila(documento)}
            </article>
          ))}
          {hasRecentWindow ? <h3 className="documents-group-title">Últimos 7 días</h3> : null}
          {(hasRecentWindow ? weekDocs : documents).map((documento) => (
            <button
              className="document-row"
              key={documento.id}
              onClick={() => void openDetail(documento.id)}
              type="button"
            >
              <span>
                <strong title={documento.accion_detalle?.titulo}>{numeroConPunto(documento, mostrarPunto) ?? "Número pendiente"}</strong>
                <small>{documento.cliente.razon_social}</small>
                {formatEmisor(documento) ? <small className="document-row-emisor">Emitio {formatEmisor(documento)}</small> : null}
              </span>
              <span>
                <strong>{documento.tipo === "NOTA_REMISION" ? documento.remision?.motivo_descripcion ?? "Nota de remisión" : formatMonto(documento.totals.total, documento.moneda)}</strong>
                <EstadoDocumentoPill documento={documento} />
                <small>{formatShortDate(documento.created_at)}</small>
              </span>
            </button>
          ))}
        </div>
        {paginador}
      </section>
      ) : null}

      </div>
        {selected ? (
        <aside className="document-detail document-ficha" aria-label="Ficha del documento" aria-live="polite">
          {selected ? (
            <>
              {/* URA-007 (SPEC C.4, H-11): numero y una sola pastilla de estado; los pasos debajo. */}
              <div className="ficha-cabecera">
                <div>
                  <h3>{formatDocumentoTipo(selected.tipo)} {numeroConPunto(selected, mostrarPunto) ?? "pendiente"}</h3>
                  <p className="muted">
                    {formatShortDate(selected.created_at)}
                    {selected.perfil_emision ? ` · ${nombrePunto(selected.perfil_emision)}` : ""}
                  </p>
                </div>
                <PastillaEstado {...estadoDocumento(selected)} />
              </div>
              {/* SPEC_NOTA_CREDITO_FACTURA_EXTERNA_v0.1: una externa no se emitio aca; no tiene pasos de emision. */}
              {selected.tipo !== "NOTA_REMISION" && !selected.origen ? (
                <ol className="pasos ficha-pasos" aria-label="Pasos de la emisión">
                  {pasosPorEstado(selected.estado).map((paso, indice, pasos) => (
                    <li className={`paso ${paso.clase}`} key={paso.etiqueta}>
                      <span className="paso-punto" aria-hidden="true">{paso.clase === "hecho" ? <Icono nombre="tilde" tamano={14} grosor={3} /> : null}</span>
                      <span className="paso-texto">{paso.etiqueta}</span>
                      {indice < pasos.length - 1 ? <span className="paso-linea" aria-hidden="true" /> : null}
                    </li>
                  ))}
                </ol>
              ) : null}
              <button
                className="ghost-action"
                onClick={() => {
                  setSelected(null);
                  if (volverACargaId) {
                    setCargaAbiertaId(volverACargaId);
                    setVolverACargaId(null);
                    setDocKindTab("CARGA_MASIVA");
                  }
                }}
                type="button"
              >
                <Icono nombre="chevron-izquierda" /> {volverACargaId ? "Volver a la carga" : "Volver a resultados"}
              </button>

              <div className="receipt-summary">
                <div>
                  <dt>Cliente</dt>
                  <dd>{selected.cliente.razon_social}</dd>
                </div>
                <div>
                  <dt>Documento</dt>
                  <dd>{selected.cliente.documento}</dd>
                </div>
                {/* SPEC_DIRECCION_RECEPTOR_v0.1 RN-08: la direccion del cliente guardada en la factura. */}
                {tieneDireccion(selected.cliente) ? (
                  <div>
                    <dt>Dirección</dt>
                    <dd>
                      {textoDireccion(selected.cliente)}
                      {domicilioCompleto(selected.cliente) ? null : (
                        <small className="ficha-direccion-no-enviada">{DIRECCION_NO_ENVIADA}</small>
                      )}
                    </dd>
                  </div>
                ) : null}
                {selected.origen ? (
                  /* SPEC_NOTA_CREDITO_FACTURA_EXTERNA_v0.1 D-6 (PLAN 7): de donde salieron los datos. */
                  <div className="ficha-origen-externa">
                    <dt>Origen</dt>
                    <dd>
                      {selected.origen === "SIFEN"
                        ? `Externa · traída de SIFEN${selected.sifen_consulta?.protocolo ? ` (protocolo ${selected.sifen_consulta.protocolo})` : ""}`
                        : "Externa · cargada a mano · datos no verificados en SIFEN"}
                      {selected.referencia_impresa ? <small className="muted"> · Factura impresa, timbrado {selected.referencia_impresa.timbrado}</small> : null}
                    </dd>
                  </div>
                ) : null}
                {selected.tipo === "NOTA_REMISION" ? (
                  <>
                    <div>
                      <dt>Motivo</dt>
                      <dd>{selected.remision?.motivo_descripcion ?? "-"}</dd>
                    </div>
                    <div>
                      <dt>Traslado</dt>
                      <dd>{selected.remision?.inicio_traslado ?? "-"}{selected.remision?.fin_traslado ? ` al ${selected.remision.fin_traslado}` : ""}{selected.remision?.kilometros ? ` · ${selected.remision.kilometros} km` : ""}</dd>
                    </div>
                    <div>
                      <dt>Transportista</dt>
                      <dd>{selected.remision?.transportista ?? "-"}</dd>
                    </div>
                    <div>
                      <dt>Vehículo</dt>
                      <dd>{selected.remision?.vehiculo ?? "-"}</dd>
                    </div>
                  </>
                ) : (
                  <div>
                    <dt>Total</dt>
                    <dd>{formatMonto(selected.totals.total, selected.moneda)}{selected.moneda && selected.moneda !== "PYG" && selected.tipo_cambio ? <small className="muted"> · Tipo de cambio {selected.tipo_cambio.toLocaleString("es-PY")}</small> : null}{selected.moneda && selected.moneda !== "PYG" && selected.totals.fuente === "FE" && selected.totals.total_guaranies != null ? <small className="muted"> · Equivale a {formatGuaranies(selected.totals.total_guaranies)}</small> : null}</dd>
                  </div>
                )}
                {/* SPEC_DESCUENTOS_FACTURA_v0.1 RN-19: el descuento (oficial de FE si ya esta aprobada). */}
                {(() => {
                  const fila = filaDescuento(selected.totals);
                  return fila ? (
                    <div>
                      <dt>{fila.etiqueta}</dt>
                      <dd>− {formatMonto(fila.monto, selected.moneda)}</dd>
                    </div>
                  ) : null;
                })()}
                <div>
                  <dt>Email</dt>
                  <dd>{formatEmailStatus(emailStatus?.status ?? selected.delivery.email_status)}</dd>
                </div>
                {formatEmisor(selected) || selected.perfil_emision ? (
                  <div>
                    <dt>Emitida por</dt>
                    <dd>{[selected.perfil_emision ? nombrePunto(selected.perfil_emision) : null, formatEmisor(selected)].filter(Boolean).join(" · ")}</dd>
                  </div>
                ) : null}
                {selected.corregida_por || selected.corrige_a ? (
                  <div data-testid="vinculo-correccion">
                    <dt>{selected.corregida_por ? "Corregida por" : "Corrige a"}</dt>
                    <dd>
                      <button
                        className="carga-enlace"
                        onClick={() => void openDetail((selected.corregida_por ?? selected.corrige_a)!.id)}
                        type="button"
                      >
                        Factura {(selected.corregida_por ?? selected.corrige_a)!.numero_fiscal ?? "sin número"}
                      </button>
                    </dd>
                  </div>
                ) : null}
                {selected.inutilizacion ? (
                  <div data-testid="estado-inutilizacion">
                    <dt>Número</dt>
                    <dd>{formatInutilizacion(selected.inutilizacion)}</dd>
                  </div>
                ) : null}
              </div>

              <section className="invoice-lines" aria-label={selected.tipo === "NOTA_REMISION" ? "Mercaderia trasladada" : "Productos vendidos"}>
                <h4>{selected.tipo === "NOTA_REMISION" ? "Mercadería trasladada" : "Productos vendidos"}</h4>
                <div className="invoice-lines-list">
                  {selected.items.map((item) => (
                    <article className="invoice-line-card" key={`${selected.id}-${item.line_no}`}>
                      <strong>
                        {formatCantidad(item.cantidad)} x {item.descripcion}
                      </strong>
                      {selected.tipo === "NOTA_REMISION" ? null : <small>{formatMonto(item.subtotal, selected.moneda)}</small>}
                    </article>
                  ))}
                </div>
              </section>

              {selected.tipo === "FACTURA" && fichaSaldo && fichaSaldo.lineas.some((linea) => linea.cantidad_acreditada > 0) ? (
                <section className="invoice-lines nc-acreditado" aria-label="Devuelto por notas de crédito">
                  <h4>Devuelto por notas de crédito</h4>
                  <div className="invoice-lines-list">
                    {fichaSaldo.lineas
                      .filter((linea) => linea.cantidad_acreditada > 0)
                      .map((linea) => (
                        <article className="invoice-line-card" key={`saldo-${linea.line_no}`}>
                          <strong>
                            {formatCantidad(linea.cantidad_acreditada)} de {formatCantidad(linea.cantidad_facturada)} x {linea.descripcion}
                          </strong>
                          <small>{linea.saldo > 0 ? `Saldo ${formatCantidad(linea.saldo)}` : "Devuelta"}</small>
                        </article>
                      ))}
                  </div>
                </section>
              ) : null}

              {/* URA-007 (P-L7, H-11): el aviso solo aparece si hay algo que hacer; el estado ya esta en la pastilla. */}
              {selected.accion_detalle && selected.accion !== "OK" ? (
                <div className={`accion-banner ${accionBannerClass(selected.accion)}`}>
                  <p className="accion-banner-titulo">{selected.accion_detalle.titulo}</p>
                  <p className="accion-banner-descripcion">{selected.accion_detalle.descripcion}</p>
                  {selected.estado === "RECHAZADA" && selected.tipo === "FACTURA" && selected.inutilizacion?.status !== "ACCEPTED" ? (
                    <p className="accion-banner-descripcion">{AVISO_INUTILIZACION}</p>
                  ) : null}
                  {selected.tipo !== "NOTA_REMISION" && (selected.accion_detalle.acciones_sugeridas.length > 0 || puedeVerificarAhora(selected)) ? (
                    <div className="accion-banner-acciones">
                      {puedeVerificarAhora(selected) ? (
                        <button className="secondary-action" disabled={actionLoading} onClick={() => void refreshSelectedStatus()} type="button">
                          Verificar estado fiscal
                        </button>
                      ) : null}
                      {selected.accion_detalle.acciones_sugeridas.includes("REINTENTAR") && selected.puede_reintentar_emision ? (
                        <button className="secondary-action" disabled={actionLoading} onClick={() => void retrySelectedEmission()} type="button">
                          Reintentar emisión
                        </button>
                      ) : null}
                      {selected.accion_detalle.acciones_sugeridas.includes("CORREGIR_REEMITIR") ? (
                        <button
                          className="secondary-action"
                          onClick={() => (onCorregirFactura ? onCorregirFactura(borradorDeCorreccion(selected)) : onGoTo?.("invoice"))}
                          type="button"
                        >
                          Corregir y emitir de nuevo
                        </button>
                      ) : null}
                      {selected.accion_detalle.acciones_sugeridas.includes("INUTILIZAR_NUMERO") && inutilizarMotivo === null ? (
                        <button
                          className="secondary-action"
                          data-testid="inutilizar-numero"
                          disabled={actionLoading}
                          onClick={() => setInutilizarMotivo("Factura rechazada por SIFEN")}
                          type="button"
                        >
                          Inutilizar número
                        </button>
                      ) : null}
                      {selected.accion_detalle.acciones_sugeridas.includes("REINTENTAR_NOTA_CREDITO") ? (
                        <button className="secondary-action" data-testid="reintentar-nota-credito" disabled={actionLoading} onClick={() => void retryNotaCredito(selected)} type="button">
                          Reintentar nota de crédito
                        </button>
                      ) : null}
                      {selected.accion_detalle.acciones_sugeridas.includes("NUEVA_NOTA_CREDITO") ? (
                        <button className="secondary-action" data-testid="nueva-nota-credito" disabled={actionLoading} onClick={() => openNuevaNotaCredito(selected)} type="button">
                          Emitir nueva nota de crédito
                        </button>
                      ) : null}
                      {selected.accion_detalle.acciones_sugeridas.includes("CREAR_NCE") ? (
                        <button className="secondary-action" disabled={actionLoading || !canEmitNotaCredito(selected, documents, Boolean(context?.nc_moneda_extranjera_habilitada))} onClick={() => void emitSelectedNotaCredito()} type="button">
                          Crear nota de crédito
                        </button>
                      ) : null}
                      {selected.accion_detalle.acciones_sugeridas.includes("CONTACTAR_SOPORTE") && selected.accion_detalle.soporte_payload ? (
                        <button className="secondary-action" onClick={() => void copySoportePayload(selected.accion_detalle!.soporte_payload!)} type="button">
                          <Icono nombre="copiar" /> Copiar datos para soporte
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                  {inutilizarMotivo !== null ? (
                    <div className="carga-confirmacion" role="dialog" aria-label={`Inutilizar número ${selected.numero_fiscal ?? ""}`}>
                      <p>
                        <strong>¿Inutilizar el número {selected.numero_fiscal}?</strong> SIFEN lo registra como inutilizado y no se
                        vuelve a usar. No se puede deshacer.
                      </p>
                      <label>
                        Motivo
                        <textarea
                          maxLength={MOTIVO_INUTILIZACION_MAX}
                          onChange={(event) => setInutilizarMotivo(event.target.value)}
                          rows={2}
                          value={inutilizarMotivo}
                        />
                      </label>
                      <small className="muted">
                        {inutilizarMotivo.trim().length} de {MOTIVO_INUTILIZACION_MAX} caracteres. Mínimo {MOTIVO_INUTILIZACION_MIN}.
                      </small>
                      <div className="carga-acciones">
                        <button className="secondary-action" disabled={actionLoading} onClick={() => setInutilizarMotivo(null)} type="button">
                          Volver
                        </button>
                        <button
                          className="primary-action"
                          data-testid="confirmar-inutilizar"
                          disabled={actionLoading || inutilizarMotivo.trim().length < MOTIVO_INUTILIZACION_MIN}
                          onClick={() => void inutilizarSelected()}
                          type="button"
                        >
                          Sí, inutilizar
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <>
                  {getRecoverableMessage(selected) ? <p className="editor-alert blocked">{getRecoverableMessage(selected)}</p> : null}
                  {selected.estado === "RECHAZADA" ? (
                    <p className="editor-alert blocked">{getRejectedSifenMessage(selectedSifenSummary)}</p>
                  ) : null}
                </>
              )}
              {emailStatus?.message ? <p className="editor-alert ready">{emailStatus.message}</p> : null}

              {selected.origen ? (
                <p className="muted" data-testid="externa-sin-entrega">
                  Esta factura no se emitió en este sistema: no tiene PDF ni enlace para compartir.
                </p>
              ) : sinValidezFiscal(selected) ? (
                <p className="editor-alert blocked" data-testid="sin-validez">
                  Esta {getDocumentoNombreLower(selected.tipo)} no tiene validez fiscal: no se puede ver ni compartir con el cliente.
                </p>
              ) : (
              <div className="delivery-actions">
                {/* URA-007 (SPEC C.4, P-I1): entrega en una grilla de dos columnas, con iconos y sin emojis. */}
                <div className="action-group action-group-primary ficha-entrega">
                  <h4 className="group-title">Entregar al cliente</h4>
                  <a className={selectedKudeUrl ? "secondary-link" : "secondary-link disabled"} href={selectedKudeUrl ?? "#"} rel="noreferrer" target="_blank">
                    <Icono nombre="pdf" /> Ver {getDocumentoNombreLower(selected.tipo)} PDF
                  </a>
                  <a className={deliveryLink ? "secondary-link" : "secondary-link disabled"} href={deliveryLink?.whatsapp_url ?? "#"} rel="noreferrer" target="_blank">
                    <Icono nombre="whatsapp" /> Enviar por WhatsApp
                  </a>
                  <a className={deliveryLink ? "secondary-link" : "secondary-link disabled"} href={deliveryLink?.public_url ?? "#"} rel="noreferrer" target="_blank">
                    <Icono nombre="compartir" /> Compartir {getDocumentoNombreLower(selected.tipo)}
                  </a>
                  <button className="secondary-action" disabled={!deliveryLink} onClick={() => void copyDetailLink()} type="button">
                    <Icono nombre="copiar" /> Copiar enlace
                  </button>
                </div>
              </div>
              )}

              <div className="action-group action-group-secondary">
                {/* URA-007 (SPEC C.4): lo que se emite desde esta factura, con el estado de cada tipo (A.2). */}
                <h4 className="group-title">{selected.tipo === "FACTURA" ? "Desde esta factura" : `Acciones sobre esta ${getDocumentoNombreLower(selected.tipo)}`}</h4>
                {selected.tipo === "FACTURA" && selected.condicion_venta === "CREDITO" && !selected.origen ? (
                  <button
                    className="secondary-action"
                    disabled={actionLoading}
                    onClick={() => {
                      void (async () => {
                        try {
                          await api.request(`/facturas/${selected.id}/recibo`, { method: "POST" });
                          onGoTo?.("recibos");
                        } catch (err) {
                          // SPEC_AJUSTES_TEXTOS_OPERADOR_v0.1, A-8: el error se muestra, como en las demas acciones.
                          setError(err instanceof Error ? err.message : "No se pudo emitir el recibo de cobro.");
                        }
                      })();
                    }}
                    type="button"
                  >
                    <Icono nombre="recibos" /> Emitir recibo de cobro
                  </button>
                ) : null}
                {selected.tipo !== "NOTA_REMISION" ? (
                <button className="secondary-action" disabled={actionLoading || !canEmitNotaCredito(selected, documents, Boolean(context?.nc_moneda_extranjera_habilitada))} onClick={() => void emitSelectedNotaCredito()} type="button">
                  <Icono nombre="credito" /> Crear nota de crédito
                </button>
                ) : null}
                {selected.origen && selected.puede_eliminar_externa ? (
                  <button className="secondary-action" disabled={actionLoading} onClick={() => void eliminarFacturaExterna()} type="button">
                    <Icono nombre="alerta" /> Eliminar factura externa
                  </button>
                ) : null}
                {selected.tipo === "FACTURA" && !selected.origen ? (
                  <>
                    <button className="secondary-action" disabled title="Disponible próximamente" type="button">
                      <Icono nombre="debito" /> Nota de débito <span className="menu-tag">Próximamente</span>
                    </button>
                    <button className="secondary-action" disabled title="La emisión manual llega con FS-56" type="button">
                      <Icono nombre="remision" /> Nota de remisión para esta venta <span className="menu-tag">Próximamente</span>
                    </button>
                  </>
                ) : null}
                {selected.tipo === "FACTURA" && esClienteInnominado(selected.cliente) ? <small className="muted">{AVISO_NOTA_CREDITO_INNOMINADA}</small> : null}
                {(selected.totals?.anticipo ?? 0) > 0 ? <small className="muted">{AVISO_NOTA_CREDITO_CON_ANTICIPO}</small> : null}
                {selected.moneda && selected.moneda !== "PYG" && !context?.nc_moneda_extranjera_habilitada ? <small className="muted">La nota de crédito de una factura en moneda extranjera se gestiona con soporte.</small> : null}
              </div>
              {/* SPEC_NOTA_REMISION_v0.1 RN-26: la nota de remision se anula como la factura (168 h en lugar de 48).
                  URA-007 (P-L6): anular se separa del resto, con estilo de peligro; pide motivo en su ventana. */}
              {["FACTURA", "NOTA_CREDITO", "NOTA_REMISION"].includes(selected.tipo) && !selected.origen ? (
                <div className="ficha-peligro">
                  <button className="danger-action" disabled={actionLoading || !canCancelDocumento(selected)} onClick={() => void cancelSelectedDocumento()} type="button">
                    <Icono nombre="alerta" /> Anular {getDocumentoNombreLower(selected.tipo)}
                  </button>
                </div>
              ) : null}

              {/* Resultado del ultimo intento de anulacion. Solo se muestra si hubo uno y no
                  termino aceptado: una anulacion exitosa ya se refleja en el estado. */}
              {selected.cancelacion && selected.cancelacion.status !== "ACCEPTED" ? (
                <section className="cancelacion-resultado" data-testid="cancelacion-resultado">
                  <p className="cancelacion-mensaje">{mensajeCancelacion(selected)}</p>
                  {selected.cancelacion.rejection_code ? (
                    <p className="muted">
                      Código SIFEN {selected.cancelacion.rejection_code}
                      {selected.cancelacion.intentos > 1 ? ` · ${selected.cancelacion.intentos} intentos` : null}
                    </p>
                  ) : null}
                  {selected.cancelacion.status === "REJECTED" && selected.cancelacion.retryable ? (
                    <button
                      className="secondary-action"
                      disabled={actionLoading}
                      onClick={() => openReasonModal("CANCEL_DETAIL", selected.id, selected.tipo, true)}
                      type="button"
                      data-testid="reintentar-anulacion"
                    >
                      <Icono nombre="reloj" /> Reintentar anulación
                    </button>
                  ) : null}
                  {selected.cancelacion.status === "FAILED" ? (
                    <button
                      className="secondary-action"
                      disabled={actionLoading}
                      onClick={() => void refreshSelectedStatus()}
                      type="button"
                      data-testid="consultar-tras-failed"
                    >
                      <Icono nombre="reloj" /> Consultar estado en SIFEN
                    </button>
                  ) : null}
                </section>
              ) : null}

              <details className="tech-block">
                <summary>Información fiscal</summary>
                <dl className="receipt-summary">
                  <div>
                    <dt>Código fiscal</dt>
                    <dd>{selected.cdc ?? "Pendiente"}</dd>
                  </div>
                  <div>
                    <dt>Estado fiscal</dt>
                    <dd>{formatSifenSummary(selectedSifenSummary)}</dd>
                  </div>
                  <div>
                    <dt>Estado email</dt>
                    <dd>{formatEmailStatus(emailStatus?.status ?? selected.delivery.email_status)}</dd>
                  </div>
                </dl>
              </details>
              <details className="tech-block">
                <summary>Opciones avanzadas</summary>
                <div className="result-actions">
                  <span>
                    {verificarEnOpcionesAvanzadas(selected) ? (
                      <button className="secondary-action" disabled={actionLoading} onClick={() => void refreshSelectedStatus()} type="button">
                        Verificar estado fiscal
                      </button>
                    ) : null}
                    {selected.sifen_last_checked_at ? (
                      <small className="muted"> Última verificación automática: {formatUltimaVerificacion(selected.sifen_last_checked_at)}</small>
                    ) : null}
                  </span>
                  {selected.puede_reintentar_emision ? (
                    <button className="secondary-action" disabled={actionLoading} onClick={() => void retrySelectedEmission()} type="button">
                      Reintentar emisión
                    </button>
                  ) : null}
                  <button className="secondary-action" disabled={actionLoading} onClick={() => void loadDeliveryFor(selected, true)} type="button">
                    Crear nuevo enlace
                  </button>
                  <a className={selectedXmlUrl ? "secondary-link" : "secondary-link disabled"} href={selectedXmlUrl ?? "#"} rel="noreferrer" target="_blank">
                    Descargar documento electrónico
                  </a>
                </div>
              </details>
              {isInternalSupport ? (
                <details className="tech-block">
                  <summary>Administración fiscal</summary>
                <section className="action-group action-group-internal" aria-label="Autogestion soporte">
                  <h4 className="group-title">Eventos y regularización fiscal</h4>
                  <p className="muted">Flujo sugerido: decisión, validar el impacto en el CDC y ejecutar la acción.</p>
                  {decision ? (
                    <div className="support-decision-box">
                      <p><strong>Acción recomendada:</strong> {decision.recommended_action}</p>
                      <p><strong>Confianza:</strong> {decision.decision_confidence}</p>
                      <p><strong>Motivos:</strong> {decision.reason_codes.join(", ") || "sin códigos"}</p>
                    </div>
                  ) : (
                    <p className="muted">Sin decisión disponible para este documento.</p>
                  )}
                  {cdcImpact ? (
                    <p className="muted">
                      Impacto CDC: <strong>{cdcImpact.cdc_impact}</strong> {cdcImpact.reason ? `· ${cdcImpact.reason}` : ""}
                    </p>
                  ) : null}
                  <div className="result-actions">
                    <button className="secondary-action" disabled={actionLoading} onClick={() => void validateSelectedCdcImpact()} type="button">
                      Validar impacto CDC
                    </button>
                    <button className="secondary-action" disabled={actionLoading} onClick={() => void retrySameCdcAction()} type="button">
                      Reintentar mismo CDC
                    </button>
                    <button className="secondary-action" disabled={actionLoading} onClick={() => void createDerivedAction()} type="button">
                      Crear DE derivado
                    </button>
                    <button className="secondary-action" disabled={actionLoading} onClick={() => void cancelSendAction()} type="button">
                      Cancelar envío local
                    </button>
                    <button className="secondary-action" disabled={actionLoading} onClick={() => void voidNumberAction()} type="button">
                      Inutilizar numeración
                    </button>
                  </div>
                </section>
                </details>
              ) : null}
              {message ? <p className="inline-message">{message}</p> : null}
            </>
          ) : (
            <p className="muted empty-state">Elegí un documento para ver detalle y acciones.</p>
          )}
        </aside>
        ) : null}
      </div>
      {reasonModal ? (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-panel" aria-labelledby="reason-modal-title" role="dialog" aria-modal="true">
            <header>
              <p className="eyebrow">Confirmación</p>
              <h3 id="reason-modal-title">{getReasonModalTitle(reasonModal.action, reasonModal.tipo)}</h3>
              <p className="muted">Escribí el motivo para continuar.</p>
            </header>
            <label className="credit-note-motivo">
              Motivo
              <textarea
                autoFocus
                maxLength={150}
                onChange={(event) => setReasonDraft(event.target.value)}
                placeholder={getReasonModalPlaceholder(reasonModal.action)}
                rows={4}
                value={reasonDraft}
              />
            </label>
            {reasonError ? <p className="form-error">{reasonError}</p> : null}
            <div className="result-actions">
              <button className="secondary-action" disabled={actionLoading} onClick={closeReasonModal} type="button">
                Cancelar
              </button>
              <button className="primary-action" disabled={actionLoading} onClick={() => void submitReasonModal()} type="button">
                {actionLoading ? "Procesando..." : "Confirmar"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {notaCreditoPopup ? (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-panel" aria-labelledby="nc-success-title" role="dialog" aria-modal="true">
            <header>
              <p className="eyebrow">Nota de crédito</p>
              <h3 id="nc-success-title">
                {notaCreditoPopup.accion_detalle?.acciones_sugeridas.includes("REINTENTAR_NOTA_CREDITO")
                  ? notaCreditoPopup.accion_detalle.titulo
                  : getSimpleDocumentoEstado(notaCreditoPopup.estado, notaCreditoPopup.tipo)}
              </h3>
              <p className="muted">
                {notaCreditoPopup.numero_fiscal ? `Número ${notaCreditoPopup.numero_fiscal}` : "Número pendiente"}
                {" · "}{notaCreditoPopup.cliente.razon_social}
              </p>
            </header>
            <p className={notaCreditoPopup.estado === "EMITIDA" ? "editor-alert ready" : "editor-alert blocked"}>
              {notaCreditoPopup.accion_detalle?.acciones_sugeridas.includes("REINTENTAR_NOTA_CREDITO")
                ? notaCreditoPopup.accion_detalle.descripcion
                : getNotaCreditoSuccessMessage(notaCreditoPopup.estado)}
            </p>
            <div className="result-actions">
              {notaCreditoPopup.accion_detalle?.acciones_sugeridas.includes("REINTENTAR_NOTA_CREDITO") ? (
                <button className="secondary-action" data-testid="popup-reintentar-nota-credito" disabled={actionLoading} onClick={() => void retryNotaCredito(notaCreditoPopup)} type="button">
                  Reintentar nota de crédito
                </button>
              ) : null}
              <button className="primary-action" onClick={() => setNotaCreditoPopup(null)} type="button">
                Ver nota de crédito
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {dialogoConfirmar}
    </section>
  );
}

/** RN-08: con identidad fiscal y aun sin respuesta de SIFEN, el operador puede adelantarse al worker. */
export function puedeVerificarAhora(documento: DocumentoResponse): boolean {
  // Una nota de credito trabada se destraba con "Reintentar nota de credito" (SPEC_NOTA_CREDITO_TRABADA_v0.1).
  if (documento.accion_detalle?.acciones_sugeridas.includes("REINTENTAR_NOTA_CREDITO")) return false;
  return (documento.estado === "EMITIENDO" || documento.estado === "PENDIENTE_SIFEN") && Boolean(documento.document_uuid || documento.cdc);
}

/** RN-10: en proceso el boton vive en el aviso; aca solo para otros estados no finales con identidad. */
export function verificarEnOpcionesAvanzadas(documento: DocumentoResponse): boolean {
  return Boolean(documento.document_uuid || documento.cdc) && !puedeVerificarAhora(documento) && !esEstadoFinalOperador(documento.estado);
}

export function accionBannerClass(accion: DocumentoAccion | undefined): string {
  switch (accion) {
    case "OK":
      return "ok";
    case "EN_PROCESO":
      return "en-proceso";
    case "REQUIERE_ACCION":
      return "requiere-accion";
    case "REQUIERE_SOPORTE":
      return "requiere-soporte";
    default:
      return "en-proceso";
  }
}



/**
 * El resultado de una anulacion no es binario: SIFEN puede aceptar, rechazar (de forma
 * reintentable o no) o no responder. Cada caso dice que hacer, no que codigo devolvio SIFEN.
 */
export function mensajeCancelacion(doc: DocumentoResponse): string {
  const c = doc.cancelacion;
  if (!c || c.status === "ACCEPTED") {
    return "Documento anulado.";
  }
  if (c.status === "REJECTED") {
    const motivo = c.rejection_message ? `: ${c.rejection_message}.` : ".";
    if (c.rejection_code === "0100") {
      return "SIFEN no pudo procesar la anulación en este momento y la factura sigue vigente. Esperá un minuto y reintenta.";
    }
    return c.retryable
      ? `SIFEN rechazó la anulación${motivo} Podés reintentar: suele resolverse en el segundo intento.`
      : `SIFEN rechazó la anulación de forma definitiva${motivo} Si corresponde, emití una nota de crédito.`;
  }
  if (c.status === "FAILED") {
    return "No hubo respuesta de SIFEN. La factura puede seguir vigente: consulta el estado antes de reintentar.";
  }
  return "La anulación quedó en un estado que no pudimos interpretar. Consultá el estado del documento.";
}

/** Nombre visible del emisor del documento; `null` si la respuesta no lo trae. */
export function formatEmisor(documento: DocumentoResponse): string | null {
  const emisor = documento.emitido_por;
  if (!emisor) return null;
  return emisor.display_name ?? emisor.username;
}

export function getReasonModalTitle(
  action: "CANCEL_DETAIL" | "CANCEL_LIST" | "VOID_NUMBER",
  tipo?: DocumentoResponse["tipo"]
): string {
  if (action === "VOID_NUMBER") {
    return "Inutilizar numeración";
  }
  return `Anular ${getDocumentoNombreLower(tipo ?? "FACTURA")}`;
}

export function getReasonModalPlaceholder(
  action: "CANCEL_DETAIL" | "CANCEL_LIST" | "VOID_NUMBER"
): string {
  if (action === "VOID_NUMBER") {
    return "Explicá por qué necesitás inutilizar la numeración.";
  }
  return "Ej: error en datos del comprobante o anulación solicitada por cliente.";
}

export function getNotaCreditoSuccessMessage(estado: DocumentoEstado): string {
  if (estado === "EMITIDA") {
    return "La nota de crédito fue aceptada por SIFEN. El PDF ya está disponible para compartir.";
  }
  if (estado === "PENDIENTE_SIFEN" || estado === "EMITIENDO") {
    return "La nota de crédito fue enviada al sistema fiscal y está pendiente de confirmación SIFEN. Refrescar el estado es seguro — se usa la misma referencia idempotente.";
  }
  return "La nota de crédito fue procesada. Verificar el estado fiscal para continuar.";
}

export function canCancelDocumento(documento: DocumentoResponse): boolean {
  // SPEC_NOTA_REMISION_v0.1 RN-26: la nota de remision tambien se anula (hasta 168 horas desde la aprobacion).
  return (documento.tipo === "FACTURA" || documento.tipo === "NOTA_REMISION") && documento.estado === "EMITIDA" && Boolean(documento.cdc);
}

/** SPEC_TOTALES_FE_EN_CARGA_v0.1, RN-08. */
export const AVISO_NOTA_CREDITO_CON_ANTICIPO = "Esta factura tiene anticipo: la nota de crédito se gestiona con soporte.";

export function canEmitNotaCredito(documento: DocumentoResponse, documents: DocumentoResponse[], ncMonedaExtranjera = false): boolean {
  // SPEC_NOTA_CREDITO_FACTURA_EXTERNA_v0.1: una externa impresa no tiene CDC; tiene referencia impresa.
  if (documento.tipo !== "FACTURA" || documento.estado !== "EMITIDA" || (!documento.cdc && !documento.referencia_impresa)) {
    return false;
  }
  // SPEC_COMPRADOR_INNOMINADO_v0.1, RN-06: SIFEN no admite NC sobre una factura sin nombre.
  if (esClienteInnominado(documento.cliente)) {
    return false;
  }
  if ((documento.totals?.anticipo ?? 0) > 0) {
    return false;
  }
  // SPEC_MONEDA_EXTRANJERA_v0.1, D-1: solo con FE que emite la nota en la moneda de la factura.
  if (documento.moneda && documento.moneda !== "PYG" && !ncMonedaExtranjera) {
    return false;
  }

  // SPEC_NOTA_CREDITO_PARCIAL_v0.1: con notas vivas puede quedar saldo; la ventana lo consulta
  // (GET /nota-credito/saldo) y ofrece la parcial o avisa que esta acreditada por completo.
  void documents;
  return true;
}

export function getSifenSummary(documento: DocumentoResponse): SifenSummary | null {
  const source = documento.fiscal_status;
  if (!source) {
    return null;
  }

  const summary: SifenSummary = {
    code: findNestedFiscalValue(source, "dCodRes"),
    message: findNestedFiscalValue(source, "dMsgRes"),
    status: findNestedFiscalValue(source, "dEstRes"),
    processedAt: findNestedFiscalValue(source, "dFecProc")
  };

  if (!summary.code && !summary.message && !summary.status && !summary.processedAt) {
    return null;
  }

  return summary;
}

export function findNestedFiscalValue(value: unknown, targetKey: string): string | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    const normalizedKey = key.includes(":") ? key.split(":").at(-1) : key;
    if (normalizedKey === targetKey && (typeof nestedValue === "string" || typeof nestedValue === "number")) {
      return String(nestedValue);
    }

    if (Array.isArray(nestedValue)) {
      for (const item of nestedValue) {
        const found = findNestedFiscalValue(item, targetKey);
        if (found) {
          return found;
        }
      }
      continue;
    }

    const found = findNestedFiscalValue(nestedValue, targetKey);
    if (found) {
      return found;
    }
  }

  return null;
}

export function formatSifenSummary(summary: SifenSummary | null): string {
  if (!summary) {
    return "Sin respuesta fiscal resumida";
  }

  const status = summary.status ? `${summary.status} · ` : "";
  if (summary.code && summary.message) {
    return `${status}${summary.code} · ${summary.message}`;
  }
  if (summary.message) {
    return `${status}${summary.message}`;
  }
  if (summary.code) {
    return `${status}${summary.code}`;
  }
  return summary.status ?? "Sin respuesta fiscal resumida";
}

/** FS-34: estado del documento a primera vista en el listado. */
/** URA-017: la pastilla sale del mapa unico de lib/estados.ts, sin emojis (PAUTAS_FRONTEND_v0.1 P-E1, P-I1). */
export function EstadoDocumentoPill({ documento }: { documento: DocumentoResponse }) {
  return <PastillaEstado {...estadoDocumento(documento)} />;
}

/** FS-31, RN-31.1: estados sin validez fiscal. Mismo criterio que el servicio de entrega. */
export function sinValidezFiscal(documento: Pick<DocumentoResponse, "estado">): boolean {
  return ["RECHAZADA", "ERROR_OPERATIVO", "ERROR_TEMPORAL", "CANCELADO_LOCAL"].includes(documento.estado);
}

/** FS-28: la factura nueva parte de los datos de la rechazada; la rechazada no cambia. */
export function borradorDeCorreccion(documento: DocumentoResponse): InvoiceInitialDraft {
  return {
    cliente_nombre: documento.cliente.razon_social,
    cliente_ruc: documento.cliente.documento_tipo === "RUC" ? documento.cliente.documento : null,
    cliente: { ...documento.cliente, cliente_id: null },
    corrige_numero: documento.numero_fiscal,
    corrige_documento_id: documento.id,
    items: documento.items.map((item) => ({
      descripcion: item.descripcion,
      cantidad: item.cantidad,
      precio_unitario: item.precio_unitario,
      iva_tipo: item.iva_tipo,
      catalog_item_id: item.catalogo_item_id ?? null
    }))
  };
}

/**
 * SPEC_CORRECCION_INUTILIZACION_RECHAZADAS_v0.1, RN-C3: reemplaza el aviso de FS-36. El operador
 * inutiliza el numero desde el detalle.
 */
export const AVISO_INUTILIZACION =
  "El número de esta factura quedó sin usar. Conviene inutilizarlo antes del día 15 del mes siguiente: SIFEN no lo vuelve a usar.";

export const MOTIVO_INUTILIZACION_MIN = 5;

export const MOTIVO_INUTILIZACION_MAX = 150;

export function formatInutilizacion(inutilizacion: DocumentoInutilizacion): string {
  if (inutilizacion.status === "ACCEPTED") return "Inutilizado ante SIFEN";
  if (inutilizacion.status === "REJECTED") {
    return `SIFEN rechazó la inutilización${inutilizacion.rejection_code ? ` (${inutilizacion.rejection_code})` : ""}${inutilizacion.rejection_message ? `: ${inutilizacion.rejection_message}` : ""}`;
  }
  return "La inutilización no tuvo respuesta. Puede volver a intentar.";
}

export function getRejectedSifenMessage(summary: SifenSummary | null): string {
  const base = `Documento rechazado por SIFEN: ${formatSifenSummary(summary)}.`;
  if (summary?.code === "1306") {
    return `${base} SIFEN no encontró el RUC del cliente: revisá el número y el dígito verificador, o emití con la cédula si no tiene RUC. ${AVISO_INUTILIZACION}`;
  }
  return `${base} Revisá los datos del receptor y el detalle fiscal antes de reintentar. ${AVISO_INUTILIZACION}`;
}

export function getRecoverableMessage(documento: DocumentoResponse): string | null {
  if (documento.estado === "EMITIENDO") {
    return "La factura quedó en cola. Puede consultar el detalle o refrescar cuando el backend fiscal responda.";
  }
  if (documento.estado === "PENDIENTE_SIFEN") {
    return "La confirmación fiscal está pendiente. Refrescar estado o reintentar es seguro porque se usa la misma referencia idempotente.";
  }
  if (documento.estado === "ERROR_TEMPORAL") {
    return "Hubo un error temporal de comunicación fiscal. Podés reintentar sin duplicar el documento operativo.";
  }
  return null;
}


