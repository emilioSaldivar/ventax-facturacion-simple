#!/usr/bin/env node
// v0.3 (PLAN_TUTORIALES_VIDEO_v0.3 §2): emite, sin grabar, la factura de dos lineas para la nota combinada de V4
// (2 x "Servicio de consultoría" 100.000 y 1 x "Soporte técnico mensual" 50.000, IVA 10 %, SEGEL SA, contado).
// EMITE 1 factura en SIFEN test (stack local). Guarda el numero en estado.json (facturasV4b.combinada).
//   ENSAYO_PASSWORD_FILE=/ruta/clave node scripts/tutoriales/preparar-v4.cjs
const t = require("./lib.cjs");

const ESPERA_MAX = 15 * 60 * 1000;

t.correr("preparar-v4", { modoEditor: "completo", grabar: false }, async (s) => {
  const { page } = s;
  await t.ingresar(s);
  await t.abrirSeccion(s, "Nueva factura", { mostrar: false });
  const cliente = page.locator("section[aria-label='Cliente']");
  await cliente.waitFor();
  await cliente.getByPlaceholder("Ingresá el número de documento").fill("80026570-0");
  await page.keyboard.press("Tab");
  await page.waitForFunction(() => {
    const el = document.querySelector("section[aria-label='Cliente'] label.cliente-nombre input");
    return el && el.value.trim().length > 0;
  }, null, { timeout: 20000 });
  const lineas = [
    { descripcion: "Servicio de consultoría", cantidad: "2", precio: "100000" },
    { descripcion: "Soporte técnico mensual", cantidad: "1", precio: "50000" }
  ];
  for (const [i, l] of lineas.entries()) {
    const n = i + 1;
    const desc = page.getByLabel(`Descripción, línea ${n}`, { exact: true });
    if (n > 1 && !(await desc.isVisible().catch(() => false))) await page.getByRole("button", { name: /Agregar línea/ }).click();
    await desc.fill(l.descripcion);
    await page.keyboard.press("Escape").catch(() => undefined);
    await page.getByLabel(`Cantidad, línea ${n}`, { exact: true }).fill(l.cantidad);
    await page.getByLabel(`Precio, línea ${n}`, { exact: true }).fill(l.precio);
  }
  await page.getByText("250.000").first().waitFor({ timeout: 20000 });
  await page.getByRole("button", { name: "Crear factura" }).click();
  const titulo = page.locator("#invoice-title");
  await titulo.waitFor({ timeout: 60000 });
  const pastilla = page.locator(".estado-fiscal .status-pill");
  const fin = Date.now() + ESPERA_MAX;
  for (;;) {
    const clase = (await pastilla.getAttribute("class").catch(() => "")) ?? "";
    const texto = (await pastilla.innerText().catch(() => "")) ?? "";
    if (clase.includes("ready")) break;
    if (/revisión|Rechaz/i.test(texto)) throw new Error(`Factura no aprobada: ${texto}`);
    if (Date.now() > fin) throw new Error("Sin aprobacion en 15 minutos");
    await page.waitForTimeout(3000);
  }
  const numero = (await titulo.innerText()).replace(/^Factura\s+/, "").trim().split("-").pop();
  const previo = t.leerEstado().facturasV4b ?? {};
  t.guardarEstado({ facturasV4b: { ...previo, combinada: numero } });
  s.estado.combinada = numero;
  console.log(`Factura para la nota combinada: ${numero}`);
});
