#!/usr/bin/env node

const { chromium } = require("playwright");

const baseUrl = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:8092/app/";
const publicUrl = process.env.SMOKE_PUBLIC_URL ?? "https://factura.ventax.app/public/d/mock-flow-token";

const user = {
  id: "11111111-1111-4111-8111-111111111111",
  username: "operador",
  display_name: "Operador Mock",
  role: "OPERADOR_FACTURACION"
};

const contextResponse = {
  user,
  tenant: {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Tenant Demo",
    status: "ACTIVE"
  },
  facturador: {
    id: "33333333-3333-4333-8333-333333333333",
    emisor_id: "80136968-1",
    razon_social: "Facturador Demo",
    ruc: "80136968-1"
  },
  fiscal_context: {
    establecimiento: "001",
    punto_expedicion: "001",
    perfil_emision_codigo: "SERV",
    actividad_economica_codigo: "82110",
    actividad_economica_descripcion: "Servicios administrativos",
    timbrado: "80136968",
    timbrado_inicio: "2025-12-30",
    documento_nro: "0000000",
    credito_plazo_dias: 30
  }
};

const readinessResponse = {
  ready: true,
  checks: [
    { code: "operational_context", ok: true, message: "Contexto operativo completo." },
    { code: "fiscal_backend_ready", ok: true, message: "Backend fiscal mock disponible." }
  ]
};

const cliente = {
  source: "AGENDA_FACTURADOR",
  cliente_id: "44444444-4444-4444-8444-444444444444",
  documento_tipo: "RUC",
  documento: "80123456-7",
  razon_social: "Cliente Flujo Mock S.A.",
  direccion: "Centro",
  telefono: "0981000000",
  email: "cliente@example.com"
};

const item = {
  id: "55555555-5555-4555-8555-555555555555",
  codigo: "SERV-001",
  descripcion: "Servicio de flujo mock",
  precio_unitario: 11000,
  iva_tipo: "IVA_10",
  activo: true
};

const totals = {
  subtotal: 11000,
  total_sin_iva: 10000,
  iva_5: 0,
  iva_10: 1000,
  total_iva: 1000,
  total: 11000
};

const previewResponse = {
  items: [
    {
      ...item,
      catalogo_item_id: item.id,
      line_no: 1,
      cantidad: 1,
      subtotal: 11000,
      base_imponible: 10000,
      iva_monto: 1000
    }
  ],
  totals
};

const documento = {
  id: "66666666-6666-4666-8666-666666666666",
  tipo: "FACTURA",
  estado: "EMITIDA",
  condicion_venta: "CONTADO",
  numero_fiscal: "001-001-0000001",
  cdc: "A".repeat(44),
  fiscal_document_id: "doc-mock-flow",
  external_ref: "fac-mock-flow",
  cliente,
  items: previewResponse.items,
  totals,
  fiscal_status: { status: "APPROVED", mode: "mock" },
  delivery: {
    public_url: null,
    whatsapp_url: null,
    email_status: "DELEGATED",
    artifacts: {
      kude_pdf: { available: true, url: null },
      xml: { available: true, url: null }
    }
  },
  created_at: "2026-05-18T00:00:00.000Z"
};

