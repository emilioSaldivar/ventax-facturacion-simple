import QRCode from "qrcode";
import { numeroALetras } from "../../shared/utils/numero-letras.js";
import type { FacturadorParaPdf } from "../notas/notas.types.js";
import type { ReciboRecord } from "./recibos.types.js";

const FORMA_PAGO_LABEL: Record<ReciboRecord["forma_pago"], string> = {
  EFECTIVO: "Efectivo",
  TRANSFERENCIA: "Transferencia Bancaria",
  CHEQUE: "Cheque",
  TARJETA_CREDITO: "Tarjeta de Crédito",
  TARJETA_DEBITO: "Tarjeta de Débito",
  OTRO: "Otro",
};

export async function buildReciboPdfHtml(
  recibo: ReciboRecord,
  facturador: FacturadorParaPdf,
  baseUrl: string
): Promise<string> {
  const qrData = `${baseUrl}/verificar/recibo/${recibo.verification_token}`;
  const qrDataUrl = await QRCode.toDataURL(qrData, { width: 120, margin: 1 });

  const nroStr = recibo.numero != null ? String(recibo.numero).padStart(7, "0") : "-------";
  const fechaStr = recibo.emitido_at
    ? new Date(recibo.emitido_at).toLocaleDateString("es-PY", { day: "2-digit", month: "2-digit", year: "numeric" })
    : recibo.fecha_cobro;

  const logoHtml = facturador.logo_url
    ? `<img src="${facturador.logo_url}" alt="Logo" style="max-height:55px;max-width:150px;object-fit:contain;">`
    : "";

  const importeLetras = numeroALetras(recibo.importe);
  const formaPagoLabel = FORMA_PAGO_LABEL[recibo.forma_pago] ?? recibo.forma_pago;

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #1a1a1a; max-width: 148mm; margin: 0 auto; padding: 12mm; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 14px; border-bottom: 2px solid #1a1a1a; padding-bottom: 10px; }
  .empresa-nombre { font-size: 13px; font-weight: bold; }
  .empresa-rubro { font-size: 10px; color: #444; margin-top: 2px; }
  .empresa-info { font-size: 9px; color: #555; margin-top: 4px; line-height: 1.5; }
  .doc-right { text-align: right; }
  .doc-title { font-size: 13px; font-weight: bold; color: #1a1a1a; text-transform: uppercase; letter-spacing: 1px; }
  .doc-nro { font-size: 22px; font-weight: bold; color: #1a1a1a; margin-top: 2px; }
  .doc-fecha { font-size: 10px; color: #555; margin-top: 2px; }
  .section { margin-bottom: 10px; }
  .section-label { font-size: 8px; color: #888; text-transform: uppercase; font-weight: bold; margin-bottom: 2px; }
  .section-value { font-size: 12px; font-weight: bold; }
  .section-sub { font-size: 10px; color: #444; }
  .divider { border: none; border-top: 1px solid #ddd; margin: 10px 0; }
  .importe-box { background: #f5f5f5; border-radius: 4px; padding: 10px 14px; margin: 10px 0; }
  .importe-label { font-size: 9px; color: #888; text-transform: uppercase; font-weight: bold; }
  .importe-value { font-size: 26px; font-weight: bold; color: #1a1a1a; margin-top: 2px; }
  .importe-letras { font-size: 9px; color: #555; font-style: italic; margin-top: 4px; }
  .meta-row { display: flex; gap: 24px; margin-bottom: 8px; }
  .meta-item { flex: 1; }
  .footer { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 18px; border-top: 1px solid #ddd; padding-top: 10px; }
  .footer-note { font-size: 8px; color: #aaa; }
  .firma-box { text-align: center; border-top: 1px solid #999; padding-top: 6px; width: 120px; font-size: 9px; color: #555; }
</style>
</head>
<body>

<div class="header">
  <div>
    ${logoHtml}
    <div class="empresa-nombre" style="margin-top:${facturador.logo_url ? "6px" : "0"}">${esc(facturador.razon_social)}</div>
    ${facturador.rubro_descripcion ? `<div class="empresa-rubro">${esc(facturador.rubro_descripcion)}</div>` : ""}
    <div class="empresa-info">
      RUC: ${esc(facturador.ruc)}<br>
      ${facturador.direccion ? esc(facturador.direccion) + "<br>" : ""}
      ${facturador.telefono ? "Tel: " + esc(facturador.telefono) : ""}
    </div>
  </div>
  <div class="doc-right">
    <div class="doc-title">Recibo de Dinero</div>
    <div class="doc-nro">N° ${nroStr}</div>
    <div class="doc-fecha">Fecha: ${fechaStr}</div>
    <div style="margin-top:6px;">
      <img src="${qrDataUrl}" width="70" height="70" alt="QR">
    </div>
  </div>
</div>

<div class="section">
  <div class="section-label">Recibido de</div>
  <div class="section-value">${esc(recibo.pagador_nombre)}</div>
  ${recibo.pagador_documento ? `<div class="section-sub">${esc(recibo.pagador_documento_tipo ?? "CI/RUC")}: ${esc(recibo.pagador_documento)}</div>` : ""}
</div>

<div class="section">
  <div class="section-label">Concepto</div>
  <div class="section-value" style="font-size:11px;font-weight:normal;">${esc(recibo.concepto)}</div>
</div>

${recibo.factura_numero_display ? `
<div class="section">
  <div class="section-label">Referencia</div>
  <div class="section-sub">Factura N° ${esc(recibo.factura_numero_display)}</div>
</div>
` : ""}

<hr class="divider">

<div class="importe-box">
  <div class="importe-label">Importe Recibido</div>
  <div class="importe-value">Gs. ${fmtGs(recibo.importe)}</div>
  <div class="importe-letras">${importeLetras}</div>
</div>

<div class="meta-row">
  <div class="meta-item">
    <div class="section-label">Forma de Pago</div>
    <div class="section-sub" style="font-weight:bold;">${esc(formaPagoLabel)}</div>
  </div>
  ${recibo.referencia_bancaria ? `
  <div class="meta-item">
    <div class="section-label">Referencia Bancaria</div>
    <div class="section-sub">${esc(recibo.referencia_bancaria)}</div>
  </div>` : ""}
</div>

<div class="footer">
  <div class="footer-note">
    Documento no fiscal. Verificar autenticidad en:<br>
    ${qrData}
  </div>
  <div class="firma-box">Firma del emisor</div>
</div>

</body>
</html>`;
}

function esc(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function fmtGs(n: number | null | undefined): string {
  if (n == null) return "";
  return Math.round(n).toLocaleString("es-PY");
}
