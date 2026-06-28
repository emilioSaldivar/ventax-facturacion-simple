import QRCode from "qrcode";
import { numeroALetras } from "../../shared/utils/numero-letras.js";
import type { FacturadorParaPdf, NotaConItems } from "./notas.types.js";

export async function buildNotaPdfHtml(
  nota: NotaConItems,
  facturador: FacturadorParaPdf,
  baseUrl: string
): Promise<string> {
  const qrData = `${baseUrl}/verificar/nota/${nota.verification_token}`;
  const qrDataUrl = await QRCode.toDataURL(qrData, { width: 100, margin: 1 });

  const tipoLabel = nota.tipo === "PRESUPUESTO" ? "PRESUPUESTO" : "NOTA DE PEDIDO";
  const nroStr = nota.numero != null ? String(nota.numero).padStart(7, "0") : "-------";
  const fechaStr = nota.fecha_emision ?? "";
  const validoHastaStr = nota.valido_hasta ?? null;

  const logoHtml = facturador.logo_url
    ? `<img src="${facturador.logo_url}" alt="Logo" style="max-height:60px;max-width:160px;object-fit:contain;">`
    : "";

  const filaHtml = nota.items.map((item) => {
    if (item.fila_tipo === "CONTEXTO") {
      return `<tr>
        <td colspan="4" style="font-weight:bold;padding:6px 8px;border-bottom:1px solid #e5e5e5;background:#f9f9f9;">${esc(item.descripcion)}</td>
      </tr>`;
    }
    if (item.fila_tipo === "ITEM_SIN_PRECIO") {
      return `<tr>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e5e5;">${esc(item.descripcion)}</td>
        <td style="text-align:center;padding:6px 8px;border-bottom:1px solid #e5e5e5;">&mdash;</td>
        <td style="text-align:right;padding:6px 8px;border-bottom:1px solid #e5e5e5;">&mdash;</td>
        <td style="text-align:right;padding:6px 8px;border-bottom:1px solid #e5e5e5;">&mdash;</td>
      </tr>`;
    }
    return `<tr>
      <td style="padding:6px 8px;border-bottom:1px solid #e5e5e5;">${esc(item.descripcion)}</td>
      <td style="text-align:center;padding:6px 8px;border-bottom:1px solid #e5e5e5;">${fmt(item.cantidad)}</td>
      <td style="text-align:right;padding:6px 8px;border-bottom:1px solid #e5e5e5;">Gs. ${fmtGs(item.precio_unitario)}</td>
      <td style="text-align:right;padding:6px 8px;border-bottom:1px solid #e5e5e5;">Gs. ${fmtGs(item.precio_total)}</td>
    </tr>`;
  }).join("");

  const totalLetras = numeroALetras(nota.total);

  const observacionesHtml = nota.observaciones
    ? `<div style="margin-top:20px;padding:10px 12px;background:#f9f9f9;border-left:3px solid #1e3a5f;border-radius:2px;">
        <div style="font-size:9px;color:#888;text-transform:uppercase;font-weight:bold;margin-bottom:6px;">Observaciones</div>
        <div style="font-size:10px;color:#333;white-space:pre-line;">${esc(nota.observaciones)}</div>
      </div>`
    : "";

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #1a1a1a; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 18px; }
  .header-left { flex: 1; padding-right: 16px; }
  .header-right { text-align: right; min-width: 190px; }
  .doc-tipo { font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 1px; }
  .doc-title { font-size: 22px; font-weight: bold; color: #1e3a5f; letter-spacing: 1px; margin: 2px 0; }
  .doc-nro { font-size: 13px; font-weight: bold; color: #1a1a1a; }
  .doc-fecha { font-size: 10px; color: #555; margin-top: 4px; }
  .doc-valido { font-size: 10px; color: #1e3a5f; font-weight: bold; margin-top: 3px; }
  .empresa-nombre { font-size: 13px; font-weight: bold; }
  .empresa-rubro { font-size: 10px; color: #444; margin-top: 2px; }
  .empresa-info { font-size: 10px; color: #555; margin-top: 4px; line-height: 1.6; }
  .divider { border: none; border-top: 2px solid #1e3a5f; margin: 14px 0; }
  .cliente-box { background: #f5f7fa; border-radius: 4px; padding: 10px 14px; margin-bottom: 18px; border-left: 3px solid #1e3a5f; }
  .cliente-label { font-size: 9px; color: #888; text-transform: uppercase; font-weight: bold; margin-bottom: 3px; }
  .cliente-nombre { font-size: 12px; font-weight: bold; }
  .cliente-ruc { font-size: 10px; color: #555; margin-top: 2px; }
  .section-title { font-size: 10px; color: #888; text-transform: uppercase; font-weight: bold; letter-spacing: 0.5px; margin-bottom: 8px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 0; }
  thead th { background: #1e3a5f; color: #fff; padding: 7px 8px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
  .total-section { margin-top: 16px; display: flex; justify-content: flex-end; }
  .total-box { background: #1e3a5f; color: #fff; border-radius: 6px; padding: 12px 18px; min-width: 220px; }
  .total-row { display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 4px; color: rgba(255,255,255,0.8); }
  .total-row-main { display: flex; justify-content: space-between; font-size: 15px; font-weight: bold; color: #fff; border-top: 1px solid rgba(255,255,255,0.3); padding-top: 6px; margin-top: 4px; }
  .total-letras { font-size: 10px; color: #555; margin-top: 10px; font-style: italic; text-align: right; }
  .footer { margin-top: 28px; border-top: 1px solid #ddd; padding-top: 12px; display: flex; justify-content: space-between; align-items: flex-end; }
  .footer-note { font-size: 9px; color: #888; line-height: 1.5; max-width: 380px; }
</style>
</head>
<body>

<div class="header">
  <div class="header-left">
    ${logoHtml}
    <div class="empresa-nombre" style="margin-top:${facturador.logo_url ? "8px" : "0"}">${esc(facturador.razon_social)}</div>
    ${facturador.rubro_descripcion ? `<div class="empresa-rubro">${esc(facturador.rubro_descripcion)}</div>` : ""}
    <div class="empresa-info">
      RUC: ${esc(facturador.ruc)}
      ${facturador.direccion ? `<br>${esc(facturador.direccion)}` : ""}
      ${facturador.telefono ? `<br>Tel: ${esc(facturador.telefono)}` : ""}
    </div>
  </div>
  <div class="header-right">
    <div class="doc-tipo">${tipoLabel}</div>
    <div class="doc-nro">Nº ${nroStr}</div>
    <div class="doc-fecha">Emitido: ${fechaStr}</div>
    ${validoHastaStr ? `<div class="doc-valido">Válido hasta: ${validoHastaStr}</div>` : ""}
    <div style="margin-top:10px;">
      <img src="${qrDataUrl}" width="80" height="80" alt="QR verificacion">
    </div>
  </div>
</div>

<hr class="divider">

<div class="cliente-box">
  <div class="cliente-label">Cliente</div>
  <div class="cliente-nombre">${esc(nota.cliente_nombre)}</div>
  ${nota.cliente_ruc ? `<div class="cliente-ruc">RUC/CI: ${esc(nota.cliente_ruc)}</div>` : ""}
</div>

<div class="section-title">Conceptos presupuestados</div>
<table>
  <thead>
    <tr>
      <th style="text-align:left;width:50%;">Descripción</th>
      <th style="text-align:center;width:12%;">Cant.</th>
      <th style="text-align:right;width:18%;">Precio Unit.</th>
      <th style="text-align:right;width:20%;">Total</th>
    </tr>
  </thead>
  <tbody>
    ${filaHtml}
  </tbody>
</table>

<div class="total-section">
  <div>
    <div class="total-box">
      <div class="total-row"><span>Subtotal</span><span>Gs. ${fmtGs(nota.total)}</span></div>
      <div class="total-row-main"><span>TOTAL</span><span>Gs. ${fmtGs(nota.total)}</span></div>
    </div>
    <div class="total-letras">${totalLetras}</div>
  </div>
</div>

${observacionesHtml}

<div class="footer">
  <div class="footer-note">
    Este documento corresponde a un presupuesto comercial y no constituye un comprobante fiscal.<br>
    Para aceptar este presupuesto comuníquese con nosotros.<br>
    Verificar en: ${qrData}
  </div>
  <img src="${qrDataUrl}" width="56" height="56" alt="QR">
</div>

</body>
</html>`;
}

function esc(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function fmt(n: number | null | undefined): string {
  if (n == null) return "";
  return n % 1 === 0 ? String(n) : n.toFixed(2);
}

function fmtGs(n: number | null | undefined): string {
  if (n == null) return "";
  return Math.round(n).toLocaleString("es-PY");
}