async function installApiMocks(page, calls) {
  await page.route("**/api/v1/auth/refresh", (route) => route.fulfill({ status: 401, json: { error: { message: "Sin sesion." } } }));
  await page.route("**/api/v1/auth/login", (route) => {
    calls.login += 1;
    return route.fulfill({
      json: {
        access_token: "mock-access-token",
        token_type: "Bearer",
        expires_in: 900,
        user
      }
    });
  });
  await page.route("**/api/v1/me/context", (route) => route.fulfill({ json: contextResponse }));
  await page.route("**/api/v1/me/readiness", (route) => route.fulfill({ json: readinessResponse }));
  await page.route("**/api/v1/clientes/search**", (route) => route.fulfill({ json: { items: [] } }));
  await page.route("**/api/v1/clientes", (route) => {
    calls.clientes += 1;
    return route.fulfill({ status: 201, json: { ...cliente, activo: true } });
  });
  await page.route("**/api/v1/catalogo/items/search**", (route) => route.fulfill({ json: { items: [item] } }));
  await page.route("**/api/v1/catalogo/items", (route) => {
    calls.catalogo += 1;
    return route.fulfill({ status: 201, json: item });
  });
  await page.route("**/api/v1/facturas/preview", (route) => route.fulfill({ json: previewResponse }));
  await page.route("**/api/v1/facturas?**", (route) => route.fulfill({ json: { items: [documento], total: 1 } }));
  await page.route("**/api/v1/facturas/66666666-6666-4666-8666-666666666666", (route) => route.fulfill({ json: documento }));
  await page.route("**/api/v1/facturas/**/delivery-link", (route) =>
    route.fulfill({
      json: {
        public_url: publicUrl,
        whatsapp_url: `https://wa.me/?text=${encodeURIComponent(publicUrl)}`,
        token_status: "ACTIVE"
      }
    })
  );
  await page.route("**/api/v1/facturas/**/email-status", (route) =>
    route.fulfill({ json: { status: "DELEGATED", message: "Envio de email delegado a Ventax FE." } })
  );
  await page.route("**/api/v1/facturas", (route) => {
    calls.facturas += 1;
    calls.idempotencyKey = route.request().headers()["idempotency-key"] ?? null;
    return route.fulfill({ status: 201, json: documento });
  });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const calls = {
    login: 0,
    clientes: 0,
    catalogo: 0,
    facturas: 0,
    idempotencyKey: null
  };

  await installApiMocks(page, calls);
  await page.goto(baseUrl, { waitUntil: "networkidle" });

  await page.getByLabel("Usuario").fill("operador");
  await page.getByLabel("Contrasena").fill("password");
  await page.getByRole("button", { name: "Ingresar" }).click();
  await page.getByText("Puede emitir").waitFor();

  await page.getByRole("button", { name: "Nueva factura" }).click();
  await page.getByPlaceholder("80123456-7").fill(cliente.documento);
  await page.getByLabel("Nombre o razon social").fill(cliente.razon_social);
  await page.getByLabel("Direccion").fill(cliente.direccion);
  await page.getByLabel("Telefono").fill(cliente.telefono);
  await page.getByLabel("Correo").fill(cliente.email);
  await page.getByRole("button", { name: "Guardar cliente" }).click();
  await page.getByRole("button", { name: "Confirmar alta" }).click();
  await page.getByText("Cliente guardado").waitFor();

  await page.getByLabel("Codigo").fill("SERV");
  await page.getByText(item.descripcion).waitFor();
  await page.getByRole("button", { name: new RegExp(item.descripcion) }).click();
  await page.getByRole("button", { name: "Editar como nuevo" }).click();
  await page.getByRole("button", { name: "Guardar item 10%" }).click();
  await page.getByText("Item rapido guardado").waitFor();

  await page.getByRole("button", { name: "Calcular" }).click();
  await page.getByText("Total a pagar").waitFor();
  await page.getByRole("button", { name: "Emitir factura" }).click();
  await page.getByText(publicUrl).waitFor();
  await page.getByRole("link", { name: "KUDE/PDF" }).waitFor();
  await page.getByRole("link", { name: "XML" }).waitFor();
  await page.getByRole("link", { name: "WhatsApp" }).waitFor();

  await page.getByRole("button", { name: "Nueva factura" }).last().click();
  await page.getByRole("button", { name: "Volver" }).click();
  await page.getByRole("button", { name: "Ver documentos" }).click();
  await page.getByText(cliente.razon_social).waitFor();
  await page.getByRole("button", { name: new RegExp(cliente.razon_social) }).click();
  await page.getByText("Detalle").waitFor();
  await page.getByRole("link", { name: "KUDE/PDF" }).waitFor();

  await browser.close();

  const failures = [];
  if (calls.login !== 1) failures.push("login no fue ejecutado exactamente una vez");
  if (calls.clientes !== 1) failures.push("alta rapida de cliente no fue ejecutada");
  if (calls.catalogo !== 1) failures.push("alta rapida de catalogo no fue ejecutada");
  if (calls.facturas !== 1) failures.push("emision de factura no fue ejecutada");
  if (!calls.idempotencyKey) failures.push("Idempotency-Key ausente en emision");

  if (failures.length > 0) {
    console.error(failures.join("\n"));
    process.exit(1);
  }

  console.log(JSON.stringify({ ok: true, baseUrl, calls }, null, 2));
}

main().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
