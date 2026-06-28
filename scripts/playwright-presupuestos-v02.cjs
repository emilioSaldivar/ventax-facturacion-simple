#!/usr/bin/env node
// Validación visual de Presupuestos v0.2

const { chromium } = require("playwright");

const baseUrl = process.env.SMOKE_BASE_URL ?? "http://localhost:5173/app/";
const viewport = { width: 390, height: 844 };

const accessToken = "mock-access-token";

const contextResponse = {
  user: { id: "u1", username: "op", display_name: "Operador", role: "OPERADOR_FACTURACION" },
  tenant: { id: "t1", name: "Demo", status: "ACTIVE" },
  facturador: { id: "f1", emisor_id: "80136968-1", razon_social: "Demo SA", ruc: "80136968-1" },
  fiscal_context: {
    timbrado: "12345678", timbrado_vence: "2027-12-31", establecimiento_codigo: "001",
    punto_expedicion_codigo: "001", documento_tipo: "FACTURA_ELECTRONICA",
    documento_nro: 1, credito_plazo_dias: 30,
    establecimiento_nombre: "Casa Central", establecimiento_direccion: "Asuncion",
    actividades_economicas: []
  }
};

const readinessResponse = {
  can_emit: true,
  checks: [{ code: "ready", ok: true, message: "Listo para emitir." }]
};

const notasListPresupuesto = {
  items: [
    {
      id: "n1",
      tipo: "PRESUPUESTO",
      numero: 1,
      estado: "EMITIDO",
      estado_comercial: null,
      fecha_emision: "2026-06-25",
      valido_hasta: "2026-07-25",
      cliente_nombre: "Empresa ABC",
      cliente_ruc: "80000001-1",
      observaciones: null,
      created_at: "2026-06-25T10:00:00Z",
      total: 150000,
      verification_token: "tok-1"
    },
    {
      id: "n2",
      tipo: "PRESUPUESTO",
      numero: null,
      estado: "BORRADOR",
      estado_comercial: null,
      fecha_emision: null,
      valido_hasta: null,
      cliente_nombre: "Cliente Borrador",
      cliente_ruc: null,
      observaciones: null,
      created_at: "2026-06-28T09:00:00Z",
      total: 0,
      verification_token: null
    }
  ],
  total: 2
};

const notasPedidoList = {
  items: [
    {
      id: "n3",
      tipo: "PEDIDO",
      numero: 1,
      estado: "EMITIDO",
      estado_comercial: "ACEPTADO",
      fecha_emision: "2026-06-20",
      valido_hasta: "2026-07-20",
      cliente_nombre: "Cliente Pedido",
      cliente_ruc: "80000002-2",
      observaciones: null,
      created_at: "2026-06-20T10:00:00Z",
      total: 250000,
      verification_token: "tok-3"
    }
  ],
  total: 1
};

