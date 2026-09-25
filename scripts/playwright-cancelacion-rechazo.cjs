#!/usr/bin/env node
// Validacion visual del resultado de una anulacion (SPEC_PARIDAD_CONTRATO_FE_v0.1, PF-016).
//
// Cubre lo que antes era invisible: una cancelacion rechazada por SIFEN se veia igual que una
// aceptada. Ahora debe mostrar el motivo y, si es reintentable, ofrecer reintentar.

const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

const baseUrl = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:8096/app/";
const outDir = process.env.SMOKE_OUT_DIR ?? "test-results";
const viewports = [
  { nombre: "mobile", width: 390, height: 844 },
  { nombre: "desktop", width: 1440, height: 900 }
];

const contexto = {
  user: { id: "u1", username: "op", display_name: "Operador", role: "OPERADOR_FACTURACION" },
  tenant: { id: "t1", name: "Demo", status: "ACTIVE" },
  facturador: { id: "f1", emisor_id: "80136968-1", razon_social: "Demo SA", ruc: "80136968-1" },
  fiscal_context: {
    establecimiento: "001", punto_expedicion: "001", perfil_emision_codigo: "P1",
    actividad_economica_codigo: "47111", actividad_economica_descripcion: "Comercio",
    timbrado: "12345678", timbrado_inicio: "2026-01-01", documento_nro: "0000001",
    credito_plazo_dias: 30, tipo_transaccion_default: 1
  }
};

function documento(cancelacion) {
  return {
    id: "doc-1", document_uuid: "uuid-1", tipo: "FACTURA", estado: "EMITIDA",
    condicion_venta: "CONTADO", numero_fiscal: "001-001-0000001", cdc: "A".repeat(44),
    fiscal_document_id: "fd-1", external_ref: null, fiscal_envio_modo: "BATCH",
    batch: null, cliente: { razon_social: "Cliente Demo", documento: "80000000-1", documento_tipo: "RUC" },
    items: [{ line_no: 1, descripcion: "Servicio", cantidad: 1, precio_unitario: 100000, iva_tipo: "IVA_10", subtotal: 100000, base_imponible: 90909, iva_monto: 9091 }],
    totals: { total: 100000, iva_10: 9091, iva_5: 0, exenta: 0, base_10: 90909, base_5: 0 },
    fiscal_status: null, fiscal_status_raw: "APPROVED", sifen_result_code: "0260",
    sifen_result_message: "Aprobado", sifen_last_checked_at: "2026-09-25T00:00:00Z",
    documento_relacionado_id: null, nce_motivo: null, cancelacion,
    delivery: {
      public_url: null,
      whatsapp_url: null,
      email_status: "NOT_APPLICABLE",
      artifacts: { kude_pdf: { available: false, url: null }, xml: { available: false, url: null } }
    },
    created_at: "2026-09-25T00:00:00Z"
  };
}

const ESCENARIOS = {
  "rechazo-reintentable": {
    cancelacion: { status: "REJECTED", rejection_code: "0100", rejection_message: "Error Inesperado", retryable: true, intentos: 1, last_at: "2026-09-25T00:00:00Z" },
    esperaReintento: true,
    esperaConsulta: false
  },
  "rechazo-terminal": {
    cancelacion: { status: "REJECTED", rejection_code: "4009", rejection_message: "Plazo extemporaneo", retryable: false, intentos: 1, last_at: "2026-09-25T00:00:00Z" },
    esperaReintento: false,
    esperaConsulta: false
  },
  "sin-respuesta-sifen": {
    cancelacion: { status: "FAILED", rejection_code: null, rejection_message: null, retryable: null, intentos: 1, last_at: "2026-09-25T00:00:00Z" },
    esperaReintento: false,
    esperaConsulta: true
  },
  "aceptada": { cancelacion: null, esperaReintento: false, esperaConsulta: false, sinBloque: true }
};

async function run() {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const resultados = [];

  for (const vp of viewports) {
    for (const [nombre, esc] of Object.entries(ESCENARIOS)) {
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await ctx.newPage();
      const doc = documento(esc.cancelacion);

      await page.route("**/api/v1/**", (route) => {
        const url = route.request().url();
        const json = (b) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
        if (url.includes("/me/context")) return json(contexto);
        if (url.includes("/me/readiness")) return json({ ready: true, checks: [] });
        if (url.includes("/facturas/doc-1")) return json(doc);
        if (url.includes("/facturas")) return json({ items: [doc], total: 1 });
        if (url.includes("/batch-pendientes")) return json({ documents_pending: 0, batches_pending: 0 });
        return json({});
      });

      await page.addInitScript(() => {
        localStorage.setItem("ventax_factura_access_token", "mock");
      });
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1200);

      // La app arranca en "Nueva factura" y la navegacion vive detras del menu.
      await page.getByRole("button", { name: "Abrir menu" }).first().click().catch(() => undefined);
      await page.waitForTimeout(400);
      // El boton del menu lleva texto compuesto: "📂DocumentosFacturas y notas emitidas".
      await page.locator('button:has-text("Documentos")').first().click().catch(() => undefined);
      await page.waitForTimeout(900);
      const fila = page.locator("text=001-001-0000001").first();
      if (await fila.count()) {
        await fila.click().catch(() => undefined);
        await page.waitForTimeout(900);
      }

      const hayBloque = await page.isVisible('[data-testid="cancelacion-resultado"]').catch(() => false);
      const hayReintento = await page.isVisible('[data-testid="reintentar-anulacion"]').catch(() => false);
      const hayConsulta = await page.isVisible('[data-testid="consultar-tras-failed"]').catch(() => false);

      const ok = esc.sinBloque
        ? !hayBloque
        : hayBloque && hayReintento === esc.esperaReintento && hayConsulta === esc.esperaConsulta;

      resultados.push({ viewport: vp.nombre, escenario: nombre, hayBloque, hayReintento, hayConsulta, ok });
      await page.screenshot({ path: path.join(outDir, `cancelacion-${nombre}-${vp.nombre}.png`), fullPage: true });
      await ctx.close();
    }
  }

  await browser.close();
  const fallos = resultados.filter((r) => !r.ok);
  console.log(JSON.stringify({ resultados, fallos: fallos.length }, null, 2));
  if (fallos.length > 0) process.exit(1);
  console.log(`OK: ${resultados.length} verificaciones en ${viewports.length} viewports.`);
}

run().catch((e) => { console.error(e); process.exit(1); });
