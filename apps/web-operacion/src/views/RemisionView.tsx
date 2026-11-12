// Espacio de Notas de remision (SPEC_UX_RESTO_APP_v0.1 B.3; PLAN §4, URA-006). Hoy la nota de remision entra solo por
// planilla: pestañas "Emitidas · N" (abre Documentos en su pestaña, como en B.1 y B.2) y "Por planilla" (la carga masiva
// con el tipo NOTA_REMISION por defecto). La pestaña "Nueva nota de remisión" la agrega FS-56 con su propia cadena.
import { useEffect, useState } from "react";
import { useApi } from "../api/useApi";
import { EncabezadoPantalla } from "../components/EncabezadoPantalla";
import { RemisionNuevaView } from "./RemisionNuevaView";
import { CargaMasivaView } from "../carga-masiva";
import { actividadPunto, nombrePunto } from "../lib/punto";
import type { DocumentoListResponse, OperationalContextResponse, UserSummary } from "../tipos";

// SPEC_NOTA_REMISION_v0.1 RN-02b: sin permiso o numerador en FE la pestaña queda en gris, "No habilitado".
const SIN_PERMISO = "Este facturador no tiene habilitada la nota de remisión. Pedila a Segel.";

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
  const habilitada = Boolean(context.nota_remision_habilitada);
  // Con el permiso, el espacio abre en "Nueva"; el menu "Nuevo" con la planilla sigue abriendo "Por planilla".
  const [pestana, setPestana] = useState<"NUEVA" | "PLANILLA">(habilitada && !abrirNuevaCarga ? "NUEVA" : "PLANILLA");
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
        {/* SPEC_NOTA_REMISION_v0.1 RN-01 y RN-02: "Nueva nota de remisión" solo con NRE_EMIT. */}
        <button
          aria-pressed={pestana === "NUEVA"}
          className={pestana === "NUEVA" ? "active" : ""}
          disabled={!habilitada}
          onClick={() => setPestana("NUEVA")}
          title={habilitada ? undefined : SIN_PERMISO}
          type="button"
        >
          Nueva nota de remisión{habilitada ? "" : " · No habilitado"}
        </button>
        <button aria-pressed="false" onClick={onVerEmitidas} type="button">
          Emitidas{emitidas !== null ? ` · ${emitidas}` : ""}
        </button>
        <button aria-pressed={pestana === "PLANILLA"} className={pestana === "PLANILLA" ? "active" : ""} onClick={() => setPestana("PLANILLA")} type="button">
          Por planilla
        </button>
      </div>
      {!habilitada ? <p className="muted">{SIN_PERMISO}</p> : null}
      {pestana === "NUEVA" ? (
        <RemisionNuevaView context={context} onVerEmitidas={onVerEmitidas} seEmitePor={seEmitePor} />
      ) : (
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
      )}
    </section>
  );
}