const notaFull = {
  id: "n1",
  tipo: "PRESUPUESTO",
  numero: 1,
  estado: "EMITIDO",
  estado_comercial: null,
  fecha_emision: "2026-06-25",
  valido_hasta: "2026-07-25",
  cliente_nombre: "Empresa ABC",
  cliente_ruc: "80000001-1",
  observaciones: "Condiciones: 30 días de validez.",
  created_at: "2026-06-25T10:00:00Z",
  total: 150000,
  verification_token: "tok-1",
  items: [
    { id: "i1", orden: 1, fila_tipo: "ITEM", descripcion: "Servicio de consultoría", cantidad: 3, precio_unitario: 50000, precio_total: 150000, catalog_item_id: null, catalog_iva_tipo: null }
  ]
};

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport });
  let passed = 0;
  let failed = 0;

  function check(name, result) {
    if (result) { console.log(`✓ ${name}`); passed++; }
    else { console.error(`✗ ${name}`); failed++; }
  }

  try {
    // Mock API routes
    await page.route("**/api/v1/auth/refresh", r => r.fulfill({ status: 401, json: { error: { message: "No session." } } }));
    await page.route("**/api/v1/auth/login", r => r.fulfill({ json: { access_token: accessToken, refresh_token: "rt", expires_in: 900 } }));
    await page.route("**/api/v1/me/context", r => r.fulfill({ json: contextResponse }));
    await page.route("**/api/v1/me/readiness", r => r.fulfill({ json: readinessResponse }));
    await page.route("**/api/v1/notas?*tipo=PRESUPUESTO*", r => r.fulfill({ json: notasListPresupuesto }));
    await page.route("**/api/v1/notas?*tipo=PEDIDO*", r => r.fulfill({ json: notasPedidoList }));
    await page.route("**/api/v1/notas?*limit=100*", r => {
      const url = r.request().url();
      if (url.includes("tipo=PEDIDO")) r.fulfill({ json: notasPedidoList });
      else r.fulfill({ json: notasListPresupuesto });
    });
    await page.route("**/api/v1/notas/n1", r => r.fulfill({ json: notaFull }));
    await page.route("**/api/v1/notas/n1/estado-comercial", r => r.fulfill({ json: { ...notaFull, estado_comercial: "ACEPTADO" } }));
    await page.route("**/api/v1/clientes/search**", r => r.fulfill({ json: { items: [] } }));
    await page.route("**/api/v1/catalogo/items/search**", r => r.fulfill({ json: { items: [] } }));

    await page.goto(baseUrl, { waitUntil: "networkidle" });
    // Login
    await page.getByLabel("Usuario").fill("operador");
    await page.getByLabel(/contrase/i).fill("clave123");
    await page.getByRole("button", { name: /ingresar/i }).click();
    await page.waitForTimeout(1500);

    // Navegar a Presupuestos via menú
    const menuBtn = page.locator('.hamburger-action, button[aria-label="Abrir menu"]');
    await menuBtn.click();
    await page.waitForTimeout(300);
    // Click Presupuestos in menu
    const presupuestosBtn = page.getByRole("button", { name: /presupuesto/i }).first();
    await presupuestosBtn.waitFor({ timeout: 8000 });
    await presupuestosBtn.click();
    await page.waitForTimeout(800);

    // PS-011: Lista con tabs
    await page.waitForTimeout(800);

    const tabPresupuestos = page.getByRole("tab", { name: /presupuestos/i });
    const tabPedidos = page.getByRole("tab", { name: /pedidos/i });
    check("PS-011: Tab 'Presupuestos' visible", await tabPresupuestos.isVisible());
    check("PS-011: Tab 'Pedidos' visible", await tabPedidos.isVisible());
    check("PS-011: No existe tab 'Todos'", !(await page.getByRole("tab", { name: /todos/i }).isVisible().catch(() => false)));

    // Barra de búsqueda
    const searchInput = page.locator(".list-search-input, input[type='search']");
    check("PS-011: Input de búsqueda visible", await searchInput.isVisible());

    // Botón de nueva nota
    const nuevoBtn = page.getByRole("button", { name: /nuevo presupuesto/i });
    check("PS-015: Botón 'Nuevo presupuesto' visible en tab Presupuestos", await nuevoBtn.isVisible());

    // Tarjetas de presupuestos
    check("PS-011: Tarjeta 'Empresa ABC' visible", await page.getByText("Empresa ABC").isVisible());
    check("PS-011: Tarjeta 'Cliente Borrador' visible", await page.getByText("Cliente Borrador").isVisible());

    // Estado visual en chip
    check("PS-016: Chip 'Pendiente' visible en nota emitida", await page.getByText("Pendiente").first().isVisible());
    check("PS-016: Chip 'Borrador' visible en nota borrador", await page.getByText("Borrador").first().isVisible());

    // Tab Pedidos
    await tabPedidos.click();
    await page.waitForTimeout(500);
    const nuevoPedidoBtn = page.getByRole("button", { name: /nuevo pedido/i });
    check("PS-015: Botón cambia a 'Nuevo pedido' en tab Pedidos", await nuevoPedidoBtn.isVisible());
    check("PS-016: Chip 'Aceptado' visible en pedido con estado_comercial=ACEPTADO", await page.getByText("Aceptado").isVisible());

    // Volver a presupuestos, abrir detalle
    await tabPresupuestos.click();
    await page.waitForTimeout(500);

    // Click en tarjeta emitida (Empresa ABC)
    const cardEmpresaABC = page.locator(".invoice-card-main").filter({ hasText: "Empresa ABC" });
    await cardEmpresaABC.click();
    await page.waitForTimeout(800);

    // PS-013: Vista detalle
    check("PS-013: Heading con tipo y número", await page.getByRole("heading", { name: /presupuesto n°/i }).isVisible());
    check("PS-013: Total visible en resumen", (await page.locator("dd strong").count()) > 0);
    check("PS-013: Fecha de validez visible", await page.getByText("2026-07-25").isVisible());
    check("PS-013: Conceptos presupuestados visible", await page.getByText("Conceptos presupuestados").isVisible());
    check("PS-013: Observaciones visible", await page.getByText("Condiciones: 30 días de validez.").isVisible());

    // PS-016: Estado visual en detalle
    check("PS-016: Estado 'Pendiente' en detalle", await page.locator(".status-pill.pending").isVisible());

    // PS-013: Botones de estado comercial
    check("PS-013: Botón 'Aceptado' visible", await page.getByRole("button", { name: /aceptado/i }).isVisible());
    check("PS-013: Botón 'Rechazado' visible", await page.getByRole("button", { name: /rechazado/i }).isVisible());

    // PS-014: Convertir en factura
    check("PS-014: Botón 'Convertir en factura' visible para nota EMITIDA no RECHAZADA", await page.getByRole("button", { name: /convertir en factura/i }).isVisible());

    // PS-012: Ir a formulario y verificar campos nuevos
    const backBtn = page.getByRole("button", { name: /volver/i });
    if (await backBtn.isVisible()) await backBtn.click();
    await page.waitForTimeout(500);

    // Abrir formulario de nuevo presupuesto
    const nuevoBtnList = page.getByRole("button", { name: /nuevo presupuesto/i });
    await nuevoBtnList.click();
    await page.waitForTimeout(600);

    check("PS-012: Campo 'Válido hasta' en formulario", await page.getByLabel(/válido hasta/i).isVisible());
    check("PS-012: Campo 'Observaciones' en formulario", await page.getByLabel(/observaciones/i).isVisible());

    console.log("\n─────────────────────────────────");
    console.log(`Resultados: ${passed} pasaron, ${failed} fallaron`);

  } catch (err) {
    console.error("Error en el script:", err.message);
    failed++;
  } finally {
    await browser.close();
    process.exit(failed > 0 ? 1 : 0);
  }
}

main();
