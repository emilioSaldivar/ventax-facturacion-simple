// "Nueva nota de remision" (SPEC_NOTA_REMISION_v0.1 seccion C, entrega E1). Un formulario por bloques en una sola
// pantalla (patron de Notas de credito: tarjetas a la izquierda y panel fijo a la derecha). Las reglas y los mensajes
// son los de la API (`lib/validacionRemision.ts`, espejo); al emitir se valida tambien en el servidor y manda el.
import { useEffect, useMemo, useState } from "react";
import { useApi } from "../api/useApi";
import { Aviso } from "../components/Aviso";
import { CampoFormulario } from "../components/CampoFormulario";
import { Icono } from "../components/Icono";
import { ResultadoEmision } from "../components/ResultadoEmision";
import { SelectorDomicilio, domicilioVacio, type Domicilio } from "../components/SelectorDomicilio";
import { useEntregaDocumento } from "../lib/useEntregaDocumento";
import { hoyAsuncion, validarNotaRemision } from "../lib/validacionRemision";
import type { NotaRemisionInput, NotaRemisionLocal } from "../lib/tiposRemision";
import type { CatalogoItem, ClienteSearchResult, DocumentoResponse, OperationalContextResponse } from "../tipos";

interface Linea {
  id: string;
  codigo: string;
  descripcion: string;
  cantidad: string;
  catalogo_item_id: string | null;
}

const nuevaClave = () => `nre-${crypto.randomUUID()}`;
const nuevaLinea = (): Linea => ({ id: crypto.randomUUID(), codigo: "", descripcion: "", cantidad: "1", catalogo_item_id: null });
const comoLocal = (d: Domicilio): NotaRemisionLocal => d as NotaRemisionLocal;

const MOTIVOS = [
  { valor: 1, texto: "Traslado por ventas" },
  { valor: 7, texto: "Traslado entre locales de la empresa" }
];
const RESPONSABLES = [
  { valor: 1, texto: "Emisor de la factura" },
  { valor: 2, texto: "Poseedor de la factura y bienes" },
  { valor: 3, texto: "Empresa transportista" },
  { valor: 4, texto: "Despachante de aduanas" },
  { valor: 5, texto: "Agente de transporte o intermediario" }
];
const FLETE_TERCERO = [
  { valor: 1, texto: "Emisor" },
  { valor: 2, texto: "Receptor" },
  { valor: 3, texto: "Tercero" },
  { valor: 4, texto: "Agente intermediario" }
];

