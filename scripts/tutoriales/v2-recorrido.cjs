#!/usr/bin/env node
// V2 — Recorrido por la app (SPEC_TUTORIALES_VIDEO_v0.1 §2, §3.1, §3.2, §3.4, §4, M-5, M-6, M-7; PLAN §5 V2). No emite.
// Se graba al final: la lista de Documentos se filtra por el dia y muestra los documentos de V3 a V6.
// "Requiere revisión" se muestra con una factura rechazada de un dia anterior con cliente ficticio (PLAN §4).
const t = require("./lib.cjs");

const hoy = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10); // America/Asuncion (UTC-3)
const DIA_RECHAZADAS = process.env.TUT_V2_DIA_RECHAZADAS ?? "2026-11-10";

async function filtrarFechas(s, desde, hasta, mostrar = true) {
  const { page } = s;
  const d = page.locator("label", { hasText: /^\s*Desde/ }).locator("input[type='date']").first();
  const h = page.locator("label", { hasText: /^\s*Hasta/ }).locator("input[type='date']").first();
  if (mostrar) await t.senalar(s, d, { ms: 300 });
  await d.fill(desde);
  if (mostrar) await t.senalar(s, h, { ms: 300 });
  await h.fill(hasta);
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await page.waitForTimeout(1500);
}

