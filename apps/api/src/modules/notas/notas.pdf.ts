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

  const tipoLabel = nota.tipo === "PRESUPUESTO" ? "NOTA DE PRESUPUESTO" : "NOTA DE PEDIDO";
  const nroStr = nota.numero != null ? String(nota.numero).padStart(7, "0") : "-------";
  const fechaStr = nota.fecha_emision ?? "";

  const logoHtml = facturador.logo_url
    ? `<img src="${facturador.logo_url}" alt="Logo" style="max-height:60px;max-width:160px;object-fit:contain;">`
    : "";

  const filaHtml = nota.items.map((item) => {
    if (item.fila_tipo === "CONTEXTO") {
      return `<tr>
        <td colspan="4" style="font-weight:bold;padding:4px 6px;border-bottom:1px solid #e5e5e5;">${esc(item.descripcion)}</td>
      </tr>`;
    }
    if (item.fila_tipo === "ITEM_SIN_PRECIO") {
      return `<tr>
        <td style="padding:4px 6px;border-bottom:1px solid #e5e5e5;">${esc(item.descripcion)}</td>
        <td style="text-align:center;padding:4px 6px;border-bottom:1px solid #e5e5e5;">&mdash;</td>
        <td style="text-align:right;padding:4px 6px;border-bottom:1px solid #e5e5e5;">&mdash;</td>
        <td style="text-align:right;padding:4px 6px;border-bottom:1px solid #e5e5e5;">&mdash;</td>
      </tr>`;
    }
    return `<tr>
      <td style="padding:4px 6px;border-bottom:1px solid #e5e5e5;">${esc(item.descripcion)}</td>
      <td style="text-align:center;padding:4px 6px;border-bottom:1px solid #e5e5e5;">${fmt(item.cantidad)}</td>
      <td style="text-align:right;padding:4px 6px;border-bottom:1px solid #e5e5e5;">${fmtGs(item.precio_unitario)}</td>
      <td style="text-align:right;padding:4px 6px;border-bottom:1px solid #e5e5e5;">${fmtGs(item.precio_total)}</td>
    </tr>`;
  }).join("");

  const totalLetras = numeroALetras(nota.total);

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #1a1a1a; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; }
  .header-left { flex: 1; }
  .header-right { text-align: right; min-width: 180px; }
  .doc-title { font-size: 14px; font-weight: bold; color: #1a1a1a; }
  .doc-nro { font-size: 20px; font-weight: bold; color: #1a1a1a; letter-spacing: 1px; }
  .doc-fecha { font-size: 11px; color: #555; margin-top: 4px; }
  .empresa-nombre { font-size: 14px; font-weight: bold; }
  .empresa-rubro { font-size: 11px; color: #444; margin-top: 2px; }
  .empresa-info { font-size: 10px; color: #555; margin-top: 4px; line-height: 1.5; }
  .cliente-box { background: #f5f5f5; border-radius: 4px; padding: 8px 12px; margin-bottom: 16px; }
  .cliente-label { font-size: 9px; color: #888; text-transform: uppercase; font-weight: bold; }
  .cliente-nombre { font-size: 12px; font-weight: bold; }
  .cliente-ruc { font-size: 10px; color: #555; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  thead th { background: #1a1a1a; color: #fff; padding: 6px; font-size: 10px; text-transform: uppercase; }
  .total-box { text-align: right; margin-top: 8px; }
  .total-label { font-size: 10px; color: #888; }
  .total-value { font-size: 18px; font-weight: bold; }
  .total-letras { font-size: 10px; color: #555; margin-top: 4px; font-style: italic; }
  .footer { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 24px; border-top: 1px solid #ddd; padding-top: 12px; }
  .footer-note { font-size: 9px; color: #888; }
</style>
</head>
<body>
<div class="header">
  <div class="header-left">
    ${logoHtml}
    <div class="empresa-nombre" style="margin-top:${facturador.logo_url ? "8px" : "0"}">${esc(facturador.razon_social)}</div>
    ${facturador.rubro_descripcion ? `<div class="empresa-rubro">${esc(facturador.rubro_descripcion)}</div>` : ""}
    <div class="empresa-info">
      RUC: ${esc(facturador.ruc)}<br>
      ${facturador.direccion ? esc(facturador.direccion) + "<br>" : ""}
      ${facturador.telefono ? "Tel: " + esc(facturador.telefono) : ""}
    </div>
  </div>
  <div class="header-right">
    <div class="doc-title">${tipoLabel}</div>
    <div class="doc-nro">Nro. ${nroStr}</div>
    <div class="doc-fecha">Fecha: ${fechaStr}</div>
    <div style="margin-top:8px;">
      <img src="${qrDataUrl}" width="80" height="80" alt="QR verificacion">
    </div>
  </div>
</div>

<div class="cliente-box">
  <div class="cliente-label">Cliente</div>
  <div class="cliente-nombre">${esc(nota.cliente_nombre)}</div>
  ${nota.cliente_ruc ? `<div class="cliente-ruc">RUC/CI: ${esc(nota.cliente_ruc)}</div>` : ""}
</div>

<table>
  <thead>
    <tr>
      <th style="text-align:left;width:50%;">Descripcion</th>
      <th style="text-align:center;width:12%;">Cant.</th>
      <th style="text-align:right;width:18%;">Precio Unit.</th>
      <th style="text-align:right;width:20%;">Total</th>
    </tr>
  </thead>
  <tbody>
    ${filaHtml}
  </tbody>
</table>

<div class="total-box">
  <div class="total-label">TOTAL</div>
  <div class="total-value">Gs. ${fmtGs(nota.total)}</div>
  <div class="total-letras">${totalLetras}</div>
</div>

<div class="footer">
  <div class="footer-note">
    Este documento no es un comprobante fiscal.<br>
    Verificar en: ${qrData}
  </div>
  <img src="${qrDataUrl}" width="60" height="60" alt="QR">
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
