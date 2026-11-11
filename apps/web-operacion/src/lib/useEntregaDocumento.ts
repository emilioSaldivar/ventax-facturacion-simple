// Resultado de una emision: relectura cada 15 s hasta un estado final, verificar, reintentar y entrega (enlace,
// correo, copiar, compartir). Mismo comportamiento que el editor de facturas (SPEC_UX_NUEVA_FACTURA_v0.1 RN-11);
// lo usa Notas de credito (SPEC_UX_RESTO_APP_v0.1 B.1, RN-04; URA-005).
import { useEffect, useState } from "react";
import type { ClienteApi } from "../api/useApi";
import type { DeliveryLinkResponse, DocumentoResponse, EmailStatusResponse } from "../tipos";
import { esEstadoFinalOperador, getDocumentoNombreLower, mensajeNotaCredito, mensajeResultadoReintento } from "./documentos";
import { esNotaSinConfirmar } from "./estados";

export function useEntregaDocumento(api: ClienteApi) {
  const [documento, setDocumento] = useState<DocumentoResponse | null>(null);
  const [deliveryLink, setDeliveryLink] = useState<DeliveryLinkResponse | null>(null);
  const [emailStatus, setEmailStatus] = useState<EmailStatusResponse | null>(null);
  const [deliveryLoading, setDeliveryLoading] = useState(false);
  const [deliveryMessage, setDeliveryMessage] = useState<string | null>(null);
  const [whatsappPhone, setWhatsappPhone] = useState("");
  const [ocupado, setOcupado] = useState(false);

  async function cargarEntrega(documentoId: string, regenerate = false) {
    setDeliveryLoading(true);
    setDeliveryMessage(null);
    try {
      const [link, email] = await Promise.all([
        api.post<DeliveryLinkResponse>(`/facturas/${documentoId}/delivery-link`, { regenerate }),
        api.get<EmailStatusResponse>(`/facturas/${documentoId}/email-status`)
      ]);
      setDeliveryLink(link);
      setEmailStatus(email);
    } catch (error) {
      setDeliveryMessage(error instanceof Error ? error.message : "No se pudieron cargar las acciones de entrega.");
    } finally {
      setDeliveryLoading(false);
    }
  }

  useEffect(() => {
    if (!documento) {
      setDeliveryLink(null);
      setEmailStatus(null);
      setDeliveryMessage(null);
      setWhatsappPhone("");
      return;
    }
    setWhatsappPhone(documento.cliente.telefono ?? "");
    void cargarEntrega(documento.id);
  }, [documento?.id, documento?.cdc, documento?.estado]);

  useEffect(() => {
    if (!documento || esEstadoFinalOperador(documento.estado)) return undefined;
    const id = documento.id;
    const intervalo = window.setInterval(() => {
      api
        .get<DocumentoResponse>(`/facturas/${id}`)
        .then((actual) => {
          setDocumento((previo) =>
            previo && previo.id === actual.id &&
            (previo.estado !== actual.estado || previo.numero_fiscal !== actual.numero_fiscal || previo.cdc !== actual.cdc || previo.accion !== actual.accion)
              ? actual
              : previo
          );
        })
        .catch(() => undefined);
    }, 15000);
    return () => window.clearInterval(intervalo);
  }, [api, documento?.id, documento?.estado]);

  async function verificar() {
    if (!documento) return;
    setOcupado(true);
    try {
      setDocumento(await api.post<DocumentoResponse>(`/facturas/${documento.id}/refresh-status`, {}));
    } catch (error) {
      setDeliveryMessage(error instanceof Error ? error.message : "No se pudo refrescar el estado fiscal.");
    } finally {
      setOcupado(false);
    }
  }

  async function reintentar() {
    if (!documento) return;
    setOcupado(true);
    try {
      // SPEC_NOTA_CREDITO_TRABADA_v0.1: una nota sin confirmar se reintenta por su ruta propia.
      const ruta = esNotaSinConfirmar(documento) ? `/facturas/${documento.id}/nota-credito/reintentar` : `/facturas/${documento.id}/retry-emission`;
      const actualizado = await api.post<DocumentoResponse>(ruta, {});
      setDocumento(actualizado);
      setDeliveryMessage(actualizado.tipo === "NOTA_CREDITO" ? mensajeNotaCredito(actualizado) : mensajeResultadoReintento(actualizado));
    } catch (error) {
      setDeliveryMessage(error instanceof Error ? error.message : "No se pudo reintentar la emisión.");
    } finally {
      setOcupado(false);
    }
  }

  async function copiar() {
    const url = deliveryLink?.public_url;
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setDeliveryMessage("Link copiado.");
    } catch {
      setDeliveryMessage(url);
    }
  }

  async function compartir() {
    const url = deliveryLink?.public_url;
    if (!url || !documento) return;
    const nombre = getDocumentoNombreLower(documento.tipo);
    try {
      if (navigator.share) {
        await navigator.share({ title: `${nombre[0]!.toUpperCase()}${nombre.slice(1)} Segel`, text: `${nombre[0]!.toUpperCase()}${nombre.slice(1)} disponible para compartir`, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setDeliveryMessage("Enlace copiado para compartir.");
    } catch {
      setDeliveryMessage("No se pudo abrir el menu de compartir.");
    }
  }

  return {
    documento,
    setDocumento,
    deliveryLink,
    emailStatus,
    deliveryLoading,
    deliveryMessage,
    whatsappPhone,
    setWhatsappPhone,
    ocupado,
    verificar,
    reintentar,
    copiar,
    compartir,
    regenerarEnlace: () => (documento ? cargarEntrega(documento.id, true) : undefined)
  };
}
