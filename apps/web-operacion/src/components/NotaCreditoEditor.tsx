// SPEC_NOTA_CREDITO_UNIFICADA_v0.1 (PLAN 4, canvas 01 y 03): grilla "Qué se acredita" de la nota de credito, con la
// usabilidad del editor de factura con descuentos: Devolver (cantidad) y Acreditar (monto o %, conmutador en el
// encabezado, oculta por defecto) por linea, acreditacion sobre el total y el atajo "Toda la factura".
import { formatCantidad, formatMonto, normalizeDecimalInput } from "../lib/formato";
import {
  formularioTodaLaFactura,
  type FormularioNotaCredito,
  type NotaCombinadaArmada,
  type TipoAcreditacion
} from "../lib/notaCreditoUnificada";
import { useEsEscritorio } from "../lib/useEsEscritorio";
import type { NotaCreditoSaldoResponse } from "../tipos";

const ETIQUETA_IVA: Record<string, string> = { IVA_10: "10 %", IVA_5: "5 %", EXENTA: "Exento" };
const MENSAJE_CON_DESCUENTO = "Esta línea tiene descuento: ajustala por monto.";

type Linea = NotaCreditoSaldoResponse["lineas"][number];

function simboloMoneda(moneda: string): string {
  return moneda === "PYG" ? "Gs." : moneda;
}

function ConmutadorAcreditacion({ moneda, modo, onModo, etiqueta }: { moneda: string; modo: TipoAcreditacion; onModo: (modo: TipoAcreditacion) => void; etiqueta: string }) {
  return (
    <span className="descuento-modo" role="group" aria-label={etiqueta}>
      <button aria-label="Porcentaje" aria-pressed={modo === "PORCENTAJE"} className={modo === "PORCENTAJE" ? "active" : ""} onClick={() => onModo("PORCENTAJE")} type="button">
        %
      </button>
      <button aria-pressed={modo === "MONTO"} className={modo === "MONTO" ? "active" : ""} onClick={() => onModo("MONTO")} type="button">
        {simboloMoneda(moneda)}
      </button>
    </span>
  );
}

/** Texto del campo de acreditacion: % con 2 decimales; monto entero en PYG o con 2 decimales en otra moneda. */
function normalizarAcreditacion(texto: string, modo: TipoAcreditacion, moneda: string): string {
  if (modo === "MONTO" && moneda === "PYG") return texto.replace(/\D/g, "");
  return normalizeDecimalInput(texto, 2);
}

