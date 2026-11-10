// Pestana "Carga masiva" de Documentos (SPEC_CARGA_MASIVA_FACTURAS_v0.1, seccion 4). PC primero.
// Recibe el cliente de API por props: main.tsx no se importa desde aca, para no crear un ciclo.
import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";

type EstadoCarga = "RECIBIDA" | "VALIDANDO" | "RECHAZADA" | "VALIDADA" | "EN_COLA" | "EN_PREPARACION" | "EN_SIFEN" | "FINALIZADA" | "CANCELADA";
type EstadoComprobante = "PENDIENTE" | "INVALIDO" | "DUPLICADO" | "PREPARADO" | "ENVIADO" | "APROBADO" | "APROBADO_CON_OBS" | "RECHAZADO" | "ERROR" | "CANCELADO";

interface Problema {
  codigo: string;
  mensaje: string;
  fila?: number;
  columna?: string;
  cantidad?: number;
}

interface Totales {
  lineas: number | null;
  comprobantes: number | null;
  invalidos: number;
  duplicados: number;
  pendientes: number;
  preparados: number;
  enviados: number;
  aprobados: number;
  aprobados_con_obs: number;
  rechazados: number;
  con_error: number;
  cancelados: number;
  con_advertencias: number;
  numeros_salteados: number;
  /** SPEC_CARGA_ATENCION_COMPROBANTES_v0.1. Ausente si FE no lo informa. */
  requieren_atencion?: number;
}

interface Carga {
  id: string;
  estado: EstadoCarga;
  nombre_archivo: string | null;
  tamano_bytes: number;
  numeracion: "SERVICIO" | "CLIENTE";
  /** SPEC_DOCUMENTOS_ESCRITORIO_v0.1, fase B1. */
  tipo_documento?: TipoDeCarga;
  totales: Partial<Totales>;
  acciones: { puede_confirmar?: boolean; puede_cancelar?: boolean; puede_reintentar?: boolean };
  motivos: Problema[];
  fechas: { cancelada_en: string | null };
  subida_por: { display_name: string | null };
  sincronizada_en: string | null;
  sync_error: string | null;
  created_at: string;
  repetida?: boolean;
}

interface Comprobante {
  orden: number;
  filas: number[];
  numero_archivo: string | null;
  numero_asignado: string | null;
  referencia_venta: string | null;
  estado: EstadoComprobante;
  errores: Problema[];
  advertencias: Problema[];
  document_uuid: string | null;
  cdc: string | null;
  sifen: { codigo: string; mensaje: string | null } | null;
  correo: "PENDING" | "SENT" | "FAILED" | null;
  documento_id: string | null;
  /** SPEC_CARGA_ATENCION_COMPROBANTES_v0.1: ausentes si FE no los informa (RN-09). */
  atencion?: { motivo: "NUMERO_SIN_USAR" | "RECHAZADO_POR_SIFEN"; numero: string } | null;
  inutilizacion?: { evento_id: string; estado: string; numero: string } | null;
  acciones?: { puede_inutilizar: boolean; puede_editar: boolean };
}

interface Lote {
  lote_id: string;
  numero_lote: string | null;
  estado: string;
  documentos: number;
  aprobados: number;
  rechazados: number;
}

export interface CargaApi {
  get: <T>(path: string) => Promise<T>;
  request: <T>(path: string, init?: RequestInit) => Promise<T>;
}

export interface CargaContexto {
  facturador: string;
  establecimiento: string;
  punto: string;
  perfil: string;
  numeracion: "SERVICIO" | "CLIENTE";
}

/**
 * SPEC_DOCUMENTOS_ESCRITORIO_v0.1, fase B1 (RN-05). Catalogo fijo `CARGA_TIPO_DOCUMENTO` de FE (`segel-rc4.21`):
 * se fija en el codigo, como FE propone, y se actualiza cuando FE habilite otro tipo.
 */
type TipoDeCarga = "FACTURA" | "NOTA_REMISION";
const TIPOS_DE_CARGA: Array<{ codigo: string; etiqueta: string; plural: string; habilitado: boolean }> = [
  { codigo: "FACTURA", etiqueta: "Factura", plural: "facturas", habilitado: true },
  { codigo: "NOTA_REMISION", etiqueta: "Nota de remisión", plural: "notas de remisión", habilitado: true },
  { codigo: "NOTA_CREDITO", etiqueta: "Nota de crédito", plural: "notas de crédito", habilitado: false },
  { codigo: "NOTA_DEBITO", etiqueta: "Nota de débito", plural: "notas de débito", habilitado: false },
  { codigo: "AUTOFACTURA", etiqueta: "Autofactura", plural: "autofacturas", habilitado: false }
];
const tipoDeCarga = (codigo: string | undefined) => TIPOS_DE_CARGA.find((tipo) => tipo.codigo === (codigo ?? "FACTURA")) ?? TIPOS_DE_CARGA[0]!;
const PLANTILLA_POR_TIPO: Record<TipoDeCarga, string> = {
  FACTURA: "plantilla-carga-facturas.csv",
  NOTA_REMISION: "plantilla-carga-notas-remision.csv"
};

const ETIQUETA_CARGA: Record<EstadoCarga, string> = {
  RECIBIDA: "Recibida",
  VALIDANDO: "Validando",
  RECHAZADA: "Archivo rechazado",
  VALIDADA: "Lista para confirmar",
  EN_COLA: "En espera de otra carga",
  EN_PREPARACION: "Emitiendo",
  EN_SIFEN: "En SIFEN",
  FINALIZADA: "Finalizada",
  CANCELADA: "Cancelada"
};

const ETIQUETA_COMPROBANTE: Record<EstadoComprobante, string> = {
  PENDIENTE: "Válido, sin emitir",
  INVALIDO: "Con errores",
  DUPLICADO: "Ya emitido antes",
  PREPARADO: "Preparado",
  ENVIADO: "Enviado a SIFEN",
  APROBADO: "Aprobado",
  APROBADO_CON_OBS: "Aprobado con observación",
  RECHAZADO: "Rechazado por SIFEN",
  ERROR: "Falla del servicio",
  CANCELADO: "Cancelado"
};

