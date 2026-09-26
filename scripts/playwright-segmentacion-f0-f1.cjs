#!/usr/bin/env node
// Validacion visual de F0 y F1 de la segmentacion por perfil de emision
// (SPEC_SEGMENTACION_PERFIL_EMISION, SEG-002 y SEG-006).
//
// F0: la superficie de soporte interno se muestra por lista blanca. Un rol desconocido
//     no la hereda por descarte, que es lo que ocurria con `role !== "OPERADOR_FACTURACION"`.
// F1: cada documento muestra quien lo emitio, en el listado y en el detalle, sin backfill.

const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

const baseUrl = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:8096/app/";
const outDir = process.env.SMOKE_OUT_DIR ?? "test-results";
const viewports = [
  { nombre: "mobile", width: 390, height: 844 },
  { nombre: "desktop", width: 1440, height: 900 }
];

function contexto(role) {
  return {
    user: { id: "u1", username: "op", display_name: "Operador", role },
    tenant: { id: "t1", name: "Demo", status: "ACTIVE" },
    facturador: { id: "f1", emisor_id: "80136968-1", razon_social: "Demo SA", ruc: "80136968-1" },
    fiscal_context: {
      establecimiento: "001", punto_expedicion: "001", perfil_emision_codigo: "P1",
      actividad_economica_codigo: "47111", actividad_economica_descripcion: "Comercio",
      timbrado: "12345678", timbrado_inicio: "2026-01-01", documento_nro: "0000001",
      credito_plazo_dias: 30, tipo_transaccion_default: 1
    }
  };
}

function documento(id, numero, emitidoPor) {
  return {
    id, document_uuid: `uuid-${id}`, tipo: "FACTURA", estado: "EMITIDA",
    condicion_venta: "CONTADO", numero_fiscal: numero, cdc: "A".repeat(44),
    fiscal_document_id: `fd-${id}`, external_ref: null, fiscal_envio_modo: "BATCH",
    batch: null, cliente: { razon_social: "Cliente Demo", documento: "80000000-1", documento_tipo: "RUC" },
    items: [{ line_no: 1, descripcion: "Servicio", cantidad: 1, precio_unitario: 100000, iva_tipo: "IVA_10", subtotal: 100000, base_imponible: 90909, iva_monto: 9091 }],
    totals: { total: 100000, iva_10: 9091, iva_5: 0, exenta: 0, base_10: 90909, base_5: 0 },
    fiscal_status: null, fiscal_status_raw: "APPROVED", sifen_result_code: "0260",
    sifen_result_message: "Aprobado", sifen_last_checked_at: "2026-09-25T00:00:00Z",
    documento_relacionado_id: null, nce_motivo: null, cancelacion: null,
    emitido_por: emitidoPor,
    delivery: {
      public_url: null, whatsapp_url: null, email_status: "NOT_APPLICABLE",
      artifacts: { kude_pdf: { available: false, url: null }, xml: { available: false, url: null } }
    },
    created_at: "2026-09-25T00:00:00Z"
  };
}

// Tres documentos: con display_name, solo con username, y sin emisor (respuesta antigua).
const DOCS = [
  documento("doc-1", "001-001-0000001", { id: "u1", username: "ana.lopez", display_name: "Ana Lopez" }),
  documento("doc-2", "001-001-0000002", { id: "u2", username: "bruno.diaz", display_name: null }),
  documento("doc-3", "001-001-0000003", null)
];

const ESCENARIOS = [
  { nombre: "f1-operador", role: "OPERADOR_FACTURACION", esperaGestion: false },
  { nombre: "f0-soporte", role: "SOPORTE_INTERNO", esperaGestion: true },
  { nombre: "f0-admin", role: "ADMIN_INTERNO", esperaGestion: true },
  // El invariante de F0: un rol futuro no hereda la superficie de soporte.
  { nombre: "f0-rol-desconocido", role: "CONSULTA_FACTURADOR", esperaGestion: false }
];

async function abrirDocumentos(page) {
  await page.getByRole("button", { name: "Abrir menu" }).first().click().catch(() => undefined);
  await page.waitForTimeout(400);
  await page.locator('button:has-text("Documentos")').first().click().catch(() => undefined);
  await page.waitForTimeout(900);
}

async function run() {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const resultados = [];

  for (const vp of viewports) {
    for (const esc of ESCENARIOS) {
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await ctx.newPage();

      await page.route("**/api/v1/**", (route) => {
        const url = route.request().url();
        const json = (b) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
        if (url.includes("/me/context")) return json(contexto(esc.role));
        if (url.includes("/me/readiness")) return json({ ready: true, checks: [] });
        // Con rol interno el detalle carga la decision fiscal; devolver {} rompe el render
        // (reason_codes es requerido por contrato), asi que el mock trae la forma completa.
        if (url.includes("/gestion/decision")) {
          return json({
            documento_id: "doc-1", emisor_id: "80136968-1", env: "test", cdc: "A".repeat(44),
            nro_factura: "001-001-0000001", status: "APPROVED", transmission_evidence: "YES",
            number_state: "CONSUMED", decision_confidence: "HIGH", reason_codes: ["APPROVED_BY_SIFEN"],
            recommended_action: "NO_ACTION", next_step_hint: null, escalation_required: false,
            allowed_actions: {}
          });
        }
        const match = url.match(/\/facturas\/(doc-\d)/);
        if (match) return json(DOCS.find((d) => d.id === match[1]));
        if (url.includes("/facturas")) return json({ items: DOCS, total: DOCS.length });
        if (url.includes("/batch-pendientes")) return json({ documents_pending: 0, batches_pending: 0 });
        return json({});
      });

      await page.addInitScript(() => {
        localStorage.setItem("ventax_factura_access_token", "mock");
      });
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1200);
      await abrirDocumentos(page);

      // F1 en el listado: display_name cuando existe, username cuando no, nada si no vino.
      const conDisplayName = await page.locator("text=Emitio Ana Lopez").count();
      const conUsername = await page.locator("text=Emitio bruno.diaz").count();
      const emisoresRenderizados = await page.locator(".document-row-emisor").count();

      // F0: la seccion de soporte interno aparece solo para la lista blanca.
      const hayGestion = await page.isVisible('text=Gestion de documentos').catch(() => false);

      await page.screenshot({ path: path.join(outDir, `segmentacion-${esc.nombre}-${vp.nombre}-listado.png`), fullPage: true });

      // F1 en el detalle.
      await page.locator("text=001-001-0000001").first().click().catch(() => undefined);
      await page.waitForTimeout(900);
      const detalleEmisor = await page.isVisible("text=Emitido por").catch(() => false);
      const detalleNombre = await page.locator("dd", { hasText: "Ana Lopez" }).count();

      const ok =
        conDisplayName >= 1 &&
        conUsername >= 1 &&
        emisoresRenderizados === 2 &&
        hayGestion === esc.esperaGestion &&
        detalleEmisor &&
        detalleNombre >= 1;

      resultados.push({
        viewport: vp.nombre,
        escenario: esc.nombre,
        role: esc.role,
        conDisplayName,
        conUsername,
        emisoresRenderizados,
        hayGestion,
        esperaGestion: esc.esperaGestion,
        detalleEmisor,
        ok
      });
      await page.screenshot({ path: path.join(outDir, `segmentacion-${esc.nombre}-${vp.nombre}-detalle.png`), fullPage: true });
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