export function NotaCreditoEditor({
  saldo,
  form,
  onForm,
  armada,
  mostrarAcreditaciones,
  onMostrarAcreditaciones
}: {
  saldo: NotaCreditoSaldoResponse;
  form: FormularioNotaCredito;
  onForm: (form: FormularioNotaCredito) => void;
  armada: NotaCombinadaArmada;
  mostrarAcreditaciones: boolean;
  onMostrarAcreditaciones: (mostrar: boolean) => void;
}) {
  const esEscritorio = useEsEscritorio();
  const { moneda } = saldo;
  const conDescuentos = saldo.lineas.some((l) => (l.descuento ?? 0) > 0 || (l.descuento_global ?? 0) > 0);
  const hayAcreditaciones = Object.values(form.acreditar).some((v) => v.trim()) || form.totalTexto.trim() !== "";
  // D-9 de descuentos: visibles siempre que tengan algo cargado.
  const verAcreditaciones = mostrarAcreditaciones || hayAcreditaciones;
  const admiteTotal = saldo.monto.tasas !== null && saldo.monto.saldo > 0;

  const errorDe = (lineNo: number, campo: "cantidad" | "acreditacion") => armada.errores.find((e) => e.line_no === lineNo && e.campo === campo)?.mensaje ?? null;
  const errorTotal = armada.errores.find((e) => e.campo === "acreditacion_total")?.mensaje ?? null;
  const importeDe = (lineNo: number) => armada.lineas.filter((l) => l.linea_factura === lineNo).reduce((s, l) => s + l.importe, 0);
  const bloqueadaPorDescuento = (linea: Linea) => !saldo.descuentos_en_nc && ((linea.descuento ?? 0) > 0 || (linea.descuento_global ?? 0) > 0);
  const netoUnidad = (linea: Linea) => (linea.cantidad_facturada > 0 ? linea.importe_neto / linea.cantidad_facturada : linea.precio_unitario);

  function setDevolver(lineNo: number, texto: string) {
    onForm({ ...form, devolver: { ...form.devolver, [lineNo]: normalizeDecimalInput(texto, 4) } });
  }
  function setAcreditar(lineNo: number, texto: string) {
    onForm({ ...form, acreditar: { ...form.acreditar, [lineNo]: normalizarAcreditacion(texto, form.modoAcreditar, moneda) } });
  }
  function ocultarAcreditaciones() {
    onForm({ ...form, acreditar: {}, totalTexto: "" });
    onMostrarAcreditaciones(false);
  }

  function campoDevolver(linea: Linea) {
    const bloqueada = bloqueadaPorDescuento(linea);
    const error = errorDe(linea.line_no, "cantidad");
    return (
      <>
        <input
          aria-describedby={error ? `nc-dev-error-${linea.line_no}` : undefined}
          aria-invalid={error ? true : undefined}
          aria-label={`Devolver, línea ${linea.line_no}`}
          className={error ? "invalido" : undefined}
          disabled={bloqueada || linea.saldo <= 0}
          inputMode="decimal"
          onChange={(event) => setDevolver(linea.line_no, event.target.value)}
          placeholder={bloqueada ? "—" : linea.saldo > 0 ? `máx. ${formatCantidad(linea.saldo)}` : "sin saldo"}
          title={bloqueada ? MENSAJE_CON_DESCUENTO : undefined}
          value={(form.devolver[linea.line_no] ?? "").replace(".", ",")}
        />
        {bloqueada ? <small className="nc-celda-aviso">{MENSAJE_CON_DESCUENTO}</small> : null}
        {error ? (
          <small className="nc-celda-error" id={`nc-dev-error-${linea.line_no}`}>
            {error}
          </small>
        ) : null}
      </>
    );
  }

  function campoAcreditar(linea: Linea) {
    const error = errorDe(linea.line_no, "acreditacion");
    return (
      <>
        <input
          aria-describedby={error ? `nc-acr-error-${linea.line_no}` : undefined}
          aria-invalid={error ? true : undefined}
          aria-label={`Ajuste, línea ${linea.line_no}`}
          className={error ? "invalido" : undefined}
          disabled={linea.saldo_importe <= 0}
          inputMode="decimal"
          onChange={(event) => setAcreditar(linea.line_no, event.target.value)}
          placeholder={form.modoAcreditar === "PORCENTAJE" ? "0 %" : "0"}
          value={(form.acreditar[linea.line_no] ?? "").replace(".", ",")}
        />
        {error ? (
          <small className="nc-celda-error" id={`nc-acr-error-${linea.line_no}`}>
            {error}
          </small>
        ) : null}
      </>
    );
  }

  const conmutadorLineas = (
    <ConmutadorAcreditacion
      etiqueta="Ajuste en porcentaje o monto"
      modo={form.modoAcreditar}
      moneda={moneda}
      onModo={(modo) => onForm({ ...form, modoAcreditar: modo, acreditar: modo === form.modoAcreditar ? form.acreditar : {} })}
    />
  );

  return (
    <div className="nc-editor">
      <div className="nc-editor-acciones">
        <button className="secondary-action" onClick={() => onForm(formularioTodaLaFactura(saldo, form))} type="button">
          Toda la factura
        </button>
        <button className="enlace-accion" onClick={() => (verAcreditaciones ? ocultarAcreditaciones() : onMostrarAcreditaciones(true))} type="button">
          {verAcreditaciones ? (hayAcreditaciones ? "Quitar ajustes" : "Ocultar ajustes") : "Agregar ajuste"}
        </button>
      </div>

      {esEscritorio ? (
        <div className="nc-lineas-wrap">
          <table className="nc-lineas nc-lineas-editor">
            <thead>
              <tr>
                <th>#</th>
                <th>Descripción</th>
                <th className="numero">Facturado</th>
                <th className="numero">Precio</th>
                {conDescuentos ? <th className="numero">Neto u.</th> : null}
                <th>IVA</th>
                <th className="numero">Ya devuelto o ajustado</th>
                <th className="numero">Devolver</th>
                {verAcreditaciones ? (
                  <th className="numero">
                    <span className="descuento-cabecera">
                      Ajuste
                      {conmutadorLineas}
                    </span>
                  </th>
                ) : null}
                <th className="numero">Importe</th>
              </tr>
            </thead>
            <tbody>
              {saldo.lineas.map((linea) => (
                <tr key={linea.line_no}>
                  <td>{linea.line_no}</td>
                  <td>{linea.descripcion}</td>
                  <td className="numero">{formatCantidad(linea.cantidad_facturada)}</td>
                  <td className="numero">{formatMonto(linea.precio_unitario, moneda)}</td>
                  {conDescuentos ? <td className="numero">{formatMonto(netoUnidad(linea), moneda)}</td> : null}
                  <td>{ETIQUETA_IVA[linea.iva_tipo] ?? linea.iva_tipo}</td>
                  <td className="numero">
                    {linea.importe_acreditado > 0 ? formatMonto(linea.importe_acreditado, moneda) : "—"}
                    {linea.cantidad_acreditada > 0 ? <small className="muted nc-celda-sub">{formatCantidad(linea.cantidad_acreditada)} devuelto</small> : null}
                  </td>
                  <td className="numero nc-celda-campo">{campoDevolver(linea)}</td>
                  {verAcreditaciones ? <td className="numero nc-celda-campo">{campoAcreditar(linea)}</td> : null}
                  <td className="numero">{formatMonto(importeDe(linea.line_no), moneda)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="nc-tarjetas-linea">
          {verAcreditaciones ? <div className="nc-tarjetas-conmutador">Ajuste en {conmutadorLineas}</div> : null}
          {saldo.lineas.map((linea) => (
            <article className="nc-tarjeta-linea" key={linea.line_no}>
              <header>
                <strong>{linea.descripcion}</strong>
                <span className="muted">
                  {formatCantidad(linea.cantidad_facturada)} × {formatMonto(linea.precio_unitario, moneda)} · IVA {ETIQUETA_IVA[linea.iva_tipo] ?? linea.iva_tipo}
                </span>
                {linea.importe_acreditado > 0 ? <span className="muted">Ya devuelto o ajustado {formatMonto(linea.importe_acreditado, moneda)}</span> : null}
              </header>
              <div className="nc-tarjeta-campos">
                <label>
                  <span>Devolver</span>
                  {campoDevolver(linea)}
                </label>
                {verAcreditaciones ? (
                  <label>
                    <span>Ajuste ({form.modoAcreditar === "PORCENTAJE" ? "%" : simboloMoneda(moneda)})</span>
                    {campoAcreditar(linea)}
                  </label>
                ) : null}
              </div>
              <p className="nc-tarjeta-importe">
                <span className="muted">Importe</span> <strong>{formatMonto(importeDe(linea.line_no), moneda)}</strong>
              </p>
            </article>
          ))}
        </div>
      )}

      {verAcreditaciones ? (
        <div className="nc-acreditacion-total">
          <label className="nc-acreditacion-total-campo">
            <span className="descuento-cabecera">
              Ajuste sobre el total
              <ConmutadorAcreditacion
                etiqueta="Ajuste sobre el total en porcentaje o monto"
                modo={form.modoTotal}
                moneda={moneda}
                onModo={(modo) => onForm({ ...form, modoTotal: modo, totalTexto: modo === form.modoTotal ? form.totalTexto : "" })}
              />
            </span>
            <input
              aria-invalid={errorTotal ? true : undefined}
              aria-label="Ajuste sobre el total"
              className={errorTotal ? "invalido" : undefined}
              disabled={!admiteTotal}
              inputMode="decimal"
              onChange={(event) => onForm({ ...form, totalTexto: normalizarAcreditacion(event.target.value, form.modoTotal, moneda) })}
              placeholder={form.modoTotal === "PORCENTAJE" ? "0 %" : "0"}
              value={form.totalTexto.replace(".", ",")}
            />
          </label>
          <small className="muted">
            {admiteTotal
              ? form.modoTotal === "PORCENTAJE"
                ? `Porcentaje del saldo de la factura (${formatMonto(saldo.monto.saldo, moneda)}). Se reparte en proporción a lo que la factura tiene en cada tasa.`
                : "Se reparte en proporción a lo que la factura tiene en cada tasa."
              : "No se pudo consultar lo que la factura tiene en cada tasa; ajustá por línea."}
          </small>
          {errorTotal ? <small className="nc-celda-error">{errorTotal}</small> : null}
        </div>
      ) : null}
    </div>
  );
}