const ETIQUETA_CORREO: Record<string, string> = { PENDING: "Pendiente", SENT: "Enviado", FAILED: "No se pudo enviar" };

const ETIQUETA_ATENCION: Record<string, string> = { NUMERO_SIN_USAR: "sin usar", RECHAZADO_POR_SIFEN: "rechazado por SIFEN" };

const ETIQUETA_INUTILIZACION: Record<string, string> = { PENDING: "En curso", ACCEPTED: "Aceptada", REJECTED: "Rechazada", FAILED: "Falló" };

const MOTIVO_MIN = 5;
const MOTIVO_MAX = 150;

const ESTADOS_ACTIVOS: EstadoCarga[] = ["RECIBIDA", "VALIDANDO", "EN_COLA", "EN_PREPARACION", "EN_SIFEN"];

const FILTROS: Array<{ valor: string; etiqueta: string; query: string }> = [
  { valor: "TODOS", etiqueta: "Todos", query: "" },
  { valor: "ERRORES", etiqueta: "Con errores", query: "estado=INVALIDO" },
  { valor: "AVISOS", etiqueta: "Con avisos", query: "con_advertencias=true" },
  { valor: "APROBADOS", etiqueta: "Aprobados", query: "estado=APROBADO,APROBADO_CON_OBS" },
  { valor: "RECHAZADOS", etiqueta: "Rechazados", query: "estado=RECHAZADO" },
  { valor: "FALLAS", etiqueta: "Fallas", query: "estado=ERROR" }
];

const POR_PAGINA = 50;

/** FS-35: comprobantes que pueden necesitar ayuda de soporte. */
const CON_AYUDA: EstadoComprobante[] = ["INVALIDO", "RECHAZADO", "ERROR"];

/**
 * SPEC_CARGA_ATENCION_COMPROBANTES_v0.1, RN-10: sin nada en proceso y con numeros por resolver, la carga solo
 * espera al operador. El estado de FE no cambia; cambia lo que se muestra.
 */
function soloRequiereAtencion(carga: Pick<Carga, "totales">): boolean {
  const t = carga.totales;
  const enProceso = (t.pendientes ?? 0) + (t.preparados ?? 0) + (t.enviados ?? 0) + (t.con_error ?? 0);
  return (t.requieren_atencion ?? 0) > 0 && enProceso === 0;
}

function estadoVisible(carga: Pick<Carga, "estado" | "totales">): { etiqueta: string; clase: string } {
  if (soloRequiereAtencion(carga) && carga.estado !== "FINALIZADA" && carga.estado !== "CANCELADA") {
    return { etiqueta: "Requiere atención", clase: "rechazado" };
  }
  return { etiqueta: ETIQUETA_CARGA[carga.estado], clase: claseEstado(carga.estado) };
}

function claseEstado(estado: EstadoCarga | EstadoComprobante): string {
  if (["FINALIZADA", "APROBADO", "APROBADO_CON_OBS", "VALIDADA"].includes(estado)) return "ready";
  if (["RECHAZADA", "RECHAZADO", "INVALIDO", "ERROR"].includes(estado)) return "rechazado";
  if (["CANCELADA", "CANCELADO", "DUPLICADO"].includes(estado)) return "draft";
  return "pending";
}

function formatoFecha(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("es-PY", { dateStyle: "short", timeStyle: "short" });
}

function formatoHora(iso: string | null): string {
  return iso ? new Date(iso).toLocaleTimeString("es-PY", { hour: "2-digit", minute: "2-digit" }) : "-";
}

function formatoMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toLocaleString("es-PY", { maximumFractionDigits: 1 })} MB`;
}

function ubicacion(problema: Problema): string {
  return [problema.fila ? `Fila ${problema.fila}` : null, problema.columna ? `columna ${problema.columna}` : null].filter(Boolean).join(", ");
}

function detallesDe(error: unknown): Record<string, unknown> {
  return ((error as { details?: Record<string, unknown> } | null)?.details ?? {}) as Record<string, unknown>;
}

/** SPEC seccion 4: mensajes propios de FS. El texto de FE se muestra tal como llega. */
function mensajeDeError(error: unknown): { texto: string; motivos: Problema[] } {
  const detalles = detallesDe(error);
  const base = error instanceof Error ? error.message : "No se pudo completar la solicitud.";
  const motivos = Array.isArray(detalles.motivos) ? (detalles.motivos as Problema[]) : [];
  if ((error as { status?: number } | null)?.status === 413 && typeof detalles.tope_bytes === "number") {
    return { texto: `El archivo supera el tope de ${formatoMb(detalles.tope_bytes)}. Pártelo en archivos más chicos y súbelos por separado.`, motivos };
  }
  if ((error as { status?: number } | null)?.status === 429) {
    const espera = Number(detalles.retry_after_seconds);
    const cuando = Number.isFinite(espera) && espera > 0 ? ` Intenta de nuevo en ${espera >= 60 ? `${Math.ceil(espera / 60)} min` : `${espera} s`}.` : "";
    const cuota = detalles.fe_code === "CARGA_CUOTA_DIARIA" ? " La cuota la fija soporte." : "";
    return { texto: `${base}${cuando}${cuota}`, motivos };
  }
  if (motivos.length > 0) {
    return { texto: `${base} No es un problema del archivo: contacta a soporte.`, motivos };
  }
  return { texto: base, motivos };
}

function ListaProblemas({ problemas, clase }: { problemas: Problema[]; clase: "error" | "aviso" }) {
  if (problemas.length === 0) return null;
  return (
    <ul className={`carga-problemas ${clase}`}>
      {problemas.map((problema, indice) => (
        <li key={`${problema.codigo}-${indice}`}>
          <strong>{problema.codigo}</strong> {problema.mensaje}
          {ubicacion(problema) ? <small> ({ubicacion(problema)})</small> : null}
        </li>
      ))}
    </ul>
  );
}

export function CargaMasivaView({
  api,
  apiBaseUrl,
  accessToken,
  esInterno,
  contexto,
  cargaInicialId,
  onVerDocumento
}: {
  api: CargaApi;
  apiBaseUrl: string;
  accessToken: string | null;
  esInterno: boolean;
  contexto: CargaContexto;
  cargaInicialId?: string | null;
  onVerDocumento: (documentoId: string, cargaId: string) => void;
}) {
  const [vista, setVista] = useState<"LISTADO" | "NUEVA" | "DETALLE">(cargaInicialId ? "DETALLE" : "LISTADO");
  const [cargaId, setCargaId] = useState<string | null>(cargaInicialId ?? null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<{ texto: string; motivos: Problema[] } | null>(null);

  function fallar(causa: unknown) {
    setError(mensajeDeError(causa));
  }

  async function descargar(ruta: string, nombre: string) {
    setError(null);
    try {
      const respuesta = await fetch(`${apiBaseUrl}${ruta}`, { headers: { authorization: `Bearer ${accessToken ?? ""}` } });
      if (!respuesta.ok) throw new Error("No se pudo descargar el archivo.");
      const url = URL.createObjectURL(await respuesta.blob());
      const enlace = document.createElement("a");
      enlace.href = url;
      enlace.download = nombre;
      enlace.click();
      URL.revokeObjectURL(url);
    } catch (causa) {
      fallar(causa);
    }
  }

  function abrir(id: string, mensaje: string | null = null) {
    setCargaId(id);
    setAviso(mensaje);
    setError(null);
    setVista("DETALLE");
  }

  function volver() {
    setCargaId(null);
    setAviso(null);
    setError(null);
    setVista("LISTADO");
  }

  return (
    <section className="carga-masiva" aria-label="Carga masiva">
      {error ? (
        <div className="error-banner" role="alert">
          <p>{error.texto}</p>
          <ListaProblemas clase="error" problemas={error.motivos} />
        </div>
      ) : null}
      {aviso ? <p className="carga-aviso" role="status">{aviso}</p> : null}

      {vista === "LISTADO" ? (
        <ListadoCargas
          api={api}
          onAbrir={(id) => abrir(id)}
          onDescargarPlantilla={() => void descargar("/cargas/plantilla", "plantilla-carga-facturas.csv")}
          onError={fallar}
          onNueva={() => {
            setAviso(null);
            setError(null);
            setVista("NUEVA");
          }}
        />
      ) : null}

      {vista === "NUEVA" ? (
        <NuevaCarga
          api={api}
          contexto={contexto}
          onCancelar={volver}
          onDescargarPlantilla={(tipo) => void descargar(`/cargas/plantilla?tipo_documento=${tipo}`, PLANTILLA_POR_TIPO[tipo])}
          onError={fallar}
          onLimpiarError={() => setError(null)}
          onSubida={(carga) =>
            abrir(
              carga.id,
              carga.repetida
                ? "Este archivo ya se había subido: se abrió la carga anterior. Si se subió con el perfil equivocado, cancélala y súbelo de nuevo."
                : null
            )
          }
        />
      ) : null}

      {vista === "DETALLE" && cargaId ? (
        <DetalleCarga
          api={api}
          cargaId={cargaId}
          esInterno={esInterno}
          onDescargarResultado={(carga) =>
            void descargar(`/cargas/${carga.id}/resultado`, `resultado-${(carga.nombre_archivo ?? carga.id).replace(/\.(csv|zip)$/i, "")}.csv`)
          }
          onError={fallar}
          onLimpiarError={() => setError(null)}
          onVerDocumento={onVerDocumento}
          onVolver={volver}
        />
      ) : null}
    </section>
  );
}

function ListadoCargas({
  api,
  onAbrir,
  onNueva,
  onDescargarPlantilla,
  onError
}: {
  api: CargaApi;
  onAbrir: (id: string) => void;
  onNueva: () => void;
  onDescargarPlantilla: () => void;
  onError: (causa: unknown) => void;
}) {
  const [cargas, setCargas] = useState<Carga[]>([]);
  const [total, setTotal] = useState(0);
  const [estado, setEstado] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [pagina, setPagina] = useState(0);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    const query = new URLSearchParams({ limit: "20", offset: String(pagina * 20) });
    if (estado) query.set("estado", estado);
    if (desde) query.set("desde", desde);
    if (hasta) query.set("hasta", hasta);
    api
      .get<{ items: Carga[]; total: number }>(`/cargas?${query.toString()}`)
      .then((resultado) => {
        if (!vigente) return;
        setCargas(resultado.items);
        setTotal(resultado.total);
      })
      .catch((causa) => {
        if (vigente) onError(causa);
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });
    return () => {
      vigente = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado, desde, hasta, pagina]);

  return (
    <>
      <div className="carga-encabezado">
        <div>
          <h3>Cargas de facturas</h3>
          <p className="muted">Sube un archivo con tus ventas, revisa los errores y confirma para emitir.</p>
        </div>
        <div className="carga-acciones">
          <button className="secondary-action" onClick={onDescargarPlantilla} type="button">Descargar plantilla</button>
          <button className="primary-action" onClick={onNueva} type="button">Nueva carga</button>
        </div>
      </div>

      <div className="carga-filtros">
        <label>
          Estado
          <select
            onChange={(event) => {
              setEstado(event.target.value);
              setPagina(0);
            }}
            value={estado}
          >
            <option value="">Todos</option>
            {(Object.keys(ETIQUETA_CARGA) as EstadoCarga[]).map((valor) => (
              <option key={valor} value={valor}>{ETIQUETA_CARGA[valor]}</option>
            ))}
          </select>
        </label>
        <label>
          Desde
          <input onChange={(event) => { setDesde(event.target.value); setPagina(0); }} type="date" value={desde} />
        </label>
        <label>
          Hasta
          <input onChange={(event) => { setHasta(event.target.value); setPagina(0); }} type="date" value={hasta} />
        </label>
      </div>

      {cargando ? <p className="muted">Cargando...</p> : null}
      {!cargando && cargas.length === 0 ? (
        <p className="empty-state">Todavía no hay cargas. Empieza con "Nueva carga".</p>
      ) : null}

      {cargas.length > 0 ? (
        <table className="carga-tabla">
          <thead>
            <tr>
              <th>Archivo</th>
              <th>Tipo</th>
              <th>Fecha</th>
              <th>Estado</th>
              <th>Comprobantes</th>
              <th>Aprobados</th>
              <th>Con problemas</th>
              <th>Subida por</th>
            </tr>
          </thead>
          <tbody>
            {cargas.map((carga) => (
              <tr key={carga.id}>
                <td data-label="Archivo">
                  <button className="carga-enlace" onClick={() => onAbrir(carga.id)} type="button">{carga.nombre_archivo ?? "Sin nombre"}</button>
                </td>
                <td data-label="Tipo">{tipoDeCarga(carga.tipo_documento).etiqueta}</td>
                <td data-label="Fecha">{formatoFecha(carga.created_at)}</td>
                <td data-label="Estado"><span className={`status-pill ${estadoVisible(carga).clase}`}>{estadoVisible(carga).etiqueta}</span></td>
                <td data-label="Comprobantes">{carga.totales.comprobantes ?? "-"}</td>
                <td data-label="Aprobados">{(carga.totales.aprobados ?? 0) + (carga.totales.aprobados_con_obs ?? 0)}</td>
                <td data-label="Con problemas">{(carga.totales.invalidos ?? 0) + (carga.totales.rechazados ?? 0) + (carga.totales.con_error ?? 0)}</td>
                <td data-label="Subida por">{carga.subida_por.display_name ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {total > 20 ? (
        <div className="carga-paginas">
          <button className="secondary-action" disabled={pagina === 0} onClick={() => setPagina(pagina - 1)} type="button">Anterior</button>
          <span className="muted">Página {pagina + 1} de {Math.ceil(total / 20)}</span>
          <button className="secondary-action" disabled={(pagina + 1) * 20 >= total} onClick={() => setPagina(pagina + 1)} type="button">Siguiente</button>
        </div>
      ) : null}
    </>
  );
}

function NuevaCarga({
  api,
  contexto,
  onSubida,
  onCancelar,
  onDescargarPlantilla,
  onError,
  onLimpiarError
}: {
  api: CargaApi;
  contexto: CargaContexto;
  onSubida: (carga: Carga) => void;
  onCancelar: () => void;
  onDescargarPlantilla: (tipo: TipoDeCarga) => void;
  onError: (causa: unknown) => void;
  onLimpiarError: () => void;
}) {
  const [tipo, setTipo] = useState<TipoDeCarga>("FACTURA");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [encima, setEncima] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [problema, setProblema] = useState<string | null>(null);

  function elegir(elegido: File | undefined) {
    onLimpiarError();
    setProblema(null);
    if (!elegido) return;
    if (!/\.(csv|zip)$/i.test(elegido.name)) {
      setArchivo(null);
      setProblema("El archivo debe ser .csv o .zip.");
      return;
    }
    setArchivo(elegido);
  }

  function soltar(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setEncima(false);
    elegir(event.dataTransfer.files[0]);
  }

  async function subir() {
    if (!archivo) return;
    setSubiendo(true);
    onLimpiarError();
    try {
      const esZip = /\.zip$/i.test(archivo.name);
      const carga = await api.request<Carga>(`/cargas?nombre_archivo=${encodeURIComponent(archivo.name)}&tipo_documento=${tipo}`, {
        method: "POST",
        body: archivo,
        headers: { "content-type": esZip ? "application/zip" : "text/csv" }
      });
      onSubida(carga);
    } catch (causa) {
      onError(causa);
    } finally {
      setSubiendo(false);
    }
  }

  return (
    <>
      <div className="carga-encabezado">
        <h3>Nueva carga</h3>
        <button className="ghost-action" onClick={onCancelar} type="button">Volver</button>
      </div>

      <dl className="carga-contexto">
        <div><dt>Facturador</dt><dd>{contexto.facturador}</dd></div>
        <div><dt>Punto</dt><dd>{contexto.establecimiento}-{contexto.punto}</dd></div>
        <div><dt>Perfil</dt><dd>{contexto.perfil}</dd></div>
        <div><dt>Numeración</dt><dd>{contexto.numeracion === "CLIENTE" ? "La trae el archivo" : "La asigna el servicio"}</dd></div>
      </dl>
      <p className="muted">Todas las filas del archivo deben ser de este punto. Si una sola es de otro, se rechaza el archivo entero.</p>

      <label className="carga-tipo">
        Tipo de documento
        <select aria-label="Tipo de documento" onChange={(event) => setTipo(event.target.value as TipoDeCarga)} value={tipo}>
          {TIPOS_DE_CARGA.map((opcion) => (
            <option disabled={!opcion.habilitado} key={opcion.codigo} value={opcion.codigo}>
              {opcion.habilitado ? opcion.etiqueta : `${opcion.etiqueta} (próximamente)`}
            </option>
          ))}
        </select>
        <small className="muted">Una carga lleva un solo tipo. Cada tipo tiene su propia planilla.</small>
      </label>

      <label
        className={`carga-zona${encima ? " encima" : ""}`}
        onDragLeave={() => setEncima(false)}
        onDragOver={(event) => {
          event.preventDefault();
          setEncima(true);
        }}
        onDrop={soltar}
      >
        <input accept=".csv,.zip" aria-label="Archivo de la carga" onChange={(event) => elegir(event.target.files?.[0])} type="file" />
        {archivo ? (
          <span><strong>{archivo.name}</strong> · {formatoMb(archivo.size)}</span>
        ) : (
          <span><strong>Arrastra el archivo aquí</strong> o haz clic para elegirlo</span>
        )}
        <small>.csv o .zip, hasta 20 MB y 100.000 líneas</small>
      </label>
      {problema ? <p className="form-error">{problema}</p> : null}

      <p className="carga-aviso">Subir no emite nada: primero verás el resultado de la validación. Confirmar emite {tipoDeCarga(tipo).plural} reales.</p>

      <div className="carga-acciones">
        <button className="secondary-action" onClick={() => onDescargarPlantilla(tipo)} type="button">Descargar plantilla de {tipoDeCarga(tipo).plural}</button>
        <button className="primary-action" disabled={!archivo || subiendo} onClick={() => void subir()} type="button">
          {subiendo ? "Subiendo..." : "Subir archivo"}
        </button>
      </div>
    </>
  );
}

function Totales({ carga }: { carga: Carga }) {
  const t = carga.totales;
  const filas: Array<[string, number | null | undefined]> = [
    ["Comprobantes", t.comprobantes],
    ["Líneas", t.lineas],
    ["Válidos sin emitir", t.pendientes],
    ["Con errores", t.invalidos],
    ["Con avisos", t.con_advertencias],
    ["Ya emitidos antes", t.duplicados],
    ["En proceso", (t.preparados ?? 0) + (t.enviados ?? 0)],
    ["Aprobados", (t.aprobados ?? 0) + (t.aprobados_con_obs ?? 0)],
    ["Rechazados", t.rechazados],
    ["Fallas del servicio", t.con_error],
    ["Cancelados", t.cancelados],
    ["Requieren atención", t.requieren_atencion]
  ];
  return (
    <dl className="carga-totales">
      {filas
        .filter(([nombre, valor]) => valor !== null && valor !== undefined && (valor > 0 || nombre === "Comprobantes"))
        .map(([nombre, valor]) => (
          <div key={nombre}>
            <dt>{nombre}</dt>
            <dd>{valor}</dd>
          </div>
        ))}
    </dl>
  );
}

function DetalleCarga({
  api,
  cargaId,
  esInterno,
  onVolver,
  onVerDocumento,
  onDescargarResultado,
  onError,
  onLimpiarError
}: {
  api: CargaApi;
  cargaId: string;
  esInterno: boolean;
  onVolver: () => void;
  onVerDocumento: (documentoId: string, cargaId: string) => void;
  onDescargarResultado: (carga: Carga) => void;
  onError: (causa: unknown) => void;
  onLimpiarError: () => void;
}) {
  const [carga, setCarga] = useState<Carga | null>(null);
  const [comprobantes, setComprobantes] = useState<Comprobante[]>([]);
  const [totalComprobantes, setTotalComprobantes] = useState(0);
  const [filtro, setFiltro] = useState("TODOS");
  const [pagina, setPagina] = useState(1);
  const [confirmando, setConfirmando] = useState<"confirmar" | "cancelar" | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [informacion, setInformacion] = useState<string | null>(null);
  const [lotes, setLotes] = useState<Lote[] | null>(null);
  const [inutilizando, setInutilizando] = useState<{ orden: number; numero: string; motivo: string } | null>(null);
  const filtroRef = useRef({ filtro, pagina });
  filtroRef.current = { filtro, pagina };

  const cargarComprobantes = useCallback(async () => {
    const { filtro: actual, pagina: paginaActual } = filtroRef.current;
    const query = FILTROS.find((opcion) => opcion.valor === actual)?.query ?? "";
    const resultado = await api.get<{ items: Comprobante[]; total: number }>(
      `/cargas/${cargaId}/comprobantes?page=${paginaActual}&limit=${POR_PAGINA}${query ? `&${query}` : ""}`
    );
    setComprobantes(resultado.items);
    setTotalComprobantes(resultado.total);
  }, [api, cargaId]);

  const cargar = useCallback(async () => {
    const actual = await api.get<Carga>(`/cargas/${cargaId}`);
    setCarga(actual);
    if (actual.estado !== "RECIBIDA" && actual.estado !== "VALIDANDO" && actual.estado !== "RECHAZADA") {
      await cargarComprobantes();
    }
    return actual;
  }, [api, cargaId, cargarComprobantes]);

  useEffect(() => {
    void cargar().catch(onError);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargaId]);

  useEffect(() => {
    if (carga && carga.estado !== "RECIBIDA" && carga.estado !== "VALIDANDO" && carga.estado !== "RECHAZADA") {
      void cargarComprobantes().catch(onError);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtro, pagina]);

  const estado = carga?.estado;
  // RN-06: una VALIDADA sin nada que confirmar la cierra FE sola; se sigue mirando hasta verla cerrada.
  const activa = estado
    ? ESTADOS_ACTIVOS.includes(estado) || (estado === "VALIDADA" && carga?.acciones.puede_confirmar === false)
    : false;

  // Validar tarda segundos; el resto puede tardar horas. Se detiene con la pestana del navegador oculta.
  useEffect(() => {
    if (!activa) return;
    const espera = estado === "RECIBIDA" || estado === "VALIDANDO" ? 3000 : 15000;
    const temporizador = window.setInterval(() => {
      if (document.visibilityState === "visible") void cargar().catch(onError);
    }, espera);
    return () => window.clearInterval(temporizador);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activa, estado, cargaId]);

  async function accion(nombre: "confirmar" | "cancelar" | "reintentar") {
    setOcupado(true);
    setConfirmando(null);
    setInformacion(null);
    onLimpiarError();
    try {
      const actual = await api.request<Carga>(`/cargas/${cargaId}/${nombre}`, { method: "POST" });
      setCarga(actual);
      await cargarComprobantes();
    } catch (causa) {
      if (detallesDe(causa).reason === "CARGA_ACCION_NO_ADMITIDA") {
        setInformacion("La carga cambió de estado; se actualizó la pantalla.");
        await cargar().catch(onError);
      } else {
        onError(causa);
      }
    } finally {
      setOcupado(false);
    }
  }

  /** FS-35: mismo criterio que "Contactar soporte" en la ficha de una factura. */
  async function copiarParaSoporte(comprobante: Comprobante) {
    const problemas = [...comprobante.errores, ...comprobante.advertencias]
      .map((problema) => `- ${problema.codigo}: ${problema.mensaje}${ubicacion(problema) ? ` (${ubicacion(problema)})` : ""}`);
    const texto = [
      `Carga: ${carga?.nombre_archivo ?? "-"} (${cargaId})`,
      `Comprobante: orden ${comprobante.orden}, filas ${comprobante.filas.join("-")}`,
      `Numero del archivo: ${comprobante.numero_archivo ?? "-"}`,
      `Numero asignado: ${comprobante.numero_asignado ?? "-"}`,
      `Referencia: ${comprobante.referencia_venta ?? "-"}`,
      `Estado: ${ETIQUETA_COMPROBANTE[comprobante.estado]} (${comprobante.estado})`,
      ...(problemas.length ? ["Problemas:", ...problemas] : []),
      `Codigo SIFEN: ${comprobante.sifen?.codigo ?? "-"}`,
      `Mensaje SIFEN: ${comprobante.sifen?.mensaje ?? "-"}`,
      `document_uuid: ${comprobante.document_uuid ?? "-"}`,
      `CDC: ${comprobante.cdc ?? "-"}`
    ].join("\n");
    try {
      await navigator.clipboard.writeText(texto);
      setInformacion("Datos copiados. Puede pegarlos al contactar a soporte.");
    } catch {
      setInformacion(texto);
    }
  }

  /** SPEC_CARGA_ATENCION_COMPROBANTES_v0.1, RN-02 y RN-04. */
  async function inutilizar() {
    if (!inutilizando) return;
    const motivo = inutilizando.motivo.trim();
    if (motivo.length < MOTIVO_MIN || motivo.length > MOTIVO_MAX) return;
    setOcupado(true);
    setInformacion(null);
    onLimpiarError();
    try {
      const resultado = await api.request<{ comprobante: Comprobante }>(
        `/cargas/${cargaId}/comprobantes/${inutilizando.orden}/inutilizar`,
        { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ motivo }) }
      );
      const estadoEvento = resultado.comprobante.inutilizacion?.estado;
      setInformacion(`Inutilización del número ${inutilizando.numero} enviada: ${estadoEvento ? ETIQUETA_INUTILIZACION[estadoEvento] ?? estadoEvento : "sin respuesta"}.`);
      setInutilizando(null);
      await cargar();
    } catch (causa) {
      const reason = detallesDe(causa).reason;
      if (typeof reason === "string" && reason !== "FE_NO_DISPONIBLE") {
        setInformacion(`No se inutilizó el número ${inutilizando.numero}: ${(causa as Error).message}`);
        setInutilizando(null);
        await cargar().catch(onError);
      } else {
        onError(causa);
      }
    } finally {
      setOcupado(false);
    }
  }

  async function verLotes() {
    try {
      setLotes((await api.get<{ items: Lote[] }>(`/cargas/${cargaId}/lotes`)).items);
    } catch (causa) {
      onError(causa);
    }
  }

  if (!carga) return <p className="muted">Cargando carga...</p>;

  const t = carga.totales;
  const invalidos = t.invalidos ?? 0;
  const aEmitir = t.pendientes ?? 0;
  const procesados = (t.aprobados ?? 0) + (t.aprobados_con_obs ?? 0) + (t.rechazados ?? 0) + (t.cancelados ?? 0);
  const conResultado = (t.comprobantes ?? 0) - invalidos - (t.duplicados ?? 0);
  const avance = conResultado > 0 ? Math.min(100, Math.round((procesados / conResultado) * 100)) : 0;
  const errorInterno = carga.motivos.some((motivo) => motivo.codigo === "ERROR_INTERNO");
  const conAtencion = t.requieren_atencion ?? 0;
  const informaAtencion = t.requieren_atencion !== undefined;

  return (
    <>
      <div className="carga-encabezado">
        <div>
          <h3>{carga.nombre_archivo ?? "Carga sin nombre"}</h3>
          <p className="muted">
            <span className={`status-pill ${estadoVisible(carga).clase}`}>{estadoVisible(carga).etiqueta}</span>{" "}
            {tipoDeCarga(carga.tipo_documento).etiqueta} · Subida el {formatoFecha(carga.created_at)} por {carga.subida_por.display_name ?? "-"}
          </p>
        </div>
        <button className="ghost-action" onClick={onVolver} type="button">Volver a las cargas</button>
      </div>

      {informacion ? <p className="carga-aviso" role="status">{informacion}</p> : null}
      {carga.sync_error ? (
        <p className="carga-aviso advertencia" role="status">
          No se pudo consultar el servicio. Se muestra lo último conocido, actualizado a las {formatoHora(carga.sincronizada_en)}.
        </p>
      ) : null}

      {carga.estado === "RECIBIDA" || carga.estado === "VALIDANDO" ? <p className="carga-aviso">Validando el archivo. Tarda unos segundos.</p> : null}

      {carga.estado === "RECHAZADA" ? (
        <div className="error-banner">
          <p>
            {errorInterno
              ? "El servicio no pudo procesar este archivo. Es un problema del servicio, no del archivo: contacta a soporte."
              : "El archivo no cumple el formato y no se procesó nada. Corrígelo y vuelve a subirlo."}
          </p>
          <ListaProblemas clase="error" problemas={carga.motivos} />
          <small>Las filas se cuentan como en una planilla: los títulos son la fila 1.</small>
        </div>
      ) : null}

      <Totales carga={carga} />

      {(carga.estado === "EN_COLA" || carga.estado === "EN_PREPARACION" || carga.estado === "EN_SIFEN") && !soloRequiereAtencion(carga) ? (
        <div className="carga-avance">
          <div className="carga-barra" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={avance}>
            <span style={{ width: `${avance}%` }} />
          </div>
          <p className="muted">
            {carga.estado === "EN_COLA" ? "Espera a que termine otra carga de este facturador. " : null}
            {carga.estado === "EN_SIFEN" ? "Esperando la respuesta de SIFEN: puede tardar horas y no es un error. El último lote puede esperar hasta 15 minutos. " : null}
            Puedes cerrar esta pantalla: la carga sigue. Actualizado a las {formatoHora(carga.sincronizada_en)}.
          </p>
          {carga.fechas.cancelada_en ? (
            <p className="muted">Cancelada: lo que ya estaba preparado termina de transmitirse. Es normal ver unos pocos pendientes unos segundos.</p>
          ) : null}
        </div>
      ) : null}

      {conAtencion > 0 ? (
        <p className="carga-aviso advertencia" role="status">
          {conAtencion} comprobante(s) dejaron un número sin usar o rechazado por SIFEN. La carga no termina hasta inutilizarlos desde la tabla.
        </p>
      ) : null}

      {(t.con_error ?? 0) > 0 ? (
        <p className="carga-aviso advertencia">
          {t.con_error} comprobante(s) con falla del servicio: no son un rechazo de SIFEN. La carga no termina hasta reintentarlos o cancelarlos.
        </p>
      ) : null}

      {confirmando === "confirmar" ? (
        <div className="carga-confirmacion" role="dialog" aria-label="Confirmar emisión">
          <p><strong>Se emitirán {aEmitir} {tipoDeCarga(carga.tipo_documento).plural} reales.</strong> {invalidos > 0 ? `${invalidos} comprobante(s) con errores quedan afuera.` : null}</p>
          {invalidos > 0 && carga.numeracion === "CLIENTE" ? (
            <p>
              Los números de los {invalidos} comprobantes inválidos quedarán sin usar.{" "}
              {informaAtencion ? "Podrás inutilizarlos desde esta pantalla." : "Inutilizarlos es responsabilidad del cliente."}
            </p>
          ) : null}
          <div className="carga-acciones">
            <button className="secondary-action" onClick={() => setConfirmando(null)} type="button">Volver</button>
            <button className="primary-action" disabled={ocupado} onClick={() => void accion("confirmar")} type="button">Sí, emitir {aEmitir} {tipoDeCarga(carga.tipo_documento).plural}</button>
          </div>
        </div>
      ) : null}

      {confirmando === "cancelar" ? (
        <div className="carga-confirmacion" role="dialog" aria-label="Cancelar carga">
          <p><strong>¿Cancelar la carga?</strong> Se cancelan los comprobantes sin preparar y los que fallaron.</p>
          {carga.estado !== "VALIDADA" ? <p>Los ya preparados siguen su curso y se transmiten igual.</p> : null}
          <div className="carga-acciones">
            <button className="secondary-action" onClick={() => setConfirmando(null)} type="button">Volver</button>
            <button className="primary-action" disabled={ocupado} onClick={() => void accion("cancelar")} type="button">Sí, cancelar</button>
          </div>
        </div>
      ) : null}

      {carga.estado === "VALIDADA" && invalidos > 0 ? (
        <p className="muted">Los errores se corrigen en el archivo, no aquí. Si los corriges, sube el archivo de nuevo; si confirmas, se emiten solo los válidos.</p>
      ) : null}

      {!confirmando ? (
        <div className="carga-acciones">
          {carga.acciones.puede_confirmar ? (
            <button className="primary-action" disabled={ocupado} onClick={() => setConfirmando("confirmar")} type="button">Confirmar y emitir</button>
          ) : null}
          {carga.acciones.puede_reintentar ? (
            <button className="primary-action" disabled={ocupado} onClick={() => void accion("reintentar")} type="button">Reintentar fallas</button>
          ) : null}
          {carga.acciones.puede_cancelar ? (
            <button className="secondary-action" disabled={ocupado} onClick={() => setConfirmando("cancelar")} type="button">Cancelar carga</button>
          ) : null}
          {carga.estado === "FINALIZADA" || carga.estado === "EN_SIFEN" ? (
            <button className="secondary-action" onClick={() => onDescargarResultado(carga)} type="button">Descargar resultado</button>
          ) : null}
          {esInterno && carga.estado !== "RECHAZADA" ? (
            <button className="secondary-action" onClick={() => void verLotes()} type="button">Ver lotes SIFEN</button>
          ) : null}
        </div>
      ) : null}

      {lotes ? (
        <table className="carga-tabla">
          <thead><tr><th>Lote</th><th>Estado</th><th>Documentos</th><th>Aprobados</th><th>Rechazados</th></tr></thead>
          <tbody>
            {lotes.map((lote) => (
              <tr key={lote.lote_id}>
                <td data-label="Lote">{lote.numero_lote ?? "-"}</td>
                <td data-label="Estado">{lote.estado}</td>
                <td data-label="Documentos">{lote.documentos}</td>
                <td data-label="Aprobados">{lote.aprobados}</td>
                <td data-label="Rechazados">{lote.rechazados}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {carga.estado !== "RECIBIDA" && carga.estado !== "VALIDANDO" && carga.estado !== "RECHAZADA" ? (
        <>
          <div className="filter-tabs" role="group" aria-label="Filtrar comprobantes">
            {FILTROS.map((opcion) => (
              <button
                className={filtro === opcion.valor ? "active" : ""}
                key={opcion.valor}
                onClick={() => {
                  setFiltro(opcion.valor);
                  setPagina(1);
                }}
                type="button"
              >
                {opcion.etiqueta}
              </button>
            ))}
          </div>

          {comprobantes.length === 0 ? <p className="empty-state">No hay comprobantes con este filtro.</p> : null}

          {comprobantes.length > 0 ? (
            <table className="carga-tabla">
              <thead>
                <tr>
                  <th>Número del archivo</th>
                  <th>Número asignado</th>
                  <th>Referencia</th>
                  <th>Filas</th>
                  <th>Estado</th>
                  <th>Detalle</th>
                  <th>Correo</th>
                  <th>Documento</th>
                </tr>
              </thead>
              <tbody>
                {comprobantes.map((comprobante) => (
                  <tr key={comprobante.orden}>
                    <td data-label="Número del archivo">{comprobante.numero_archivo ?? "-"}</td>
                    <td data-label="Número asignado">{comprobante.numero_asignado ?? "-"}</td>
                    <td data-label="Referencia">{comprobante.referencia_venta ?? "-"}</td>
                    <td data-label="Filas">{comprobante.filas[0] === comprobante.filas[1] ? comprobante.filas[0] : comprobante.filas.join("-")}</td>
                    <td data-label="Estado"><span className={`status-pill ${claseEstado(comprobante.estado)}`}>{ETIQUETA_COMPROBANTE[comprobante.estado]}</span></td>
                    <td data-label="Detalle">
                      <div>
                        <ListaProblemas clase="error" problemas={comprobante.errores} />
                        <ListaProblemas clase="aviso" problemas={comprobante.advertencias} />
                        {comprobante.sifen ? <span><strong>{comprobante.sifen.codigo}</strong> {comprobante.sifen.mensaje}</span> : null}
                        {comprobante.cdc ? <small className="carga-cdc" title={comprobante.cdc}>CDC {comprobante.cdc}</small> : null}
                        {comprobante.atencion ? (
                          <span className="carga-atencion">
                            <strong>Número sin resolver:</strong> {comprobante.atencion.numero} ({ETIQUETA_ATENCION[comprobante.atencion.motivo] ?? comprobante.atencion.motivo})
                          </span>
                        ) : null}
                        {comprobante.inutilizacion ? (
                          <span className="carga-inutilizacion">
                            <strong>Inutilización:</strong> {ETIQUETA_INUTILIZACION[comprobante.inutilizacion.estado] ?? comprobante.inutilizacion.estado} ({comprobante.inutilizacion.numero})
                          </span>
                        ) : null}
                        {comprobante.atencion ? (
                          <span className="carga-acciones-comprobante">
                            {comprobante.acciones?.puede_inutilizar ? (
                              <button
                                className="secondary-action"
                                disabled={ocupado}
                                onClick={() => setInutilizando({ orden: comprobante.orden, numero: comprobante.atencion!.numero, motivo: "" })}
                                type="button"
                              >
                                Inutilizar número
                              </button>
                            ) : null}
                            <button
                              className="secondary-action"
                              disabled={!comprobante.acciones?.puede_editar}
                              title="Edición no disponible todavía"
                              type="button"
                            >
                              Editar
                            </button>
                            {!comprobante.acciones?.puede_editar ? <small className="muted">Edición no disponible todavía</small> : null}
                          </span>
                        ) : null}
                        {inutilizando?.orden === comprobante.orden ? (
                          <div className="carga-confirmacion" role="dialog" aria-label={`Inutilizar número ${inutilizando.numero}`}>
                            <p><strong>¿Inutilizar el número {inutilizando.numero}?</strong> SIFEN lo registra como inutilizado. No se puede deshacer.</p>
                            <label>
                              Motivo
                              <textarea
                                maxLength={MOTIVO_MAX}
                                onChange={(event) => setInutilizando({ ...inutilizando, motivo: event.target.value })}
                                placeholder="Ej.: factura con errores en la carga, no se emitió"
                                rows={2}
                                value={inutilizando.motivo}
                              />
                            </label>
                            <small className="muted">
                              {inutilizando.motivo.trim().length} de {MOTIVO_MAX} caracteres. Mínimo {MOTIVO_MIN}.
                            </small>
                            <div className="carga-acciones">
                              <button className="secondary-action" disabled={ocupado} onClick={() => setInutilizando(null)} type="button">Volver</button>
                              <button
                                className="primary-action"
                                disabled={ocupado || inutilizando.motivo.trim().length < MOTIVO_MIN}
                                onClick={() => void inutilizar()}
                                type="button"
                              >
                                Sí, inutilizar
                              </button>
                            </div>
                          </div>
                        ) : null}
                        {CON_AYUDA.includes(comprobante.estado) ? (
                          <button className="carga-enlace carga-soporte" onClick={() => void copiarParaSoporte(comprobante)} type="button">
                            Copiar datos para soporte
                          </button>
                        ) : null}
                      </div>
                    </td>
                    <td data-label="Correo">{comprobante.correo ? ETIQUETA_CORREO[comprobante.correo] : "-"}</td>
                    <td data-label="Documento">
                      {comprobante.documento_id ? (
                        <button className="carga-enlace" onClick={() => onVerDocumento(comprobante.documento_id!, cargaId)} type="button">Ver factura</button>
                      ) : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}

          {totalComprobantes > POR_PAGINA ? (
            <div className="carga-paginas">
              <button className="secondary-action" disabled={pagina === 1} onClick={() => setPagina(pagina - 1)} type="button">Anterior</button>
              <span className="muted">Página {pagina} de {Math.ceil(totalComprobantes / POR_PAGINA)}</span>
              <button className="secondary-action" disabled={pagina * POR_PAGINA >= totalComprobantes} onClick={() => setPagina(pagina + 1)} type="button">Siguiente</button>
            </div>
          ) : null}
        </>
      ) : null}
    </>
  );
}
