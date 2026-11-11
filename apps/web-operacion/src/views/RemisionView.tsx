// Espacio de Notas de remision (SPEC_UX_RESTO_APP_v0.1 B.3; PLAN §4, URA-006). Hoy la nota de remision entra solo por
// planilla: pestañas "Emitidas · N" (abre Documentos en su pestaña, como en B.1 y B.2) y "Por planilla" (la carga masiva
// con el tipo NOTA_REMISION por defecto). La pestaña "Nueva nota de remisión" la agrega FS-56 con su propia cadena.
import { useEffect, useState } from "react";
import { useApi } from "../api/useApi";
import { EncabezadoPantalla } from "../components/EncabezadoPantalla";
import { CargaMasivaView } from "../carga-masiva";
import { actividadPunto, nombrePunto } from "../lib/punto";
import type { DocumentoListResponse, OperationalContextResponse, UserSummary } from "../tipos";

export function RemisionView({
  context,
  role,
  abrirNuevaCarga = false,
  onBack,
  onVerEmitidas,
  onVerDocumento
}: {
  context: OperationalContextResponse;
  role: UserSummary["role"];
  /** El menu "Nuevo" abre directamente "Nueva carga" con el tipo NOTA_REMISION. */
  abrirNuevaCarga?: boolean;
  onBack: () => void;
  onVerEmitidas: () => void;
  onVerDocumento: (documentoId: string) => void;
}) {
  const api = useApi();
  const [emitidas, setEmitidas] = useState<number | null>(null);
  const fc = context.fiscal_context;
  const seEmitePor = `Se emite por el ${[nombrePunto(fc), actividadPunto(fc)].filter(Boolean).join(" · ")}`;

  useEffect(() => {
    api
      .get<DocumentoListResponse>("/facturas?tipo=NOTA_REMISION&limit=1&offset=0")
      .then((r) => setEmitidas(r.total))
      .catch(() => setEmitidas(null));
  }, [api]);

  return (
    <section className="nc-espacio" aria-labelledby="remision-title">
      <EncabezadoPantalla id="remision-title" onVolver={onBack} subtitulo={`Traslado de mercadería · ${seEmitePor}`} titulo="Notas de remisión" />
      <div className="nc-pestanas" role="group" aria-label="Notas de remisión">
        <button aria-pressed="false" onClick={onVerEmitidas} type="button">
          Emitidas{emitidas !== null ? ` · ${emitidas}` : ""}
        </button>
        <button aria-pressed="true" className="active" type="button">
          Por planilla
        </button>
      </div>
      <CargaMasivaView
        api={api}
        contexto={{
          facturador: context.facturador.razon_social,
          establecimiento: fc.establecimiento,
          punto: fc.punto_expedicion,
          perfil: fc.perfil_emision_alias ?? fc.perfil_emision_codigo,
          numeracion: fc.numeracion_facturas ?? "SERVICIO"
        }}
        esInterno={role === "SOPORTE_INTERNO" || role === "ADMIN_INTERNO"}
        onVerDocumento={(documentoId) => onVerDocumento(documentoId)}
        tipoInicial={abrirNuevaCarga ? "NOTA_REMISION" : undefined}
        tipoPorDefecto="NOTA_REMISION"
      />
    </section>
  );
}
