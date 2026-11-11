import { Aviso } from "./Aviso";
import { etiquetaPunto, nombrePunto, type PuntoDeExpedicion } from "../lib/punto";

/**
 * La nota de credito sale por el punto activo (SPEC_MULTIPERFIL_USUARIO_v0.1 RN-05, D-1). Si la factura se emitio por
 * otro punto, se avisa antes de emitir. Lo usan Notas de credito y el modal de nota de credito de Documentos (H-08).
 */
export function AvisoPuntoDistinto({ perfilDocumento, puntoActivo }: { perfilDocumento?: PuntoDeExpedicion | null; puntoActivo?: PuntoDeExpedicion | null }) {
  if (!perfilDocumento || !puntoActivo || etiquetaPunto(perfilDocumento) === etiquetaPunto(puntoActivo)) return null;
  return (
    <Aviso tono="atencion">
      La factura se emitió por el {nombrePunto(perfilDocumento)}; la nota de crédito sale por el {nombrePunto(puntoActivo)} (punto activo).
    </Aviso>
  );
}
