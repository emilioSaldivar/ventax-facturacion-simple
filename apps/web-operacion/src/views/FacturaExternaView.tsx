// SPEC_NOTA_CREDITO_FACTURA_EXTERNA_v0.1 (PLAN 7, NCX-007): traer al sistema una factura que no emitio FS para emitir
// notas de credito sobre ella. Dos caminos: desde SIFEN por CDC (datos del documento firmado, sin edicion) o cargada a
// mano (referencia electronica o impresa). Al guardar, el padre abre la ficha de la factura en Documentos.
import { useState } from "react";
import { useApi } from "../api/useApi";
import { Aviso } from "../components/Aviso";
import { CampoFormulario } from "../components/CampoFormulario";
import { EncabezadoPantalla } from "../components/EncabezadoPantalla";
import { formatMonto, normalizeDecimalInput } from "../lib/formato";
import { normalizarCdc, validarCdcFactura } from "../../../../packages/shared/src/fiscal/cdc";
import type { DocumentoResponse, FacturaExternaPrevia, OperationalContextResponse } from "../tipos";

type Pestana = "SIFEN" | "MANUAL";
type TipoReferencia = "ELECTRONICO" | "IMPRESO";

interface LineaManual {
  id: string;
  descripcion: string;
  cantidad: string;
  precio: string;
  iva: "IVA_10" | "IVA_5" | "EXENTA";
}

const nuevaLinea = (): LineaManual => ({ id: crypto.randomUUID(), descripcion: "", cantidad: "1", precio: "", iva: "IVA_10" });
const ETIQUETA_IVA: Record<string, string> = { IVA_10: "10 %", IVA_5: "5 %", EXENTA: "Exenta" };
const TIPOS_DOCUMENTO = [
  { valor: "RUC", etiqueta: "RUC" },
  { valor: "CI", etiqueta: "Cédula" },
  { valor: "PASAPORTE", etiqueta: "Pasaporte" },
  { valor: "CEDULA_EXTRANJERA", etiqueta: "Cédula extranjera" }
];

