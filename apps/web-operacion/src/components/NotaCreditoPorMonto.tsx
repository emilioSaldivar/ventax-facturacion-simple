// SPEC_NOTA_CREDITO_POR_MONTO_v0.1 (PLAN 7): modo "Por monto" de la nota de credito, comun a la ventana de
// Documentos y a la pantalla Notas de credito. Muestra el saldo neto, pide el monto y el tipo de ajuste y anticipa
// el reparto por tasa con la misma funcion que usa la API.
import { Aviso } from "./Aviso";
import { CampoFormulario } from "./CampoFormulario";
import { formatMonto, normalizeDecimalInput } from "../lib/formato";
import {
  MULTIPLO_MONTO_PYG,
  TIPOS_AJUSTE_MONTO,
  repartirMontoPorTasa,
  validarMontoNotaCredito,
  type MotivoCodigoMonto
} from "../lib/notaCreditoMonto";
import type { NotaCreditoSaldoResponse } from "../tipos";

const ETIQUETA_TASA = { IVA_10: "IVA 10 %", IVA_5: "IVA 5 %", EXENTA: "Exento" } as const;

/** Monto pedido o el motivo por el que no se puede enviar (RN-01 y RN-04 en pantalla). */
export function pedidoNotaCreditoMonto(saldo: NotaCreditoSaldoResponse, montoTexto: string): { monto: number | null; error: string | null } {
  if (!saldo.monto.admite) return { monto: null, error: saldo.monto.motivo_no_admite ?? "La factura no admite nota de crédito por monto." };
  if (!montoTexto.trim()) return { monto: null, error: "Indicá el monto a acreditar." };
  const monto = Number(montoTexto);
  const error = validarMontoNotaCredito(monto, saldo.moneda);
  if (error) return { monto: null, error };
  if (monto > saldo.monto.saldo) return { monto: null, error: `El monto supera el saldo de la factura (${formatMonto(saldo.monto.saldo, saldo.moneda)}).` };
  return { monto, error: null };
}

export function NotaCreditoPorMonto({
  saldo,
  montoTexto,
  onMontoTexto,
  motivoCodigo,
  onMotivoCodigo
}: {
  saldo: NotaCreditoSaldoResponse;
  montoTexto: string;
  onMontoTexto: (valor: string) => void;
  motivoCodigo: MotivoCodigoMonto;
  onMotivoCodigo: (codigo: MotivoCodigoMonto) => void;
}) {
  const { moneda } = saldo;
  const enGuaranies = moneda === "PYG";
  const pedido = pedidoNotaCreditoMonto(saldo, montoTexto);
  const partes = pedido.monto !== null && saldo.monto.tasas ? repartirMontoPorTasa(pedido.monto, saldo.monto.tasas, moneda) : [];
  const ayuda = enGuaranies
    ? `En múltiplos de ${MULTIPLO_MONTO_PYG} Gs. Saldo: ${formatMonto(saldo.monto.saldo, moneda)}.`
    : `Hasta 2 decimales. Saldo: ${formatMonto(saldo.monto.saldo, moneda)}.`;

  return (
    <div className="nc-monto">
      <dl className="nc-totales">
        <div>
          <dt>Total de la factura</dt>
          <dd>{formatMonto(saldo.monto.total_factura, moneda)}</dd>
        </div>
        <div>
          <dt>Ya acreditado</dt>
          <dd>{formatMonto(saldo.monto.acreditado, moneda)}</dd>
        </div>
        <div>
          <dt>Saldo disponible</dt>
          <dd>
            <strong>{formatMonto(saldo.monto.saldo, moneda)}</strong>
          </dd>
        </div>
      </dl>
      {saldo.monto.fuente === "FS" ? (
        <Aviso tono="atencion">No se pudo consultar el servicio fiscal: el saldo y el reparto se confirman al emitir.</Aviso>
      ) : null}
      <div className="nc-monto-campos">
        <CampoFormulario ayuda={ayuda} etiqueta="Monto a acreditar">
          <input
            disabled={!saldo.monto.admite}
            inputMode={enGuaranies ? "numeric" : "decimal"}
            onChange={(event) => onMontoTexto(enGuaranies ? event.target.value.replace(/\D/g, "") : normalizeDecimalInput(event.target.value, 2))}
            placeholder={enGuaranies ? "0" : "0,00"}
            value={enGuaranies ? montoTexto : montoTexto.replace(".", ",")}
          />
        </CampoFormulario>
        <CampoFormulario ayuda="Queda como motivo de la nota en SIFEN." etiqueta="Tipo de ajuste">
          <select disabled={!saldo.monto.admite} onChange={(event) => onMotivoCodigo(Number(event.target.value) as MotivoCodigoMonto)} value={motivoCodigo}>
            {TIPOS_AJUSTE_MONTO.map((tipo) => (
              <option key={tipo.codigo} value={tipo.codigo}>
                {tipo.etiqueta}
              </option>
            ))}
          </select>
        </CampoFormulario>
      </div>
      {montoTexto.trim() && pedido.error ? <p className="nc-bloqueo">{pedido.error}</p> : null}
      {partes.length > 0 ? (
        <div className="nc-monto-reparto">
          <p className="muted">Se reparte según lo que la factura tiene en cada tasa:</p>
          <dl className="nc-totales">
            {partes.map((parte) => (
              <div key={parte.iva_tipo}>
                <dt>{ETIQUETA_TASA[parte.iva_tipo]}</dt>
                <dd>{formatMonto(parte.importe, moneda)}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
    </div>
  );
}
