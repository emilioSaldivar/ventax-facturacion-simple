#!/usr/bin/env node
// V6 — Recibos, presupuestos, clientes y catalogo (SPEC_TUTORIALES_VIDEO_v0.1 §2, §3.7, §3.8, §3.9, M-2, M-7; PLAN §5 V6).
// Recibos y presupuestos NO van a SIFEN. Usa la factura a credito de V3 (estado.json).
// Antes de grabar limpia en la base LOCAL lo que el video crea (cliente de ejemplo y producto MANT-01), para que se repita.
const { execFileSync } = require("node:child_process");
const t = require("./lib.cjs");

const PG = process.env.TUT_PG_CONTAINER ?? "segel-fs-postgres-1";
const FACTURADOR = "0480309f-3d9d-44f4-9359-4c5c5728c8b2";
const sql = (q) =>
  execFileSync("docker", ["exec", "-i", PG, "sh", "-c", 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atq'], { input: q, encoding: "utf8" }).trim();

function limpiar() {
  sql(`update facturador_clientes set deleted_at=now() where facturador_id='${FACTURADOR}' and deleted_at is null and razon_social='BANCO CENTRAL DEL PARAGUAY';
       update catalogo_items set deleted_at=now() where facturador_id='${FACTURADOR}' and deleted_at is null and codigo='MANT-01';`);
}
const ultimoToken = (tabla) => sql(`select verification_token from ${tabla} where facturador_id='${FACTURADOR}' and verification_token is not null order by created_at desc limit 1;`);

async function confirmarSiPregunta(page, nombre = /^(Emitir|Confirmar|Sí)/) {
  const dialogo = page.getByRole("dialog").filter({ has: page.getByRole("button", { name: nombre }) }).last();
  if (await dialogo.isVisible({ timeout: 2500 }).catch(() => false)) await dialogo.getByRole("button", { name: nombre }).last().click();
}

t.correr("v6-comercial-agendas", {}, async (s) => {
  const { page } = s;
  const { facturas } = t.leerEstado();
  if (!facturas?.credito) throw new Error("Falta la factura a credito de V3 en estado.json.");
  limpiar();
  await t.ingresar(s);
  await t.paso(s, "En este video: recibos de cobro, presupuestos y pedidos, y tus agendas de clientes y productos.");
  await t.paso(s, "Recibos, presupuestos y pedidos son comprobantes comerciales: no van a SIFEN y no tienen valor fiscal.", { cubre: ["3.2-recibos", "3.2-presupuestos"] });

  // 1. Recibo de una factura a credito
  await t.paso(s, "Cuando el cliente paga una factura a crédito, emitís el recibo desde la ficha de la factura.", { cubre: ["3.7-recibo-factura", "3.4-acciones"] });
  await t.abrirSeccion(s, "Documentos");
  await t.senalar(s, page.getByPlaceholder("Buscar factura..."), { escribir: facturas.credito });
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  const fila = page.locator("tbody tr").filter({ hasText: facturas.credito }).first();
  await fila.waitFor({ timeout: 20000 });
  await t.senalar(s, fila, { clic: true });
  const emitirRecibo = page.getByRole("button", { name: "Emitir recibo de cobro" });
  await emitirRecibo.waitFor();
  await t.senalar(s, emitirRecibo, { clic: true });
  await confirmarSiPregunta(page);
  await page.getByText(facturas.credito).first().waitFor({ timeout: 20000 });
  await t.paso(s, "El recibo queda en “Cobros / Recibos”, con la factura de referencia.");
  const filaRecibo = page.locator("main").getByText(facturas.credito).first();
  await t.senalar(s, filaRecibo, { clic: true, ms: 600 });
  await page.waitForTimeout(1200);
  await t.paso(s, "Ahí ves el recibo con el cliente, el importe y la factura que cobra.", { cubre: ["4-recibo"] });

  // 2. Recibo sin factura
  await t.paso(s, "También podés hacer un recibo por otro concepto, sin factura. Tocá “Nuevo recibo”.", { cubre: ["3.7-recibo-suelto"] });
  await t.abrirSeccion(s, "Cobros / Recibos");
  await t.senalar(s, page.getByRole("button", { name: /Nuevo recibo/ }).first(), { clic: true });
  const doc = page.getByPlaceholder("Ingresá el número de documento");
  await doc.waitFor();
  await t.senalar(s, doc, { escribir: "80026570-0" });
  await page.keyboard.press("Tab");
  await page.waitForTimeout(2500);
  const pagador = page.getByPlaceholder("Juan Perez");
  if (!(await pagador.inputValue()).trim()) await t.senalar(s, pagador, { escribir: "SEGEL SA" });
  await t.paso(s, "El pagador se completa igual que en la factura. Escribí el concepto y el importe.");
  await t.senalar(s, page.getByPlaceholder("Pago de servicio mensual"), { escribir: "Seña por capacitación del equipo" });
  await t.senalar(s, page.locator("label", { hasText: /^Importe/ }).locator("input"), { escribir: "300000" });
  await t.paso(s, "Elegí la forma de pago. Con transferencia o cheque, anotá la referencia.");
  const forma = page.locator("label", { hasText: /^Forma de pago/ }).locator("select");
  await t.senalar(s, forma, { ms: 400 });
  await forma.selectOption("TRANSFERENCIA");
  await t.senalar(s, page.getByPlaceholder("Nro. transferencia, cheque, etc."), { escribir: "TRF-004512" });
  await t.senalar(s, page.getByRole("button", { name: "Guardar y emitir" }), { clic: true });
  await confirmarSiPregunta(page);
  await page.locator("button.danger-action:visible", { hasText: /^Anular$/ }).first().waitFor({ timeout: 20000 });
  await t.paso(s, "Recibo emitido. Lo mandás por WhatsApp o con su enlace.", { cubre: ["3.7-recibo-entrega"] });
  await t.senalar(s, page.getByText("WhatsApp").first(), { ms: 800 });
  await t.paso(s, "Si te equivocaste, “Anular” lo deja sin efecto, con un motivo.");
  await t.senalar(s, page.locator("button.danger-action:visible", { hasText: /^Anular$/ }).first(), { ms: 1000 });
  const tokenRecibo = ultimoToken("recibos_dinero");
  await t.paso(s, "Así lo ve tu cliente al abrir el enlace.", { cubre: ["3.9-publicas"] });
  await page.goto(`${new URL(t.BASE).origin}/verificar/recibo/${tokenRecibo}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await t.paso(s, "Puede ver el recibo y bajarlo en PDF.");
  await page.goBack({ waitUntil: "domcontentloaded" });
  await page.locator("nav.side-nav").waitFor();

  // 3. Catalogo
  await t.paso(s, "Ahora, tus productos y servicios. El catálogo es opcional: sirve para no escribir lo mismo cada vez.", { cubre: ["3.2-catalogo", "3.8-productos"] });
  await t.abrirSeccion(s, "Catálogo");
  await t.senalar(s, page.getByRole("button", { name: "Nuevo producto o servicio" }).first(), { clic: true });
  await t.senalar(s, page.getByLabel("Nombre o descripción", { exact: true }), { escribir: "Mantenimiento mensual" });
  await t.senalar(s, page.getByLabel("Precio (Gs.)", { exact: true }), { escribir: "450000" });
  await t.senalar(s, page.locator("label", { hasText: /^IVA/ }).locator("select").last(), { ms: 400 });
  const avanzado = page.locator(".enlace-accion").filter({ hasText: /c[oó]digo|m[aá]s|opciones/i }).first();
  if (await avanzado.isVisible().catch(() => false)) {
    await t.senalar(s, avanzado, { clic: true });
    const codigo = page.getByPlaceholder("SERV-001");
    if (await codigo.isVisible().catch(() => false)) await t.senalar(s, codigo, { escribir: "MANT-01" });
  }
  await t.senalar(s, page.getByRole("button", { name: "Guardar", exact: true }), { clic: true });
  await page.getByText("Mantenimiento mensual").first().waitFor();
  await t.paso(s, "En la factura, al escribir la descripción, la app te sugiere los productos del catálogo con su precio e IVA.", { cubre: ["3.3-catalogo"] });
  await t.abrirSeccion(s, "Nueva factura");
  const desc = page.getByLabel("Descripción, línea 1", { exact: true });
  await t.senalar(s, desc, { escribir: "Manten" });
  const sugerencia = page.getByRole("listbox", { name: "Catálogo" }).getByText("Mantenimiento mensual").first();
  await sugerencia.waitFor({ timeout: 10000 });
  await t.senalar(s, sugerencia, { clic: true });
  await page.waitForTimeout(800);
  await t.senalar(s, page.getByLabel("Precio, línea 1", { exact: true }), { ms: 1000 });
  await t.paso(s, "Pero no es obligatorio: también podés escribir cualquier producto directo en la factura.", { cubre: ["3.2-nueva-factura"] });

  // 4. Presupuesto
  await t.paso(s, "Un presupuesto le muestra a tu cliente cuánto le vas a cobrar, antes de facturar.", { cubre: ["3.7-presupuestos", "3.7-editor"] });
  await t.abrirSeccion(s, "Presupuestos / Pedidos");
  await t.senalar(s, page.getByRole("button", { name: /Nuevo presupuesto/ }).first(), { clic: true });
  const docNota = page.getByPlaceholder("Número de documento");
  await docNota.waitFor();
  await t.senalar(s, docNota, { escribir: "80026570-0" });
  await page.keyboard.press("Tab");
  await page.waitForTimeout(2500);
  const nomNota = page.getByPlaceholder("Nombre del cliente");
  if (!(await nomNota.inputValue()).trim()) await t.senalar(s, nomNota, { escribir: "SEGEL SA" });
  await t.paso(s, "Agregá los ítems: del catálogo o escritos a mano.");
  await t.senalar(s, page.getByRole("button", { name: /Agregar primer item/ }), { clic: true });
  const hoja = page.getByRole("dialog").last();
  await t.senalar(s, hoja.locator("label.sheet-description input"), { escribir: "Manten" });
  const sugNota = hoja.getByRole("button", { name: /Mantenimiento mensual/ }).first();
  await sugNota.waitFor({ timeout: 10000 });
  await t.senalar(s, sugNota, { clic: true });
  // Elegir del catalogo agrega el item y cierra la hoja; si quedara abierta, se confirma.
  await page.waitForTimeout(800);
  const agregar1 = hoja.getByRole("button", { name: "AGREGAR SIN GUARDAR" });
  if (await agregar1.isVisible().catch(() => false)) await t.senalar(s, agregar1, { clic: true });
  await t.senalar(s, page.getByRole("button", { name: "+ Agregar item" }), { clic: true });
  const hoja2 = page.getByRole("dialog").last();
  await t.senalar(s, hoja2.locator("label.sheet-description input"), { escribir: "Capacitación del equipo (4 horas)" });
  await t.senalar(s, hoja2.getByPlaceholder("0").last(), { escribir: "600000" });
  await t.senalar(s, hoja2.getByRole("button", { name: "AGREGAR SIN GUARDAR" }), { clic: true });
  await t.paso(s, "Indicá hasta cuándo vale el presupuesto y tocá “Emitir”.");
  const vence = new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10);
  const fecha = page.locator("input[type='date']").first();
  await t.senalar(s, fecha, { ms: 300 });
  await fecha.fill(vence);
  await t.senalar(s, page.getByRole("button", { name: "Emitir", exact: true }), { clic: true });
  await confirmarSiPregunta(page);
  const estadoSel = page.getByLabel("Estado del presupuesto");
  await estadoSel.waitFor({ timeout: 20000 });
  await t.paso(s, "Cuando el cliente responde, marcás el estado: aceptado o rechazado.", { cubre: ["3.7-detalle", "4-comercial"] });
  await t.senalar(s, estadoSel, { ms: 400 });
  await estadoSel.selectOption("ACEPTADO");
  await page.waitForTimeout(1200);
  await t.paso(s, "Lo enviás por WhatsApp o en PDF.");
  await t.senalar(s, page.getByText("Enviar por WhatsApp").first(), { ms: 800 });
  const tokenNota = ultimoToken("notas_comerciales");
  await page.goto(`${new URL(t.BASE).origin}/verificar/nota/${tokenNota}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await t.paso(s, "Así lo ve tu cliente.");
  await page.goBack({ waitUntil: "domcontentloaded" });
  await page.locator("nav.side-nav").waitFor();
  await t.abrirSeccion(s, "Presupuestos / Pedidos", { mostrar: false });
  await page.locator("main").getByText("SEGEL SA").first().click();
  const convertir = page.getByRole("button", { name: "Convertir en factura" });
  await convertir.waitFor();
  await t.paso(s, "Si lo acepta, “Convertir en factura” abre una factura nueva con los mismos datos, lista para emitir.");
  await t.senalar(s, convertir, { clic: true });
  await page.locator("section[aria-label='Cliente']").waitFor();
  await page.waitForTimeout(1500);
  await t.paso(s, "Revisás y emitís como cualquier factura. Acá no la emitimos.");
  await t.abrirSeccion(s, "Presupuestos / Pedidos");
  await t.senalar(s, page.getByRole("tab", { name: /Pedidos/ }), { clic: true });
  await t.paso(s, "Los pedidos funcionan igual que los presupuestos.");

  // 5. Clientes
  await t.paso(s, "Por último, tu agenda de clientes. También es opcional.", { cubre: ["3.2-agenda", "3.8-clientes"] });
  await t.abrirSeccion(s, "Agenda / Clientes");
  await page.getByPlaceholder("Nombre, RUC o CI...").waitFor();
  await t.paso(s, "Los clientes que facturaste con la casilla marcada ya están acá.");
  await t.senalar(s, page.locator("main").getByText("SEGEL SA").first(), { ms: 1000 });
  await t.paso(s, "Para agregar uno, tocá “Nuevo cliente” y escribí su RUC: el nombre se completa desde la DNIT.");
  await t.senalar(s, page.getByRole("button", { name: "Nuevo cliente" }).first(), { clic: true });
  // En escritorio el alta es un panel al costado (no un dialogo).
  const dlg = page.locator("form.catalogo-form").last();
  await dlg.locator("label", { hasText: /^Tipo de documento/ }).locator("select").selectOption("RUC");
  await t.senalar(s, dlg.getByLabel("Documento", { exact: true }), { escribir: "80009769" });
  await page.keyboard.press("Tab");
  await page.waitForFunction(() => {
    const d = [...document.querySelectorAll("form.catalogo-form label")].find((l) => l.textContent?.trim().startsWith("Nombre o razón social"));
    return d && d.querySelector("input")?.value.trim();
  }, null, { timeout: 15000 });
  await page.waitForTimeout(800);
  await t.senalar(s, dlg.locator("button[type='submit']"), { clic: true });
  await page.waitForTimeout(1200);
  await t.paso(s, "Con “Usar” empezás una factura para ese cliente.");
  const usar = page.locator("main").getByRole("button", { name: /^Usar$/ }).first();
  await t.senalar(s, usar, { clic: true });
  await page.locator("section[aria-label='Cliente']").waitFor();
  await page.waitForTimeout(1500);
  await t.paso(s, "Eso es todo. Con estos seis videos ya conocés toda la app de Segel Factura.", { ms: 2500 });
});