export function RemisionNuevaView({
  context,
  onVerEmitidas,
  seEmitePor
}: {
  context: OperationalContextResponse;
  onVerEmitidas: () => void;
  seEmitePor: string;
}) {
  const api = useApi();
  const entrega = useEntregaDocumento(api);
  const hoy = hoyAsuncion();
  const [clave, setClave] = useState(nuevaClave);
  const [motivo, setMotivo] = useState(1);
  const [responsable, setResponsable] = useState(1);
  const [kilometros, setKilometros] = useState("");
  const [fechaPrevista, setFechaPrevista] = useState(hoy);
  // Destinatario (motivo 1).
  const [busqueda, setBusqueda] = useState("");
  const [sugerencias, setSugerencias] = useState<ClienteSearchResult[]>([]);
  const [cliente, setCliente] = useState({ cliente_id: null as string | null, documento_tipo: "RUC", documento: "", razon_social: "", telefono: "", email: "" });
  const [domicilioCliente, setDomicilioCliente] = useState<Domicilio>(domicilioVacio);
  // Transporte.
  const [tipoTransporte, setTipoTransporte] = useState<1 | 2>(1);
  const [modalidad, setModalidad] = useState(1);
  const [fleteTercero, setFleteTercero] = useState(1);
  const [inicio, setInicio] = useState(hoy);
  const [fin, setFin] = useState(hoy);
  const [costoFlete, setCostoFlete] = useState("");
  const [salida, setSalida] = useState<Domicilio>(domicilioVacio);
  const [entregaEnDestinatario, setEntregaEnDestinatario] = useState(true);
  const [entregaLocal, setEntregaLocal] = useState<Domicilio>(domicilioVacio);
  const [vehiculo, setVehiculo] = useState({ tipo: "Camion", marca: "", tipo_identificacion: 2, matricula: "", numero_identificacion: "" });
  const [transportista, setTransportista] = useState({
    naturaleza: "CONTRIBUYENTE" as "CONTRIBUYENTE" | "NO_CONTRIBUYENTE",
    nombre: context.facturador.razon_social,
    ruc: context.facturador.ruc,
    tipo_documento: 1,
    doc_nro: "",
    domicilio_fiscal: "",
    chofer: { nombre: "", doc_nro: "", direccion: "" }
  });
  const [lineas, setLineas] = useState<Linea[]>([nuevaLinea()]);
  const [sugerenciasCatalogo, setSugerenciasCatalogo] = useState<{ lineaId: string; items: CatalogoItem[] } | null>(null);
  const [infoFisco, setInfoFisco] = useState("");
  const [intento, setIntento] = useState(false);
  const [emitiendo, setEmitiendo] = useState(false);
  const [errorServidor, setErrorServidor] = useState<string | null>(null);

  // Busqueda del destinatario en la agenda (como Nueva factura).
  useEffect(() => {
    const q = busqueda.trim();
    if (q.length < 2) {
      setSugerencias([]);
      return;
    }
    const t = window.setTimeout(() => {
      api
        .get<{ items: ClienteSearchResult[] }>(`/clientes/search?q=${encodeURIComponent(q)}&limit=6`)
        .then((r) => setSugerencias(r.items.filter((c) => c.documento_tipo !== "NO_ESPECIFICADO")))
        .catch(() => setSugerencias([]));
    }, 300);
    return () => window.clearTimeout(t);
  }, [api, busqueda]);

  const input: NotaRemisionInput = useMemo(
    () => ({
      cliente:
        motivo === 1
          ? {
              cliente_id: cliente.cliente_id,
              documento_tipo: cliente.documento_tipo,
              documento: cliente.documento,
              razon_social: cliente.razon_social,
              telefono: cliente.telefono || null,
              email: cliente.email || null,
              domicilio: comoLocal(domicilioCliente)
            }
          : null,
      remision: {
        motivo,
        responsable,
        kilometros: Number(kilometros),
        fecha_futura_factura: motivo === 1 ? fechaPrevista : null,
        costo_flete: costoFlete ? Number(costoFlete) : null
      },
      transporte: {
        tipo: tipoTransporte,
        modalidad,
        responsable_flete: tipoTransporte === 1 ? 5 : fleteTercero,
        inicio_traslado: inicio,
        fin_traslado: fin,
        salida: comoLocal(salida),
        entrega_destinatario: motivo === 1 && entregaEnDestinatario,
        entrega: motivo === 7 || !entregaEnDestinatario ? comoLocal(entregaLocal) : null,
        vehiculo: {
          tipo: vehiculo.tipo,
          marca: vehiculo.marca,
          tipo_identificacion: vehiculo.tipo_identificacion,
          matricula: vehiculo.tipo_identificacion === 2 ? vehiculo.matricula : null,
          numero_identificacion: vehiculo.tipo_identificacion === 1 ? vehiculo.numero_identificacion : null
        },
        transportista: {
          naturaleza: transportista.naturaleza,
          nombre: transportista.nombre,
          ruc: transportista.naturaleza === "CONTRIBUYENTE" ? transportista.ruc : null,
          tipo_documento: transportista.naturaleza === "NO_CONTRIBUYENTE" ? transportista.tipo_documento : null,
          doc_nro: transportista.naturaleza === "NO_CONTRIBUYENTE" ? transportista.doc_nro : null,
          domicilio_fiscal: transportista.domicilio_fiscal,
          chofer: transportista.chofer
        }
      },
      items: lineas
        .filter((l) => l.descripcion.trim() || l.codigo.trim())
        .map((l) => ({ codigo: l.codigo || null, descripcion: l.descripcion, cantidad: Number(l.cantidad.replace(",", ".")), catalogo_item_id: l.catalogo_item_id })),
      informacion_fisco: infoFisco || null
    }),
    [motivo, responsable, kilometros, fechaPrevista, costoFlete, cliente, domicilioCliente, tipoTransporte, modalidad, fleteTercero, inicio, fin, salida, entregaEnDestinatario, entregaLocal, vehiculo, transportista, lineas, infoFisco]
  );

  const errores = useMemo(() => validarNotaRemision(input), [input]);
  const errorDe = (prefijo: string): string | null => {
    if (!intento) return null;
    return errores.find((e) => e.campo === prefijo || e.campo.startsWith(`${prefijo}.`))?.mensaje ?? null;
  };
  const bloqueo = errores[0]?.mensaje ?? null;

  function elegirCliente(c: ClienteSearchResult) {
    setCliente({ cliente_id: c.cliente_id, documento_tipo: c.documento_tipo, documento: c.documento, razon_social: c.razon_social, telefono: c.telefono ?? "", email: c.email ?? "" });
    setDomicilioCliente({ ...domicilioVacio(), direccion: c.direccion ?? "" });
    setBusqueda("");
    setSugerencias([]);
  }

  async function buscarCatalogo(lineaId: string, q: string) {
    if (q.trim().length < 2) {
      setSugerenciasCatalogo(null);
      return;
    }
    try {
      const r = await api.get<{ items: CatalogoItem[] }>(`/catalogo/items/search?q=${encodeURIComponent(q.trim())}&limit=5`);
      setSugerenciasCatalogo({ lineaId, items: r.items });
    } catch {
      setSugerenciasCatalogo(null);
    }
  }

  function cambiarLinea(id: string, cambio: Partial<Linea>) {
    setLineas((actual) => actual.map((l) => (l.id === id ? { ...l, ...cambio } : l)));
  }

  async function emitir() {
    setIntento(true);
    setErrorServidor(null);
    if (errores.length > 0) return;
    setEmitiendo(true);
    try {
      await api.post("/notas-remision/validar", input);
      const documento = await api.request<DocumentoResponse>("/notas-remision", {
        method: "POST",
        body: JSON.stringify(input),
        headers: { "Idempotency-Key": clave }
      });
      entrega.setDocumento(documento);
    } catch (e) {
      setErrorServidor(e instanceof Error ? e.message : "No se pudo emitir la nota de remisión.");
    } finally {
      setEmitiendo(false);
    }
  }

  // RN-20: "Crear nueva" renueva la clave y conserva transporte, vehiculo, transportista y local de salida.
  function crearNueva() {
    entrega.setDocumento(null);
    setClave(nuevaClave());
    setIntento(false);
    setErrorServidor(null);
    setCliente({ cliente_id: null, documento_tipo: "RUC", documento: "", razon_social: "", telefono: "", email: "" });
    setDomicilioCliente(domicilioVacio());
    setLineas([nuevaLinea()]);
    setKilometros("");
    setInfoFisco("");
    setEntregaLocal(domicilioVacio());
  }

  if (entrega.documento) {
    return (
      <div className="remision-resultado">
        <ResultadoEmision
          context={context}
          deliveryLink={entrega.deliveryLink}
          deliveryLoading={entrega.deliveryLoading}
          deliveryMessage={entrega.deliveryMessage}
          documento={entrega.documento}
          emailStatus={entrega.emailStatus}
          emitting={entrega.ocupado}
          onCompartir={() => void entrega.compartir()}
          onCopiar={() => void entrega.copiar()}
          onCrearNueva={crearNueva}
          onRegenerarEnlace={() => void entrega.regenerarEnlace()}
          onReintentar={() => void entrega.reintentar()}
          onVerDocumentos={onVerEmitidas}
          onVerificar={() => void entrega.verificar()}
          setWhatsappPhone={entrega.setWhatsappPhone}
          whatsappPhone={entrega.whatsappPhone}
        />
      </div>
    );
  }

  const motivoTexto = MOTIVOS.find((m) => m.valor === motivo)?.texto ?? "";
  const lineasConDatos = input.items.length;

  return (
    <div className="nc-grilla remision-form">
      <div className="nc-columna">
        <section className="nc-tarjeta" aria-labelledby="nre-motivo-titulo">
          <h3 id="nre-motivo-titulo">Motivo del traslado</h3>
          <div className="remision-fila">
            <CampoFormulario etiqueta="Motivo">
              <select id="nre-motivo" onChange={(e) => setMotivo(Number(e.target.value))} value={motivo}>
                {MOTIVOS.map((m) => (
                  <option key={m.valor} value={m.valor}>
                    {m.texto}
                  </option>
                ))}
              </select>
            </CampoFormulario>
            <CampoFormulario etiqueta="Responsable de la emisión">
              <select id="nre-responsable" onChange={(e) => setResponsable(Number(e.target.value))} value={responsable}>
                {RESPONSABLES.map((r) => (
                  <option key={r.valor} value={r.valor}>
                    {r.texto}
                  </option>
                ))}
              </select>
            </CampoFormulario>
          </div>
          <div className="remision-fila">
            <CampoFormulario ayuda="Estimados, de 1 a 99.999" error={errorDe("remision.kilometros")} etiqueta="Kilómetros">
              <input id="nre-km" inputMode="numeric" onChange={(e) => setKilometros(e.target.value.replace(/\D/g, ""))} value={kilometros} />
            </CampoFormulario>
            {motivo === 1 ? (
              <CampoFormulario ayuda="Cuándo vas a emitir la factura de esta venta" error={errorDe("remision.fecha_futura_factura")} etiqueta="Fecha prevista de la factura">
                <input id="nre-fecha-prevista" onChange={(e) => setFechaPrevista(e.target.value)} type="date" value={fechaPrevista} />
              </CampoFormulario>
            ) : null}
          </div>
          {motivo === 7 ? <p className="muted">El destinatario es tu propia empresa ({context.facturador.razon_social}); la mercadería va a otro local tuyo.</p> : null}
        </section>

        {motivo === 1 ? (
          <section className="nc-tarjeta" aria-labelledby="nre-destinatario-titulo">
            <h3 id="nre-destinatario-titulo">Destinatario</h3>
            <CampoFormulario ayuda="Buscá en tu agenda por nombre o documento" etiqueta="Buscar en la agenda">
              <input id="nre-buscar-cliente" onChange={(e) => setBusqueda(e.target.value)} type="search" value={busqueda} />
            </CampoFormulario>
            {sugerencias.length > 0 ? (
              <div className="suggestion-list">
                {sugerencias.map((s) => (
                  <button key={`${s.source}-${s.cliente_id ?? s.documento}`} onClick={() => elegirCliente(s)} type="button">
                    <strong>{s.documento}</strong>
                    <span>{s.razon_social}</span>
                  </button>
                ))}
              </div>
            ) : null}
            <div className="remision-fila">
              <CampoFormulario etiqueta="Tipo de documento">
                <select id="nre-doc-tipo" onChange={(e) => setCliente({ ...cliente, documento_tipo: e.target.value })} value={cliente.documento_tipo}>
                  <option value="RUC">RUC</option>
                  <option value="CI">CI</option>
                  <option value="PASAPORTE">Pasaporte</option>
                  <option value="CEDULA_EXTRANJERA">Cédula extranjera</option>
                </select>
              </CampoFormulario>
              <CampoFormulario error={errorDe("cliente.documento")} etiqueta="Documento">
                <input id="nre-doc" onChange={(e) => setCliente({ ...cliente, documento: e.target.value, cliente_id: null })} placeholder={cliente.documento_tipo === "RUC" ? "80012345-0" : undefined} value={cliente.documento} />
              </CampoFormulario>
            </div>
            <CampoFormulario error={errorDe("cliente.razon_social")} etiqueta="Nombre o razón social">
              <input id="nre-nombre" onChange={(e) => setCliente({ ...cliente, razon_social: e.target.value })} value={cliente.razon_social} />
            </CampoFormulario>
            <div className="remision-fila">
              <CampoFormulario error={errorDe("cliente.telefono")} etiqueta="Teléfono (opcional)">
                <input id="nre-tel" inputMode="tel" onChange={(e) => setCliente({ ...cliente, telefono: e.target.value })} value={cliente.telefono} />
              </CampoFormulario>
              <CampoFormulario error={errorDe("cliente.email")} etiqueta="Correo (opcional)">
                <input id="nre-correo" inputMode="email" onChange={(e) => setCliente({ ...cliente, email: e.target.value })} value={cliente.email} />
              </CampoFormulario>
            </div>
            <SelectorDomicilio api={api} error={errorDe("cliente.domicilio")} etiqueta="Domicilio del destinatario" idBase="nre-dest" onCambiar={setDomicilioCliente} valor={domicilioCliente} />
          </section>
        ) : null}

        <section className="nc-tarjeta" aria-labelledby="nre-transporte-titulo">
          <h3 id="nre-transporte-titulo">Transporte</h3>
          <div className="segmented-control" role="group" aria-label="Tipo de transporte">
            <button aria-pressed={tipoTransporte === 1} className={tipoTransporte === 1 ? "active" : ""} onClick={() => setTipoTransporte(1)} type="button">
              Propio
            </button>
            <button aria-pressed={tipoTransporte === 2} className={tipoTransporte === 2 ? "active" : ""} onClick={() => setTipoTransporte(2)} type="button">
              De un tercero
            </button>
          </div>
          <div className="remision-fila">
            <CampoFormulario etiqueta="Modalidad">
              <select id="nre-modalidad" onChange={(e) => setModalidad(Number(e.target.value))} value={modalidad}>
                <option value={1}>Terrestre</option>
                <option value={2}>Fluvial</option>
                <option value={4}>Multimodal</option>
              </select>
            </CampoFormulario>
            {tipoTransporte === 2 ? (
              <CampoFormulario etiqueta="Quién paga el flete">
                <select id="nre-flete" onChange={(e) => setFleteTercero(Number(e.target.value))} value={fleteTercero}>
                  {FLETE_TERCERO.map((f) => (
                    <option key={f.valor} value={f.valor}>
                      {f.texto}
                    </option>
                  ))}
                </select>
              </CampoFormulario>
            ) : (
              <CampoFormulario ayuda="Guaraníes, opcional" etiqueta="Costo del flete">
                <input id="nre-costo" inputMode="numeric" onChange={(e) => setCostoFlete(e.target.value.replace(/\D/g, ""))} value={costoFlete} />
              </CampoFormulario>
            )}
          </div>
          <div className="remision-fila">
            <CampoFormulario error={errorDe("transporte.inicio_traslado")} etiqueta="Inicio del traslado">
              <input id="nre-inicio" onChange={(e) => setInicio(e.target.value)} type="date" value={inicio} />
            </CampoFormulario>
            <CampoFormulario error={errorDe("transporte.fin_traslado")} etiqueta="Fin del traslado">
              <input id="nre-fin" onChange={(e) => setFin(e.target.value)} type="date" value={fin} />
            </CampoFormulario>
          </div>
        </section>

        <section className="nc-tarjeta" aria-labelledby="nre-lugares-titulo">
          <h3 id="nre-lugares-titulo">Salida y entrega</h3>
          <SelectorDomicilio api={api} conTelefono error={errorDe("transporte.salida")} etiqueta="Local de salida" idBase="nre-salida" onCambiar={setSalida} valor={salida} />
          {motivo === 1 ? (
            <label className="casilla">
              <input checked={entregaEnDestinatario} onChange={(e) => setEntregaEnDestinatario(e.target.checked)} type="checkbox" />
              Entregar en el domicilio del destinatario
            </label>
          ) : null}
          {motivo === 7 || !entregaEnDestinatario ? (
            <SelectorDomicilio
              api={api}
              conTelefono
              error={errorDe("transporte.entrega")}
              etiqueta={motivo === 7 ? "Local de destino" : "Lugar de entrega"}
              idBase="nre-entrega"
              onCambiar={setEntregaLocal}
              valor={entregaLocal}
            />
          ) : null}
        </section>

        <section className="nc-tarjeta" aria-labelledby="nre-vehiculo-titulo">
          <h3 id="nre-vehiculo-titulo">Vehículo, transportista y chofer</h3>
          <div className="remision-fila tres">
            <CampoFormulario ayuda="4 a 10 letras, por ejemplo Camion" error={errorDe("transporte.vehiculo.tipo")} etiqueta="Tipo de vehículo">
              <input id="nre-veh-tipo" maxLength={10} onChange={(e) => setVehiculo({ ...vehiculo, tipo: e.target.value })} value={vehiculo.tipo} />
            </CampoFormulario>
            <CampoFormulario error={errorDe("transporte.vehiculo.marca")} etiqueta="Marca">
              <input id="nre-veh-marca" maxLength={10} onChange={(e) => setVehiculo({ ...vehiculo, marca: e.target.value })} value={vehiculo.marca} />
            </CampoFormulario>
            <CampoFormulario etiqueta="Identificación">
              <select id="nre-veh-ident" onChange={(e) => setVehiculo({ ...vehiculo, tipo_identificacion: Number(e.target.value) })} value={vehiculo.tipo_identificacion}>
                <option value={2}>Matrícula</option>
                <option value={1}>Número de identificación</option>
              </select>
            </CampoFormulario>
          </div>
          {vehiculo.tipo_identificacion === 2 ? (
            <CampoFormulario ayuda="6 o 7 caracteres" error={errorDe("transporte.vehiculo.matricula")} etiqueta="Matrícula">
              <input id="nre-veh-matricula" maxLength={7} onChange={(e) => setVehiculo({ ...vehiculo, matricula: e.target.value.toUpperCase() })} value={vehiculo.matricula} />
            </CampoFormulario>
          ) : (
            <CampoFormulario error={errorDe("transporte.vehiculo.numero_identificacion")} etiqueta="Número de identificación">
              <input id="nre-veh-numero" maxLength={20} onChange={(e) => setVehiculo({ ...vehiculo, numero_identificacion: e.target.value })} value={vehiculo.numero_identificacion} />
            </CampoFormulario>
          )}
          <div className="remision-fila">
            <CampoFormulario etiqueta="Transportista">
              <select
                id="nre-trans-naturaleza"
                onChange={(e) => setTransportista({ ...transportista, naturaleza: e.target.value as "CONTRIBUYENTE" | "NO_CONTRIBUYENTE" })}
                value={transportista.naturaleza}
              >
                <option value="CONTRIBUYENTE">Contribuyente (con RUC)</option>
                <option value="NO_CONTRIBUYENTE">No contribuyente</option>
              </select>
            </CampoFormulario>
            <CampoFormulario error={errorDe("transporte.transportista.nombre")} etiqueta="Nombre del transportista">
              <input id="nre-trans-nombre" maxLength={60} onChange={(e) => setTransportista({ ...transportista, nombre: e.target.value })} value={transportista.nombre} />
            </CampoFormulario>
          </div>
          {transportista.naturaleza === "CONTRIBUYENTE" ? (
            <CampoFormulario error={errorDe("transporte.transportista.ruc")} etiqueta="RUC del transportista">
              <input id="nre-trans-ruc" onChange={(e) => setTransportista({ ...transportista, ruc: e.target.value })} placeholder="80012345-0" value={transportista.ruc} />
            </CampoFormulario>
          ) : (
            <div className="remision-fila">
              <CampoFormulario etiqueta="Tipo de documento">
                <select id="nre-trans-tipo-doc" onChange={(e) => setTransportista({ ...transportista, tipo_documento: Number(e.target.value) })} value={transportista.tipo_documento}>
                  <option value={1}>Cédula paraguaya</option>
                  <option value={2}>Pasaporte</option>
                  <option value={3}>Cédula extranjera</option>
                  <option value={4}>Carnet de residencia</option>
                </select>
              </CampoFormulario>
              <CampoFormulario error={errorDe("transporte.transportista.doc_nro")} etiqueta="Número de documento">
                <input id="nre-trans-doc" maxLength={20} onChange={(e) => setTransportista({ ...transportista, doc_nro: e.target.value })} value={transportista.doc_nro} />
              </CampoFormulario>
            </div>
          )}
          <CampoFormulario error={errorDe("transporte.transportista.domicilio_fiscal")} etiqueta="Domicilio fiscal del transportista">
            <input id="nre-trans-domicilio" maxLength={150} onChange={(e) => setTransportista({ ...transportista, domicilio_fiscal: e.target.value })} value={transportista.domicilio_fiscal} />
          </CampoFormulario>
          <div className="remision-fila tres">
            <CampoFormulario error={errorDe("transporte.transportista.chofer.nombre")} etiqueta="Nombre del chofer">
              <input id="nre-chofer-nombre" maxLength={60} onChange={(e) => setTransportista({ ...transportista, chofer: { ...transportista.chofer, nombre: e.target.value } })} value={transportista.chofer.nombre} />
            </CampoFormulario>
            <CampoFormulario ayuda="Sin puntos" error={errorDe("transporte.transportista.chofer.doc_nro")} etiqueta="Documento del chofer">
              <input id="nre-chofer-doc" maxLength={20} onChange={(e) => setTransportista({ ...transportista, chofer: { ...transportista.chofer, doc_nro: e.target.value } })} value={transportista.chofer.doc_nro} />
            </CampoFormulario>
            <CampoFormulario error={errorDe("transporte.transportista.chofer.direccion")} etiqueta="Dirección del chofer">
              <input id="nre-chofer-dir" maxLength={255} onChange={(e) => setTransportista({ ...transportista, chofer: { ...transportista.chofer, direccion: e.target.value } })} value={transportista.chofer.direccion} />
            </CampoFormulario>
          </div>
        </section>

        <section className="nc-tarjeta" aria-labelledby="nre-items-titulo">
          <h3 id="nre-items-titulo">Artículos</h3>
          <p className="muted">Sin precios: la nota de remisión solo informa qué se traslada. Unidad: unidades.</p>
          <div className="remision-lineas">
            {lineas.map((l, n) => (
              <div className="remision-linea" key={l.id}>
                <CampoFormulario etiqueta={`Código, artículo ${n + 1}`}>
                  <input id={`nre-item-codigo-${n}`} maxLength={20} onChange={(e) => cambiarLinea(l.id, { codigo: e.target.value })} value={l.codigo} />
                </CampoFormulario>
                <CampoFormulario className="remision-linea-descripcion" etiqueta={`Descripción, artículo ${n + 1}`}>
                  <input
                    id={`nre-item-desc-${n}`}
                    maxLength={120}
                    onChange={(e) => {
                      cambiarLinea(l.id, { descripcion: e.target.value, catalogo_item_id: null });
                      void buscarCatalogo(l.id, e.target.value);
                    }}
                    value={l.descripcion}
                  />
                </CampoFormulario>
                <CampoFormulario etiqueta={`Cantidad, artículo ${n + 1}`}>
                  <input id={`nre-item-cant-${n}`} inputMode="decimal" onChange={(e) => cambiarLinea(l.id, { cantidad: e.target.value.replace(/[^\d,.]/g, "") })} value={l.cantidad} />
                </CampoFormulario>
                <button
                  aria-label={`Quitar artículo ${n + 1}`}
                  className="icon-action"
                  disabled={lineas.length === 1}
                  onClick={() => setLineas((actual) => actual.filter((x) => x.id !== l.id))}
                  type="button"
                >
                  <Icono nombre="papelera" tamano={16} />
                </button>
                {sugerenciasCatalogo?.lineaId === l.id && sugerenciasCatalogo.items.length > 0 ? (
                  <div className="suggestion-list catalog remision-catalogo">
                    {sugerenciasCatalogo.items.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => {
                          // RN-17: del catalogo se toman codigo y descripcion, nunca el precio.
                          cambiarLinea(l.id, { codigo: item.codigo, descripcion: item.descripcion, catalogo_item_id: item.id });
                          setSugerenciasCatalogo(null);
                        }}
                        type="button"
                      >
                        <strong>{item.codigo}</strong>
                        <span>{item.descripcion}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
          {errorDe("items") ? <small className="campo-error">{errorDe("items")}</small> : null}
          <button className="ghost-action compact con-icono" onClick={() => setLineas((a) => [...a, nuevaLinea()])} type="button">
            <Icono nombre="mas" tamano={14} /> Agregar artículo
          </button>
        </section>

        <section className="nc-tarjeta" aria-labelledby="nre-fisco-titulo">
          <h3 id="nre-fisco-titulo">Información para el Fisco</h3>
          <CampoFormulario ayuda="Si la carga lo requiere, indicá por ejemplo 'Mercaderías con cadena de frío' o 'Carga peligrosa' (RG 41/2014)." etiqueta="Información para el Fisco (opcional)">
            <textarea id="nre-fisco" maxLength={3000} onChange={(e) => setInfoFisco(e.target.value)} rows={2} value={infoFisco} />
          </CampoFormulario>
        </section>
      </div>

      <aside className="nc-panel" aria-labelledby="nre-resumen-titulo">
        <h3 id="nre-resumen-titulo">Resumen</h3>
        <dl className="remision-resumen">
          <div>
            <dt>Motivo</dt>
            <dd>{motivoTexto}</dd>
          </div>
          <div>
            <dt>Destinatario</dt>
            <dd>{motivo === 7 ? context.facturador.razon_social : cliente.razon_social || "—"}</dd>
          </div>
          <div>
            <dt>Traslado</dt>
            <dd>
              {inicio === fin ? inicio : `${inicio} a ${fin}`}
              {kilometros ? ` · ${kilometros} km` : ""}
            </dd>
          </div>
          <div>
            <dt>Vehículo</dt>
            <dd>{[vehiculo.tipo, vehiculo.marca, vehiculo.tipo_identificacion === 2 ? vehiculo.matricula : vehiculo.numero_identificacion].filter(Boolean).join(" · ") || "—"}</dd>
          </div>
          <div>
            <dt>Transportista</dt>
            <dd>{transportista.nombre || "—"}</dd>
          </div>
          <div>
            <dt>Artículos</dt>
            <dd>{lineasConDatos}</dd>
          </div>
        </dl>
        {errorServidor ? <Aviso tono="error">{errorServidor}</Aviso> : null}
        <button className="primary-action wide" disabled={emitiendo || (intento && Boolean(bloqueo))} onClick={() => void emitir()} type="button">
          {emitiendo ? "Emitiendo..." : "Emitir nota de remisión"}
        </button>
        {bloqueo ? <p className="nc-bloqueo motivo-bloqueo">{bloqueo}</p> : null}
        <p className="muted nc-punto">{seEmitePor}</p>
      </aside>
    </div>
  );
}