t.correr("v2-recorrido", {}, async (s) => {
  const { page } = s;
  await t.ingresar(s);
  await t.paso(s, "En este video recorremos la app: qué hay en cada sección y para qué sirve.");

  // 1. Barra superior
  await t.paso(s, "Arriba ves la empresa, el timbrado y el punto de expedición activo.", { cubre: ["3.1-barra"] });
  await t.senalar(s, page.locator(".topbar-facturador"), { ms: 1200 });
  await t.paso(s, "Todo lo que emitís sale por ese punto. Si tenés más de uno, lo cambiás tocando acá.");
  await t.senalar(s, page.locator(".topbar-facturador"), { clic: true });
  const dialogo = page.getByRole("dialog", { name: "Cambiar punto de expedición" });
  await dialogo.waitFor();
  await page.waitForTimeout(1200);
  await t.senalar(s, dialogo.getByRole("button", { name: "Cancelar" }), { clic: true });
  await t.paso(s, "A la derecha, tu nombre y el botón para salir.");
  await t.senalar(s, page.locator(".topbar-operador"), { ms: 800 });

  // 2. Menu Nuevo
  await t.paso(s, "El botón “Nuevo” junta todo lo que podés crear.", { cubre: ["3.1-menu-nuevo"] });
  await t.senalar(s, page.locator(".topbar").getByRole("button", { name: /Nuevo/ }).first(), { clic: true });
  await page.locator(".menu-nuevo-panel").waitFor();
  await t.paso(s, "Arriba, los documentos electrónicos que van a SIFEN. Los que dicen “Próximamente” todavía no están disponibles.");
  await t.paso(s, "Abajo, los comprobantes comerciales, que no van a SIFEN: presupuestos, pedidos y recibos. Y la carga masiva por planilla.");
  await page.keyboard.press("Escape");
  await page.locator(".topbar-facturador").hover().catch(() => undefined);
  if (await page.locator(".menu-nuevo-panel").isVisible().catch(() => false)) await page.locator(".topbar").getByRole("button", { name: /Nuevo/ }).first().click();

  // 3. Menu lateral
  const nav = page.locator("nav.side-nav");
  await t.paso(s, "A la izquierda, el menú, en cuatro grupos. “Emitir”: factura, notas de crédito y notas de remisión.", { cubre: ["3.2-notas-debito", "3.2-autofacturas"] });
  for (const n of ["Nueva factura", "Notas de crédito", "Notas de remisión"]) await t.senalar(s, nav.getByRole("button", { name: n }).first(), { ms: 500 });
  await t.paso(s, "Notas de débito y autofacturas llegan más adelante.");
  for (const n of ["Notas de débito", "Autofacturas"]) await t.senalar(s, nav.getByText(n).first(), { ms: 500 });
  await t.paso(s, "“Consultar”: tus documentos emitidos, tu agenda de clientes y tu catálogo de productos.");
  for (const n of ["Documentos", "Agenda / Clientes", "Catálogo"]) await t.senalar(s, nav.getByRole("button", { name: n }).first(), { ms: 500 });
  await t.paso(s, "“Comercial”: presupuestos, pedidos y recibos, que no van a SIFEN.");
  for (const n of ["Presupuestos / Pedidos", "Cobros / Recibos"]) await t.senalar(s, nav.getByRole("button", { name: n }).first(), { ms: 500 });

  // 4. Informacion y estado
  await t.paso(s, "“Administración”: el estado de tu cuenta.", { cubre: ["3.2-informacion"] });
  await t.abrirSeccion(s, "Información y estado");
  await page.getByRole("heading", { name: "Facturador y sesión" }).waitFor();
  await t.paso(s, "Acá ves tu punto, tu timbrado y si está todo listo para facturar.");
  await t.senalar(s, page.locator("section[aria-labelledby='estado-facturador']"), { ms: 1000 });
  await t.senalar(s, page.getByRole("heading", { name: "Estado para facturar" }), { ms: 1000 });
  await t.paso(s, "Si algo no está listo, acá aparece el motivo. Abajo, los documentos que podés emitir.");
  await t.senalar(s, page.getByRole("heading", { name: "Documentos que podés emitir" }), { ms: 1000 });

  // 5. Notas de remision
  await t.abrirSeccion(s, "Notas de remisión");
  await t.paso(s, "Las notas de remisión tienen dos pestañas: las emitidas y la carga por planilla, que es como se emiten hoy.", { cubre: ["3.2-remision"] });
  await t.senalar(s, page.getByRole("button", { name: /^Emitidas/ }).first(), { ms: 700 });
  await t.senalar(s, page.getByRole("button", { name: "Por planilla" }).first(), { ms: 700 });

  // 6. Documentos
  await t.abrirSeccion(s, "Documentos");
  await page.locator("tbody tr").first().waitFor();
  await t.paso(s, "En “Documentos” están todos tus comprobantes, con una pestaña por tipo.", { cubre: ["3.2-documentos", "3.4-pestanas"] });
  for (const n of [/^Facturas/, /^Notas de crédito/, /^Notas de remisión/, /^Cargas por planilla/]) await t.senalar(s, page.getByRole("button", { name: n }).first(), { ms: 400 });
  await t.paso(s, "Podés buscar por cliente, número o total, y filtrar por estado, condición y fechas.", { cubre: ["3.4-filtros"] });
  await t.senalar(s, page.getByPlaceholder("Buscar factura..."), { ms: 400 });
  await t.senalar(s, page.locator("label", { hasText: /^\s*Estado/ }).locator("select").first(), { ms: 400 });
  await filtrarFechas(s, hoy, hoy);
  await t.paso(s, "Cada fila tiene su estado. “Factura emitida”: aprobada por SIFEN, lista para entregar.", { cubre: ["3.4-pastillas", "4-emitida"] });
  await t.senalar(s, page.locator("tbody tr").first().locator(".status-pill, .pastilla-estado").first(), { ms: 1000 });
  await t.paso(s, "“Procesando”: enviada, falta la respuesta de SIFEN; se actualiza sola. “Anulada”: sin efecto fiscal.", { cubre: ["4-procesando", "4-anulada"] });

  // 7. Ficha de una factura
  await t.paso(s, "Tocá una factura para ver su ficha.", { cubre: ["3.4-ficha"] });
  await t.senalar(s, page.locator("tbody tr").first(), { clic: true });
  const entregar = page.getByText("Entregar al cliente").first();
  await entregar.waitFor();
  await t.paso(s, "Desde la ficha la entregás: PDF, WhatsApp, compartir o copiar el enlace. El enlace siempre lleva a la versión vigente.");
  await t.senalar(s, entregar, { ms: 1200 });
  await t.paso(s, "Y desde acá creás una nota de crédito o, si es a crédito, el recibo de cobro.");
  await t.senalar(s, page.getByRole("button", { name: "Crear nota de crédito" }).first(), { ms: 1000 });
  const info = page.locator("summary", { hasText: "Información fiscal" });
  await info.scrollIntoViewIfNeeded();
  await t.paso(s, "En “Información fiscal” está el código de control y la respuesta de SIFEN, por si soporte te los pide.", { cubre: ["3.4-info-fiscal"] });
  await t.senalar(s, info, { clic: true });
  await page.waitForTimeout(1200);

  // 8. Requiere revision
  await t.paso(s, "Si SIFEN rechaza una factura, queda “Requiere revisión” y la ficha te dice qué hacer.", { cubre: ["3.4-recuperacion", "4-revision", "4-rechazada"] });
  await page.locator("label", { hasText: /^\s*Estado/ }).locator("select").first().selectOption("RECHAZADA");
  await filtrarFechas(s, DIA_RECHAZADAS, DIA_RECHAZADAS, false);
  const rechazada = page.locator("tbody tr").first();
  await rechazada.waitFor({ timeout: 15000 });
  await t.senalar(s, rechazada, { clic: true });
  await page.waitForTimeout(1500);
  for (const n of ["Verificar estado fiscal", "Corregir y emitir de nuevo", "Reintentar emisión", "Inutilizar número"]) {
    const b = page.getByRole("button", { name: n }).first();
    if (await b.isVisible().catch(() => false)) await t.senalar(s, b, { ms: 700 });
  }
  await t.paso(s, "La ficha explica el motivo del rechazo. “Corregir y emitir de nuevo” abre una factura nueva con los mismos datos, para corregir y emitir.");
  await t.paso(s, "El número rechazado se cierra con “Inutilizar número”. La fila pasa a “Corregida, falta inutilizar” y después a “Resuelta”.", { cubre: ["4-corregida"] });
  await t.paso(s, "Si el problema fue de conexión, la ficha ofrece “Verificar estado fiscal” o “Reintentar emisión”.");
  await page.locator("label", { hasText: /^\s*Estado/ }).locator("select").first().selectOption("");
  await filtrarFechas(s, hoy, hoy, false);

  // 9. Cargas por planilla
  await t.senalar(s, page.getByRole("button", { name: /^Cargas por planilla/ }).first(), { clic: true });
  await page.getByRole("heading", { name: "Cargas subidas" }).waitFor();
  await t.paso(s, "En “Cargas por planilla” están tus cargas masivas. Lo vemos en su propio video.");
  await t.paso(s, "Eso es el recorrido. En los otros videos vemos cada circuito paso a paso.", { ms: 2500 });
});