export function FacturaExternaView({
  context,
  onCancelar,
  onGuardada
}: {
  context: OperationalContextResponse;
  onCancelar: () => void;
  onGuardada: (documento: DocumentoResponse) => void;
}) {
  const api = useApi();
  const [pestana, setPestana] = useState<Pestana>("SIFEN");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  // Desde SIFEN.
  const [cdcTexto, setCdcTexto] = useState("");
  const [previa, setPrevia] = useState<FacturaExternaPrevia | null>(null);

  // A mano.
  const [documentoTipo, setDocumentoTipo] = useState("RUC");
  const [documento, setDocumento] = useState("");
  const [razonSocial, setRazonSocial] = useState("");
  const [moneda, setMoneda] = useState<"PYG" | "USD">("PYG");
  const [tipoCambio, setTipoCambio] = useState("");
  const [condicion, setCondicion] = useState<"CONTADO" | "CREDITO">("CONTADO");
  const [lineas, setLineas] = useState<LineaManual[]>([nuevaLinea()]);
  const [tipoReferencia, setTipoReferencia] = useState<TipoReferencia>("IMPRESO");
  const [cdcManual, setCdcManual] = useState("");
  const [timbrado, setTimbrado] = useState("");
  const [establecimiento, setEstablecimiento] = useState("");
  const [punto, setPunto] = useState("");
  const [numero, setNumero] = useState("");
  const [fecha, setFecha] = useState("");

  const emisorId = context.facturador.emisor_id;
  const errorCdc = cdcTexto.trim() ? validarCdcFactura(cdcTexto, emisorId)?.mensaje ?? null : null;

  async function consultar() {
    if (errorCdc || !cdcTexto.trim()) return;
    setOcupado(true);
    setError(null);
    setPrevia(null);
    try {
      setPrevia(await api.post<FacturaExternaPrevia>("/facturas/externas/sifen/previsualizar", { cdc: normalizarCdc(cdcTexto) }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo consultar SIFEN.");
    } finally {
      setOcupado(false);
    }
  }

  async function guardarDeSifen() {
    if (!previa) return;
    setOcupado(true);
    setError(null);
    try {
      onGuardada(await api.post<DocumentoResponse>("/facturas/externas/sifen", { cdc: previa.cdc }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la factura.");
    } finally {
      setOcupado(false);
    }
  }

  const decimales = moneda === "PYG" ? 0 : 2;
  const lineasValidas = lineas.filter((l) => l.descripcion.trim() && Number(l.cantidad.replace(",", ".")) > 0 && Number(l.precio.replace(",", ".")) > 0);
  const totalManual = lineasValidas.reduce((s, l) => s + Number(l.cantidad.replace(",", ".")) * Number(l.precio.replace(",", ".")), 0);
  const errorCdcManual = tipoReferencia === "ELECTRONICO" && cdcManual.trim() ? validarCdcFactura(cdcManual, emisorId)?.mensaje ?? null : null;
  const bloqueoManual = !documento.trim() || !razonSocial.trim()
    ? "Completá el cliente de la factura."
    : lineasValidas.length === 0
      ? "Cargá al menos una línea con descripción, cantidad y precio."
      : moneda !== "PYG" && !(Number(tipoCambio.replace(",", ".")) > 0)
        ? "Indicá el tipo de cambio de la factura."
        : tipoReferencia === "ELECTRONICO"
          ? !cdcManual.trim()
            ? "Indicá el CDC de la factura."
            : errorCdcManual
          : !/^\d{1,8}$/.test(timbrado) || !establecimiento || !punto || !numero || !fecha
            ? "Completá timbrado, establecimiento, punto, número y fecha de la factura impresa."
            : null;

  async function guardarManual() {
    if (bloqueoManual) return;
    setOcupado(true);
    setError(null);
    const referencia =
      tipoReferencia === "ELECTRONICO"
        ? { tipo: "ELECTRONICO", cdc: normalizarCdc(cdcManual) }
        : { tipo: "IMPRESO", timbrado, establecimiento, punto, numero, fecha };
    try {
      onGuardada(
        await api.post<DocumentoResponse>("/facturas/externas/manual", {
          condicion_venta: condicion,
          moneda,
          ...(moneda !== "PYG" ? { tipo_cambio: Number(tipoCambio.replace(",", ".")) } : {}),
          cliente: { documento_tipo: documentoTipo, documento: documento.trim(), razon_social: razonSocial.trim() },
          items: lineasValidas.map((l) => ({
            descripcion: l.descripcion.trim(),
            cantidad: Number(l.cantidad.replace(",", ".")),
            precio_unitario: Number(l.precio.replace(",", ".")),
            iva_tipo: l.iva
          })),
          referencia
        })
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la factura.");
    } finally {
      setOcupado(false);
    }
  }

  const cambiarLinea = (id: string, cambio: Partial<LineaManual>) => setLineas((actual) => actual.map((l) => (l.id === id ? { ...l, ...cambio } : l)));
  const soloDigitos = (valor: string, largo: number) => valor.replace(/\D/g, "").slice(0, largo);

  return (
    <section className="nc-espacio factura-externa" aria-labelledby="factura-externa-titulo">
      <EncabezadoPantalla
        id="factura-externa-titulo"
        onVolver={onCancelar}
        subtitulo="Para emitir una nota de crédito sobre una factura que no se emitió en este sistema"
        titulo="Traer una factura"
      />
      <div className="segmented-control factura-externa-pestanas" role="group" aria-label="Cómo traer la factura">
        <button aria-pressed={pestana === "SIFEN"} className={pestana === "SIFEN" ? "active" : ""} onClick={() => { setPestana("SIFEN"); setError(null); }} type="button">
          Desde SIFEN por CDC
        </button>
        <button aria-pressed={pestana === "MANUAL"} className={pestana === "MANUAL" ? "active" : ""} onClick={() => { setPestana("MANUAL"); setError(null); }} type="button">
          Cargar a mano
        </button>
      </div>
      {error ? <Aviso tono="error">{error}</Aviso> : null}

      {pestana === "SIFEN" ? (
        <div className="nc-columna">
          <section className="nc-tarjeta" aria-labelledby="fe-cdc-titulo">
            <h3 id="fe-cdc-titulo">CDC de la factura</h3>
            <div className="nc-busqueda">
              <CampoFormulario ayuda="Los 44 dígitos que figuran debajo del QR del KUDE. Podés pegarlos con espacios." error={errorCdc} etiqueta="CDC">
                <input
                  inputMode="numeric"
                  onChange={(e) => { setCdcTexto(e.target.value); setPrevia(null); }}
                  onKeyDown={(e) => { if (e.key === "Enter") void consultar(); }}
                  placeholder="0105 0570 ..."
                  value={cdcTexto}
                />
              </CampoFormulario>
              <button className="secondary-action" disabled={ocupado || !cdcTexto.trim() || Boolean(errorCdc)} onClick={() => void consultar()} type="button">
                {ocupado && !previa ? "Consultando..." : "Consultar en SIFEN"}
              </button>
            </div>
          </section>

          {previa ? (
            <section className="nc-tarjeta" aria-labelledby="fe-previa-titulo">
              <h3 id="fe-previa-titulo">Factura {previa.numero_fiscal}</h3>
              <Aviso tono="info">Datos tomados del documento firmado y aprobado en SIFEN. No se pueden editar.</Aviso>
              {previa.receptor.exterior ? <Aviso tono="atencion">El cliente es del exterior: la nota de crédito de esta factura se gestiona con soporte.</Aviso> : null}
              <dl className="nc-totales">
                <div><dt>Cliente</dt><dd>{previa.receptor.razon_social} · {previa.receptor.documento}</dd></div>
                <div><dt>Fecha</dt><dd>{previa.fecha_emision}</dd></div>
                <div><dt>Condición</dt><dd>{previa.condicion_venta === "CREDITO" ? "Crédito" : "Contado"}</dd></div>
              </dl>
              <div className="nc-lineas-wrap">
                <table className="nc-lineas">
                  <thead>
                    <tr>
                      <th>Descripción</th>
                      <th className="numero">Cantidad</th>
                      <th className="numero nc-col-secundaria">Precio</th>
                      <th className="numero nc-col-secundaria">Descuento</th>
                      <th className="numero nc-col-secundaria">IVA</th>
                      <th className="numero">Importe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previa.items.map((item) => (
                      <tr key={item.line_no}>
                        <td>{item.descripcion}</td>
                        <td className="numero">{item.cantidad.toLocaleString("es-PY")}</td>
                        <td className="numero nc-col-secundaria">{formatMonto(item.precio_unitario, previa.moneda)}</td>
                        <td className="numero nc-col-secundaria">{(item.descuento ?? 0) + (item.descuento_global ?? 0) > 0 ? formatMonto((item.descuento ?? 0) * item.cantidad + (item.descuento_global ?? 0), previa.moneda) : "-"}</td>
                        <td className="numero nc-col-secundaria">{ETIQUETA_IVA[item.iva_tipo] ?? item.iva_tipo}</td>
                        <td className="numero">{formatMonto(item.subtotal, previa.moneda)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <dl className="nc-totales">
                {(previa.totals.descuento ?? 0) > 0 ? <div><dt>Descuentos</dt><dd>{formatMonto(previa.totals.descuento ?? 0, previa.moneda)}</dd></div> : null}
                <div><dt>IVA</dt><dd>{formatMonto(previa.totals.total_iva, previa.moneda)}</dd></div>
                <div><dt>Total</dt><dd className="nc-total">{formatMonto(previa.totals.total, previa.moneda)}</dd></div>
              </dl>
              <button className="primary-action wide" disabled={ocupado} onClick={() => void guardarDeSifen()} type="button">
                {ocupado ? "Guardando..." : "Guardar factura"}
              </button>
            </section>
          ) : null}
        </div>
      ) : (
        <div className="nc-columna">
          <Aviso tono="atencion">Una factura cargada a mano no se verifica en SIFEN: revisá que los datos sean los de la factura original.</Aviso>
          <section className="nc-tarjeta" aria-labelledby="fe-ref-titulo">
            <h3 id="fe-ref-titulo">Referencia de la factura</h3>
            <div className="segmented-control factura-externa-referencia" role="group" aria-label="Tipo de factura">
              <button aria-pressed={tipoReferencia === "IMPRESO"} className={tipoReferencia === "IMPRESO" ? "active" : ""} onClick={() => setTipoReferencia("IMPRESO")} type="button">
                Impresa
              </button>
              <button aria-pressed={tipoReferencia === "ELECTRONICO"} className={tipoReferencia === "ELECTRONICO" ? "active" : ""} onClick={() => setTipoReferencia("ELECTRONICO")} type="button">
                Electrónica
              </button>
            </div>
            {tipoReferencia === "ELECTRONICO" ? (
              <CampoFormulario ayuda="Los 44 dígitos del CDC." error={errorCdcManual} etiqueta="CDC">
                <input inputMode="numeric" onChange={(e) => setCdcManual(e.target.value)} value={cdcManual} />
              </CampoFormulario>
            ) : (
              <div className="factura-externa-impresa">
                <CampoFormulario ayuda="8 dígitos" etiqueta="Timbrado">
                  <input inputMode="numeric" onChange={(e) => setTimbrado(soloDigitos(e.target.value, 8))} value={timbrado} />
                </CampoFormulario>
                <CampoFormulario etiqueta="Establecimiento">
                  <input inputMode="numeric" onBlur={() => establecimiento && setEstablecimiento(establecimiento.padStart(3, "0"))} onChange={(e) => setEstablecimiento(soloDigitos(e.target.value, 3))} placeholder="001" value={establecimiento} />
                </CampoFormulario>
                <CampoFormulario etiqueta="Punto">
                  <input inputMode="numeric" onBlur={() => punto && setPunto(punto.padStart(3, "0"))} onChange={(e) => setPunto(soloDigitos(e.target.value, 3))} placeholder="001" value={punto} />
                </CampoFormulario>
                <CampoFormulario etiqueta="Número">
                  <input inputMode="numeric" onBlur={() => numero && setNumero(numero.padStart(7, "0"))} onChange={(e) => setNumero(soloDigitos(e.target.value, 7))} placeholder="0000123" value={numero} />
                </CampoFormulario>
                <CampoFormulario etiqueta="Fecha de la factura">
                  <input onChange={(e) => setFecha(e.target.value)} type="date" value={fecha} />
                </CampoFormulario>
              </div>
            )}
          </section>

          <section className="nc-tarjeta" aria-labelledby="fe-cliente-titulo">
            <h3 id="fe-cliente-titulo">Cliente y condiciones</h3>
            <div className="factura-externa-cliente">
              <CampoFormulario etiqueta="Tipo de documento">
                <select onChange={(e) => setDocumentoTipo(e.target.value)} value={documentoTipo}>
                  {TIPOS_DOCUMENTO.map((t) => <option key={t.valor} value={t.valor}>{t.etiqueta}</option>)}
                </select>
              </CampoFormulario>
              <CampoFormulario ayuda={documentoTipo === "RUC" ? "Con el dígito verificador, por ejemplo 80026570-0" : undefined} etiqueta="Documento">
                <input onChange={(e) => setDocumento(e.target.value)} value={documento} />
              </CampoFormulario>
              <CampoFormulario etiqueta="Nombre o razón social">
                <input onChange={(e) => setRazonSocial(e.target.value)} value={razonSocial} />
              </CampoFormulario>
              <CampoFormulario etiqueta="Condición">
                <select onChange={(e) => setCondicion(e.target.value as "CONTADO" | "CREDITO")} value={condicion}>
                  <option value="CONTADO">Contado</option>
                  <option value="CREDITO">Crédito</option>
                </select>
              </CampoFormulario>
              <CampoFormulario etiqueta="Moneda">
                <select onChange={(e) => setMoneda(e.target.value as "PYG" | "USD")} value={moneda}>
                  <option value="PYG">Guaraníes</option>
                  <option value="USD">Dólares</option>
                </select>
              </CampoFormulario>
              {moneda !== "PYG" ? (
                <CampoFormulario etiqueta="Tipo de cambio">
                  <input inputMode="decimal" onChange={(e) => setTipoCambio(normalizeDecimalInput(e.target.value, 4))} value={tipoCambio.replace(".", ",")} />
                </CampoFormulario>
              ) : null}
            </div>
          </section>

          <section className="nc-tarjeta" aria-labelledby="fe-lineas-titulo">
            <h3 id="fe-lineas-titulo">Líneas de la factura</h3>
            <div className="nc-lineas-wrap">
              <table className="nc-lineas factura-externa-lineas">
                <thead>
                  <tr>
                    <th>Descripción</th>
                    <th className="numero">Cantidad</th>
                    <th className="numero">Precio</th>
                    <th>IVA</th>
                    <th aria-label="Quitar" />
                  </tr>
                </thead>
                <tbody>
                  {lineas.map((l, indice) => (
                    <tr key={l.id}>
                      <td><input aria-label={`Descripción, línea ${indice + 1}`} onChange={(e) => cambiarLinea(l.id, { descripcion: e.target.value })} value={l.descripcion} /></td>
                      <td className="numero"><input aria-label={`Cantidad, línea ${indice + 1}`} inputMode="decimal" onChange={(e) => cambiarLinea(l.id, { cantidad: normalizeDecimalInput(e.target.value, 4) })} value={l.cantidad.replace(".", ",")} /></td>
                      <td className="numero"><input aria-label={`Precio, línea ${indice + 1}`} inputMode="decimal" onChange={(e) => cambiarLinea(l.id, { precio: decimales === 0 ? e.target.value.replace(/\D/g, "") : normalizeDecimalInput(e.target.value, 2) })} value={l.precio.replace(".", ",")} /></td>
                      <td>
                        <select aria-label={`IVA, línea ${indice + 1}`} onChange={(e) => cambiarLinea(l.id, { iva: e.target.value as LineaManual["iva"] })} value={l.iva}>
                          <option value="IVA_10">10 %</option>
                          <option value="IVA_5">5 %</option>
                          <option value="EXENTA">Exenta</option>
                        </select>
                      </td>
                      <td>
                        <button aria-label={`Quitar línea ${indice + 1}`} className="enlace-accion" disabled={lineas.length === 1} onClick={() => setLineas((actual) => actual.filter((x) => x.id !== l.id))} type="button">
                          Quitar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button className="secondary-action" onClick={() => setLineas((actual) => [...actual, nuevaLinea()])} type="button">
              Agregar línea
            </button>
            <dl className="nc-totales">
              <div><dt>Total (estimado)</dt><dd className="nc-total">{formatMonto(moneda === "PYG" ? Math.round(totalManual) : Math.round(totalManual * 100) / 100, moneda)}</dd></div>
            </dl>
            <button className="primary-action wide" disabled={ocupado || Boolean(bloqueoManual)} onClick={() => void guardarManual()} type="button">
              {ocupado ? "Guardando..." : "Guardar factura"}
            </button>
            {bloqueoManual && !ocupado ? <p className="nc-bloqueo">{bloqueoManual}</p> : null}
          </section>
        </div>
      )}
    </section>
  );
}
