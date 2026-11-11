// Movido de main.tsx sin cambios (PLAN_UX_RESTO_APP_v0.1 §10.9, URA-023).
import { useEffect, useState } from "react";
import { numeroCorrelativo, formatMonto, fmtFecha } from "../lib/formato";
import { API_BASE_URL } from "../api/config";
import { type NotaPublicaPayload, type ReciboPublicaPayload, type ReciboFormaPago } from "../tipos";
import { FORMAS_PAGO_LABELS } from "../lib/etiquetas";

export function NotaPublicaView({ token }: { token: string }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<NotaPublicaPayload | null>(null);

  useEffect(() => {
    fetch(`${API_BASE_URL}/verificar/nota/${token}`)
      .then(r => r.json() as Promise<NotaPublicaPayload>)
      .then(d => { setData(d); setLoading(false); })
      .catch(() => { setData({ valido: false }); setLoading(false); });
  }, [token]);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100dvh", fontFamily: "var(--segel-font)" }}>
        Cargando...
      </div>
    );
  }

  if (!data?.valido) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100dvh", fontFamily: "var(--segel-font)", gap: "12px", color: "#374151" }}>
        <div style={{ fontSize: "40px" }}>🔍</div>
        <div style={{ fontSize: "16px", fontWeight: 600 }}>Documento no encontrado</div>
        <div style={{ fontSize: "14px", color: "#6b7280" }}>El enlace no es válido o el documento fue eliminado.</div>
      </div>
    );
  }

  const tipoLabel = data.tipo === "PRESUPUESTO" ? "Presupuesto" : "Nota de Pedido";
  const nroStr = data.numero != null ? numeroCorrelativo(data.numero) : "-------";
  const fmtGs = (n: number | null | undefined) => n != null ? Math.round(n).toLocaleString("es-PY") : "";
  const pdfUrl = `${API_BASE_URL}/verificar/nota/${token}/pdf`;

  return (
    <div style={{ minHeight: "100dvh", background: "#ffffff", fontFamily: "var(--segel-font)" }}>
      {/* Header */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e5e7eb", padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <img src="/app/brand/segel-logo-fondo-claro.svg" alt="Segel" width={136} height={40} style={{ display: "block" }} />
        <a
          href={pdfUrl}
          target="_blank"
          rel="noreferrer"
          style={{ background: "var(--color-brand)", color: "#fff", padding: "8px 16px", borderRadius: "8px", textDecoration: "none", fontWeight: 600, fontSize: "14px" }}
        >
          Descargar PDF
        </a>
      </div>

      {/* Card */}
      <div style={{ maxWidth: "480px", margin: "24px auto", padding: "0 16px" }}>
        <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e5e7eb", overflow: "hidden" }}>
          {/* Tipo + numero */}
          <div style={{ background: "#1e3a5f", color: "#fff", padding: "18px 20px" }}>
            <div style={{ fontSize: "11px", letterSpacing: "1px", opacity: 0.7, textTransform: "uppercase" }}>{tipoLabel}</div>
            <div style={{ fontSize: "22px", fontWeight: 700, marginTop: "4px" }}>N° {nroStr}</div>
            {data.fecha_emision && (
              <div style={{ fontSize: "12px", opacity: 0.8, marginTop: "4px" }}>Emitido: {fmtFecha(data.fecha_emision)}</div>
            )}
            {data.valido_hasta && (
              <div style={{ fontSize: "12px", opacity: 0.8, marginTop: "2px" }}>Válido hasta: {fmtFecha(data.valido_hasta)}</div>
            )}
          </div>

          {/* Cliente */}
          <div style={{ padding: "16px 20px", borderBottom: "1px solid #f3f4f6" }}>
            <div style={{ fontSize: "11px", color: "#9ca3af", textTransform: "uppercase", marginBottom: "4px" }}>Cliente</div>
            <div style={{ fontWeight: 600, fontSize: "15px" }}>{data.cliente_nombre}</div>
            {data.cliente_ruc && <div style={{ fontSize: "13px", color: "#6b7280", marginTop: "2px" }}>RUC/CI: {data.cliente_ruc}</div>}
          </div>

          {/* Items */}
          <div style={{ padding: "16px 20px" }}>
            <div style={{ fontSize: "11px", color: "#9ca3af", textTransform: "uppercase", marginBottom: "10px" }}>Detalle</div>
            {(data.items ?? []).map((it, i) => {
              if (it.fila_tipo === "CONTEXTO") {
                return <div key={i} style={{ fontSize: "12px", fontWeight: 600, color: "#374151", padding: "4px 0", borderBottom: "1px solid #f3f4f6" }}>{it.descripcion}</div>;
              }
              if (it.fila_tipo === "ITEM_SIN_PRECIO") {
                return <div key={i} style={{ fontSize: "13px", color: "#374151", padding: "6px 0", borderBottom: "1px solid #f3f4f6" }}>{it.descripcion}</div>;
              }
              return (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #f3f4f6", fontSize: "13px" }}>
                  <span style={{ color: "#374151" }}>
                    {it.descripcion}{it.cantidad && it.cantidad !== 1 ? ` ×${it.cantidad}` : ""}
                  </span>
                  <span style={{ fontWeight: 500, color: "#111827" }}>Gs. {fmtGs(it.precio_total)}</span>
                </div>
              );
            })}
          </div>

          {/* Total */}
          <div style={{ background: "#f9fafb", padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #e5e7eb" }}>
            <span style={{ fontWeight: 600, color: "#374151" }}>TOTAL</span>
            <span style={{ fontWeight: 700, fontSize: "18px", color: "#1e3a5f" }}>Gs. {fmtGs(data.total)}</span>
          </div>

          {/* Observaciones */}
          {data.observaciones && (
            <div style={{ padding: "14px 20px", borderTop: "1px solid #e5e7eb", background: "#fafafa" }}>
              <div style={{ fontSize: "11px", color: "#9ca3af", textTransform: "uppercase", marginBottom: "6px" }}>Observaciones</div>
              <div style={{ fontSize: "13px", color: "#374151", whiteSpace: "pre-line" }}>{data.observaciones}</div>
            </div>
          )}
        </div>

        <div style={{ textAlign: "center", fontSize: "12px", color: "#9ca3af", marginTop: "20px" }}>
          Documento emitido con Segel
        </div>
      </div>
    </div>
  );
}

export function ReciboPublicaView({ token }: { token: string }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ReciboPublicaPayload | null>(null);

  useEffect(() => {
    fetch(`${API_BASE_URL}/verificar/recibo/${token}`)
      .then(r => r.json() as Promise<ReciboPublicaPayload>)
      .then(d => { setData(d); setLoading(false); })
      .catch(() => { setData({ valido: false }); setLoading(false); });
  }, [token]);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100dvh", fontFamily: "var(--segel-font)" }}>
        Cargando...
      </div>
    );
  }

  if (!data?.valido) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100dvh", fontFamily: "var(--segel-font)", gap: "12px", color: "#374151" }}>
        <div style={{ fontSize: "40px" }}>🔍</div>
        <div style={{ fontSize: "16px", fontWeight: 600 }}>Documento no encontrado</div>
        <div style={{ fontSize: "14px", color: "#6b7280" }}>El enlace no es válido o el documento fue eliminado.</div>
      </div>
    );
  }

  const nroStr = data.numero != null ? numeroCorrelativo(data.numero) : "-------";
  const pdfUrl = `${API_BASE_URL}/verificar/recibo/${token}/pdf`;
  const xmlUrl = `${API_BASE_URL}/verificar/recibo/${token}/xml`;
  const anulado = data.estado === "ANULADO";

  return (
    <main style={{
      minHeight: "100vh",
      padding: "18px",
      background: "#ffffff",
      fontFamily: "var(--segel-font)",
      color: "#18242a",
      boxSizing: "border-box"
    }}>
      <section style={{ display: "grid", gap: "14px", width: "min(100%, 760px)", margin: "0 auto" }}>
        <div style={{ display: "inline-flex", alignItems: "center", width: "fit-content", minHeight: "42px" }}>
          <img src="/app/brand/segel-logo-fondo-claro.svg" alt="Segel" width={157} height={46} style={{ display: "block", width: "157px", height: "auto" }} />
        </div>

        <article style={{ display: "grid", gap: "14px", border: "1px solid #d7e5ea", borderRadius: "8px", background: "#ffffff", padding: "16px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
            <div>
              <h1 style={{ margin: "0 0 6px", fontSize: "26px", lineHeight: 1.12 }}>Recibo N° {nroStr}</h1>
              <p style={{ margin: 0, color: "#65747b", overflowWrap: "anywhere" }}>
                {data.fecha_cobro ? `Fecha de cobro: ${fmtFecha(data.fecha_cobro)}` : null}
              </p>
            </div>
            <span style={{
              flex: "0 0 auto",
              borderRadius: "999px",
              background: anulado ? "#fdecea" : "#e7f7ef",
              color: anulado ? "#b42318" : "#087f5b",
              padding: "7px 10px",
              fontSize: "12px",
              fontWeight: 900
            }}>
              {anulado ? "ANULADO" : "EMITIDO"}
            </span>
          </div>

          <dl style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "10px", margin: 0 }}>
            <div>
              <dt style={{ color: "#65747b", fontSize: "12px", fontWeight: 800 }}>Recibido de</dt>
              <dd style={{ margin: "2px 0 0", fontSize: "17px", fontWeight: 900, overflowWrap: "anywhere" }}>{data.pagador_nombre}</dd>
            </div>
            <div>
              <dt style={{ color: "#65747b", fontSize: "12px", fontWeight: 800 }}>Forma de pago</dt>
              <dd style={{ margin: "2px 0 0", fontSize: "17px", fontWeight: 900, overflowWrap: "anywhere" }}>
                {data.forma_pago ? (FORMAS_PAGO_LABELS[data.forma_pago as ReciboFormaPago] ?? data.forma_pago) : "-"}
              </dd>
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <dt style={{ color: "#65747b", fontSize: "12px", fontWeight: 800 }}>Concepto</dt>
              <dd style={{ margin: "2px 0 0", fontSize: "17px", fontWeight: 900, overflowWrap: "anywhere" }}>{data.concepto}</dd>
            </div>
            {data.referencia_documento_numero_display ? (
              <div style={{ gridColumn: "1 / -1" }}>
                <dt style={{ color: "#65747b", fontSize: "12px", fontWeight: 800 }}>Referencia factura</dt>
                <dd style={{ margin: "2px 0 0", fontSize: "17px", fontWeight: 900, overflowWrap: "anywhere" }}>N° {data.referencia_documento_numero_display}</dd>
              </div>
            ) : null}
          </dl>

          <div style={{ borderRadius: "8px", background: "var(--segel-primary-50)", padding: "14px" }}>
            <dt style={{ color: "#65747b", fontSize: "12px", fontWeight: 800 }}>Importe</dt>
            <dd style={{ margin: "2px 0 0", fontSize: "26px", fontWeight: 900 }}>{data.importe != null ? formatMonto(data.importe, data.moneda) : ""}</dd>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "10px" }} className="public-doc-actions">
            <a
              href={pdfUrl}
              target="_blank"
              rel="noreferrer"
              style={{ display: "grid", minHeight: "48px", placeItems: "center", borderRadius: "8px", border: "1px solid var(--color-brand)", background: "var(--color-brand)", color: "#ffffff", fontWeight: 900, lineHeight: 1.15, padding: "8px 12px", textDecoration: "none" }}
            >
              Ver recibo PDF
            </a>
            <a
              href={xmlUrl}
              style={{ display: "grid", minHeight: "48px", placeItems: "center", borderRadius: "8px", border: "1px solid #c6d9df", background: "#ffffff", color: "var(--color-brand-dark)", fontWeight: 900, lineHeight: 1.15, padding: "8px 12px", textDecoration: "none" }}
            >
              Descargar documento electrónico
            </a>
          </div>
          <p style={{ margin: 0, color: "#65747b" }}>
            Documento firmado digitalmente conforme a la Ley N.º 6822/2021. Firma electrónica cualificada, con efecto legal equivalente a la firma manuscrita.
          </p>
        </article>
      </section>
    </main>
  );
}
